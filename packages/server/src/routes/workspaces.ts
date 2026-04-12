import { Hono } from "hono";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { homedir, hostname } from "os";
import { join, basename, relative } from "path";
import { createReadStream } from "fs";

import { Database } from "bun:sqlite";

const app = new Hono();
const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const CURSOR_WS_DIR = join(homedir(), "Library", "Application Support", "Cursor", "User", "workspaceStorage");
const CURSOR_CHATS_DIR = join(homedir(), ".cursor", "chats");
const LOCAL_MACHINE = hostname();

interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  source: "claude" | "cursor";
  machine: string;
  sessions: SessionSummary[];
}

interface SessionSummary {
  id: string;
  firstMessage: string;
  timestamp: string;
  messageCount: number;
  linesAdded?: number;
  linesRemoved?: number;
  filesChanged?: number;
}

function decodeProjectName(encoded: string): string {
  // -Users-max-Documents-claudecode-taskmanager → /Users/max/Documents/claudecode/taskmanager
  return encoded.replace(/^-/, "/").replace(/-/g, "/");
}

function getShortName(encoded: string): string {
  // -Users-max-Documents-claudecode-taskmanager → taskmanager
  const parts = encoded.split("-").filter(Boolean);
  return parts[parts.length - 1] ?? encoded;
}

function parseSessionSummary(filePath: string): SessionSummary | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    let firstMessage = "";
    let timestamp = "";
    let messageCount = 0;

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === "user" || obj.type === "assistant") {
          messageCount++;
        }
        if (obj.type === "user" && !firstMessage) {
          const msg = obj.message?.content;
          if (typeof msg === "string") {
            firstMessage = msg.replace(/<[^>]+>/g, "").trim().slice(0, 120);
          } else if (Array.isArray(msg)) {
            const textBlock = msg.find((b: any) => b.type === "text");
            if (textBlock) {
              firstMessage = textBlock.text.replace(/<[^>]+>/g, "").trim().slice(0, 120);
            }
          }
          timestamp = obj.timestamp || "";
        }
      } catch {}
    }

    if (!firstMessage && !timestamp) return null;

    return {
      id: basename(filePath, ".jsonl"),
      firstMessage: firstMessage || "(no message)",
      timestamp,
      messageCount,
    };
  } catch {
    return null;
  }
}

// === Cursor helpers ===

function getCursorWorkspaces(): WorkspaceInfo[] {
  if (!existsSync(CURSOR_WS_DIR)) return [];

  const workspaces: WorkspaceInfo[] = [];

  // 1. chats 目录（旧 chat 模式）
  if (existsSync(CURSOR_CHATS_DIR)) {
    const chatDirs = readdirSync(CURSOR_CHATS_DIR).filter(d => {
      const p = join(CURSOR_CHATS_DIR, d);
      return statSync(p).isDirectory();
    });

    for (const chatHash of chatDirs) {
      const chatDir = join(CURSOR_CHATS_DIR, chatHash);
      const sessionDirs = readdirSync(chatDir).filter(s => {
        const p = join(chatDir, s);
        return statSync(p).isDirectory() && existsSync(join(p, "store.db"));
      });
      if (sessionDirs.length === 0) continue;

      const sessions: SessionSummary[] = [];
      for (const sessionId of sessionDirs) {
        const summary = parseCursorSession(join(chatDir, sessionId, "store.db"), sessionId);
        if (summary) sessions.push(summary);
      }
      sessions.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

      workspaces.push({
        id: `cursor:${chatHash}`,
        name: chatHash.slice(0, 8) + " (chat)",
        path: "",
        source: "cursor",
        machine: LOCAL_MACHINE,
        sessions,
      });
    }
  }

  // 2. 从全局 composerHeaders 按 workspace 分组（包含所有 composer/agent sessions）
  const globalDbPath = join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");
  if (existsSync(globalDbPath)) {
    try {
      const globalDb = new Database(globalDbPath, { readonly: true });
      const headersRow = globalDb.query("SELECT value FROM ItemTable WHERE key='composer.composerHeaders'").get() as { value: string } | null;
      globalDb.close();

      if (headersRow) {
        const hData = JSON.parse(headersRow.value);
        const composers = hData.allComposers as Array<{
          composerId: string; name?: string; createdAt?: number;
          unifiedMode?: string; workspaceIdentifier?: { id: string; uri?: { fsPath?: string } };
          totalLinesAdded?: number; totalLinesRemoved?: number; filesChangedCount?: number;
        }>;

        // 按 workspace hash 分组
        const wsMap = new Map<string, typeof composers>();
        for (const c of composers) {
          const wsId = c.workspaceIdentifier?.id || "empty-window";
          if (!wsMap.has(wsId)) wsMap.set(wsId, []);
          wsMap.get(wsId)!.push(c);
        }

        for (const [wsHash, sessions] of wsMap) {
          if (wsHash === "empty-window") continue;

          const projPath = sessions[0]?.workspaceIdentifier?.uri?.fsPath || "";
          const shortName = projPath ? basename(projPath) : wsHash.slice(0, 8);

          const sessionSummaries: SessionSummary[] = sessions.map(c => ({
            id: c.composerId,
            firstMessage: c.name || `(${c.unifiedMode || "composer"})`,
            timestamp: c.createdAt ? new Date(c.createdAt).toISOString() : "",
            messageCount: 0,
            linesAdded: c.totalLinesAdded || 0,
            linesRemoved: c.totalLinesRemoved || 0,
            filesChanged: c.filesChangedCount || 0,
          }));
          sessionSummaries.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

          workspaces.push({
            id: `cursor-ws:${wsHash}`,
            name: shortName,
            path: projPath,
            source: "cursor",
            machine: LOCAL_MACHINE,
            sessions: sessionSummaries,
          });
        }
      }
    } catch {}
  }

  return workspaces;
}

