import type { AgentConfig, AgentToServerMessage } from "@tm/shared";

interface RunningProcess {
  proc: ReturnType<typeof Bun.spawn>;
  sessionId: string;
  agentName: string;
}

// agentName → running process
const runningProcesses = new Map<string, RunningProcess>();

export function isAgentBusy(agentName: string): boolean {
  return runningProcesses.has(agentName);
}

export async function executeAgent(
  ws: WebSocket,
  sessionId: string,
  agent: AgentConfig,
  instruction: string,
) {
  if (isAgentBusy(agent.name)) {
    const msg: AgentToServerMessage = {
      type: "error",
      sessionId,
      error: `Agent ${agent.name} is already busy`,
    };
    ws.send(JSON.stringify(msg));
    return;
  }

  console.log(`🚀 启动 ${agent.name}: ${agent.cmd} "${instruction}"`);

  // 解析命令：cmd 可能包含参数，如 "claude -p"
  const cmdParts = agent.cmd.split(/\s+/);
  const args = instruction ? [...cmdParts, instruction] : cmdParts;

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe",
  });

  const running: RunningProcess = { proc, sessionId, agentName: agent.name };
  runningProcesses.set(agent.name, running);

  // 流式读取 stdout
  const readStream = async (stream: ReadableStream<Uint8Array>, streamName: "stdout" | "stderr") => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const content = decoder.decode(value, { stream: true });
        if (content) {
          const msg: AgentToServerMessage = {
            type: "output",
            sessionId,
            content,
            stream: streamName,
          };
          ws.send(JSON.stringify(msg));
        }
      }
    } catch (err) {
      // stream 关闭
    }
  };

  // 并行读取 stdout 和 stderr
  Promise.all([
    readStream(proc.stdout as ReadableStream<Uint8Array>, "stdout"),
    readStream(proc.stderr as ReadableStream<Uint8Array>, "stderr"),
  ]).then(async () => {
    const exitCode = await proc.exited;
    runningProcesses.delete(agent.name);

    if (exitCode === 0) {
      const msg: AgentToServerMessage = {
        type: "done",
        sessionId,
        result: `Process exited with code 0`,
      };
      ws.send(JSON.stringify(msg));
      console.log(`✅ ${agent.name} 完成: session ${sessionId}`);
    } else {
      const msg: AgentToServerMessage = {
        type: "error",
        sessionId,
        error: `Process exited with code ${exitCode}`,
      };
      ws.send(JSON.stringify(msg));
      console.log(`❌ ${agent.name} 失败: session ${sessionId} (exit ${exitCode})`);
    }
  });
}

export function sendToStdinBySession(sessionId: string, content: string): boolean {
  const running = [...runningProcesses.values()].find(r => r.sessionId === sessionId);
  if (!running) return false;
  try {
    running.proc.stdin.write(content + "\n");
    return true;
  } catch {
    return false;
  }
}

export function getRunningSession(agentName: string): string | undefined {
  return runningProcesses.get(agentName)?.sessionId;
}

export async function resumeSession(
  ws: WebSocket,
  sessionId: string,
  agent: AgentConfig,
) {
  if (isAgentBusy(agent.name)) {
    ws.send(JSON.stringify({
      type: "error",
      sessionId,
      error: `Agent ${agent.name} is already busy`,
    }));
    return;
  }

  console.log(`🔄 恢复会话 ${sessionId} via ${agent.name}`);

  // claude -r <sessionId> 恢复会话
  const proc = Bun.spawn(["claude", "-r", sessionId, "--no-input"], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe",
  });

  const running: RunningProcess = { proc, sessionId, agentName: agent.name };
  runningProcesses.set(agent.name, running);

  const readStream = async (stream: ReadableStream<Uint8Array>, streamName: "stdout" | "stderr") => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const content = decoder.decode(value, { stream: true });
        if (content) {
          ws.send(JSON.stringify({
            type: "output",
            sessionId,
            content,
            stream: streamName,
          }));
        }
      }
    } catch {}
  };

  Promise.all([
    readStream(proc.stdout as ReadableStream<Uint8Array>, "stdout"),
    readStream(proc.stderr as ReadableStream<Uint8Array>, "stderr"),
  ]).then(async () => {
    const exitCode = await proc.exited;
    runningProcesses.delete(agent.name);
    ws.send(JSON.stringify({
      type: exitCode === 0 ? "done" : "error",
      sessionId,
      ...(exitCode === 0 ? { result: "Session ended" } : { error: `Exit code ${exitCode}` }),
    }));
    console.log(`${exitCode === 0 ? "✅" : "❌"} 会话 ${sessionId} 结束 (exit ${exitCode})`);
  });
}
