import { watch, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import type { ServerWebSocket } from "bun";
import type { ClientWsData } from "./ws/client.ts";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

// workspaceId:sessionId → subscribed clients
const watchers = new Map<string, {
  clients: Set<ServerWebSocket<ClientWsData>>;
  lastSize: number;
  watcher: ReturnType<typeof watch> | null;
}>();

function getSessionFilePath(workspaceId: string, sessionId: string): string {
  return join(CLAUDE_PROJECTS_DIR, workspaceId, `${sessionId}.jsonl`);
}

export function subscribeToSession(ws: ServerWebSocket<ClientWsData>, workspaceId: string, sessionId: string) {
  const key = `${workspaceId}:${sessionId}`;
  let entry = watchers.get(key);

  if (!entry) {
    const filePath = getSessionFilePath(workspaceId, sessionId);
    let lastSize = 0;
    try { lastSize = statSync(filePath).size; } catch {}

    entry = { clients: new Set(), lastSize, watcher: null };
    watchers.set(key, entry);

    // 启动文件监听
    try {
      entry.watcher = watch(filePath, () => {
        const e = watchers.get(key);
        if (!e || e.clients.size === 0) return;

        try {
          const currentSize = statSync(filePath).size;
          if (currentSize <= e.lastSize) return;

          // 读取新增内容
          const fd = Bun.file(filePath);
          const buffer = readFileSync(filePath, "utf-8");
          const newContent = buffer.slice(e.lastSize);
          e.lastSize = currentSize;

          // 解析新增行
          const lines = newContent.split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (obj.type === "user" || obj.type === "assistant") {
                let text = "";
                const msg = obj.message?.content;
                if (typeof msg === "string") {
                  text = msg;
                } else if (Array.isArray(msg)) {
                  text = msg.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
                }
                if (text) {
                  const payload = JSON.stringify({
                    type: "workspace_message",
                    workspaceId,
                    sessionId,
                    role: obj.type,
                    content: text.slice(0, 2000),
                    timestamp: obj.timestamp || "",
                  });
                  for (const client of e.clients) {
                    client.send(payload);
                  }
                }
              }
            } catch {}
          }
        } catch {}
      });
    } catch {}
  }

  entry.clients.add(ws);
}

export function unsubscribeFromSession(ws: ServerWebSocket<ClientWsData>, workspaceId: string, sessionId: string) {
  const key = `${workspaceId}:${sessionId}`;
  const entry = watchers.get(key);
  if (!entry) return;
  entry.clients.delete(ws);
  if (entry.clients.size === 0) {
    entry.watcher?.close();
    watchers.delete(key);
  }
}

export function unsubscribeAll(ws: ServerWebSocket<ClientWsData>) {
  for (const [key, entry] of watchers) {
    entry.clients.delete(ws);
    if (entry.clients.size === 0) {
      entry.watcher?.close();
      watchers.delete(key);
    }
  }
}
