import { Hono } from "hono";

const health = new Hono();

health.get("/health", (c) =>
  c.json({ ok: true, service: "pl8ypus-linkedin-scheduler" }),
);

export default health;
