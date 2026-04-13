import { hostname, platform, homedir } from "os";
import { readdirSync, existsSync, statSync, readFileSync } from "fs";
import { join, basename } from "path";
import { loadConfig } from "./config.ts";
import type { AgentToServerMessage, ServerToAgentMessage, WorkspaceSummary } from "@tm/shared";
import { executeAgent, sendToStdinBySession, resumeSession } from "./executor.ts";

async function resolveServer(config: { server: string; duckdns?: string }): Promise<string> {
  if (!config.duckdns) return config.server;
  try {
    const res = await fetch(`https://dns.google/resolve?name=${config.duckdns}.duckdns.org&type=TXT`);
    const data = await res.json() as any;
    const txt = data.Answer?.find((a: any) => a.type === 16);
    if (txt) {
      const url = txt.data.replace(/"/g, "");
      if (url.startsWith("https://")) {
        console.log(`🦆 DuckDNS 解析: ${config.duckdns}.duckdns.org → ${url}`);
        return url;
      }
    }
    console.log(`⚠️  DuckDNS 解析失败，使用缓存地址: ${config.server}`);
  } catch (err) {
    console.log(`⚠️  DuckDNS 查询失败: ${err}，使用缓存地址: ${config.server}`);
  }
  return config.server;
}

export async function startDaemon() {
  const config = loadConfig();
  let ws: WebSocket | null = null;
  let machineId: string | null = null;
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30_000;

  async function connect() {
    // 每次重连前解析最新 tunnel URL
    const server = await resolveServer(config);
    if (server !== config.server) {
      config.server = server;
    }
    const wsUrl = config.server.replace(/^http/, "ws") + `/ws/agent?token=${config.token}`;
    console.log(`🔌 连接到 ${config.server}...`);

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("✅ 已连接到调度服务器");
      reconnectDelay = 1000;

      // 扫描本机 workspace 并注册
      const workspaces = scanWorkspaces();
      console.log(`📂 扫描到 ${workspaces.length} 个 workspace`);
      const registerMsg: AgentToServerMessage = {
        type: "register",
        machine: {
          hostname: hostname(),
          os: platform(),
          tailscaleIp: getTailscaleIp(),
        },
        agents: config.agents,
        workspaces,
      };
      ws!.send(JSON.stringify(registerMsg));

      // 心跳
      const heartbeatInterval = setInterval(() => {
        if (ws?.readyState !== WebSocket.OPEN) {
          clearInterval(heartbeatInterval);
          return;
        }
        if (machineId) {
          const hb: AgentToServerMessage = { type: "heartbeat", machineId };
          ws!.send(JSON.stringify(hb));
        }
      }, 30_000);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as ServerToAgentMessage;

      switch (msg.type) {
        case "registered":
          machineId = msg.machineId;
          config.machineId = machineId;
          console.log(`📋 已注册为: ${machineId}`);
          console.log(`   Agent 数量: ${config.agents.length}`);
          for (const a of config.agents) {
            console.log(`   - ${a.name}: ${a.cmd}`);
          }
          break;

        case "dispatch": {
          console.log(`📥 收到调度: [${msg.agentName}] ${msg.instruction}`);
          const agent = config.agents.find(a => a.name === msg.agentName);
          if (agent && ws) {
            executeAgent(ws, msg.sessionId, agent, msg.instruction);
          }
          break;
        }

        case "message": {
          const sent = sendToStdinBySession(msg.sessionId, msg.content);
          if (!sent) {
            console.log(`⚠️  无法转发消息到 session ${msg.sessionId}`);
          }
          break;
        }

        case "resume" as any: {
          const { sessionId: resumeId, agentName } = msg as any;
          console.log(`🔄 恢复 Claude Code 会话: ${resumeId}`);
          const agent = config.agents.find(a => a.name === agentName);
          if (agent && ws) {
            resumeSession(ws, resumeId, agent);
          }
          break;
        }
      }
    };

    ws.onclose = () => {
      console.log(`🔌 连接断开，${reconnectDelay / 1000}s 后重连...`);
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        connect();
      }, reconnectDelay);
    };

    ws.onerror = (err) => {
      console.error("❌ WebSocket 错误:", err);
    };
  }

  connect();

  // 保持进程运行
  process.on("SIGINT", () => {
    console.log("\n👋 正在断开连接...");
    ws?.close();
    process.exit(0);
  });
}

function scanWorkspaces(): WorkspaceSummary[] {
  const results: WorkspaceSummary[] = [];
  // Claude Code
  const ccDir = join(homedir(), ".claude", "projects");
  if (existsSync(ccDir)) {
    for (const dir of readdirSync(ccDir)) {
      const p = join(ccDir, dir);
      if (!statSync(p).isDirectory()) continue;
      const sessions = readdirSync(p).filter(f => f.endsWith(".jsonl")).length;
      if (sessions === 0) continue;
      const parts = dir.split("-").filter(Boolean);
      results.push({
        id: dir,
        name: parts[parts.length - 1] ?? dir,
        path: dir.replace(/^-/, "/").replace(/-/g, "/"),
        source: "claude",
        sessionCount: sessions,
      });
    }
  }
  // Cursor (composerHeaders count by workspace)
  try {
    const globalDb = join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");
    if (existsSync(globalDb)) {
      const { Database } = require("bun:sqlite");
      const db = new Database(globalDb, { readonly: true });
      const row = db.query("SELECT value FROM ItemTable WHERE key='composer.composerHeaders'").get() as { value: string } | null;
      db.close();
      if (row) {
        const hData = JSON.parse(row.value);
        const wsMap = new Map<string, { path: string; name: string; count: number }>();
        for (const c of hData.allComposers as any[]) {
          const wsId = c.workspaceIdentifier?.id;
          if (!wsId) continue;
          if (!wsMap.has(wsId)) {
            const fsPath = c.workspaceIdentifier?.uri?.fsPath || "";
            wsMap.set(wsId, { path: fsPath, name: fsPath ? basename(fsPath) : wsId.slice(0, 8), count: 0 });
          }
          wsMap.get(wsId)!.count++;
        }
        for (const [wsId, info] of wsMap) {
          results.push({
            id: `cursor-ws:${wsId}`,
            name: info.name,
            path: info.path,
            source: "cursor",
            sessionCount: info.count,
          });
        }
      }
    }
  } catch {}
  return results;
}

function getTailscaleIp(): string {
  try {
    const result = Bun.spawnSync(["tailscale", "ip", "-4"]);
    const ip = new TextDecoder().decode(result.stdout).trim();
    if (ip) return ip;
  } catch {}
  return "unknown";
}
