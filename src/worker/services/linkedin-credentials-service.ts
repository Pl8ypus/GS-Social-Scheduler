import { decryptSecret, encryptSecret } from "../lib/credentials-crypto";
import type { Env } from "../env";

const CREDENTIALS_ID = "primary";

export type LinkedInCredentialsStatus = {
  configured: boolean;
  clientId: string | null;
  hasStoredSecret: boolean;
  source: "database" | "environment" | null;
  updatedAt: string | null;
};

type CredentialsRow = {
  id: string;
  client_id: string;
  client_secret_encrypted: string;
  updated_at: string;
};

function hasEnvironmentCredentials(env: Env): boolean {
  return Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET);
}

async function getCredentialsRow(db: D1Database): Promise<CredentialsRow | null> {
  return db
    .prepare(`SELECT * FROM linkedin_app_credentials WHERE id = ?`)
    .bind(CREDENTIALS_ID)
    .first<CredentialsRow>();
}

export async function getLinkedInCredentialsStatus(
  db: D1Database,
  env: Env,
): Promise<LinkedInCredentialsStatus> {
  const row = await getCredentialsRow(db);
  if (row) {
    return {
      configured: true,
      clientId: row.client_id,
      hasStoredSecret: true,
      source: "database",
      updatedAt: row.updated_at,
    };
  }

  if (hasEnvironmentCredentials(env)) {
    return {
      configured: true,
      clientId: env.LINKEDIN_CLIENT_ID ?? null,
      hasStoredSecret: true,
      source: "environment",
      updatedAt: null,
    };
  }

  return {
    configured: false,
    clientId: null,
    hasStoredSecret: false,
    source: null,
    updatedAt: null,
  };
}

export async function resolveLinkedInCredentials(
  db: D1Database,
  env: Env,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const row = await getCredentialsRow(db);
  if (row) {
    return {
      clientId: row.client_id,
      clientSecret: await decryptSecret(row.client_secret_encrypted, env),
    };
  }

  if (hasEnvironmentCredentials(env)) {
    return {
      clientId: env.LINKEDIN_CLIENT_ID!,
      clientSecret: env.LINKEDIN_CLIENT_SECRET!,
    };
  }

  return null;
}

export type SaveLinkedInCredentialsResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function validateClientId(clientId: string): string | null {
  const trimmed = clientId.trim();
  if (!trimmed) return "Client ID is required.";
  if (trimmed.length > 256) return "Client ID is too long.";
  return null;
}

function validateClientSecret(clientSecret: string): string | null {
  const trimmed = clientSecret.trim();
  if (!trimmed) return "Client secret is required.";
  if (trimmed.length > 512) return "Client secret is too long.";
  return null;
}

export async function saveLinkedInCredentials(
  db: D1Database,
  env: Env,
  clientId: string,
  clientSecret?: string,
): Promise<SaveLinkedInCredentialsResult> {
  const clientIdError = validateClientId(clientId);
  if (clientIdError) {
    return { ok: false, status: 400, error: clientIdError };
  }

  const existing = await getCredentialsRow(db);
  let secretToStore = clientSecret?.trim() ?? "";

  if (!secretToStore) {
    if (existing) {
      secretToStore = await decryptSecret(existing.client_secret_encrypted, env);
    } else if (hasEnvironmentCredentials(env)) {
      secretToStore = env.LINKEDIN_CLIENT_SECRET!.trim();
    } else {
      return { ok: false, status: 400, error: "Client secret is required." };
    }
  }

  const clientSecretError = validateClientSecret(secretToStore);
  if (clientSecretError) {
    return { ok: false, status: 400, error: clientSecretError };
  }

  const encryptedSecret = await encryptSecret(secretToStore, env);
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO linkedin_app_credentials (
         id, client_id, client_secret_encrypted, updated_at
       )
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         client_id = excluded.client_id,
         client_secret_encrypted = excluded.client_secret_encrypted,
         updated_at = excluded.updated_at`,
    )
    .bind(CREDENTIALS_ID, clientId.trim(), encryptedSecret, now)
    .run();

  return { ok: true };
}

export async function clearLinkedInCredentials(db: D1Database): Promise<void> {
  await db
    .prepare(`DELETE FROM linkedin_app_credentials WHERE id = ?`)
    .bind(CREDENTIALS_ID)
    .run();
}
