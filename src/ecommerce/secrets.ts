/** AES-256-GCM sealing for connector credentials. Follows the Apply Mode
 * sealed-payload conventions: operator-provided 32-byte key, purpose-separated
 * derivation via HKDF, authenticated decode, no weak default. */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export interface SealedSecret { n: string; c: string; t: string }

const MAX_SECRET_BYTES = 4096;

/** No insecure development fallback: the operator provisions 32 random bytes. */
export function decodeEcommerceKey(base64: string | undefined): Buffer {
  if (!base64 || !/^[A-Za-z0-9+/]{43}=$/.test(base64))
    throw new Error("ECOMMERCE_DATA_KEY_B64 must contain a canonical 32-byte base64 key");
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32 || key.toString("base64") !== base64)
    throw new Error("Invalid e-commerce encryption key");
  return key;
}

function derive(key: Buffer, label: string): Buffer {
  if (key.length !== 32 || !/^[a-z-]{3,32}$/.test(label)) throw new Error("Invalid e-commerce key derivation");
  return Buffer.from(hkdfSync("sha256", key, Buffer.from("gtm-growth-ecommerce-v1"), Buffer.from(label), 32));
}

/** Context binds a secret to one tenant + connection so ciphertexts cannot be swapped. */
export function sealSecret(key: Buffer, context: string, plaintext: string): SealedSecret {
  const bytes = Buffer.from(plaintext, "utf8");
  if (!context || !bytes.length || bytes.length > MAX_SECRET_BYTES) throw new Error("Invalid e-commerce secret");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive(key, "secret-encryption"), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  return { n: iv.toString("base64"), c: Buffer.concat([cipher.update(bytes), cipher.final()]).toString("base64"), t: cipher.getAuthTag().toString("base64") };
}

export function openSecret(key: Buffer, context: string, sealed: SealedSecret): string {
  if (!context) throw new Error("Invalid e-commerce secret context");
  const iv = Buffer.from(sealed.n, "base64"); const tag = Buffer.from(sealed.t, "base64"); const data = Buffer.from(sealed.c, "base64");
  if (iv.length !== 12 || tag.length !== 16 || !data.length || data.length > MAX_SECRET_BYTES) throw new Error("Invalid e-commerce sealed secret");
  try {
    const decipher = createDecipheriv("aes-256-gcm", derive(key, "secret-encryption"), iv);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    const bytes = Buffer.concat([decipher.update(data), decipher.final()]);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch { throw new Error("E-commerce secret authentication failed"); }
}
