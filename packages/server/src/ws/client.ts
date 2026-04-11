import type { ServerWebSocket } from "bun";
import type { ClientToServerMessage } from "@tm/shared";
import { createSession, getAgents, updateAgentStatus, getSession } from "../store.ts";
import { getAgentConnection } from "./agent.ts";
import { addClient, removeClient, subscribe, broadcastSessionCreated, broadcastError, broadcastStatus } from "../router.ts";
import { subscribeToSession, unsubscribeAll } from "../watcher.ts";

interface ClientWsData {
  authenticated: boolean;
  subscribedSessions: Set<string>;
}

export function handleClientOpen(ws: ServerWebSocket<ClientWsData>) {
  ws.data.subscribedSessions = new Set();
  addClient(ws);
}

export function handleClientMessage(ws: ServerWebSocket<ClientWsData>, raw: string) {
  let msg: ClientToServerMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    broadcastError(ws, "Invalid JSON");
    return;
  }

  switch (msg.type) {
    case "dispatch": {
      // agentId format: agentName@machineId
      const [agentName, machineId] = msg.agentId.split("@");
      if (!agentName || !machineId) {
        broadcastError(ws, "Invalid agentId format, use: agentName@machineId");
        return;
      }

      // 检查 agent 是否存在且空闲
      const agents = getAgents();
      const agent = agents.find(a => a.name === agentName && a.machineId === machineId);
      if (!agent) {
        broadcastError(ws, `Agent ${msg.agentId} not found`);
        return;
      }
      if (agent.status !== "idle") {
        broadcastError(ws, `Agent ${msg.agentId} is ${agent.status}`);
        return;
      }

      // 找到 agent 所在机器的 WebSocket
      const agentWs = getAgentConnection(machineId);
      if (!agentWs) {
        broadcastError(ws, `Machine ${machineId} not connected`);
        return;
      }

      // 创建 session
      const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      createSession({
        id: sessionId,
        agentName,
        machineId,
        instruction: msg.instruction,
        status: "running",
        createdAt: new Date().toISOString(),
      });

      // 标记 agent 为 busy
      updateAgentStatus(machineId, agentName, "busy");
      broadcastStatus(msg.agentId, "busy");

      // 自动订阅该 session
      subscribe(ws, sessionId);

      // 转发调度指令给 agent
      agentWs.send(JSON.stringify({
        type: "dispatch",
        sessionId,
        agentName,
        instruction: msg.instruction,
      }));

      broadcastSessionCreated(ws, sessionId);
      console.log(`📤 调度: ${msg.agentId} → ${sessionId}`);
      break;
    }

    case "subscribe": {
      subscribe(ws, msg.sessionId);
      break;
    }

    case "chat": {
      // 找到 session 对应的 agent 机器，转发消息
      const session = getSession(msg.sessionId);
      if (!session) {
        broadcastError(ws, `Session ${msg.sessionId} not found`);
        return;
      }
      if (session.status !== "running") {
        broadcastError(ws, `Session ${msg.sessionId} is ${session.status}`);
        return;
      }
      const agentWs = getAgentConnection(session.machineId);
      if (!agentWs) {
        broadcastError(ws, `Machine ${session.machineId} not connected`);
        return;
      }
      agentWs.send(JSON.stringify({
        type: "message",
        sessionId: msg.sessionId,
        content: msg.content,
      }));
      break;
    }

    case "watch_workspace": {
      // 订阅 Claude Code session 文件变化
      const { workspaceId, sessionId } = msg as any;
      if (workspaceId && sessionId) {
        subscribeToSession(ws, workspaceId, sessionId);
      }
      break;
    }

    case "resume_session": {
      // 用 claude -r <sessionId> 继续会话
      const { workspaceId, sessionId: resumeId, machineId: targetMachine, agentName: targetAgent } = msg as any;
      const agentWs = getAgentConnection(targetMachine);
      if (!agentWs) {
        broadcastError(ws, `Machine ${targetMachine} not connected`);
        return;
      }
      // 订阅文件变化
      subscribeToSession(ws, workspaceId, resumeId);
      // 发送 resume 指令给 agent
      agentWs.send(JSON.stringify({
        type: "resume",
        sessionId: resumeId,
        agentName: targetAgent || "claude-code",
      }));
      ws.send(JSON.stringify({ type: "resume_started", sessionId: resumeId }));
      console.log(`🔄 恢复会话: ${resumeId} on ${targetMachine}`);
      break;
    }
  }
}

export function handleClientClose(ws: ServerWebSocket<ClientWsData>) {
  unsubscribeAll(ws);
  removeClient(ws);
}

export type { ClientWsData };