function parseCursorSession(dbPath: string, sessionId: string): SessionSummary | null {
  try {
    const db = new Database(dbPath, { readonly: true });

    // 从 meta 获取名称和时间
    const meta = db.query("SELECT * FROM meta").get() as { key: string; value: string } | null;
    let name = "";
    let createdAt = "";
    if (meta) {
      try {
        const metaVal = JSON.parse(Buffer.from(meta.value, "hex").toString("utf-8"));
        name = metaVal.name || "";
        createdAt = metaVal.createdAt ? new Date(metaVal.createdAt).toISOString() : "";
      } catch {}
    }

    // 统计消息数并获取第一条用户消息
    const blobs = db.query("SELECT data FROM blobs ORDER BY rowid").all() as { data: Buffer }[];
    let messageCount = 0;
    let firstMessage = "";
    for (const b of blobs) {
      try {
        const obj = JSON.parse(Buffer.from(b.data).toString("utf-8"));
        if (obj.role === "user" || obj.role === "assistant") {
          messageCount++;
          if (obj.role === "user" && !firstMessage) {
            const content = typeof obj.content === "string" ? obj.content :
              Array.isArray(obj.content) ? obj.content.filter((x: any) => x.type === "text").map((x: any) => x.text).join("") : "";
            firstMessage = content.replace(/<[^>]+>/g, "").trim().slice(0, 120);
          }
        }
      } catch {}
    }

    db.close();
    if (messageCount === 0) return null;

    return {
      id: sessionId,
      firstMessage: name || firstMessage || "(unnamed)",
      timestamp: createdAt,
      messageCount,
    };
  } catch {
    return null;
  }
}

function readCursorSession(dbPath: string): Array<{ role: string; content: string; timestamp: string }> {
  const messages: Array<{ role: string; content: string; timestamp: string }> = [];
  try {
    const db = new Database(dbPath, { readonly: true });
    const blobs = db.query("SELECT data FROM blobs ORDER BY rowid").all() as { data: Buffer }[];

    for (const b of blobs) {
      try {
        const obj = JSON.parse(Buffer.from(b.data).toString("utf-8"));
        if (obj.role === "user" || obj.role === "assistant") {
          let text = "";
          if (typeof obj.content === "string") text = obj.content;
          else if (Array.isArray(obj.content)) {
            text = obj.content.filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n");
          }
          // 清理 XML 标签（Cursor 在 user message 里包装了很多系统信息）
          if (obj.role === "user") {
            const userQuery = text.match(/<user_query>([\s\S]*?)<\/user_query>/);
            if (userQuery) text = userQuery[1]!.trim();
          }
          if (text && text.length > 0) {
            messages.push({
              role: obj.role === "assistant" ? "assistant" : "user",
              content: text.slice(0, 2000),
              timestamp: "",
            });
          }
        }
      } catch {}
    }
    db.close();
  } catch {}
  return messages;
}

// === Routes ===

