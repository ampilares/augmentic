import crypto from "node:crypto";

// Envelope-encryption stand-in: AES-256-GCM with a key from env. In managed
// deployments AUGMENTIC_SECRET_KEY comes from KMS; the dev fallback keeps
// zero-setup while making the "never store plaintext" invariant hold
// everywhere in code.

function getKey(): Buffer {
  const raw = process.env.AUGMENTIC_SECRET_KEY ?? "augmentic-dev-only-secret-key";
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(ciphertext: string): string {
  const [ivB64, tagB64, encB64] = ciphertext.split(".");
  if (!ivB64 || !tagB64 || !encB64) throw new Error("Malformed secret ciphertext");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
