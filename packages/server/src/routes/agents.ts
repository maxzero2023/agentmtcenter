import { Hono } from "hono";
import { getAgents } from "../store.ts";

const app = new Hono();

app.get("/", (c) => {
  const status = c.req.query("status");
  return c.json(getAgents(status));
});

export default app;