// GET /api/workspaces — 列出所有工作区（Claude Code + Cursor）
app.get("/", (c) => {
  const workspaces: WorkspaceInfo[] = [];

  // Claude Code workspaces
  if (existsSync(CLAUDE_PROJECTS_DIR)) {
    const dirs = readdirSync(CLAUDE_PROJECTS_DIR);
    for (const dir of dirs) {
      const projDir = join(CLAUDE_PROJECTS_DIR, dir);
      if (!statSync(projDir).isDirectory()) continue;
      const jsonlFiles = readdirSync(projDir).filter(f => f.endsWith(".jsonl"));
      if (jsonlFiles.length === 0) continue;

      const sessions: SessionSummary[] = [];
      for (const f of jsonlFiles) {
        const summary = parseSessionSummary(join(projDir, f));
        if (summary) sessions.push(summary);
      }
      sessions.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

      workspaces.push({
        id: dir,
        name: getShortName(dir),
        path: decodeProjectName(dir),
        source: "claude",
        machine: LOCAL_MACHINE,
        sessions,
      });
    }
  }

  // Cursor workspaces
  workspaces.push(...getCursorWorkspaces());

  // 按最新 session 时间排序
  workspaces.sort((a, b) => {
    const aTime = a.sessions[0]?.timestamp || "";
    const bTime = b.sessions[0]?.timestamp || "";
    return bTime.localeCompare(aTime);
  });

  return c.json(workspaces);
});

// GET /api/workspaces/:id/sessions/:sessionId — 获取 session 对话
app.get("/:id/sessions/:sessionId", (c) => {
  const id = c.req.param("id");
  const sessionId = c.req.param("sessionId");

  // Cursor chat session
  if (id.startsWith("cursor:")) {
    const chatHash = id.slice(7);
    const dbPath = join(CURSOR_CHATS_DIR, chatHash, sessionId, "store.db");
    if (!existsSync(dbPath)) return c.json({ error: "Session not found" }, 404);
    return c.json({ messages: readCursorSession(dbPath), source: "cursor" });
  }

  // Cursor composer/agent session — 从全局 cursorDiskKV 读取 bubble 对话
  if (id.startsWith("cursor-ws:")) {
    try {
      const globalDbPath = join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");
      if (!existsSync(globalDbPath)) return c.json({ error: "Cursor global DB not found" }, 404);

      const db = new Database(globalDbPath, { readonly: true });
      const prefix = `bubbleId:${sessionId}:`;
      const bubbles = db.query("SELECT value FROM cursorDiskKV WHERE key LIKE ? AND value IS NOT NULL ORDER BY key").all(prefix + "%") as { value: string }[];
      db.close();

      const messages: Array<{ role: string; content: string; timestamp: string }> = [];
      for (const b of bubbles) {
        try {
          const val = typeof b.value === "string" ? JSON.parse(b.value) : null;
          if (!val) continue;
          const role = val.type === 1 ? "user" : "assistant";
          const timestamp = val.timingInfo?.clientStartTime ? new Date(val.timingInfo.clientStartTime).toISOString() :
            val.createdAt || "";

          let text = val.text || "";

          // 工具调用 — 提取工具名和摘要
          if (!text.trim() && val.toolFormerData) {
            const tool = val.toolFormerData;
            const toolName = tool.name || "tool";
            let params = "";
            try {
              const p = JSON.parse(tool.params || "{}");
              // 常见字段
              params = p.relativeWorkspacePath || p.command || p.query || p.regex || "";
            } catch {}
            text = `[${toolName}] ${params}`.trim();
            if (tool.status) text += ` (${tool.status})`;
          }

          if (!text.trim()) continue;
          messages.push({ role, content: text.slice(0, 2000), timestamp });
        } catch {}
      }

      if (messages.length === 0) {
        messages.push({ role: "system", content: "No conversation data found for this session.", timestamp: "" });
      }

      return c.json({ messages, source: "cursor" });
    } catch { return c.json({ error: "Failed to read composer" }, 500); }
  }

  // Claude Code session
  const projDir = join(CLAUDE_PROJECTS_DIR, id);
  const sessionFile = join(projDir, `${sessionId}.jsonl`);
  if (!existsSync(sessionFile)) return c.json({ error: "Session not found" }, 404);

  const content = readFileSync(sessionFile, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const messages: Array<{ role: string; content: string; timestamp: string }> = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === "user" || obj.type === "assistant") {
        let text = "";
        const msg = obj.message?.content;
        if (typeof msg === "string") text = msg;
        else if (Array.isArray(msg)) {
          text = msg.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
        }
        if (text) {
          messages.push({ role: obj.type, content: text.slice(0, 2000), timestamp: obj.timestamp || "" });
        }
      }
    } catch {}
  }

  return c.json({ messages, source: "claude" });
});

