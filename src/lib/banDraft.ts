/**
 * Thin fetch wrappers around the commander-draft Worker routes
 * (worker/banDraft.ts), plus the pure turn-order helpers both sides need.
 *
 * Like pool games, this mode is account-only by design — every call needs a
 * session, so the UI gates on being signed in before any of this runs.
 *
 * The helpers below are deliberately duplicated in the Worker rather than
 * shared: the Worker is the one that actually enforces them, and the client
 * copy exists only so the UI can render the right thing without a round trip.
 * If they ever disagree, the server wins and the client gets a 409.
 */
import { call } from "./cloudSync";
import type { BanDraftAction, BanDraftDetail, BanDraftListEntry, BanDraftMeta, BanDraftPack, CardData } from "./types";

export async function listDrafts(): Promise<BanDraftListEntry[]> {
  const res = await call<{ games: BanDraftListEntry[] }>("/api/ban-drafts");
  return res.games;
}

export async function createDraft(name: string, cardsPerPack: number, invites: string[]): Promise<BanDraftDetail> {
  const res = await call<{ game: BanDraftDetail }>("/api/ban-drafts", {
    method: "POST",
    body: JSON.stringify({ name, settings: { cardsPerPack }, invites }),
  });
  return res.game;
}

export async function getDraft(gameId: string): Promise<BanDraftDetail> {
  const res = await call<{ game: BanDraftDetail }>(`/api/ban-drafts/${encodeURIComponent(gameId)}`);
  return res.game;
}

/** Host only. `packs` is one entry per member, already dealt client-side. */
export async function startDraft(
  gameId: string,
  packs: { ownerUserId: string; cards: CardData[] }[],
): Promise<BanDraftDetail> {
  const res = await call<{ game: BanDraftDetail }>(`/api/ban-drafts/${encodeURIComponent(gameId)}/start`, {
    method: "POST",
    body: JSON.stringify({ packs }),
  });
  return res.game;
}

/**
 * Pass, ban, or pick. `expectedPosition` is what makes a stale click safe: the
 * Worker refuses the write if the pack has moved since this client last saw it,
 * so a double-click can't burn two cards.
 */
export async function actOnPack(
  gameId: string,
  ownerUserId: string,
  action: Exclude<BanDraftAction, "done">,
  expectedPosition: number,
  cardId?: string,
): Promise<BanDraftDetail> {
  const res = await call<{ game: BanDraftDetail }>(`/api/ban-drafts/${encodeURIComponent(gameId)}/act`, {
    method: "POST",
    body: JSON.stringify({ ownerUserId, action, expectedPosition, cardId }),
  });
  return res.game;
}

export async function invitePlayers(gameId: string, invites: string[]): Promise<BanDraftDetail> {
  const res = await call<{ game: BanDraftDetail }>(`/api/ban-drafts/${encodeURIComponent(gameId)}/invite`, {
    method: "POST",
    body: JSON.stringify({ invites }),
  });
  return res.game;
}

/** Host: deletes the draft for everyone. Anyone else: leaves it (only before it starts). */
export async function deleteDraft(gameId: string): Promise<void> {
  await call(`/api/ban-drafts/${encodeURIComponent(gameId)}`, { method: "DELETE" });
}

// ---- Turn-order helpers (mirrors of the same functions in worker/banDraft.ts) ----

/** Index in `meta.members` of whoever is holding this pack, or -1 if the owner has left. */
export function holderSeat(meta: BanDraftMeta, pack: BanDraftPack): number {
  const owner = meta.members.findIndex((m) => m.userId === pack.ownerUserId);
  if (owner < 0) return -1;
  return (owner + pack.position) % meta.members.length;
}

export function holderOf(meta: BanDraftMeta, pack: BanDraftPack) {
  return meta.members[holderSeat(meta, pack)] ?? null;
}

/** What the pack's current holder is being asked to do with it. */
export function packAction(meta: BanDraftMeta, pack: BanDraftPack): BanDraftAction {
  if (pack.pickedCardId) return "done";
  if (pack.position >= meta.members.length) return "pick";
  if (pack.position === 0) return "look";
  return "ban";
}

/** The cards in this pack that nobody has banned. */
export function liveCards(pack: BanDraftPack): CardData[] {
  const banned = new Set(pack.bans.map((b) => b.cardId));
  return pack.cards.filter((c) => !banned.has(c.id));
}

export function bannerOf(pack: BanDraftPack, cardId: string) {
  return pack.bans.find((b) => b.cardId === cardId) ?? null;
}

/**
 * Every pack sitting in front of this player, longest-waiting first.
 *
 * More than one can pile up, and that's normal rather than a bug: packs move
 * independently, so a player who has already passed their own can be holding
 * someone else's while a third arrives. Sorting by how long each has been
 * stalled keeps a fast player from leaving the table waiting on the pack they
 * happened to look at last.
 */
export function packsAwaiting(meta: BanDraftMeta, packs: BanDraftPack[], userId: string): BanDraftPack[] {
  return packs
    .filter((p) => packAction(meta, p) !== "done" && holderOf(meta, p)?.userId === userId)
    .sort((a, b) => a.updatedAt - b.updatedAt);
}

/**
 * Where a pack still in flight is sitting, phrased for the reader — "with you"
 * rather than their own username, which reads like a third party when a player
 * is looking at their own row.
 */
export function describeWaiting(meta: BanDraftMeta, pack: BanDraftPack, viewerUserId: string): string {
  const holder = holderOf(meta, pack);
  if (!holder) return "stranded — the player holding it left the draft";
  const who = holder.userId === viewerUserId ? "you" : holder.username;
  const action = packAction(meta, pack);
  if (action === "look") return `with ${who}, for a first look`;
  if (action === "ban") return `with ${who}, waiting for a ban`;
  if (action === "pick") return `with ${who}, waiting for a commander to be chosen`;
  return `with ${who}`;
}
