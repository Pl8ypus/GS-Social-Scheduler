import { Hono } from "hono";
import type { Env } from "../../env";
import health from "./health";

const api = new Hono<{ Bindings: Env }>();

api.route("/", health);

export default api;