// POST /api/workspaces/chat — 向 session 发送消息（Claude Code / Cursor）
app.post("/chat", async (c) => {
  const { workspaceId, sessionId, message } = await c.req.json<{
    workspaceId: string;
    sessionId: string;
    message: string;
  }>();

  if (!workspaceId || !sessionId || !message) {
    return c.json({ error: "Missing workspaceId, sessionId, or message" }, 400);
  }

  let proc: ReturnType<typeof Bun.spawn>;

  if (workspaceId.startsWith("cursor:") || workspaceId.startsWith("cursor-ws:")) {
    // Cursor: 从 resolveWorkspacePath 获取项目路径
    const wsPath = resolveWorkspacePath(workspaceId);
    if (!wsPath || !existsSync(wsPath)) {
      return c.json({ error: "Cursor workspace path not found", source: "cursor" }, 404);
    }
    // cursor agent --print --trust --resume=<sessionId> (需要 expect 提供 TTY)
    const expectScript = `
spawn cursor agent --print --trust --resume="${sessionId}" "${message.replace(/"/g, '\\"')}"
set timeout 120
expect {
    timeout { exit 1 }
    eof { exit 0 }
    -re ".+" { exp_continue }
}`;
    proc = Bun.spawn(["expect", "-c", expectScript], {
      cwd: wsPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    // 120s 超时自动 kill
    const timeout = setTimeout(() => { try { proc.kill(); } catch {} }, 120000);
    proc.exited.then(() => clearTimeout(timeout));
    console.log(`🔄 Cursor resume: ${sessionId} in ${wsPath}`);
  } else {
    // Claude Code: resume session
    const projPath = decodeProjectName(workspaceId);
    proc = Bun.spawn(["claude", "-r", sessionId, "-p", message], {
      cwd: projPath,
      stdout: "pipe",
      stderr: "pipe",
    });
  }

  const source = workspaceId.startsWith("cursor") ? "cursor" : "claude";
  (async () => {
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error(`❌ ${source} chat failed (exit ${exitCode}): ${stderr.slice(0, 200)}`);
    } else {
      console.log(`✅ ${source} chat 完成`);
    }
  })();

  return c.json({ ok: true, source });
});

// POST /api/workspaces/new — 在指定路径创建新 session（Claude Code / Cursor）
app.post("/new", async (c) => {
  const { path: projectPath, message, agent } = await c.req.json<{
    path: string;
    message?: string;
    agent?: "claude" | "cursor";
  }>();

  if (!projectPath) {
    return c.json({ error: "Missing path" }, 400);
  }

  if (!existsSync(projectPath)) {
    return c.json({ error: `Path not found: ${projectPath}` }, 404);
  }

  const selectedAgent = agent || "claude";
  let proc: ReturnType<typeof Bun.spawn>;

  if (selectedAgent === "cursor") {
    const prompt = message || "hello";
    const expectScript = `
spawn cursor agent --print --trust "${prompt.replace(/"/g, '\\"')}"
set timeout 120
expect {
    timeout { exit 1 }
    eof { exit 0 }
    -re ".+" { exp_continue }
}`;
    proc = Bun.spawn(["expect", "-c", expectScript], {
      cwd: projectPath,
      stdout: "pipe",
      stderr: "pipe",
    });
  } else {
    const args = message ? ["claude", "-p", message] : ["claude", "-p", "hello"];
    proc = Bun.spawn(args, {
      cwd: projectPath,
      stdout: "pipe",
      stderr: "pipe",
    });
  }

  (async () => {
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error(`❌ 新建 ${selectedAgent} session 失败 (exit ${exitCode}): ${stderr.slice(0, 200)}`);
    } else {
      console.log(`✅ 新建 ${selectedAgent} session 完成: ${projectPath}`);
    }
  })();

  return c.json({ ok: true, path: projectPath, agent: selectedAgent });
});

