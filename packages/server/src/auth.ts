import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { SignJWT, jwtVerify } from "jose";

const CONFIG_DIR = join(homedir(), ".tm-server");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface ServerConfig {
  secretToken: string;
}

let config: ServerConfig | null = null;

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  for (const byte of bytes) {
    result += chars[byte % chars.length];
  }
  return result;
}

export function loadConfig(): ServerConfig {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (existsSync(CONFIG_FILE)) {
    config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as ServerConfig;
  } else {
    config = { secretToken: generateToken() };
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log("\n🔑 首次启动，已生成 secret token：");
    console.log(`   ${config.secretToken}`);
    console.log("   请在 tm-agent init 时使用此 token\n");
  }
  return config;
}

export function getSecretToken(): string {
  if (!config) throw new Error("Config not loaded");
  return config.secretToken;
}

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(getSecretToken());
}

export async function signJwt(machineId: string): Promise<string> {
  return new SignJWT({ machineId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(getJwtSecret());
}

export async function verifyJwt(token: string): Promise<{ machineId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return { machineId: payload.machineId as string };
  } catch {
    return null;
  }
}
