/**
 * Account sync: GET returns whatever the signed-in user last saved. PUT
 * shallow-merges its body into the stored object (top-level keys only) so a
 * caller can save just `{ identity }` without clobbering `decks` saved a
 * moment earlier — still last-write-wins per field, with no real multi-
 * device conflict resolution, which is an accepted trade-off for a small
 * trusted user base each syncing their own single account.
 *
 * The blob's shape (decks/identity/selectedPlaymat/sealedConfig) is owned
 * by the frontend (src/lib/cloudSync.ts) — the Worker treats it as opaque
 * JSON so the two don't need to stay in lockstep on every field change.
 */
import type { Env } from "./env";
import { json } from "./http";
import { getSessionUser } from "./auth";

const MAX_BLOB_BYTES = 2_000_000;

function syncKey(userId: string): string {
  return `sync:${userId}`;
}

export async function handleGetSync(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);
  const raw = await env.RATE_LIMIT_KV.get(syncKey(user.userId));
  return json({ data: raw ? JSON.parse(raw) : null });
}

export async function handlePutSync(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const text = await request.text();
  if (text.length > MAX_BLOB_BYTES) return json({ error: "Sync payload too large." }, 413);

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return json({ error: "Sync payload must be a JSON object." }, 400);
  }

  const existingRaw = await env.RATE_LIMIT_KV.get(syncKey(user.userId));
  const existing = existingRaw ? JSON.parse(existingRaw) : {};
  const updatedAt = Date.now();
  const stored = { ...existing, ...(data as Record<string, unknown>), updatedAt };
  await env.RATE_LIMIT_KV.put(syncKey(user.userId), JSON.stringify(stored));
  return json({ ok: true, updatedAt });
}