// GET /api/commands — 列出可用的 skills/commands
app.get("/commands", (c) => {
  const commands: Array<{ name: string; type: "skill" | "builtin" | "plugin"; source?: string }> = [];
  const seen = new Set<string>();

  // 内置命令
  const builtins = [
    "commit", "help", "clear", "compact", "resume", "status",
    "init", "review", "model", "permissions", "memory",
  ];
  for (const b of builtins) {
    commands.push({ name: `/${b}`, type: "builtin" });
    seen.add(b);
  }

  // 本地 Skills (~/.cursor/skills/)
  const skillsDir = join(homedir(), ".cursor", "skills");
  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      if (!seen.has(name)) {
        commands.push({ name: `/${name}`, type: "skill" });
        seen.add(name);
      }
    }
  }

  // 插件 Skills (~/.claude/plugins/cache/*/skills/)
  // 格式：插件名:skill名（如 superpowers:writing-plans）
  const pluginsDir = join(homedir(), ".claude", "plugins", "cache");
  if (existsSync(pluginsDir)) {
    const findSkillsDirs = (dir: string, depth: number): Array<{ skillsDir: string; pluginName: string }> => {
      if (depth > 5) return [];
      const results: Array<{ skillsDir: string; pluginName: string }> = [];
      try {
        for (const entry of readdirSync(dir)) {
          const fullPath = join(dir, entry);
          if (!statSync(fullPath).isDirectory()) continue;
          if (entry === "skills") {
            // 从路径推断插件名：cache/<org>/<plugin-name>/...
            const rel = fullPath.replace(pluginsDir + "/", "");
            const parts = rel.split("/");
            // 取第二级目录名作为插件名（如 superpowers, superpowers-chrome）
            const pluginName = parts[1] || parts[0] || "unknown";
            results.push({ skillsDir: fullPath, pluginName });
          } else {
            results.push(...findSkillsDirs(fullPath, depth + 1));
          }
        }
      } catch {}
      return results;
    };

    for (const { skillsDir: sd, pluginName } of findSkillsDirs(pluginsDir, 0)) {
      // 跳过临时缓存目录（temp_git_*）和通用 "skills" 名
      if (pluginName.startsWith("temp_git") || pluginName === "skills") continue;
      try {
        for (const skill of readdirSync(sd)) {
          if (!statSync(join(sd, skill)).isDirectory()) continue;
          const qualifiedName = `${pluginName}:${skill}`;
          if (!seen.has(qualifiedName)) {
            commands.push({ name: `/${qualifiedName}`, type: "plugin", source: pluginName });
            seen.add(qualifiedName);
          }
        }
      } catch {}
    }
  }

  return c.json(commands);
});

