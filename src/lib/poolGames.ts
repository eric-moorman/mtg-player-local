/**
 * Thin fetch wrappers around the pool-game Worker routes (worker/poolGames.ts).
 * Pool games are account-only by design — every call needs a session, so each of
 * these throws if the user isn't signed in, and the UI gates on that first.
 */
import { call } from "./cloudSync";
import type { PoolGameDetail, PoolGameListEntry, PoolGameMeta, PoolGamePlayerSummary, PoolGameProgress, PoolGameSettings } from "./types";

export async function listGames(): Promise<PoolGameListEntry[]> {
  const res = await call<{ games: PoolGameListEntry[] }>("/api/pool-games");
  return res.games;
}

export async function createGame(name: string, settings: PoolGameSettings, invites: string[]): Promise<PoolGameDetail> {
  const res = await call<{ game: PoolGameDetail }>("/api/pool-games", {
    method: "POST",
    body: JSON.stringify({ name, settings, invites }),
  });
  return res.game;
}

export async function getGame(gameId: string): Promise<PoolGameDetail> {
  const res = await call<{ game: PoolGameDetail }>(`/api/pool-games/${encodeURIComponent(gameId)}`);
  return res.game;
}

/**
 * Overwrites this player's own progress record wholesale. Safe as a blind write
 * because nobody else can write it — see the key layout note in worker/poolGames.ts.
 * Returns a fresh roster so the UI's view of everyone else stays reasonably current
 * without a separate poll.
 */
export async function saveProgress(gameId: string, progress: PoolGameProgress): Promise<PoolGamePlayerSummary[]> {
  const res = await call<{ players: PoolGamePlayerSummary[] }>(`/api/pool-games/${encodeURIComponent(gameId)}/progress`, {
    method: "PUT",
    body: JSON.stringify(progress),
  });
  return res.players;
}

export async function invitePlayers(gameId: string, invites: string[]): Promise<{ meta: PoolGameMeta; players: PoolGamePlayerSummary[] }> {
  return call(`/api/pool-games/${encodeURIComponent(gameId)}/invite`, {
    method: "POST",
    body: JSON.stringify({ invites }),
  });
}

/** Host: deletes the game for everyone. Anyone else: just leaves it. */
export async function deleteGame(gameId: string): Promise<void> {
  await call(`/api/pool-games/${encodeURIComponent(gameId)}`, { method: "DELETE" });
}
