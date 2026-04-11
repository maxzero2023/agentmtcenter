import type { ServerWebSocket } from "bun";
import type { AgentToServerMessage } from "@tm/shared";
import { upsertMachine, updateMachineHeartbeat, setMachineOffline, updateAgentStatus, updateSessionStatus, getSession } from "../store.ts";
import { broadcastOutput, broadcastStatus, notifySessionDone, notifySessionError } from "../router.ts";

interface AgentWsData {
  machineId: string | null;
  authenticated: boolean;
}

// machineId → ws 映射，用于调度时找到目标 agent 所在机器
const machineConnections = new Map<string, ServerWebSocket<AgentWsData>>();

export function getAgentConnection(machineId: string): ServerWebSocket<AgentWsData> | undefined {
  return machineConnections.get(machineId);
}

// 心跳超时检测
const heartbeatTimers = new Map<string, Timer>();

function resetHeartbeatTimer(machineId: string) {
  const existing = heartbeatTimers.get(machineId);
  if (existing) clearTimeout(existing);

  heartbeatTimers.set(machineId, setTimeout(() => {
    console.log(`⚠️  机器 ${machineId} 心跳超时，标记为离线`);
    setMachineOffline(machineId);
    heartbeatTimers.delete(machineId);
    const ws = machineConnections.get(machineId);
    if (ws) {
      try { ws.close(); } catch {}
      machineConnections.delete(machineId);
    }
  }, 60_000));
}

export async function handleAgentOpen(ws: ServerWebSocket<AgentWsData>) {
  // 连接时通过 URL query 验证 JWT
  // token 在 upgrade 时已验证，这里 machineId 可能还没设置
}

export async function handleAgentMessage(ws: ServerWebSocket<AgentWsData>, raw: string) {
  let msg: AgentToServerMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    return;
  }

  switch (msg.type) {
    case "register": {
      const { machine, agents } = msg;
      // 生成或复用 machineId
      const machineId = `${machine.hostname}-${machine.tailscaleIp}`.replace(/\./g, "-");
      ws.data.machineId = machineId;
      ws.data.authenticated = true;

      upsertMachine(machineId, {
        hostname: machine.hostname,
        tailscaleIp: machine.tailscaleIp,
        os: machine.os,
      }, agents);

      machineConnections.set(machineId, ws);
      resetHeartbeatTimer(machineId);

      ws.send(JSON.stringify({ type: "registered", machineId }));
      console.log(`✅ 机器已注册: ${machineId} (${agents.length} agents)`);
      break;
    }

    case "heartbeat": {
      const { machineId } = msg;
      updateMachineHeartbeat(machineId);
      resetHeartbeatTimer(machineId);
      break;
    }

    case "output": {
      const session = getSession(msg.sessionId);
      if (session) {
        const agentId = `${session.agentName}@${session.machineId}`;
        broadcastOutput(msg.sessionId, agentId, msg.content, msg.stream);
      }
      break;
    }

    case "done": {
      const session = getSession(msg.sessionId);
      if (session) {
        updateSessionStatus(msg.sessionId, "completed");
        updateAgentStatus(session.machineId, session.agentName, "idle");
        broadcastStatus(`${session.agentName}@${session.machineId}`, "idle");
        notifySessionDone(msg.sessionId, msg.result);
      }
      break;
    }

    case "error": {
      const session = getSession(msg.sessionId);
      if (session) {
        updateSessionStatus(msg.sessionId, "failed");
        updateAgentStatus(session.machineId, session.agentName, "idle");
        broadcastStatus(`${session.agentName}@${session.machineId}`, "idle");
        notifySessionError(msg.sessionId, msg.error);
      }
      break;
    }
  }
}

export function handleAgentClose(ws: ServerWebSocket<AgentWsData>) {
  const { machineId } = ws.data;
  if (machineId) {
    console.log(`🔌 机器断开: ${machineId}`);
    setMachineOffline(machineId);
    machineConnections.delete(machineId);
    const timer = heartbeatTimers.get(machineId);
    if (timer) {
      clearTimeout(timer);
      heartbeatTimers.delete(machineId);
    }
  }
}

export type { AgentWsData };
