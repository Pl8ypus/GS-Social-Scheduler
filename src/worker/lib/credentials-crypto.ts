import type { Env } from "../env";

const IV_LENGTH = 12;

function getKeyMaterial(env: Env): string {
  if (env.ENVIRONMENT === "test") {
    return "test-credentials-encryption-key";
  }
  if (env.CREDENTIALS_ENCRYPTION_KEY) {
    return env.CREDENTIALS_ENCRYPTION_KEY;
  }
  if (env.CF_ACCESS_AUD) {
    return env.CF_ACCESS_AUD;
  }
  throw new Error(
    "Credential encryption is not configured (set CREDENTIALS_ENCRYPTION_KEY or CF_ACCESS_AUD)",
  );
}

async function getEncryptionKey(env: Env): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(getKeyMaterial(env)),
  );
  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function encryptSecret(plaintext: string, env: Env): Promise<string> {
  const key = await getEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(combined);
}

export async function decryptSecret(stored: string, env: Env): Promise<string> {
  const key = await getEncryptionKey(env);
  const combined = fromBase64(stored);
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}
