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
  /** LinkedIn OAuth client id. */
  LINKEDIN_CLIENT_ID?: string;
  /** LinkedIn OAuth client secret. */
  LINKEDIN_CLIENT_SECRET?: string;
  /** Optional key for encrypting credentials stored in D1 (falls back to CF_ACCESS_AUD). */
  CREDENTIALS_ENCRYPTION_KEY?: string;
  /** Optional explicit OAuth callback URL registered in LinkedIn. */
  LINKEDIN_REDIRECT_URI?: string;
  /** LinkedIn REST API version, e.g. `202506`. */
  LINKEDIN_API_VERSION?: string;
  /** Rate limiter for the `/api/*` surface. */
  API_RATE_LIMITER: RateLimit;
}
