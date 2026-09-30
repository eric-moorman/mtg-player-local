/**
 * Thin fetch wrappers around the account/sync Worker routes (worker/auth.ts,
 * worker/sync.ts). The session lives in an HttpOnly cookie the browser
 * handles automatically — every call needs `credentials: "include"` since
 * the API and the app are same-origin but fetch doesn't send cookies by
 * default for same-site requests initiated this way in all browsers.
 */
import type { Deck, Identity, SealedConfig } from "./types";

export interface AuthUser {
  username: string;
}

/** Partial on purpose — PUT /api/sync merges, and callers only ever send the field(s) that changed. */
export interface SyncData {
  decks: Deck[];
  identity: Identity;
  selectedPlaymat: string;
  sealedConfig: SealedConfig;
}

class ApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) throw new ApiError(body?.error ?? `Request failed (${res.status}).`);
  return body as T;
}

export async function register(username: string, password: string): Promise<AuthUser> {
  const res = await call<{ user: AuthUser }>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
  return res.user;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await call<{ user: AuthUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  return res.user;
}

export async function logout(): Promise<void> {
  await call("/api/auth/logout", { method: "POST" });
}

export async function me(): Promise<AuthUser | null> {
  const res = await call<{ user: AuthUser | null }>("/api/auth/me");
  return res.user;
}

export async function getSync(): Promise<Partial<SyncData> | null> {
  const res = await call<{ data: Partial<SyncData> | null }>("/api/sync");
  return res.data;
}

/** Merges the given field(s) into the account's stored sync blob (server-side shallow merge — see worker/sync.ts). */
export async function patchSync(patch: Partial<SyncData>): Promise<void> {
  await call("/api/sync", { method: "PUT", body: JSON.stringify(patch) });
}
