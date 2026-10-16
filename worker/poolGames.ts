/**
 * Pool games: persistent, multi-player Sealed Pool sessions.
 *
 * A game is split across two kinds of KV record, and the split is the whole
 * design — KV is eventually consistent with no transactions, so the only safe
 * arrangement is one where no two clients ever write the same key:
 *
 *   poolgame:<gameId>            -> GameMeta       (written by the host only)
 *   poolgame:<gameId>:p:<userId> -> PlayerProgress (written by that player only)
 *   poolgames:<userId>           -> string[] of gameIds this user belongs to
 *
 * Every member therefore plays concurrently with zero contention: they read
 * the shared rules, and read/write nothing but their own progress. The one
 * cross-user write is the host stamping a gameId into an invitee's index at
 * create/invite time — a rare, one-shot read-modify-write whose worst case is
 * the same last-write-wins the account sync blob already accepts (see sync.ts).
 *
 * The rules in GameMeta.settings are a frozen *copy* of the host's settings at
 * creation, not a live reference to their account config, so a host fiddling
 * with their personal defaults later can't rewrite a game already in progress.
 *
 * Visibility: a member can read every member's progress *summary* (money spent,
 * card counts, finished or not) but only ever their own card list. That's
 * enforced here rather than client-side — summarize() is the only thing another
 * player's record is ever passed through.
 */
import type { Env } from "./env";
import { json } from "./http";
import { getSessionUser, lookupUserByUsername } from "./auth";
import { randomId } from "./crypto";

const MAX_GAMES_PER_USER = 25;
const MAX_MEMBERS = 8;
const MAX_NAME_LENGTH = 60;
const MAX_PROGRESS_BYTES = 1_500_000;
const MAX_INVITES_PER_REQUEST = 8;

interface Member {
  userId: string;
  username: string;
}

/**
 * Only the fields the Worker actually reasons about are typed here; the card
 * payloads inside PlayerProgress stay opaque JSON owned by the frontend
 * (src/lib/types.ts), so adding a field to a pool card needs no Worker change.
 */
interface GameSettings {
  budget: number;
  cardsPerPack: number;
  packPrice: number;
  rarityWeights: Record<string, number>;
  allowedSets: string[];
}

interface GameMeta {
  id: string;
  name: string;
  createdAt: number;
  hostUserId: string;
  hostUsername: string;
  settings: GameSettings;
  members: Member[];
}

interface PlayerProgress {
  gameId: string;
  userId: string;
  username: string;
  spent: number;
  pool: unknown[];
  deckSelections: Record<string, number>;
  commanders: string[];
  finished: boolean;
  finishedDeckName?: string;
  updatedAt: number;
}

interface PlayerSummary {
  userId: string;
  username: string;
  spent: number;
  poolCount: number;
  deckCount: number;
  finished: boolean;
  updatedAt: number;
}

function metaKey(gameId: string): string {
  return `poolgame:${gameId}`;
}

function progressKey(gameId: string, userId: string): string {
  return `poolgame:${gameId}:p:${userId}`;
}

function indexKey(userId: string): string {
  return `poolgames:${userId}`;
}

async function readMeta(env: Env, gameId: string): Promise<GameMeta | null> {
  const raw = await env.RATE_LIMIT_KV.get(metaKey(gameId));
  return raw ? (JSON.parse(raw) as GameMeta) : null;
}

async function readIndex(env: Env, userId: string): Promise<string[]> {
  const raw = await env.RATE_LIMIT_KV.get(indexKey(userId));
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as string[]) : [];
}

async function addToIndex(env: Env, userId: string, gameId: string): Promise<void> {
  const ids = await readIndex(env, userId);
  if (ids.includes(gameId)) return;
  await env.RATE_LIMIT_KV.put(indexKey(userId), JSON.stringify([...ids, gameId]));
}

async function removeFromIndex(env: Env, userId: string, gameId: string): Promise<void> {
  const ids = await readIndex(env, userId);
  await env.RATE_LIMIT_KV.put(indexKey(userId), JSON.stringify(ids.filter((id) => id !== gameId)));
}

function emptyProgress(gameId: string, member: Member): PlayerProgress {
  return {
    gameId,
    userId: member.userId,
    username: member.username,
    spent: 0,
    pool: [],
    deckSelections: {},
    commanders: [],
    finished: false,
    updatedAt: Date.now(),
  };
}

function summarize(progress: PlayerProgress): PlayerSummary {
  return {
    userId: progress.userId,
    username: progress.username,
    spent: progress.spent,
    poolCount: Array.isArray(progress.pool) ? progress.pool.length : 0,
    deckCount: Object.values(progress.deckSelections ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0),
    finished: Boolean(progress.finished),
    updatedAt: progress.updatedAt,
  };
}

/** A member with no progress record yet (invited, never opened the game) still needs a roster row. */
async function rosterFor(env: Env, meta: GameMeta): Promise<PlayerSummary[]> {
  return Promise.all(
    meta.members.map(async (m) => {
      const raw = await env.RATE_LIMIT_KV.get(progressKey(meta.id, m.userId));
      return raw ? summarize(JSON.parse(raw) as PlayerProgress) : summarize(emptyProgress(meta.id, m));
    }),
  );
}

