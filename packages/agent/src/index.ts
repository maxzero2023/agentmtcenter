#!/usr/bin/env bun
import { Command } from "commander";
import { saveConfig, addAgent, removeAgent, listAgents, configExists } from "./config.ts";
import { startDaemon } from "./daemon.ts";
import type { AgentClientConfig } from "@tm/shared";

const program = new Command();

program
  .name("tm-agent")
  .description("Agent 调度中心 Worker 守护进程")
  .version("0.1.0");

program
  .command("init")
  .description("初始化：连接服务器并注册")
  .requiredOption("--server <url>", "调度服务器地址（或用 --duckdns 自动解析）")
  .requiredOption("--token <token>", "服务器 secret token")
  .option("--duckdns <domain>", "DuckDNS 域名，自动解析 tunnel URL（如 maxthjp）")
  .action(async (opts: { server: string; token: string; duckdns?: string }) => {
    let server = opts.server.replace(/\/$/, "");

    // 如果指定了 duckdns，先解析出实际 URL
    if (opts.duckdns) {
      console.log(`🦆 从 DuckDNS 解析: ${opts.duckdns}.duckdns.org...`);
      try {
        const res = await fetch(`https://dns.google/resolve?name=${opts.duckdns}.duckdns.org&type=TXT`);
        const data = await res.json() as any;
        const txt = data.Answer?.find((a: any) => a.type === 16);
        if (txt) {
          const url = txt.data.replace(/"/g, "");
          if (url.startsWith("https://")) {
            server = url;
            console.log(`✅ 解析到: ${server}`);
          }
        }
      } catch (err) {
        console.error(`⚠️  DuckDNS 解析失败: ${err}`);
      }
    }

    console.log(`🔗 正在连接 ${server}...`);

    // 用 secret token 换取 JWT
    const res = await fetch(`${server}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: opts.token }),
    });

    if (!res.ok) {
      const err = await res.json() as { error: string };
      console.error(`❌ 认证失败: ${err.error}`);
      process.exit(1);
    }

    const { jwt } = await res.json() as { jwt: string };

    const config: AgentClientConfig = {
      server,
      token: jwt,
      machineId: "",
      agents: [],
      ...(opts.duckdns ? { duckdns: opts.duckdns } : {}),
    };
    saveConfig(config);
    console.log("✅ 初始化成功！配置已保存到 ~/.tm-agent/config.json");
    if (opts.duckdns) {
      console.log(`   DuckDNS: ${opts.duckdns} (重连时自动解析最新 URL)`);
    }
    console.log("   下一步: tm-agent add <name> --cmd <command>");
  });

program
  .command("add <name>")
  .description("添加一个可用的 agent")
  .requiredOption("--cmd <command>", "启动命令")
  .option("--tag <tags...>", "标签", [])
  .action((name: string, opts: { cmd: string; tag: string[] }) => {
    addAgent(name, opts.cmd, opts.tag);
    console.log(`✅ 已添加 agent: ${name} (${opts.cmd})`);
  });

program
  .command("remove <name>")
  .description("移除一个 agent")
  .action((name: string) => {
    if (removeAgent(name)) {
      console.log(`✅ 已移除 agent: ${name}`);
    } else {
      console.error(`❌ 未找到 agent: ${name}`);
    }
  });

program
  .command("list")
  .description("列出已配置的 agent")
  .action(() => {
    const agents = listAgents();
    if (agents.length === 0) {
      console.log("暂无 agent，使用 tm-agent add 添加");
      return;
    }
    console.log("已配置的 agent：");
    for (const a of agents) {
      const tags = a.tags.length > 0 ? ` [${a.tags.join(", ")}]` : "";
      console.log(`  ${a.name}: ${a.cmd}${tags}`);
    }
  });

program
  .command("start")
  .description("启动守护进程，连接调度服务器")
  .option("-d, --daemon", "后台运行")
  .action(async (opts: { daemon?: boolean }) => {
    if (!configExists()) {
      console.error("❌ 未初始化，请先运行: tm-agent init --server <url> --token <token>");
      process.exit(1);
    }
    if (opts.daemon) {
      // 后台模式：用 Bun.spawn 启动自己
      const proc = Bun.spawn(["bun", "run", import.meta.path, "start"], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore",
      });
      console.log(`✅ 守护进程已启动 (PID: ${proc.pid})`);
      return;
    }
    await startDaemon();
  });

program.parse();
