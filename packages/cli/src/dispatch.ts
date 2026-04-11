import { loadConfig } from "./config.ts";

function headers() {
  const config = loadConfig();
  return {
    "Authorization": `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };
}

function apiUrl(path: string): string {
  const config = loadConfig();
  return `${config.server}${path}`;
}

function wsUrl(path: string): string {
  const config = loadConfig();
  return config.server.replace(/^http/, "ws") + path + `?token=${config.token}`;
}

export async function listAgents() {
  const res = await fetch(apiUrl("/api/agents"), { headers: headers() });
  const agents = await res.json() as Array<{ machineId: string; name: string; status: string; cmd: string; tags: string[] }>;

  if (agents.length === 0) {
    console.log("暂无在线 agent");
    return;
  }

  // 按机器分组
  const byMachine = new Map<string, typeof agents>();
  for (const a of agents) {
    const list = byMachine.get(a.machineId) ?? [];
    list.push(a);
    byMachine.set(a.machineId, list);
  }

  for (const [machineId, machineAgents] of byMachine) {
    console.log(`\n📦 ${machineId}`);
    for (const a of machineAgents) {
      const statusIcon = a.status === "idle" ? "🟢" : a.status === "busy" ? "🟡" : "🔴";
      const tags = a.tags.length > 0 ? ` [${a.tags.join(", ")}]` : "";
      console.log(`   ${statusIcon} ${a.name} (${a.status}) — ${a.cmd}${tags}`);
    }
  }
}

export async function sendDispatch(agentId: string, instruction: string) {
  const res = await fetch(apiUrl("/api/dispatch"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ agentId, instruction }),
  });

  const result = await res.json() as { sessionId?: string; error?: string };
  if (!res.ok) {
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }

  console.log(`✅ 已调度，session: ${result.sessionId}`);

  // 自动 attach 到 session
  if (result.sessionId) {
    await attachSession(result.sessionId);
  }
}

export async function listSessions() {
  const res = await fetch(apiUrl("/api/sessions"), { headers: headers() });
  const sessions = await res.json() as Array<{ id: string; agentName: string; machineId: string; status: string; instruction: string; createdAt: string }>;

  if (sessions.length === 0) {
    console.log("暂无会话");
    return;
  }

  for (const s of sessions) {
    const statusIcon = s.status === "running" ? "🟡" : s.status === "completed" ? "🟢" : "🔴";
    const instr = s.instruction.length > 50 ? s.instruction.slice(0, 50) + "..." : s.instruction;
    console.log(`${statusIcon} ${s.id}  ${s.agentName}@${s.machineId}  "${instr}"  (${s.status})`);
  }
}

export async function attachSession(sessionId: string) {
  const url = wsUrl("/ws/client");
  const ws = new WebSocket(url);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "subscribe", sessionId }));
    console.log(`📡 已接入 session: ${sessionId}\n`);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data as string);
    switch (msg.type) {
      case "output":
        process.stdout.write(msg.content);
        break;
      case "done":
        console.log(`\n✅ 完成: ${msg.result}`);
        ws.close();
        break;
      case "error":
        console.error(`\n❌ 错误: ${msg.error ?? msg.message}`);
        ws.close();
        break;
      case "session_created":
        // 已处理
        break;
    }
  };

  ws.onclose = () => {
    // 正常退出
  };

  // Ctrl+C 退出
  process.on("SIGINT", () => {
    console.log("\n👋 已断开");
    ws.close();
    process.exit(0);
  });

  // 等待 ws 关闭
  await new Promise<void>((resolve) => {
    ws.addEventListener("close", () => resolve());
  });
}

export async function chatWithAgent(agentId: string, initialInstruction?: string) {
  const url = wsUrl("/ws/client");
  const ws = new WebSocket(url);
  let sessionId: string | null = null;
  let sessionDone = false;

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(e);
  });

  // 调度初始指令（如果有）
  if (initialInstruction) {
    ws.send(JSON.stringify({ type: "dispatch", agentId, instruction: initialInstruction }));
  } else {
    ws.send(JSON.stringify({ type: "dispatch", agentId, instruction: "" }));
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data as string);
    switch (msg.type) {
      case "session_created":
        sessionId = msg.sessionId;
        console.log(`💬 对话已建立 (session: ${sessionId})`);
        console.log(`   输入消息后回车发送，Ctrl+C 退出\n`);
        break;
      case "output":
        process.stdout.write(msg.content);
        break;
      case "done":
        console.log(`\n✅ Agent 已完成`);
        sessionDone = true;
        break;
      case "error":
        if (msg.sessionId) {
          console.error(`\n❌ Agent 错误: ${msg.error}`);
          sessionDone = true;
        } else {
          console.error(`\n❌ ${msg.message}`);
        }
        break;
    }
  };

  // 读取 stdin 输入
  const reader = Bun.stdin.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const readLoop = async () => {
    while (!sessionDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 按行处理
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim() && sessionId) {
          ws.send(JSON.stringify({ type: "chat", sessionId, content: line }));
        }
      }
    }
  };

  process.on("SIGINT", () => {
    console.log("\n👋 退出对话（session 保持运行，可用 tm dispatch attach 重新接入）");
    ws.close();
    process.exit(0);
  });

  await readLoop();
  ws.close();
}
