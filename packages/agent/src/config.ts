import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { AgentClientConfig, AgentConfig } from "@tm/shared";

const CONFIG_DIR = join(homedir(), ".tm-agent");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadConfig(): AgentClientConfig {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error("未初始化，请先运行: tm-agent init --server <url> --token <token>");
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as AgentClientConfig;
}

export function saveConfig(config: AgentClientConfig): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function addAgent(name: string, cmd: string, tags: string[]): void {
  const config = loadConfig();
  const existing = config.agents.findIndex(a => a.name === name);
  const agent: AgentConfig = { name, cmd, tags };
  if (existing >= 0) {
    config.agents[existing] = agent;
  } else {
    config.agents.push(agent);
  }
  saveConfig(config);
}

export function removeAgent(name: string): boolean {
  const config = loadConfig();
  const idx = config.agents.findIndex(a => a.name === name);
  if (idx < 0) return false;
  config.agents.splice(idx, 1);
  saveConfig(config);
  return true;
}

export function listAgents(): AgentConfig[] {
  const config = loadConfig();
  return config.agents;
}
