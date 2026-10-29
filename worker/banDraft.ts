/**
 * Commander draft: a pack-passing ban draft.
 *
 * Everyone opens a pack of commanders at the same time. You look at yours, pass
 * it left, and every other player bans one card out of it before it comes back
 * to you — whatever survived the table is what you get to choose from.
 *
 * Like pool games (worker/poolGames.ts) this lives in KV, which has no
 * transactions, so the record layout is chosen to guarantee that no two clients
 * ever write the same key at the same time:
 *
 *   bandraft:<gameId>                      -> DraftMeta  (host only)
 *   bandraft:<gameId>:pack:<ownerUserId>   -> Pack       (whoever is holding it)
 *   bandrafts:<userId>                     -> string[] of gameIds this user is in
 *
 * The pack records are the interesting half. A pack is mutated by a different
 * player at each step, which would normally be exactly the contended write KV
 * can't do safely — except that the rules of the mode mean a pack is only ever
 * in one person's hands. `position` says how many seats it has travelled from
 * its owner, so the current holder is derivable (`holderSeat()`), and this file
 * rejects a write from anybody else. One writer at a time, enforced server-side,
 * and no two packs share a key.
 *
 * `position` is also the thing that makes a stale client harmless: every write
 * states the position it believes it is acting on, and a mismatch is refused.
 * Double-clicking "Ban" can't eat two cards, and a client that polled late
 * can't ban into a pack that already moved on.
 */
import type { Env } from "./env";
import { json } from "./http";
import { getSessionUser, lookupUserByUsername } from "./auth";
import { randomId } from "./crypto";

const MAX_DRAFTS_PER_USER = 25;
const MAX_MEMBERS = 8;
const MAX_NAME_LENGTH = 60;
const MAX_CARDS_PER_PACK = 30;
const MIN_CARDS_PER_PACK = 2;
const MAX_PACK_BYTES = 400_000;
const MAX_INVITES_PER_REQUEST = 8;

interface Member {
  userId: string;
  username: string;
}

interface DraftSettings {
  cardsPerPack: number;
}

interface DraftMeta {
  id: string;
  name: string;
  createdAt: number;
  hostUserId: string;
  hostUsername: string;
  settings: DraftSettings;
  /** Seat order; the pack passes down this list and wraps. */
  members: Member[];
  started: boolean;
  startedAt?: number;
}

interface Ban {
  cardId: string;
  cardName: string;
  byUserId: string;
  byUsername: string;
  at: number;
}

/**
 * Card payloads stay opaque JSON owned by the frontend (src/lib/types.ts) — the
 * Worker only ever reads `id` and `name` off them, so adding a field to a card
 * needs no change here.
 */
interface Pack {
  gameId: string;
  ownerUserId: string;
  ownerUsername: string;
  cards: { id: string; name: string }[];
  bans: Ban[];
  position: number;
  pickedCardId: string | null;
  pickedAt?: number;
  updatedAt: number;
}

function metaKey(gameId: string): string {
  return `bandraft:${gameId}`;
}

function packKey(gameId: string, ownerUserId: string): string {
  return `bandraft:${gameId}:pack:${ownerUserId}`;
}

function indexKey(userId: string): string {
  return `bandrafts:${userId}`;
}

async function readMeta(env: Env, gameId: string): Promise<DraftMeta | null> {
  const raw = await env.RATE_LIMIT_KV.get(metaKey(gameId));
  return raw ? (JSON.parse(raw) as DraftMeta) : null;
}

async function readPack(env: Env, gameId: string, ownerUserId: string): Promise<Pack | null> {
  const raw = await env.RATE_LIMIT_KV.get(packKey(gameId, ownerUserId));
  return raw ? (JSON.parse(raw) as Pack) : null;
}

