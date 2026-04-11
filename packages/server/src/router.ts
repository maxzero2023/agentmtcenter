import type { ServerWebSocket } from "bun";
import type { ClientWsData } from "./ws/client.ts";
import type { OutputToClientMessage, StatusMessage, SessionCreatedMessage, ErrorToClientMessage } from "@tm/shared";

// session → 订阅的 client WebSocket 集合
const subscriptions = new Map<string, Set<ServerWebSocket<ClientWsData>>>();

// session → 消息历史缓存（内存，最多保留 500 条/session）
const sessionHistory = new Map<string, string[]>();
const MAX_HISTORY_PER_SESSION = 500;

function appendHistory(sessionId: string, raw: string) {
  let history = sessionHistory.get(sessionId);
  if (!history) {
    history = [];
    sessionHistory.set(sessionId, history);
  }
  if (history.length < MAX_HISTORY_PER_SESSION) {
    history.push(raw);
  }
}

// 所有已连接的 client（用于广播状态变更）
const allClients = new Set<ServerWebSocket<ClientWsData>>();

export function addClient(ws: ServerWebSocket<ClientWsData>) {
  allClients.add(ws);
}

export function removeClient(ws: ServerWebSocket<ClientWsData>) {
  allClients.delete(ws);
  // 清理订阅
  for (const [sessionId, subs] of subscriptions) {
    subs.delete(ws);
    if (subs.size === 0) subscriptions.delete(sessionId);
  }
}

export function subscribe(ws: ServerWebSocket<ClientWsData>, sessionId: string) {
  let subs = subscriptions.get(sessionId);
  if (!subs) {
    subs = new Set();
    subscriptions.set(sessionId, subs);
  }
  subs.add(ws);
  ws.data.subscribedSessions.add(sessionId);

  // 回放历史消息
  const history = sessionHistory.get(sessionId);
  if (history) {
    for (const raw of history) {
      ws.send(raw);
    }
  }
}

export function broadcastOutput(sessionId: string, agentId: string, content: string, stream?: "stdout" | "stderr") {
  const msg: OutputToClientMessage = { type: "output", sessionId, agentId, content, stream };
  const raw = JSON.stringify(msg);
  appendHistory(sessionId, raw);
  const subs = subscriptions.get(sessionId);
  if (subs) {
    for (const ws of subs) {
      ws.send(raw);
    }
  }
}

export function broadcastStatus(agentId: string, status: "idle" | "busy" | "offline") {
  const msg: StatusMessage = { type: "status", agentId, status };
  const raw = JSON.stringify(msg);
  for (const ws of allClients) {
    ws.send(raw);
  }
}

export function broadcastSessionCreated(ws: ServerWebSocket<ClientWsData>, sessionId: string) {
  const msg: SessionCreatedMessage = { type: "session_created", sessionId };
  ws.send(JSON.stringify(msg));
}

export function broadcastError(ws: ServerWebSocket<ClientWsData>, message: string) {
  const msg: ErrorToClientMessage = { type: "error", message };
  ws.send(JSON.stringify(msg));
}

export function notifySessionDone(sessionId: string, result: string) {
  const raw = JSON.stringify({ type: "done", sessionId, result });
  appendHistory(sessionId, raw);
  const subs = subscriptions.get(sessionId);
  if (subs) {
    for (const ws of subs) {
      ws.send(raw);
    }
  }
}

export function notifySessionError(sessionId: string, error: string) {
  const raw = JSON.stringify({ type: "error", sessionId, error });
  appendHistory(sessionId, raw);
  const subs = subscriptions.get(sessionId);
  if (subs) {
    for (const ws of subs) {
      ws.send(raw);
    }
  }
}
