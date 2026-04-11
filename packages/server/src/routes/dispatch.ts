import { Hono } from "hono";
import { createSession, getAgents, updateAgentStatus } from "../store.ts";
import { getAgentConnection } from "../ws/agent.ts";
import { broadcastStatus } from "../router.ts";

const app = new Hono();

app.post("/", async (c) => {
  const body = await c.req.json<{ agentId: string; instruction: string }>();
  const [agentName, machineId] = body.agentId.split("@");

  if (!agentName || !machineId) {
    return c.json({ error: "Invalid agentId format, use: agentName@machineId" }, 400);
  }

  const agents = getAgents();
  const agent = agents.find(a => a.name === agentName && a.machineId === machineId);
  if (!agent) return c.json({ error: `Agent ${body.agentId} not found` }, 404);
  if (agent.status !== "idle") return c.json({ error: `Agent ${body.agentId} is ${agent.status}` }, 409);

  const agentWs = getAgentConnection(machineId);
  if (!agentWs) return c.json({ error: `Machine ${machineId} not connected` }, 502);

  const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  createSession({
    id: sessionId,
    agentName,
    machineId,
    instruction: body.instruction,
    status: "running",
    createdAt: new Date().toISOString(),
  });

  updateAgentStatus(machineId, agentName, "busy");
  broadcastStatus(body.agentId, "busy");

  agentWs.send(JSON.stringify({
    type: "dispatch",
    sessionId,
    agentName,
    instruction: body.instruction,
  }));

  console.log(`📤 调度: ${body.agentId} → ${sessionId}`);
  return c.json({ sessionId });
});

export default app;