/** Every pack on the table, in seat order. Empty until the host starts the draft. */
async function readPacks(env: Env, meta: DraftMeta): Promise<Pack[]> {
  const packs = await Promise.all(meta.members.map((m) => readPack(env, meta.id, m.userId)));
  return packs.filter((p): p is Pack => p !== null);
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

function isMember(meta: DraftMeta, userId: string): boolean {
  return meta.members.some((m) => m.userId === userId);
}

function seatOf(meta: DraftMeta, userId: string): number {
  return meta.members.findIndex((m) => m.userId === userId);
}

/**
 * Who is physically holding a pack right now: its owner's seat plus however many
 * seats it has travelled, wrapped around the table. At position 0 and at
 * position N that lands back on the owner, which is exactly right — those are
 * the first look and the final pick.
 */
function holderSeat(meta: DraftMeta, pack: Pack): number {
  const n = meta.members.length;
  const owner = seatOf(meta, pack.ownerUserId);
  if (owner < 0) return -1;
  return (owner + pack.position) % n;
}

/** What the current holder is being asked to do. Mirrors packAction() on the client. */
function packAction(meta: DraftMeta, pack: Pack): "look" | "ban" | "pick" | "done" {
  if (pack.pickedCardId) return "done";
  if (pack.position >= meta.members.length) return "pick";
  if (pack.position === 0) return "look";
  return "ban";
}

/** How the "you acted on a stale pack" error reads, per action. */
const WAITING_FOR: Record<"look" | "ban" | "pick" | "done", string> = {
  look: "passed on by its owner",
  ban: "banned from",
  pick: "picked from by its owner",
  done: "nothing — it's finished",
};

/** Card ids still on the table for this pack — everything that wasn't banned. */
function liveCardIds(pack: Pack): Set<string> {
  const banned = new Set(pack.bans.map((b) => b.cardId));
  return new Set(pack.cards.map((c) => c.id).filter((id) => !banned.has(id)));
}

async function summarize(env: Env, meta: DraftMeta, userId: string) {
  const packs = await readPacks(env, meta);
  const mine = packs.find((p) => p.ownerUserId === userId) ?? null;
  const picked = packs.filter((p) => p.pickedCardId).length;
  const yourTurn = packs.some((p) => {
    const action = packAction(meta, p);
    return action !== "done" && meta.members[holderSeat(meta, p)]?.userId === userId;
  });
  const myCommander = mine?.pickedCardId
    ? (mine.cards.find((c) => c.id === mine.pickedCardId)?.name ?? null)
    : null;
  return {
    meta,
    yourTurn: meta.started && yourTurn,
    picked,
    total: meta.members.length,
    complete: meta.started && packs.length > 0 && picked === packs.length,
    myCommander,
  };
}

function sanitizeSettings(input: any): DraftSettings | null {
  if (typeof input !== "object" || input === null) return null;
  const cardsPerPack = Number(input.cardsPerPack);
  if (!Number.isFinite(cardsPerPack)) return null;
  if (cardsPerPack < MIN_CARDS_PER_PACK || cardsPerPack > MAX_CARDS_PER_PACK) return null;
  return { cardsPerPack: Math.floor(cardsPerPack) };
}

/** Same shape and same friendly per-name reporting as the pool-game invite flow. */
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

export async function handleCreateBanDraft(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const name = String(body?.name ?? "").trim().slice(0, MAX_NAME_LENGTH) || "Commander draft";
  const settings = sanitizeSettings(body?.settings);
  if (!settings) {
    return json({ error: `A pack needs between ${MIN_CARDS_PER_PACK} and ${MAX_CARDS_PER_PACK} commanders in it.` }, 400);
  }

  const existing = await readIndex(env, user.userId);
  if (existing.length >= MAX_DRAFTS_PER_USER) {
    return json({ error: `You already have ${MAX_DRAFTS_PER_USER} commander drafts — finish or delete one first.` }, 409);
  }

  const resolved = await resolveInvites(env, body?.invites, [user.userId]);
  if (!resolved) return json({ error: "Invalid invite list." }, 400);
  if (resolved.unknownNames.length) return unknownNamesError(resolved.unknownNames);

  const host: Member = { userId: user.userId, username: user.username };
  const members = [host, ...resolved.members].slice(0, MAX_MEMBERS);

  const meta: DraftMeta = {
    id: randomId(10),
    name,
    createdAt: Date.now(),
    hostUserId: user.userId,
    hostUsername: user.username,
    settings,
    members,
    started: false,
  };

  await env.RATE_LIMIT_KV.put(metaKey(meta.id), JSON.stringify(meta));
  for (const member of members) {
    await addToIndex(env, member.userId, meta.id);
  }

  return json({ game: { meta, packs: [], viewerUserId: user.userId } });
}

export async function handleListBanDrafts(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const ids = await readIndex(env, user.userId);
  const games = [];
  const orphaned: string[] = [];
  for (const id of ids) {
    const meta = await readMeta(env, id);
    // Host deleted it, or dropped us from it — clean up the dangling index entry as we notice it.
    if (!meta || !isMember(meta, user.userId)) {
      orphaned.push(id);
      continue;
    }
    games.push(await summarize(env, meta, user.userId));
  }
  if (orphaned.length) {
    await env.RATE_LIMIT_KV.put(indexKey(user.userId), JSON.stringify(ids.filter((id) => !orphaned.includes(id))));
  }

  games.sort((a, b) => b.meta.createdAt - a.meta.createdAt);
  return json({ games });
}

export async function handleGetBanDraft(request: Request, env: Env, gameId: string): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const meta = await readMeta(env, gameId);
  if (!meta) return json({ error: "That commander draft no longer exists." }, 404);
  if (!isMember(meta, user.userId)) return json({ error: "You're not in that commander draft." }, 403);

  return json({ game: { meta, packs: await readPacks(env, meta), viewerUserId: user.userId } });
}