function isMember(meta: GameMeta, userId: string): boolean {
  return meta.members.some((m) => m.userId === userId);
}

function sanitizeSettings(input: any): GameSettings | null {
  if (typeof input !== "object" || input === null) return null;
  const budget = Number(input.budget);
  const cardsPerPack = Number(input.cardsPerPack);
  const packPrice = Number(input.packPrice);
  const allowedSets = input.allowedSets;
  const weights = input.rarityWeights;
  if (!Number.isFinite(budget) || budget < 0) return null;
  if (!Number.isFinite(cardsPerPack) || cardsPerPack < 1 || cardsPerPack > 60) return null;
  if (!Number.isFinite(packPrice) || packPrice < 0) return null;
  if (!Array.isArray(allowedSets) || allowedSets.length === 0) return null;
  if (!allowedSets.every((c: unknown) => typeof c === "string" && c.length > 0 && c.length <= 16)) return null;
  if (typeof weights !== "object" || weights === null) return null;
  const rarityWeights: Record<string, number> = {};
  for (const key of ["common", "uncommon", "rare", "mythic"]) {
    const value = Number(weights[key]);
    if (!Number.isFinite(value) || value < 0) return null;
    rarityWeights[key] = value;
  }
  return { budget, cardsPerPack, packPrice, rarityWeights, allowedSets: allowedSets.slice(0, 200) };
}

/**
 * Resolves invited usernames to real accounts, reporting *which* names failed
 * rather than a blanket error — a typo in one friend's name shouldn't leave the
 * host guessing which of five it was. Dedupes case-insensitively, and silently
 * drops anyone already in the game (including the host typing their own name).
 */
async function resolveInvites(
  env: Env,
  usernames: unknown,
  excludeUserIds: string[],
): Promise<{ members: Member[]; unknownNames: string[] } | null> {
  if (usernames == null) return { members: [], unknownNames: [] };
  if (!Array.isArray(usernames)) return null;
  const names = usernames
    .filter((n: unknown): n is string => typeof n === "string")
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .slice(0, MAX_INVITES_PER_REQUEST);

  const seen = new Set<string>();
  const members: Member[] = [];
  const unknownNames: string[] = [];
  for (const name of names) {
    const lower = name.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    const user = await lookupUserByUsername(env, name);
    if (!user) {
      unknownNames.push(name);
      continue;
    }
    if (excludeUserIds.includes(user.id)) continue;
    members.push({ userId: user.id, username: user.username });
  }
  return { members, unknownNames };
}

function unknownNamesError(names: string[]): Response {
  return json(
    { error: `No account found for: ${names.join(", ")}. Check the spelling — they need to have signed up first.` },
    404,
  );
}

export async function handleCreatePoolGame(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const name = String(body?.name ?? "").trim().slice(0, MAX_NAME_LENGTH) || "Pool game";
  const settings = sanitizeSettings(body?.settings);
  if (!settings) {
    return json({ error: "Those game settings aren't valid — check the budget, the pack config, and that at least one set is selected." }, 400);
  }

  const existing = await readIndex(env, user.userId);
  if (existing.length >= MAX_GAMES_PER_USER) {
    return json({ error: `You already have ${MAX_GAMES_PER_USER} pool games — finish or delete one first.` }, 409);
  }

  const resolved = await resolveInvites(env, body?.invites, [user.userId]);
  if (!resolved) return json({ error: "Invalid invite list." }, 400);
  if (resolved.unknownNames.length) return unknownNamesError(resolved.unknownNames);

  const host: Member = { userId: user.userId, username: user.username };
  const members = [host, ...resolved.members].slice(0, MAX_MEMBERS);

  const meta: GameMeta = {
    id: randomId(10),
    name,
    createdAt: Date.now(),
    hostUserId: user.userId,
    hostUsername: user.username,
    settings,
    members,
  };
  const progress = emptyProgress(meta.id, host);

  await env.RATE_LIMIT_KV.put(metaKey(meta.id), JSON.stringify(meta));
  await env.RATE_LIMIT_KV.put(progressKey(meta.id, user.userId), JSON.stringify(progress));
  for (const member of members) {
    await addToIndex(env, member.userId, meta.id);
  }

  return json({ game: { meta, players: await rosterFor(env, meta), progress } });
}

export async function handleListPoolGames(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const ids = await readIndex(env, user.userId);
  const games = [];
  const orphaned: string[] = [];
  for (const id of ids) {
    const meta = await readMeta(env, id);
    // Host deleted the game, or removed us from it — drop the dangling index entry as we notice it.
    if (!meta || !isMember(meta, user.userId)) {
      orphaned.push(id);
      continue;
    }
    const players = await rosterFor(env, meta);
    games.push({ meta, players, me: players.find((p) => p.userId === user.userId) ?? null });
  }
  if (orphaned.length) {
    await env.RATE_LIMIT_KV.put(indexKey(user.userId), JSON.stringify(ids.filter((id) => !orphaned.includes(id))));
  }

  games.sort((a, b) => b.meta.createdAt - a.meta.createdAt);
  return json({ games });
}

