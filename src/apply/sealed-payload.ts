/** Node-only authenticated encryption for short-lived proposals and rollback snapshots. */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

export interface SealedPayload {
  nonce: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
  sha256: string;
}

const MAX_PAYLOAD_BYTES = 256 * 1024;
export const SNAPSHOT_LIMIT_BYTES = 64 * 1024;
export const digest = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** No insecure development fallback: the operator must provision 32 random bytes. */
export function decodeApplyKey(base64: string | undefined): Buffer {
  if (!base64 || !/^[A-Za-z0-9+/]{43}=$/.test(base64))
    throw new Error("APPLY_DATA_KEY_B64 must contain a canonical 32-byte base64 key");
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32 || key.toString("base64") !== base64)
    throw new Error("Invalid Apply Mode encryption key");
  return key;
}

/** Purpose separation prevents swapping one tenant's proposal with another's backup. */
export function deriveApplyKey(key: Buffer, label: string): Buffer {
  if (key.length !== 32 || !/^[a-z-]{3,32}$/.test(label)) throw new Error("Invalid Apply Mode key derivation");
  return Buffer.from(hkdfSync("sha256", key, Buffer.from("gtm-growth-apply-v1"), Buffer.from(label), 32));
}

export function sealText(key: Buffer, context: string, content: string, limit = MAX_PAYLOAD_BYTES): SealedPayload {
  const bytes = Buffer.from(content, "utf8");
  if (!context || bytes.length > limit || limit > MAX_PAYLOAD_BYTES || bytes.includes(0))
    throw new Error("Invalid or oversized Apply Mode payload");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveApplyKey(key, "payload-encryption"), nonce);
  cipher.setAAD(Buffer.from(context, "utf8"));
  return { nonce, ciphertext: Buffer.concat([cipher.update(bytes), cipher.final()]), tag: cipher.getAuthTag(), sha256: digest(content) };
}

/** Authenticated decode; never return partial plaintext on a key/context mismatch. */
export function openText(key: Buffer, context: string, sealed: SealedPayload, limit = MAX_PAYLOAD_BYTES): string {
  if (!context || sealed.nonce.length !== 12 || sealed.tag.length !== 16 ||
      sealed.ciphertext.length > limit || limit > MAX_PAYLOAD_BYTES ||
      !/^[a-f0-9]{64}$/.test(sealed.sha256))
    throw new Error("Invalid Apply Mode encrypted payload");
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveApplyKey(key, "payload-encryption"), sealed.nonce);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(sealed.tag);
    const bytes = Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]);
    if (bytes.length > limit || bytes.includes(0)) throw new Error("Payload exceeds bound");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (digest(content) !== sealed.sha256) throw new Error("Payload digest mismatch");
    return content;
  } catch { throw new Error("Apply Mode payload authentication failed"); }
}
