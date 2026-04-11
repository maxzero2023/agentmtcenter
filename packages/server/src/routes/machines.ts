import { Hono } from "hono";
import { getMachines } from "../store.ts";

const app = new Hono();

app.get("/", (c) => {
  return c.json(getMachines());
});

export default app;
