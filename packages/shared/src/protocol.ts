import type { AgentConfig } from "./types.ts";

// === Agent → Server ===

export interface RegisterMessage {
  type: "register";
  machine: {
    hostname: string;
    os: string;
    tailscaleIp: string;
  };
  agents: AgentConfig[];
}

export interface HeartbeatMessage {
  type: "heartbeat";
  machineId: string;
}

export interface OutputMessage {
  type: "output";
  sessionId: string;
  content: string;
  stream?: "stdout" | "stderr";
}

export interface DoneMessage {
  type: "done";
  sessionId: string;
  result: string;
}

export interface ErrorMessage {
  type: "error";
  sessionId: string;
  error: string;
}

export type AgentToServerMessage =
  | RegisterMessage
  | HeartbeatMessage
  | OutputMessage
  | DoneMessage
  | ErrorMessage;

// === Server → Agent ===

export interface DispatchToAgentMessage {
  type: "dispatch";
  sessionId: string;
  agentName: string;
  instruction: string;
}

export interface MessageToAgentMessage {
  type: "message";
  sessionId: string;
  content: string;
}

export interface RegisteredMessage {
  type: "registered";
  machineId: string;
}

export type ServerToAgentMessage =
  | DispatchToAgentMessage
  | MessageToAgentMessage
  | RegisteredMessage;

// === Client → Server ===

export interface DispatchRequestMessage {
  type: "dispatch";
  agentId: string; // format: agentName@machineId
  instruction: string;
}

export interface ChatMessage {
  type: "chat";
  sessionId: string;
  content: string;
}

export interface SubscribeMessage {
  type: "subscribe";
  sessionId: string;
}

export type ClientToServerMessage =
  | DispatchRequestMessage
  | ChatMessage
  | SubscribeMessage;

// === Server → Client ===

export interface OutputToClientMessage {
  type: "output";
  sessionId: string;
  agentId: string;
  content: string;
  stream?: "stdout" | "stderr";
}

export interface StatusMessage {
  type: "status";
  agentId: string;
  status: "idle" | "busy" | "offline";
}

export interface SessionCreatedMessage {
  type: "session_created";
  sessionId: string;
}

export interface ErrorToClientMessage {
  type: "error";
  message: string;
}

export type ServerToClientMessage =
  | OutputToClientMessage
  | StatusMessage
  | SessionCreatedMessage
  | ErrorToClientMessage;
