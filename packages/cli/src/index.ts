#!/usr/bin/env bun
import { Command } from "commander";
import { saveConfig, configExists } from "./config.ts";
import { listAgents, sendDispatch, listSessions, attachSession, chatWithAgent } from "./dispatch.ts";

const program = new Command();

program
  .name("tm")
  .description("Agent 调度中心 CLI")
  .version("0.1.0");

program
  .command("config")
  .description("配置调度服务器连接")
  .requiredOption("--server <url>", "服务器地址")
  .requiredOption("--token <token>", "服务器 secret token")
  .action(async (opts: { server: string; token: string }) => {
    const server = opts.server.replace(/\/$/, "");

    // 用 secret token 换 JWT
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
    saveConfig(server, jwt);
    console.log("✅ 配置已保存到 ~/.tm/config.json");
  });

const dispatch = program
  .command("dispatch")
  .description("调度管理");

dispatch
  .command("list")
  .description("列出在线 agent")
  .action(async () => {
    await listAgents();
  });

dispatch
  .command("send <agentId> <instruction>")
  .description("向 agent 发送指令 (格式: agentName@machineId)")
  .action(async (agentId: string, instruction: string) => {
    await sendDispatch(agentId, instruction);
  });

dispatch
  .command("sessions")
  .description("查看会话列表")
  .action(async () => {
    await listSessions();
  });

dispatch
  .command("attach <sessionId>")
  .description("接入运行中的会话")
  .action(async (sessionId: string) => {
    await attachSession(sessionId);
  });

dispatch
  .command("chat <agentId> [instruction]")
  .description("与 agent 交互式对话 (格式: agentName@machineId)")
  .action(async (agentId: string, instruction?: string) => {
    await chatWithAgent(agentId, instruction);
  });

program.parse();
