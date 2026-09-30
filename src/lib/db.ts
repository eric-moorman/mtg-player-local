import { openDB, type IDBPDatabase } from "idb";
import type { CardData, Deck, Identity, PlayMat } from "./types";

const SET_POOL_STALE_MS = 14 * 24 * 60 * 60 * 1000;

const DB_NAME = "kitchen-table";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("catalogChunks")) {
          db.createObjectStore("catalogChunks");
        }
        if (!db.objectStoreNames.contains("catalogMeta")) {
          db.createObjectStore("catalogMeta");
        }
        if (!db.objectStoreNames.contains("decks")) {
          db.createObjectStore("decks", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
        if (!db.objectStoreNames.contains("playmats")) {
          db.createObjectStore("playmats", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("setPools")) {
          db.createObjectStore("setPools");
        }
      },
    });
  }
  return dbPromise;
}

// ---- Catalog (chunked to keep individual records small) ----

export async function saveCatalogChunks(chunks: CardData[][]) {
  const db = await getDb();
  const tx = db.transaction("catalogChunks", "readwrite");
  await tx.store.clear();
  await Promise.all(chunks.map((chunk, i) => tx.store.put(chunk, i)));
  await tx.done;
}

export async function loadCatalogChunks(): Promise<CardData[]> {
  const db = await getDb();
  const chunks: CardData[][] = await db.getAll("catalogChunks");
  return chunks.flat();
}

export async function setCatalogMeta(key: string, value: unknown) {
  const db = await getDb();
  await db.put("catalogMeta", value, key);
}

export async function getCatalogMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return db.get("catalogMeta", key);
}

// ---- Decks ----

export async function listDecks(): Promise<Deck[]> {
  const db = await getDb();
  return db.getAll("decks");
}

export async function saveDeck(deck: Deck) {
  const db = await getDb();
  await db.put("decks", deck);
}

export async function deleteDeck(id: string) {
  const db = await getDb();
  await db.delete("decks", id);
}

// ---- Settings / identity ----

export async function getIdentity(): Promise<Identity> {
  const db = await getDb();
  const stored = await db.get("settings", "identity");
  return stored ?? { name: "Player", color: "#B2532F" };
}

export async function setIdentity(identity: Identity) {
  const db = await getDb();
  await db.put("settings", identity, "identity");
}

export async function getSelectedPlaymat(): Promise<string> {
  const db = await getDb();
  return (await db.get("settings", "selectedPlaymat")) ?? "slate";
}

export async function setSelectedPlaymat(id: string) {
  const db = await getDb();
  await db.put("settings", id, "selectedPlaymat");
}

// ---- Custom playmats ----

export async function listCustomPlaymats(): Promise<PlayMat[]> {
  const db = await getDb();
  return db.getAll("playmats");
}

export async function saveCustomPlaymat(playmat: PlayMat) {
  const db = await getDb();
  await db.put("playmats", playmat);
}

export async function deleteCustomPlaymat(id: string) {
  const db = await getDb();
  await db.delete("playmats", id);
}

// ---- Sealed Pool: per-set card pool cache ----

interface StoredSetPool {
  cards: CardData[];
  cachedAt: number;
}

export async function saveSetPool(setCode: string, cards: CardData[]) {
  const db = await getDb();
  const record: StoredSetPool = { cards, cachedAt: Date.now() };
  await db.put("setPools", record, setCode);
}

export async function loadSetPool(setCode: string): Promise<CardData[] | null> {
  const db = await getDb();
  const record: StoredSetPool | undefined = await db.get("setPools", setCode);
  if (!record) return null;
  if (Date.now() - record.cachedAt > SET_POOL_STALE_MS) return null;
  return record.cards;
}
