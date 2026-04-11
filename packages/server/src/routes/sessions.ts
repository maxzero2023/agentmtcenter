import { Hono } from "hono";
import { getSessions, getSession } from "../store.ts";

const app = new Hono();

app.get("/", (c) => {
  const status = c.req.query("status");
  return c.json(getSessions(status));
});

app.get("/:id", (c) => {
  const session = getSession(c.req.param("id"));
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(session);
});

export default app;