// POST /api/workspaces/upload — 上传文件/图片到 workspace
app.post("/upload", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file") as File | null;
  const workspaceId = form.get("workspaceId") as string | null;

  if (!file || !workspaceId) {
    return c.json({ error: "Missing file or workspaceId" }, 400);
  }

  const wsPath = resolveWorkspacePath(workspaceId);
  if (!wsPath) return c.json({ error: "Workspace not found" }, 404);

  // 保存到 workspace 的 .tm-uploads/ 目录
  const uploadDir = join(wsPath, ".tm-uploads");
  if (!existsSync(uploadDir)) {
    const { mkdirSync } = await import("fs");
    mkdirSync(uploadDir, { recursive: true });
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${timestamp}-${safeName}`;
  const filePath = join(uploadDir, fileName);

  const buffer = await file.arrayBuffer();
  const { writeFileSync } = await import("fs");
  writeFileSync(filePath, Buffer.from(buffer));

  return c.json({
    ok: true,
    path: filePath,
    name: file.name,
    size: file.size,
    type: file.type,
  });
});

// === Workspace path resolver ===

function resolveWorkspacePath(id: string): string | null {
  if (id.startsWith("cursor-ws:")) {
    // 从全局 composerHeaders 查找路径
    const globalDbPath = join(homedir(), "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb");
    if (!existsSync(globalDbPath)) return null;
    try {
      const db = new Database(globalDbPath, { readonly: true });
      const row = db.query("SELECT value FROM ItemTable WHERE key='composer.composerHeaders'").get() as { value: string } | null;
      db.close();
      if (!row) return null;
      const hData = JSON.parse(row.value);
      const wsHash = id.slice(10);
      const match = (hData.allComposers as any[]).find(c => c.workspaceIdentifier?.id === wsHash);
      return match?.workspaceIdentifier?.uri?.fsPath || null;
    } catch { return null; }
  }
  if (id.startsWith("cursor:")) return null; // old chat, no project path
  // Claude Code workspace
  return decodeProjectName(id);
}

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

// GET /api/workspaces/:id/files — 目录浏览
app.get("/:id/files", (c) => {
  const id = c.req.param("id");
  const subPath = c.req.query("path") || ".";
  const wsPath = resolveWorkspacePath(id);
  if (!wsPath || !existsSync(wsPath)) return c.json({ error: "Workspace path not found" }, 404);

  const targetPath = join(wsPath, subPath);
  if (!targetPath.startsWith(wsPath)) return c.json({ error: "Invalid path" }, 400);
  if (!existsSync(targetPath)) return c.json({ error: "Path not found" }, 404);

  const stat = statSync(targetPath);
  if (!stat.isDirectory()) {
    // 返回文件内容（限制大小）
    const content = readFileSync(targetPath, "utf-8").slice(0, 50000);
    return c.json({ type: "file", path: subPath, content, size: stat.size });
  }

  const IGNORE = new Set(["node_modules", ".git", "dist", ".next", ".nuxt", "build", "__pycache__", ".turbo", ".cache"]);
  const entries = readdirSync(targetPath).filter(name => !name.startsWith(".") && !IGNORE.has(name)).map(name => {
    const fullPath = join(targetPath, name);
    try {
      const s = statSync(fullPath);
      return { name, isDir: s.isDirectory(), size: s.size, mtime: s.mtime.toISOString() };
    } catch {
      return { name, isDir: false, size: 0, mtime: "" };
    }
  });
  // 目录在前，文件在后
  entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));

  return c.json({ type: "dir", path: subPath, entries, root: wsPath });
});

// GET /api/workspaces/:id/git/status — git status
app.get("/:id/git/status", async (c) => {
  const id = c.req.param("id");
  const wsPath = resolveWorkspacePath(id);
  if (!wsPath || !existsSync(wsPath)) return c.json({ error: "Workspace path not found" }, 404);

  const { stdout, exitCode } = await runGit(wsPath, ["status", "--porcelain", "-uall"]);
  if (exitCode !== 0) return c.json({ error: "Not a git repo" }, 400);

  const files = stdout.trim().split("\n").filter(Boolean).map(line => {
    const status = line.slice(0, 2);
    const file = line.slice(3);
    return { status: status.trim() || "?", file };
  });

  // branch info
  const { stdout: branch } = await runGit(wsPath, ["branch", "--show-current"]);
  const { stdout: logLine } = await runGit(wsPath, ["log", "--oneline", "-1"]);

  return c.json({ branch: branch.trim(), lastCommit: logLine.trim(), files });
});

// GET /api/workspaces/:id/git/diff — git diff (working tree or specific commit)
app.get("/:id/git/diff", async (c) => {
  const id = c.req.param("id");
  const ref = c.req.query("ref"); // optional: commit hash
  const wsPath = resolveWorkspacePath(id);
  if (!wsPath || !existsSync(wsPath)) return c.json({ error: "Workspace path not found" }, 404);

  let diff: string;
  if (ref) {
    // 某次 commit 的 diff
    const { stdout } = await runGit(wsPath, ["show", ref, "--stat", "--patch", "--no-color"]);
    diff = stdout;
  } else {
    // 当前 working tree：staged + unstaged
    const { stdout: staged } = await runGit(wsPath, ["diff", "--cached", "--no-color"]);
    const { stdout: unstaged } = await runGit(wsPath, ["diff", "--no-color"]);
    diff = (staged ? "=== STAGED ===\n" + staged + "\n" : "") +
           (unstaged ? "=== UNSTAGED ===\n" + unstaged : "");
    if (!diff) diff = "(no changes)";
  }

  // 限制大小
  return c.json({ diff: diff.slice(0, 100000) });
});

// GET /api/workspaces/:id/git/log — 最近 commits
app.get("/:id/git/log", async (c) => {
  const id = c.req.param("id");
  const wsPath = resolveWorkspacePath(id);
  if (!wsPath || !existsSync(wsPath)) return c.json({ error: "Workspace path not found" }, 404);

  const { stdout, exitCode } = await runGit(wsPath, [
    "log", "--oneline", "--no-color", "-30",
    "--format=%H|%h|%s|%an|%ar",
  ]);
  if (exitCode !== 0) return c.json({ error: "Not a git repo" }, 400);

  const commits = stdout.trim().split("\n").filter(Boolean).map(line => {
    const [hash, short, message, author, time] = line.split("|");
    return { hash, short, message, author, time };
  });

  return c.json(commits);
});

export default app;
