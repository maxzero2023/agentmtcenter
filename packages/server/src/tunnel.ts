import { spawn } from "child_process";
import { homedir } from "os";
import { join, dirname } from "path";
import { existsSync, writeFileSync, mkdirSync, readFileSync } from "fs";

const CONFIG_DIR = join(homedir(), ".tm-server");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const TUNNEL_FILE = join(CONFIG_DIR, "tunnel.json");

function getDuckDnsConfig(): { domain: string; token: string } | null {
  try {
    const config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    if (config.duckdns?.domain && config.duckdns?.token) return config.duckdns;
  } catch {}
  return null;
}

let tunnelProcess: ReturnType<typeof spawn> | null = null;
let currentUrl: string | null = null;

export function getTunnelUrl(): string | null {
  if (currentUrl) return currentUrl;
  if (existsSync(TUNNEL_FILE)) {
    try {
      const data = JSON.parse(readFileSync(TUNNEL_FILE, "utf-8"));
      return data.url || null;
    } catch {}
  }
  return null;
}

export function startTunnel(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (tunnelProcess) {
      tunnelProcess.kill();
      tunnelProcess = null;
    }

    const proc = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    tunnelProcess = proc;

    let resolved = false;
    const onData = (data: Buffer) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z\-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        resolved = true;
        currentUrl = match[0];
        // 持久化 URL
        if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
        writeFileSync(TUNNEL_FILE, JSON.stringify({ url: currentUrl, startedAt: new Date().toISOString() }));
        console.log(`🌐 Tunnel: ${currentUrl}`);
        // 更新 DuckDNS TXT 记录
        updateDuckDns(currentUrl);
        resolve(currentUrl);
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    proc.on("close", (code) => {
      currentUrl = null;
      tunnelProcess = null;
      if (!resolved) reject(new Error(`cloudflared exited with code ${code}`));
    });

    // 超时
    setTimeout(() => {
      if (!resolved) reject(new Error("Tunnel startup timeout"));
    }, 30000);
  });
}

export function stopTunnel() {
  if (tunnelProcess) {
    tunnelProcess.kill();
    tunnelProcess = null;
    currentUrl = null;
  }
}

async function updateDuckDns(tunnelUrl: string) {
  const duckdns = getDuckDnsConfig();
  if (!duckdns) return;
  try {
    const url = `https://www.duckdns.org/update?domains=${duckdns.domain}&token=${duckdns.token}&txt=${encodeURIComponent(tunnelUrl)}&verbose=true`;
    const res = await fetch(url);
    const text = await res.text();
    if (text.startsWith("OK")) {
      console.log(`🦆 DuckDNS TXT 已更新: ${duckdns.domain}.duckdns.org → ${tunnelUrl}`);
    } else {
      console.log(`⚠️  DuckDNS 更新失败: ${text}`);
    }
  } catch (err) {
    console.log(`⚠️  DuckDNS 更新失败: ${err}`);
  }
}