export async function handleGetPoolGame(request: Request, env: Env, gameId: string): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const meta = await readMeta(env, gameId);
  if (!meta) return json({ error: "That pool game no longer exists." }, 404);
  if (!isMember(meta, user.userId)) return json({ error: "You're not in that pool game." }, 403);

  const raw = await env.RATE_LIMIT_KV.get(progressKey(gameId, user.userId));
  const member = meta.members.find((m) => m.userId === user.userId)!;
  // First open as an invitee: materialize an empty progress record so later saves have a home.
  const progress = raw ? (JSON.parse(raw) as PlayerProgress) : emptyProgress(gameId, member);
  if (!raw) await env.RATE_LIMIT_KV.put(progressKey(gameId, user.userId), JSON.stringify(progress));

  return json({ game: { meta, players: await rosterFor(env, meta), progress } });
}

export async function handlePutPoolGameProgress(request: Request, env: Env, gameId: string): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const meta = await readMeta(env, gameId);
  if (!meta) return json({ error: "That pool game no longer exists." }, 404);
  if (!isMember(meta, user.userId)) return json({ error: "You're not in that pool game." }, 403);

  const text = await request.text();
  if (text.length > MAX_PROGRESS_BYTES) return json({ error: "That pool has grown too large to save." }, 413);

  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (typeof body !== "object" || body === null) return json({ error: "Invalid progress payload." }, 400);
  if (!Number.isFinite(Number(body.spent))) return json({ error: "Invalid progress payload." }, 400);
  if (!Array.isArray(body.pool)) return json({ error: "Invalid progress payload." }, 400);
  if (typeof body.deckSelections !== "object" || body.deckSelections === null || Array.isArray(body.deckSelections)) {
    return json({ error: "Invalid progress payload." }, 400);
  }
  if (!Array.isArray(body.commanders)) return json({ error: "Invalid progress payload." }, 400);

  // gameId/userId/username come from the URL and the session, never from the body —
  // a client can't write into someone else's record by relabeling its payload.
  const progress: PlayerProgress = {
    gameId,
    userId: user.userId,
    username: user.username,
    spent: Number(body.spent),
    pool: body.pool,
    deckSelections: body.deckSelections,
    commanders: body.commanders.filter((c: unknown) => typeof c === "string").slice(0, 2),
    finished: Boolean(body.finished),
    updatedAt: Date.now(),
  };
  if (typeof body.finishedDeckName === "string") {
    progress.finishedDeckName = body.finishedDeckName.slice(0, MAX_NAME_LENGTH);
  }

  await env.RATE_LIMIT_KV.put(progressKey(gameId, user.userId), JSON.stringify(progress));
  return json({ ok: true, updatedAt: progress.updatedAt, players: await rosterFor(env, meta) });
}

export async function handleInviteToPoolGame(request: Request, env: Env, gameId: string): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const meta = await readMeta(env, gameId);
  if (!meta) return json({ error: "That pool game no longer exists." }, 404);
  // Host-only, and that's not just a permission choice: one writer per meta record is what keeps it safe to update.
  if (meta.hostUserId !== user.userId) return json({ error: "Only the host can invite players." }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const resolved = await resolveInvites(env, body?.invites, meta.members.map((m) => m.userId));
  if (!resolved) return json({ error: "Invalid invite list." }, 400);
  if (resolved.unknownNames.length) return unknownNamesError(resolved.unknownNames);
  if (resolved.members.length === 0) return json({ error: "Those players are already in this game." }, 409);
  if (meta.members.length + resolved.members.length > MAX_MEMBERS) {
    return json({ error: `A pool game can hold at most ${MAX_MEMBERS} players.` }, 409);
  }

  meta.members = [...meta.members, ...resolved.members];
  await env.RATE_LIMIT_KV.put(metaKey(gameId), JSON.stringify(meta));
  for (const member of resolved.members) {
    await addToIndex(env, member.userId, gameId);
  }

  return json({ meta, players: await rosterFor(env, meta) });
}

/** The host deletes the game for everyone; anybody else just leaves it. */
export async function handleDeletePoolGame(request: Request, env: Env, gameId: string): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const meta = await readMeta(env, gameId);
  if (!meta) {
    await removeFromIndex(env, user.userId, gameId);
    return json({ ok: true });
  }
  if (!isMember(meta, user.userId)) return json({ error: "You're not in that pool game." }, 403);

  if (meta.hostUserId === user.userId) {
    for (const member of meta.members) {
      await env.RATE_LIMIT_KV.delete(progressKey(gameId, member.userId));
      await removeFromIndex(env, member.userId, gameId);
    }
    await env.RATE_LIMIT_KV.delete(metaKey(gameId));
    return json({ ok: true, deleted: true });
  }

  await env.RATE_LIMIT_KV.delete(progressKey(gameId, user.userId));
  await removeFromIndex(env, user.userId, gameId);
  meta.members = meta.members.filter((m) => m.userId !== user.userId);
  await env.RATE_LIMIT_KV.put(metaKey(gameId), JSON.stringify(meta));
  return json({ ok: true, left: true });
}
