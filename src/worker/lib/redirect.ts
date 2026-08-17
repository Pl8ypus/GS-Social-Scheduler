import type { Env } from "../env";

function parseAllowedOrigins(env: Env): string[] {
  const raw = (env.LINKEDIN_ALLOWED_REDIRECT_ORIGINS ?? "").trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isSafeAbsoluteOrigin(origin: string, allowedOrigins: string[]): boolean {
  try {
    const u = new URL(origin);
    // Reject protocol-relative origins or non-http(s)
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    // Match exactly against allowed origins if any provided
    if (allowedOrigins.length === 0) return false;
    return allowedOrigins.includes(u.origin);
  } catch {
    return false;
  }
}

export function normalizeLinkedInCallbackUri(requestUrl: string, env: Env): string {
  // If explicit callback is configured, validate it and return
  if (env.LINKEDIN_REDIRECT_URI) {
    // Reject dangerous schemes like javascript:, data:, ftp:, or protocol-relative
    try {
      const u = new URL(env.LINKEDIN_REDIRECT_URI);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        throw new Error("Invalid redirect URI scheme");
      }
      return u.toString();
    } catch (err) {
      throw new Error("LINKEDIN_REDIRECT_URI is invalid or not allowed");
    }
  }

  const allowed = parseAllowedOrigins(env);

  // If allowed origins are provided, only allow origins that exactly match
  if (allowed.length > 0) {
    let parsed: URL;
    try {
      parsed = new URL(requestUrl);
    } catch {
      throw new Error("Invalid request URL");
    }
    const origin = parsed.origin;
    if (!isSafeAbsoluteOrigin(origin, allowed)) {
      throw new Error("Request origin not allowed for redirect_uri");
    }
    return new URL("/api/admin/linkedin/callback", origin).toString();
  }

  // For test environment only, fall back to using the request URL origin
  if (env.ENVIRONMENT === "test") {
    try {
      const parsed = new URL(requestUrl);
      return new URL("/api/admin/linkedin/callback", parsed.origin).toString();
    } catch {
      throw new Error("Invalid request URL");
    }
  }

  // In production require an explicit LINKEDIN_REDIRECT_URI or allowed origins
  throw new Error("LINKEDIN_REDIRECT_URI or LINKEDIN_ALLOWED_REDIRECT_ORIGINS must be configured");
}

export function isDangerousRedirectDestination(value: string): boolean {
  if (!value) return true;
  // Reject protocol-relative values
  if (value.startsWith("//")) return true;
  // Reject common dangerous schemes
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:") || lower.startsWith("ftp:")) return true;
  try {
    // If it's an absolute URL, ensure it has http(s)
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
  } catch {
    // If it's not parseable as absolute, allow relative paths that start with a single '/'
    if (!value.startsWith("/")) return true;
    if (value.startsWith("//")) return true; // protocol-relative
  }
  return false;
}

export default {};
