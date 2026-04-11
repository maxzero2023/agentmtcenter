import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".tm");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface CliConfig {
  server: string;
  token: string;
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadConfig(): CliConfig {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error("未配置，请先运行: tm config --server <url> --token <token>");
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as CliConfig;
}

export function saveConfig(server: string, token: string): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify({ server, token }, null, 2));
}
