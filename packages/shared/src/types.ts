export interface MachineInfo {
  hostname: string;
  tailscaleIp: string;
  os: string;
  registeredAt: string;
  lastSeen: string;
  online: boolean;
  agents: Record<string, AgentInfo>;
}

export interface AgentInfo {
  cmd: string;
  tags: string[];
  status: "idle" | "busy" | "offline";
}

export interface SessionInfo {
  id: string;
  agentName: string;
  machineId: string;
  instruction: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
}

export interface ServerState {
  machines: Record<string, MachineInfo>;
  sessions: SessionInfo[];
}

export interface AgentConfig {
  name: string;
  cmd: string;
  tags: string[];
}

export interface AgentClientConfig {
  server: string;
  token: string;
  machineId: string;
  agents: AgentConfig[];
  duckdns?: string; // e.g. "maxthjp" — auto-resolve tunnel URL from DuckDNS TXT
}
