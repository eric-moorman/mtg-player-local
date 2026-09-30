/**
 * Password hashing (PBKDF2-SHA256 via the Workers-native Web Crypto API —
 * there's no bcrypt/argon2 available in this runtime without a WASM
 * dependency, and this is the standard idiomatic choice for Workers) plus
 * small helpers for generating opaque random IDs (session IDs, user IDs).
 *
 * ITERATIONS is tuned to stay well inside Workers CPU-time limits (a real
 * concern on the free plan's ~10ms/request budget) while still being a
 * meaningful cost for an attacker. Benchmarked empirically via Node's
 * webcrypto (same PBKDF2/SHA-256 implementation surface as the Workers
 * runtime): ~0.22ms per 1,000 iterations, so 20,000 costs ~4-5ms, leaving
 * headroom for the rest of the request's own CPU work. This trades some
 * brute-force resistance (well below OWASP's ~600k recommendation) for
 * reliability — an accepted trade-off given this app's small-trusted-
 * friend-group threat model, not a cost cut made blindly.
 */

const ITERATIONS = 20_000;
const HASH_BITS = 256;

export function randomId(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = toHex(saltBytes);
  const hash = await deriveHash(password, saltBytes);
  return { salt, hash };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const computed = await deriveHash(password, fromHex(salt));
  return timingSafeEqual(computed, expectedHash);
}

async function deriveHash(password: string, saltBytes: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_BITS
  );
  return toHex(new Uint8Array(derived));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Constant-time string comparison so hash checks don't leak timing info. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
