import { getCatalogMeta, loadCatalogChunks, saveCatalogChunks, setCatalogMeta } from "./db";
import type { CardData, DeckCard } from "./types";

const USER_AGENT_NOTE = "KitchenTable/0.1 (friends-only P2P MTG table; non-commercial)";
const CHUNK_SIZE = 4000;
const STALE_MS = 14 * 24 * 60 * 60 * 1000;

export interface CatalogProgress {
  phase: "checking" | "downloading" | "parsing" | "storing" | "done";
  receivedBytes?: number;
  totalBytes?: number;
}

// Scryfall asks that API clients identify themselves and self-throttle.
// The browser can't set a custom User-Agent header on fetch, so we keep a
// small gap between requests instead and note the client in a query-string-free way.
let lastRequestAt = 0;
async function politeFetch(url: string, init?: RequestInit): Promise<Response> {
  const wait = 100 - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  return fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
}

function slim(raw: any): CardData | null {
  const face = raw.image_uris ? raw : raw.card_faces?.[0]?.image_uris ? raw.card_faces[0] : null;
  const imgs = face?.image_uris ?? raw.image_uris;
  if (!imgs) return null;
  return {
    id: raw.id,
    name: raw.name,
    mana_cost: raw.mana_cost ?? raw.card_faces?.[0]?.mana_cost ?? "",
    cmc: typeof raw.cmc === "number" ? raw.cmc : 0,
    type_line: raw.type_line ?? "",
    oracle_text: raw.oracle_text ?? raw.card_faces?.map((f: any) => f.oracle_text).join("\n\n") ?? "",
    keywords: raw.keywords ?? [],
    colors: raw.colors ?? raw.card_faces?.[0]?.colors ?? [],
    power: raw.power,
    toughness: raw.toughness,
    loyalty: raw.loyalty,
    price_usd: raw.prices?.usd ? parseFloat(raw.prices.usd) : raw.prices?.usd_foil ? parseFloat(raw.prices.usd_foil) : null,
    image_small: imgs.small,
    image_large: imgs.large,
  };
}

export async function getCatalogInfo(): Promise<{ count: number; updatedAt: number } | null> {
  const meta = await getCatalogMeta<{ count: number; updatedAt: number }>("info");
  return meta ?? null;
}

export function isCatalogStale(updatedAt: number): boolean {
  return Date.now() - updatedAt > STALE_MS;
}

export async function loadCachedCatalog(): Promise<CardData[]> {
  return loadCatalogChunks();
}

/**
 * Downloads Scryfall's `oracle_cards` bulk file (one entry per unique card),
 * keeping only the fields the app actually uses, then caches it in IndexedDB.
 * This is the one-time (or periodic-refresh) heavy operation described in
 * DESIGN.md so the deck builder never has to hit the live API per keystroke.
 *
 * Scryfall only serves this file gzip-compressed, as JSON Lines (one card
 * object per line) rather than one big JSON array — so it's streamed and
 * decompressed on the fly with the standard `DecompressionStream` API instead
 * of being buffered whole and passed to `JSON.parse`.
 */
export async function downloadFullCatalog(onProgress: (p: CatalogProgress) => void): Promise<CardData[]> {
  onProgress({ phase: "checking" });
  const bulkListRes = await politeFetch("https://api.scryfall.com/bulk-data");
  if (!bulkListRes.ok) throw new Error("Could not reach Scryfall bulk-data endpoint.");
  const bulkList = await bulkListRes.json();
  const oracleEntry = bulkList.data.find((d: any) => d.type === "oracle_cards");
  if (!oracleEntry?.jsonl_download_uri) throw new Error("Scryfall didn't list an oracle_cards bulk file.");

  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser doesn't support streaming gzip decompression, needed to load the catalog.");
  }

  const res = await fetch(oracleEntry.jsonl_download_uri);
  if (!res.ok || !res.body) throw new Error("Bulk data download failed.");

  const total = Number(res.headers.get("content-length")) || oracleEntry.compressed_size || undefined;
  let received = 0;
  const progressTap = new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      onProgress({ phase: "downloading", receivedBytes: received, totalBytes: total });
      controller.enqueue(chunk);
    },
  });

  const decompressed = res.body.pipeThrough(progressTap).pipeThrough(new DecompressionStream("gzip"));
  const reader = decompressed.getReader();
  const textDecoder = new TextDecoder("utf-8");

  const slimmed: CardData[] = [];
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += textDecoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim().replace(/,$/, "");
      if (!trimmed || trimmed === "[" || trimmed === "]") continue;
      const s = slim(JSON.parse(trimmed));
      if (s) slimmed.push(s);
    }
  }
  const last = buffer.trim().replace(/,$/, "");
  if (last && last !== "[" && last !== "]") {
    const s = slim(JSON.parse(last));
    if (s) slimmed.push(s);
  }

  onProgress({ phase: "storing" });
  const chunked: CardData[][] = [];
  for (let i = 0; i < slimmed.length; i += CHUNK_SIZE) chunked.push(slimmed.slice(i, i + CHUNK_SIZE));
  await saveCatalogChunks(chunked);
  await setCatalogMeta("info", { count: slimmed.length, updatedAt: Date.now() });

  onProgress({ phase: "done" });
  return slimmed;
}

// ---- Search ----

/** Fallback used before the local catalog has finished downloading. */
export async function searchLive(query: string): Promise<CardData[]> {
  if (!query.trim()) return [];
  const res = await politeFetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.cards ?? data.data ?? []).map(slim).filter(Boolean) as CardData[];
}

export async function fetchCardByName(name: string): Promise<CardData | null> {
  const res = await politeFetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  return slim(await res.json());
}

// ---- Printing history ----

export interface Printing {
  set: string;
  set_name: string;
  rarity: string;
  released_at: string;
}

const printingsCache = new Map<string, Printing[]>();

/** Every set a card has ever been printed in, newest first. Cached in memory for the session. */
export async function fetchPrintings(name: string): Promise<Printing[]> {
  const key = name.toLowerCase();
  const cached = printingsCache.get(key);
  if (cached) return cached;

  const query = `!"${name}"`;
  const res = await politeFetch(
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`
  );
  if (!res.ok) {
    printingsCache.set(key, []);
    return [];
  }
  const data = await res.json();
  const printings: Printing[] = (data.data ?? []).map((c: any) => ({
    set: (c.set ?? "").toUpperCase(),
    set_name: c.set_name ?? "",
    rarity: c.rarity ?? "",
    released_at: c.released_at ?? "",
  }));
  printingsCache.set(key, printings);
  return printings;
}

// ---- Decklist text format ----

export function parseDecklistText(text: string): DeckCard[] {
  const lines = text.split("\n");
  const out: DeckCard[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const match = trimmed.match(/^(\d+)x?\s+(.+)$/i);
    if (match) out.push({ qty: parseInt(match[1], 10), name: match[2].trim() });
    else out.push({ qty: 1, name: trimmed });
  }
  return out;
}

export function serializeDecklist(cards: DeckCard[]): string {
  return cards.map((c) => `${c.qty} ${c.name}`).join("\n");
}

export function resolveDeckToCards(deck: DeckCard[], catalog: CardData[]): CardData[] {
  const byName = new Map(catalog.map((c) => [c.name.toLowerCase(), c]));
  const out: CardData[] = [];
  for (const dc of deck) {
    const found = byName.get(dc.name.toLowerCase());
    if (!found) continue;
    for (let i = 0; i < dc.qty; i++) out.push(found);
  }
  return out;
}