/**
 * Deals the table in. The host's client builds every pack (it already knows how
 * to talk to Scryfall; the Worker does not), and this writes them all before
 * flipping `started` — so nobody can ever observe a started draft with no packs
 * in it. Also the moment the seat order freezes: `members` can't change after
 * this, because a seat appearing mid-draft would move every pack in flight.
 */
export async function handleStartBanDraft(request: Request, env: Env, gameId: string): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const meta = await readMeta(env, gameId);
  if (!meta) return json({ error: "That commander draft no longer exists." }, 404);
  if (meta.hostUserId !== user.userId) return json({ error: "Only the host can start the draft." }, 403);
  if (meta.started) return json({ error: "That draft has already started." }, 409);

  const text = await request.text();
  if (text.length > MAX_PACK_BYTES * MAX_MEMBERS) return json({ error: "Those packs are too large to save." }, 413);
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const incoming = body?.packs;
  if (!Array.isArray(incoming) || incoming.length !== meta.members.length) {
    return json({ error: "The host needs to send exactly one pack per player." }, 400);
  }

  const packs: Pack[] = [];
  for (const member of meta.members) {
    const entry = incoming.find((p: any) => p?.ownerUserId === member.userId);
    if (!entry || !Array.isArray(entry.cards) || entry.cards.length !== meta.settings.cardsPerPack) {
      return json({ error: "Those packs don't match this draft's settings." }, 400);
    }
    // Card ids have to be distinct within a pack or a ban couldn't name one unambiguously.
    const ids = new Set<string>();
    for (const card of entry.cards) {
      if (typeof card?.id !== "string" || typeof card?.name !== "string") {
        return json({ error: "Those packs contain a card the server can't read." }, 400);
      }
      if (ids.has(card.id)) return json({ error: "A pack can't contain the same commander twice." }, 400);
      ids.add(card.id);
    }
    packs.push({
      gameId,
      ownerUserId: member.userId,
      ownerUsername: member.username,
      cards: entry.cards,
      bans: [],
      position: 0,
      pickedCardId: null,
      updatedAt: Date.now(),
    });
  }

  for (const pack of packs) {
    await env.RATE_LIMIT_KV.put(packKey(gameId, pack.ownerUserId), JSON.stringify(pack));
  }
  meta.started = true;
  meta.startedAt = Date.now();
  await env.RATE_LIMIT_KV.put(metaKey(gameId), JSON.stringify(meta));

  return json({ game: { meta, packs, viewerUserId: user.userId } });
}

/**
 * The one write path every player shares. `ownerUserId` names which pack, and
 * the caller must be the seat currently holding it; `expectedPosition` is the
 * stale-client guard described at the top of this file.
 */
