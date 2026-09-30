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

export type SealedPhase = "setup" | "loading" | "active";
export type SealedTab = "packs" | "buy" | "build";

export interface PoolCard {
  uid: string;
  card: CardData;
  via: "pack" | "buy";
  fromSet?: string;
}

interface SealedStore {
  phase: SealedPhase;
  activeTab: SealedTab;
  setActiveTab: (tab: SealedTab) => void;

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
  selectAllSets: () => void;
  clearAllSets: () => void;

  setPools: Record<string, CardData[]>;
  loadError: string | null;

  pool: PoolCard[];
  lastOpened: { setCode: string; cards: CardData[] } | null;

  /** Card name -> quantity chosen for the deck (bounded by how many of that name are in the pool). */
  deckSelections: Record<string, number>;
  addToDeck: (name: string) => void;
  removeFromDeck: (name: string) => void;

  startSession: () => Promise<void>;
  openPack: (setCode: string) => void;
  dismissReveal: () => void;
  buyCard: (card: CardData, setCode: string) => void;
  removeFromPool: (uid: string) => void;
  saveAsDeck: (name: string) => Promise<string>;
  reset: () => void;
}

function poolQtyByName(pool: PoolCard[], name: string): number {
  return pool.reduce((n, p) => n + (p.card.name === name ? 1 : 0), 0);
}

export const useSealed = create<SealedStore>((set, get) => ({
  phase: "setup",
  activeTab: "packs",
  setActiveTab: (tab) => set({ activeTab: tab }),

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
  selectAllSets: () => set((s) => ({ allowedSets: s.availableSets.map((set) => set.code) })),
  clearAllSets: () => set({ allowedSets: [] }),

  setPools: {},
  loadError: null,

  pool: [],
  lastOpened: null,

  deckSelections: {},
  addToDeck: (name) =>
    set((s) => {
      const available = poolQtyByName(s.pool, name);
      const current = s.deckSelections[name] ?? 0;
      if (current >= available) return {};
      return { deckSelections: { ...s.deckSelections, [name]: current + 1 } };
    }),
  removeFromDeck: (name) =>
    set((s) => {
      const current = s.deckSelections[name] ?? 0;
      if (current <= 0) return {};
      const next = { ...s.deckSelections };
      if (current <= 1) delete next[name];
      else next[name] = current - 1;
      return { deckSelections: next };
    }),

  startSession: async () => {
    const { allowedSets } = get();
    if (allowedSets.length === 0) {
      set({ loadError: "Pick at least one set first." });
      return;
    }
    set({ phase: "loading", loadError: null });
    const setPools: Record<string, CardData[]> = {};
    try {
      // Sequential, not Promise.all: keeps every request properly spaced through
      // politeFetch's queue and means a failure is attributable to one specific set.
      for (const code of allowedSets) {
        setPools[code] = await scryfall.fetchSetCardPool(code);
      }
      set({ setPools, phase: "active", activeTab: "packs", spent: 0, pool: [], deckSelections: {} });
    } catch {
      const name = get().availableSets.find((s) => !setPools[s.code] && allowedSets.includes(s.code))?.name;
      set({
        phase: "setup",
        loadError: name ? `Couldn't load "${name}" from Scryfall. Please try again.` : "Couldn't load one of the sets from Scryfall. Please try again.",
      });
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
      const nextPool = s.pool.filter((p) => p.uid !== uid);
      // Clamp the deck selection for this name in case the removed copy was one that had been chosen for the deck.
      const available = poolQtyByName(nextPool, entry.card.name);
      const deckSelections = { ...s.deckSelections };
      if ((deckSelections[entry.card.name] ?? 0) > available) {
        if (available <= 0) delete deckSelections[entry.card.name];
        else deckSelections[entry.card.name] = available;
      }
      return { pool: nextPool, spent: s.spent - refund, deckSelections };
    }),

  saveAsDeck: async (name) => {
    const { deckSelections } = get();
    const cards: DeckCard[] = Object.entries(deckSelections)
      .filter(([, qty]) => qty > 0)
      .map(([cardName, qty]) => ({ name: cardName, qty }));
    const deck: Deck = { id: newId(), name: name.trim() || "Sealed pool", cards, updatedAt: Date.now() };
    await saveDeck(deck);
    return deck.id;
  },

  reset: () =>
    set({
      phase: "setup",
      activeTab: "packs",
      budget: 50,
      spent: 0,
      allowedSets: [],
      setPools: {},
      pool: [],
      lastOpened: null,
      loadError: null,
      deckSelections: {},
    }),
}));
