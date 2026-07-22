import type { Env as GeneratedEnv } from "../../worker-configuration";

export interface Env extends GeneratedEnv {
  /**
   * Deployment environment. `"test"` bypasses Cloudflare Access verification
   * for Vitest only. Any other value (or unset) is treated as production and
   * fails closed.
   */
  ENVIRONMENT?: string;
  /** Cloudflare Access team domain, e.g. `myteam.cloudflareaccess.com`. */
  CF_ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access application AUD tag. */
  CF_ACCESS_AUD?: string;
  /** Rate limiter for the `/api/*` surface. */
  API_RATE_LIMITER: RateLimit;
}
