import { Hono } from "hono";
import type { Env } from "../../env";
import health from "./health";
import posts from "./posts";
import reporting from "./reporting";

const api = new Hono<{ Bindings: Env }>();

api.route("/", health);
api.route("/posts", posts);
api.route("/reporting", reporting);

export default api;
