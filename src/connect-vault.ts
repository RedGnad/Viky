import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Where a connected source's keys sleep (D188, rule 4): sealed with AES-256-GCM under `CONNECT_TOKEN_KEY`, a key of
 * 32 bytes in base64 that the founder sets on Vercel, sensitive, and that never leaves the server. A sealed value is
 * what the connection store writes and reads; the key it seals is opened only for the one request that needs it,
 * handed to the reading service as a secret the attestor never sees, and dropped.
 *
 * Nothing here is a password or a proof: a key sealed this way is never printed, never journalled, never in a proof.
 */

export class VaultError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "INVALID_KEY" | "CANNOT_OPEN",
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = "v1";

function keyOf(env: NodeJS.ProcessEnv): Buffer {
  const raw = env.CONNECT_TOKEN_KEY?.trim();
  if (!raw) throw new VaultError("NOT_CONFIGURED", "CONNECT_TOKEN_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) throw new VaultError("INVALID_KEY", `CONNECT_TOKEN_KEY must be ${KEY_BYTES} bytes in base64`);
  return key;
}

/** Whether the key exists where this runs: a boolean, never its length nor a prefix. */
export function vaultConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    keyOf(env);
    return true;
  } catch {
    return false;
  }
}

/** A fresh key for the founder to set, printed once by an operator's command and nowhere else. */
export function newVaultKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

/** `v1.<iv>.<tag>.<ciphertext>`, each part base64url: the shape the store holds. */
export function sealSecret(text: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = keyOf(env);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

export function openSecret(sealed: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = keyOf(env);
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new VaultError("CANNOT_OPEN", "Not a sealed value of this vault");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new VaultError("CANNOT_OPEN", "The sealed value does not open with this key");
  }
}