export async function handleActOnBanDraftPack(request: Request, env: Env, gameId: string): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const meta = await readMeta(env, gameId);
  if (!meta) return json({ error: "That commander draft no longer exists." }, 404);
  if (!isMember(meta, user.userId)) return json({ error: "You're not in that commander draft." }, 403);
  if (!meta.started) return json({ error: "That draft hasn't started yet." }, 409);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const ownerUserId = String(body?.ownerUserId ?? "");
  const pack = await readPack(env, gameId, ownerUserId);
  if (!pack) return json({ error: "That pack isn't part of this draft." }, 404);

  const holder = meta.members[holderSeat(meta, pack)];
  if (!holder || holder.userId !== user.userId) {
    return json({ error: "That pack isn't in front of you right now." }, 409);
  }
  if (Number(body?.expectedPosition) !== pack.position) {
    // Somebody (possibly this same player, double-clicking) already moved it along.
    return json({ error: "That pack has already moved on — refreshing." }, 409);
  }

  const action = packAction(meta, pack);
  const requested = String(body?.action ?? "");
  if (requested !== action) {
    return json({ error: `That pack is waiting to be ${WAITING_FOR[action]} — your copy of it is out of date.` }, 409);
  }

  if (action === "look") {
    pack.position += 1;
  } else if (action === "ban") {
    const cardId = String(body?.cardId ?? "");
    if (!liveCardIds(pack).has(cardId)) {
      return json({ error: "That card isn't in this pack any more." }, 409);
    }
    const card = pack.cards.find((c) => c.id === cardId)!;
    pack.bans.push({
      cardId,
      cardName: card.name,
      byUserId: user.userId,
      byUsername: user.username,
      at: Date.now(),
    });
    pack.position += 1;
  } else if (action === "pick") {
    const cardId = String(body?.cardId ?? "");
    if (!liveCardIds(pack).has(cardId)) {
      return json({ error: "That card isn't in this pack any more." }, 409);
    }
    pack.pickedCardId = cardId;
    pack.pickedAt = Date.now();
  } else {
    return json({ error: "That pack is already finished." }, 409);
  }

  pack.updatedAt = Date.now();
  await env.RATE_LIMIT_KV.put(packKey(gameId, ownerUserId), JSON.stringify(pack));

  return json({ game: { meta, packs: await readPacks(env, meta), viewerUserId: user.userId } });
}

export async function handleInviteToBanDraft(request: Request, env: Env, gameId: string): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const meta = await readMeta(env, gameId);
  if (!meta) return json({ error: "That commander draft no longer exists." }, 404);
  // Host-only, and that's not just a permission choice: one writer per meta record is what keeps it safe to update.
  if (meta.hostUserId !== user.userId) return json({ error: "Only the host can invite players." }, 403);
  // Seats are frozen once packs are in flight — see handleStartBanDraft.
  if (meta.started) return json({ error: "The draft has already started — the table is set." }, 409);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const resolved = await resolveInvites(env, body?.invites, meta.members.map((m) => m.userId));
  if (!resolved) return json({ error: "Invalid invite list." }, 400);
  if (resolved.unknownNames.length) return unknownNamesError(resolved.unknownNames);
  if (resolved.members.length === 0) return json({ error: "Those players are already in this draft." }, 409);
  if (meta.members.length + resolved.members.length > MAX_MEMBERS) {
    return json({ error: `A commander draft can seat at most ${MAX_MEMBERS} players.` }, 409);
  }

  meta.members = [...meta.members, ...resolved.members];
  await env.RATE_LIMIT_KV.put(metaKey(gameId), JSON.stringify(meta));
  for (const member of resolved.members) {
    await addToIndex(env, member.userId, gameId);
  }

  return json({ game: { meta, packs: [], viewerUserId: user.userId } });
}

/**
 * The host deletes the draft for everyone. Anybody else leaves it — but only
 * before it starts: once packs are moving, a vanished seat would strand every
 * pack that still has to pass through it.
 */
export async function handleDeleteBanDraft(request: Request, env: Env, gameId: string): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Not signed in." }, 401);

  const meta = await readMeta(env, gameId);
  if (!meta) {
    await removeFromIndex(env, user.userId, gameId);
    return json({ ok: true });
  }
  if (!isMember(meta, user.userId)) return json({ error: "You're not in that commander draft." }, 403);

  if (meta.hostUserId === user.userId) {
    for (const member of meta.members) {
      await env.RATE_LIMIT_KV.delete(packKey(gameId, member.userId));
      await removeFromIndex(env, member.userId, gameId);
    }
    await env.RATE_LIMIT_KV.delete(metaKey(gameId));
    return json({ ok: true, deleted: true });
  }

  if (meta.started) {
    return json({ error: "You can't leave a draft that's already underway — the packs still have to pass through your seat." }, 409);
  }

  await removeFromIndex(env, user.userId, gameId);
  meta.members = meta.members.filter((m) => m.userId !== user.userId);
  await env.RATE_LIMIT_KV.put(metaKey(gameId), JSON.stringify(meta));
  return json({ ok: true, left: true });
}
