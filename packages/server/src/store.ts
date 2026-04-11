import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { AgentInfo, MachineInfo, ServerState, SessionInfo } from "@tm/shared";

const STATE_DIR = join(homedir(), ".tm-server");
const STATE_FILE = join(STATE_DIR, "state.json");

function emptyState(): ServerState {
  return { machines: {}, sessions: [] };
}

let state: ServerState = emptyState();

export function loadState(): void {
  if (existsSync(STATE_FILE)) {
    const raw = readFileSync(STATE_FILE, "utf-8");
    state = JSON.parse(raw) as ServerState;
    // 启动时标记所有 agent 为 offline
    for (const machine of Object.values(state.machines)) {
      machine.online = false;
      for (const agent of Object.values(machine.agents)) {
        agent.status = "offline";
      }
    }
  }
}

function persist(): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// === Machines ===

export function upsertMachine(id: string, info: Omit<MachineInfo, "agents" | "registeredAt" | "lastSeen" | "online">, agents: Array<{ name: string; cmd: string; tags: string[] }>): void {
  const existing = state.machines[id];
  const now = new Date().toISOString();
  const agentMap: Record<string, AgentInfo> = {};
  for (const a of agents) {
    agentMap[a.name] = { cmd: a.cmd, tags: a.tags, status: "idle" };
  }
  state.machines[id] = {
    ...info,
    registeredAt: existing?.registeredAt ?? now,
    lastSeen: now,
    online: true,
    agents: agentMap,
  };
  persist();
}

export function getMachines(): Record<string, MachineInfo> {
  return state.machines;
}

export function getMachine(id: string): MachineInfo | undefined {
  return state.machines[id];
}

export function updateMachineHeartbeat(id: string): boolean {
  const machine = state.machines[id];
  if (!machine) return false;
  machine.lastSeen = new Date().toISOString();
  machine.online = true;
  persist();
  return true;
}

export function setMachineOffline(id: string): void {
  const machine = state.machines[id];
  if (!machine) return;
  machine.online = false;
  for (const agent of Object.values(machine.agents)) {
    agent.status = "offline";
  }
  persist();
}

// === Agents ===

export function getAgents(statusFilter?: string): Array<{ machineId: string; name: string } & AgentInfo> {
  const result: Array<{ machineId: string; name: string } & AgentInfo> = [];
  for (const [machineId, machine] of Object.entries(state.machines)) {
    for (const [name, agent] of Object.entries(machine.agents)) {
      if (!statusFilter || agent.status === statusFilter) {
        result.push({ machineId, name, ...agent });
      }
    }
  }
  return result;
}

export function updateAgentStatus(machineId: string, agentName: string, status: AgentInfo["status"]): boolean {
  const agent = state.machines[machineId]?.agents[agentName];
  if (!agent) return false;
  agent.status = status;
  persist();
  return true;
}

// === Sessions ===

export function createSession(session: SessionInfo): void {
  state.sessions.push(session);
  persist();
}

export function getSession(id: string): SessionInfo | undefined {
  return state.sessions.find(s => s.id === id);
}

export function getSessions(statusFilter?: string): SessionInfo[] {
  if (!statusFilter) return state.sessions;
  return state.sessions.filter(s => s.status === statusFilter);
}

export function updateSessionStatus(id: string, status: SessionInfo["status"]): boolean {
  const session = state.sessions.find(s => s.id === id);
  if (!session) return false;
  session.status = status;
  if (status === "completed" || status === "failed") {
    session.completedAt = new Date().toISOString();
  }
  persist();
  return true;
}
