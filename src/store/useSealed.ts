import { create } from "zustand";
import * as scryfall from "../lib/scryfall";
import { saveDeck } from "../lib/db";
import { newId } from "../lib/reducer";
import type { CardData, Deck, DeckCard, RarityWeights, SealedConfig, SetInfo } from "../lib/types";

const CONFIG_KEY = "kt-sealed-config";

const DEFAULT_WEIGHTS: RarityWeights = { common: 60, uncommon: 25, rare: 12, mythic: 3 };
const DEFAULT_CONFIG: SealedConfig = { cardsPerPack: 14, packPrice: 4, rarityWeights: DEFAULT_WEIGHTS };

function loadConfig(): SealedConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: SealedConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export type SealedPhase = "setup" | "loading" | "session" | "building";

export interface PoolCard {
  uid: string;
  card: CardData;
  via: "pack" | "buy";
  fromSet?: string;
}

interface SealedStore {
  phase: SealedPhase;
  config: SealedConfig;
  setConfig: (patch: Partial<SealedConfig>) => void;
  setRarityWeight: (rarity: keyof RarityWeights, value: number) => void;

  budget: number;
  setBudget: (n: number) => void;
  spent: number;

  availableSets: SetInfo[];
  loadAvailableSets: () => Promise<void>;
  allowedSets: string[];
  toggleSet: (code: string) => void;

  setPools: Record<string, CardData[]>;
  loadError: string | null;

  pool: PoolCard[];
  lastOpened: { setCode: string; cards: CardData[] } | null;

  startSession: () => Promise<void>;
  openPack: (setCode: string) => void;
  dismissReveal: () => void;
  buyCard: (card: CardData, setCode: string) => void;
  removeFromPool: (uid: string) => void;
  finishAcquiring: () => void;
  backToSession: () => void;
  saveAsDeck: (name: string) => Promise<string>;
  reset: () => void;
}

export const useSealed = create<SealedStore>((set, get) => ({
  phase: "setup",
  config: loadConfig(),
  setConfig: (patch) =>
    set((s) => {
      const config = { ...s.config, ...patch };
      saveConfig(config);
      return { config };
    }),
  setRarityWeight: (rarity, value) =>
    set((s) => {
      const config = { ...s.config, rarityWeights: { ...s.config.rarityWeights, [rarity]: value } };
      saveConfig(config);
      return { config };
    }),

  budget: 50,
  setBudget: (n) => set({ budget: Math.max(0, n) }),
  spent: 0,

  availableSets: [],
  loadAvailableSets: async () => {
    if (get().availableSets.length) return;
    const sets = await scryfall.fetchSetList();
    set({ availableSets: sets });
  },
  allowedSets: [],
  toggleSet: (code) =>
    set((s) => ({
      allowedSets: s.allowedSets.includes(code) ? s.allowedSets.filter((c) => c !== code) : [...s.allowedSets, code],
    })),

  setPools: {},
  loadError: null,

  pool: [],
  lastOpened: null,

  startSession: async () => {
    const { allowedSets } = get();
    if (allowedSets.length === 0) {
      set({ loadError: "Pick at least one set first." });
      return;
    }
    set({ phase: "loading", loadError: null });
    try {
      const entries = await Promise.all(allowedSets.map(async (code) => [code, await scryfall.fetchSetCardPool(code)] as const));
      const setPools: Record<string, CardData[]> = {};
      for (const [code, cards] of entries) setPools[code] = cards;
      set({ setPools, phase: "session", spent: 0, pool: [] });
    } catch {
      set({ phase: "setup", loadError: "Couldn't load one or more sets from Scryfall. Please try again." });
    }
  },

  openPack: (setCode) => {
    const { budget, spent, config, setPools, pool } = get();
    const remaining = budget - spent;
    if (remaining < config.packPrice) return;
    const setPool = setPools[setCode];
    if (!setPool || setPool.length === 0) return;
    const opened = scryfall.openPack(setPool, config.cardsPerPack, config.rarityWeights);
    const newPoolCards: PoolCard[] = opened.map((card) => ({ uid: newId(), card, via: "pack", fromSet: setCode }));
    set({
      spent: spent + config.packPrice,
      pool: [...pool, ...newPoolCards],
      lastOpened: { setCode, cards: opened },
    });
  },
  dismissReveal: () => set({ lastOpened: null }),

  buyCard: (card, setCode) => {
    const { budget, spent, pool } = get();
    const price = card.price_usd ?? 0;
    if (budget - spent < price) return;
    set({ spent: spent + price, pool: [...pool, { uid: newId(), card, via: "buy", fromSet: setCode }] });
  },

  removeFromPool: (uid) =>
    set((s) => {
      const entry = s.pool.find((p) => p.uid === uid);
      if (!entry) return {};
      const refund = entry.via === "buy" ? entry.card.price_usd ?? 0 : 0;
      return { pool: s.pool.filter((p) => p.uid !== uid), spent: s.spent - refund };
    }),

  finishAcquiring: () => set({ phase: "building" }),
  backToSession: () => set({ phase: "session" }),

  saveAsDeck: async (name) => {
    const { pool } = get();
    const counts = new Map<string, number>();
    for (const p of pool) counts.set(p.card.name, (counts.get(p.card.name) ?? 0) + 1);
    const cards: DeckCard[] = Array.from(counts.entries()).map(([cardName, qty]) => ({ name: cardName, qty }));
    const deck: Deck = { id: newId(), name: name.trim() || "Sealed pool", cards, updatedAt: Date.now() };
    await saveDeck(deck);
    return deck.id;
  },

  reset: () =>
    set({
      phase: "setup",
      budget: 50,
      spent: 0,
      allowedSets: [],
      setPools: {},
      pool: [],
      lastOpened: null,
      loadError: null,
    }),
}));
