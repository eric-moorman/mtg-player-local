/**
 * Username/password accounts for a small, trusted, friends-only user base:
 * open self-serve registration, no email, no password-reset flow. Sessions
 * are opaque random IDs stored in KV (not signed tokens), so logout is a
 * real server-side revocation and no signing secret is needed.
 *
 * Everything lives in the one KV namespace already bound as RATE_LIMIT_KV
 * (see env.ts) under prefixed keys:
 *   user:<lowercased-username>  -> UserRecord
 *   session:<opaque-id>         -> SessionRecord (expires after SESSION_TTL_SECONDS)
 *   rate:auth:<ip>              -> login/register attempt counter (separate
 *                                   budget from /api/report's rate:<ip>)
 */
import type { Env } from "./env";
import { json } from "./http";
import { hashPassword, verifyPassword, randomId } from "./crypto";

const SESSION_COOKIE = "kt_session";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const AUTH_RATE_LIMIT_PER_HOUR = 10;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

interface UserRecord {
  id: string;
  /** As registered, for display — lookups always go through the lowercased key. */
  username: string;
  salt: string;
  hash: string;
  createdAt: string;
}

export interface SessionUser {
  userId: string;
  username: string;
}

interface Credentials {
  username?: string;
  password?: string;
}

function userKey(username: string): string {
  return `user:${username.trim().toLowerCase()}`;
}

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

async function checkAuthRateLimit(env: Env, request: Request): Promise<boolean> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const key = `rate:auth:${ip}`;
  const countRaw = await env.RATE_LIMIT_KV.get(key);
  const count = countRaw ? parseInt(countRaw, 10) : 0;
  if (count >= AUTH_RATE_LIMIT_PER_HOUR) return false;
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3600 });
  return true;
}

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  if (!(await checkAuthRateLimit(env, request))) {
    return json({ error: "Too many attempts from this network recently — please try again later." }, 429);
  }
  const body = await readCredentials(request);
  if (!body) return json({ error: "Invalid request." }, 400);
  const { username, password } = body;

  if (!USERNAME_RE.test(username)) {
    return json({ error: "Username must be 3-32 characters: letters, numbers, underscores, or hyphens." }, 400);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  }

  const key = userKey(username);
  const existing = await env.RATE_LIMIT_KV.get(key);
  if (existing) return json({ error: "That username is already taken." }, 409);

  const { salt, hash } = await hashPassword(password);
  const user: UserRecord = { id: randomId(), username, salt, hash, createdAt: new Date().toISOString() };
  await env.RATE_LIMIT_KV.put(key, JSON.stringify(user));

  return startSession(request, env, user);
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!(await checkAuthRateLimit(env, request))) {
    return json({ error: "Too many attempts from this network recently — please try again later." }, 429);
  }
  const body = await readCredentials(request);
  if (!body) return json({ error: "Invalid request." }, 400);
  const { username, password } = body;

  const raw = await env.RATE_LIMIT_KV.get(userKey(username));
  if (!raw) return json({ error: "Incorrect username or password." }, 401);
  const user: UserRecord = JSON.parse(raw);
  if (!(await verifyPassword(password, user.salt, user.hash))) {
    return json({ error: "Incorrect username or password." }, 401);
  }

  return startSession(request, env, user);
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  const sessionId = readSessionCookie(request);
  if (sessionId) await env.RATE_LIMIT_KV.delete(sessionKey(sessionId));
  return json({ ok: true }, 200, { "Set-Cookie": cookieHeader(request, "", 0) });
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  return json({ user: user ? { username: user.username } : null });
}

/** Resolves the signed-in user (or null) from the session cookie — used by the sync routes too. */
export async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const sessionId = readSessionCookie(request);
  if (!sessionId) return null;
  const raw = await env.RATE_LIMIT_KV.get(sessionKey(sessionId));
  if (!raw) return null;
  return JSON.parse(raw) as SessionUser;
}

async function startSession(request: Request, env: Env, user: UserRecord): Promise<Response> {
  const sessionId = randomId(24);
  const session: SessionUser = { userId: user.id, username: user.username };
  await env.RATE_LIMIT_KV.put(sessionKey(sessionId), JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  return json({ user: { username: user.username } }, 200, { "Set-Cookie": cookieHeader(request, sessionId, SESSION_TTL_SECONDS) });
}

async function readCredentials(request: Request): Promise<{ username: string; password: string } | null> {
  try {
    const body: Credentials = await request.json();
    return { username: (body.username ?? "").trim(), password: body.password ?? "" };
  } catch {
    return null;
  }
}

function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** `Secure` only when the request actually came in over https — lets cookies work under plain-http local dev too. */
function cookieHeader(request: Request, value: string, maxAgeSeconds: number): string {
  const secure = new URL(request.url).protocol === "https:";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}
