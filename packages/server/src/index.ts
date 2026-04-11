import { existsSync, statSync } from "fs";
import { join } from "path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { loadState } from "./store.ts";
import { loadConfig, verifyJwt } from "./auth.ts";
import machineRoutes from "./routes/machines.ts";
import agentRoutes from "./routes/agents.ts";
import sessionRoutes from "./routes/sessions.ts";
import dispatchRoutes from "./routes/dispatch.ts";
import workspaceRoutes from "./routes/workspaces.ts";
import { handleAgentOpen, handleAgentMessage, handleAgentClose, type AgentWsData } from "./ws/agent.ts";
import { handleClientOpen, handleClientMessage, handleClientClose, type ClientWsData } from "./ws/client.ts";
import { startTunnel, getTunnelUrl } from "./tunnel.ts";

const PORT = 7483;

// 初始化
const config = loadConfig();
loadState();

// HTTP API
const app = new Hono();
app.use("*", cors());

// JWT 认证中间件（API 路由）
app.use("/api/*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const result = await verifyJwt(auth.slice(7));
  if (!result) {
    return c.json({ error: "Invalid token" }, 401);
  }
  await next();
});

app.route("/api/machines", machineRoutes);
app.route("/api/agents", agentRoutes);
app.route("/api/sessions", sessionRoutes);
app.route("/api/dispatch", dispatchRoutes);
app.route("/api/workspaces", workspaceRoutes);

app.get("/health", (c) => c.json({ ok: true }));
app.get("/tunnel", (c) => c.json({ url: getTunnelUrl() }));

// 注册端点：用 secret token 换 JWT
app.post("/auth/register", async (c) => {
  const body = await c.req.json<{ token: string; machineId?: string }>();
  if (body.token !== config.secretToken) {
    return c.json({ error: "Invalid token" }, 401);
  }
  const { signJwt } = await import("./auth.ts");
  const jwt = await signJwt(body.machineId ?? "client");
  return c.json({ jwt });
});

// Bun server with WebSocket
type WsData = { path: string } & (AgentWsData | ClientWsData);

const server = Bun.serve<WsData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws/agent") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response("Missing token", { status: 401 });
      }
      // token 验证在 open 后异步做（Bun upgrade 是同步的）
      const upgraded = server.upgrade(req, {
        data: { path: "agent", machineId: null, authenticated: false } as WsData,
      });
      return upgraded ? undefined : new Response("Upgrade failed", { status: 500 });
    }

    if (url.pathname === "/ws/client") {
      const upgradeHeader = req.headers.get("upgrade");
      if (!upgradeHeader) {
        console.log("⚠️  /ws/client 请求缺少 Upgrade 头:", Object.fromEntries(req.headers.entries()));
        return new Response("WebSocket upgrade required", { status: 426 });
      }
      const upgraded = server.upgrade(req, {
        data: { path: "client", authenticated: true, subscribedSessions: new Set() } as WsData,
      });
      return upgraded ? undefined : new Response("Upgrade failed", { status: 500 });
    }

    // API 和 auth 路由走 Hono
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname === "/health" || url.pathname === "/tunnel") {
      return app.fetch(req);
    }

    // PWA 静态文件（构建后）
    const pwaDistDir = join(import.meta.dir, "../../pwa/dist");
    if (existsSync(pwaDistDir)) {
      const fullPath = join(pwaDistDir, url.pathname);
      if (url.pathname !== "/" && existsSync(fullPath) && !statSync(fullPath).isDirectory()) {
        return new Response(Bun.file(fullPath));
      }
      // SPA fallback
      return new Response(Bun.file(join(pwaDistDir, "index.html")));
    }

    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const data = ws.data as WsData;
      if (data.path === "agent") {
        handleAgentOpen(ws as any);
      } else {
        handleClientOpen(ws as any);
      }
    },
    message(ws, message) {
      const data = ws.data as WsData;
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      if (data.path === "agent") {
        handleAgentMessage(ws as any, raw);
      } else {
        handleClientMessage(ws as any, raw);
      }
    },
    close(ws) {
      const data = ws.data as WsData;
      if (data.path === "agent") {
        handleAgentClose(ws as any);
      } else {
        handleClientClose(ws as any);
      }
    },
  },
});

console.log(`🚀 Dispatch Server 运行在 http://localhost:${PORT}`);
console.log(`   WebSocket Agent: ws://localhost:${PORT}/ws/agent`);
console.log(`   WebSocket Client: ws://localhost:${PORT}/ws/client`);
console.log(`   Secret Token: ${config.secretToken}`);

// 自动启动 tunnel（如果 cloudflared 可用）
if (process.argv.includes("--tunnel")) {
  startTunnel(PORT).then(url => {
    console.log(`🌐 Tunnel URL: ${url}`);
  }).catch(err => {
    console.log(`⚠️  Tunnel 启动失败: ${err.message}`);
  });
}
