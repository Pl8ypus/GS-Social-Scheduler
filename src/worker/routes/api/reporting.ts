import { Hono } from "hono";
import type { Env } from "../../env";
import { getSchedulerHealth } from "../../services/reporting-service";

const reporting = new Hono<{ Bindings: Env }>();

reporting.get("/health", async (c) => {
  const health = await getSchedulerHealth(c.env.DB);
  return c.json({ health });
});

export default reporting;
