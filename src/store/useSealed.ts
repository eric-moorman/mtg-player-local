/**
 * Sealed Pool, as persistent multi-player "pool games".
 *
 * A pool game is a saved session: the rules (budget, allowed sets, pack config)
 * are frozen at creation and shared by everyone invited, while each player's
 * money, cards and in-progress deck are their own and live server-side under
 * their account (see worker/poolGames.ts). So the store holds two clearly
 * separate things, and it matters not to mix them up:
 *
 *   - `config` / `draft*` — the host's *personal defaults* and the new-game form.
 *     `config` is the account-synced preference, exactly as it was before.
 *   - `rules` + progress (`spent`, `pool`, `deckSelections`, `commanders`) — the
 *     *loaded game*. `rules` is a frozen copy owned by the game, never written back
 *     to the account, so editing your defaults can't rewrite a game in progress.
 *
 * Every progress mutation calls queueSave(), which debounces a whole-record PUT.
 * A blind overwrite is safe here only because no other client can write this
 * record — that's the point of the per-player key layout in the Worker.
 */
import { create } from "zustand";
import * as scryfall from "../lib/scryfall";
import * as cloud from "../lib/cloudSync";
import * as api from "../lib/poolGames";
import { useAuth } from "./useAuth";
import { useGame } from "./useGame";
import { newId } from "../lib/reducer";
import type {
  CardData,
  Deck,
  DeckCard,
  PoolCardRecord,
  PoolGameDetail,
  PoolGameListEntry,
  PoolGameMeta,
  PoolGamePlayerSummary,
  PoolGameProgress,
  PoolGameSettings,
  RarityWeights,
  SealedConfig,
  SetInfo,
} from "../lib/types";

const CONFIG_KEY = "kt-sealed-config";
const SAVE_DEBOUNCE_MS = 700;

function isSignedIn(): boolean {
  return useAuth.getState().user != null;
}

const DEFAULT_WEIGHTS: RarityWeights = { common: 60, uncommon: 25, rare: 12, mythic: 3 };
const DEFAULT_CONFIG: SealedConfig = {
  cardsPerPack: 14,
  packPrice: 6,
  rarityWeights: DEFAULT_WEIGHTS,
  sellBackRate: scryfall.DEFAULT_SELL_BACK_RATE,
};

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

/** `list` = pick or create a game; `setup` = the new-game form; `active` = playing one. */
export type SealedView = "list" | "setup" | "loading" | "active";
export type SealedTab = "packs" | "buy" | "build";
export type SaveState = "idle" | "saving" | "saved" | "error";

/** Kept as an alias so the older `PoolCard` name still reads naturally at call sites. */
export type PoolCard = PoolCardRecord;

interface SealedStore {
  view: SealedView;
  activeTab: SealedTab;
  setActiveTab: (tab: SealedTab) => void;

  /** The account's personal defaults, used to seed the new-game form. Not the rules of any game. */
  config: SealedConfig;
  setConfig: (patch: Partial<SealedConfig>) => void;
  setRarityWeight: (rarity: keyof RarityWeights, value: number) => void;
  loadRemoteConfig: () => Promise<void>;

  // ---- Saved game list ----
  games: PoolGameListEntry[];
  gamesStatus: "idle" | "loading" | "ready";
  listError: string | null;
  refreshGames: () => Promise<void>;
  openGame: (gameId: string) => Promise<void>;
  deleteGame: (gameId: string) => Promise<void>;

  // ---- New-game form ----
  draftName: string;
  setDraftName: (name: string) => void;
  draftBudget: number;
  setDraftBudget: (n: number) => void;
  draftInvites: string;
  setDraftInvites: (value: string) => void;
  showSetup: () => void;
  cancelSetup: () => void;
  createGame: () => Promise<void>;

  availableSets: SetInfo[];
  loadAvailableSets: () => Promise<void>;
  allowedSets: string[];
  toggleSet: (code: string) => void;
  selectAllSets: () => void;
  clearAllSets: () => void;

  // ---- The loaded game ----
  game: PoolGameMeta | null;
  /** Frozen rules of the loaded game — the only thing the active session should read numbers from. */
  rules: PoolGameSettings | null;
  players: PoolGamePlayerSummary[];
  /** Lazily filled, one set at a time, as packs get opened — never preloaded for every allowed set. */
  setPools: Record<string, CardData[]>;
  loadingSets: Record<string, boolean>;
  /** Surfaced next to the pack buttons; a failed pack never charges the budget. */
  packError: string | null;
  loadError: string | null;
  saveState: SaveState;

  spent: number;
  pool: PoolCardRecord[];
  deckSelections: Record<string, number>;
  commanders: string[];
  finished: boolean;
  finishedDeckName: string | null;

  lastOpened: { setCode: string; cards: CardData[] } | null;

  addToDeck: (name: string) => void;
  removeFromDeck: (name: string) => void;
  toggleCommander: (name: string) => void;

  basicLandCache: Record<string, CardData>;
  addBasicLands: (name: string, qty: number) => Promise<void>;

  openPack: (setCode: string) => Promise<void>;
  dismissReveal: () => void;
  buyCard: (card: CardData, setCode: string) => void;
  removeFromPool: (uid: string) => void;

  /** Saves the chosen cards as a normal deck and marks this game complete. */
  finishGame: (name: string) => Promise<void>;
  invitePlayers: (usernames: string[]) => Promise<void>;
  /** Leaves the loaded game and returns to the list — the game itself stays saved. */
  closeGame: () => void;
}

function poolQtyByName(pool: PoolCardRecord[], name: string): number {
  return pool.reduce((n, p) => n + (p.card.name === name ? 1 : 0), 0);
}

export const useSealed = create<SealedStore>((set, get) => {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Snapshot of just the fields the server owns for this player. */
  function progressSnapshot(): PoolGameProgress | null {
    const s = get();
    if (!s.game) return null;
    return {
      gameId: s.game.id,
      userId: "",
      username: "",
      spent: s.spent,
      pool: s.pool,
      deckSelections: s.deckSelections,
      commanders: s.commanders,
      finished: s.finished,
      finishedDeckName: s.finishedDeckName ?? undefined,
      updatedAt: Date.now(),
    };
  }

  async function flushSave(): Promise<void> {
    const snapshot = progressSnapshot();
    if (!snapshot) return;
    set({ saveState: "saving" });
    try {
      const players = await api.saveProgress(snapshot.gameId, snapshot);
      // Guard against a stale response landing after the user already left the game.
      if (get().game?.id === snapshot.gameId) set({ players, saveState: "saved" });
    } catch {
      set({ saveState: "error" });
    }
  }

  function queueSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  async function saveNow(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await flushSave();
  }

  /**
   * Opens a game straight to the table. Card pools are deliberately NOT fetched here:
   * a game may allow hundreds of sets, and pulling every one up front (each itself
   * paginated) took minutes with nothing on screen. A set's pool is fetched the first
   * time a pack from it is opened, and the Buy tab searches Scryfall live, so the cost
   * is proportional to what the player actually touches.
   */
  function loadGameIntoSession(detail: PoolGameDetail): void {
    const { meta, progress, players } = detail;
    set({
      view: "active",
      activeTab: progress.finished ? "build" : "packs",
      loadError: null,
      packError: null,
      game: meta,
      rules: meta.settings,
      players,
      spent: progress.spent,
      pool: progress.pool,
      deckSelections: progress.deckSelections,
      commanders: progress.commanders,
      finished: progress.finished,
      finishedDeckName: progress.finishedDeckName ?? null,
      lastOpened: null,
      saveState: "idle",
    });
    // Only for displaying set names next to the pack buttons — one cheap, cached request.
    void get().loadAvailableSets();
  }

  return {
    view: "list",
    activeTab: "packs",
    setActiveTab: (tab) => set({ activeTab: tab }),

    config: loadConfig(),
    setConfig: (patch) =>
      set((s) => {
        const config = { ...s.config, ...patch };
        if (isSignedIn()) cloud.patchSync({ sealedConfig: config }).catch(() => {});
        else saveConfig(config);
        return { config };
      }),
    setRarityWeight: (rarity, value) =>
      set((s) => {
        const config = { ...s.config, rarityWeights: { ...s.config.rarityWeights, [rarity]: value } };
        if (isSignedIn()) cloud.patchSync({ sealedConfig: config }).catch(() => {});
        else saveConfig(config);
        return { config };
      }),
    loadRemoteConfig: async () => {
      if (isSignedIn()) {
        const data = await cloud.getSync();
        // Merged over defaults, not assigned: an account synced before sell-back existed has no rate stored.
        if (data?.sealedConfig) set({ config: { ...DEFAULT_CONFIG, ...data.sealedConfig } });
      } else {
        set({ config: loadConfig() });
      }
    },

    games: [],
    gamesStatus: "idle",
    listError: null,
    refreshGames: async () => {
      if (!isSignedIn()) {
        set({ games: [], gamesStatus: "ready", listError: null });
        return;
      }
      set({ gamesStatus: "loading", listError: null });
      try {
        set({ games: await api.listGames(), gamesStatus: "ready" });
      } catch (e: any) {
        set({ gamesStatus: "ready", listError: e?.message ?? "Couldn't load your pool games." });
      }
    },
    openGame: async (gameId) => {
      set({ view: "loading", loadError: null });
      try {
        const detail = await api.getGame(gameId);
        loadGameIntoSession(detail);
      } catch (e: any) {
        set({ view: "list", loadError: e?.message ?? "Couldn't open that pool game." });
        void get().refreshGames();
      }
    },
    deleteGame: async (gameId) => {
      try {
        await api.deleteGame(gameId);
      } catch (e: any) {
        set({ listError: e?.message ?? "Couldn't remove that pool game." });
        return;
      }
      if (get().game?.id === gameId) get().closeGame();
      set((s) => ({ games: s.games.filter((g) => g.meta.id !== gameId) }));
    },

    draftName: "",
    setDraftName: (name) => set({ draftName: name }),
    draftBudget: 50,
    setDraftBudget: (n) => set({ draftBudget: Math.max(0, n) }),
    draftInvites: "",
    setDraftInvites: (value) => set({ draftInvites: value }),
    showSetup: () => set({ view: "setup", loadError: null, draftName: "", draftInvites: "", allowedSets: [] }),
    cancelSetup: () => set({ view: "list", loadError: null }),
    createGame: async () => {
      const { allowedSets, config, draftBudget, draftName, draftInvites } = get();
      if (allowedSets.length === 0) {
        set({ loadError: "Pick at least one set first." });
        return;
      }
      const settings: PoolGameSettings = {
        budget: draftBudget,
        cardsPerPack: config.cardsPerPack,
        packPrice: config.packPrice,
        rarityWeights: config.rarityWeights,
        sellBackRate: config.sellBackRate,
        allowedSets,
      };
      const invites = draftInvites
        .split(/[\s,]+/)
        .map((n) => n.trim())
        .filter((n) => n.length > 0);

      set({ view: "loading", loadError: null });
      let detail: PoolGameDetail;
      try {
        detail = await api.createGame(draftName, settings, invites);
      } catch (e: any) {
        // Back to the form with everything still filled in, so a bad username is a one-field fix.
        set({ view: "setup", loadError: e?.message ?? "Couldn't create that pool game." });
        return;
      }
      loadGameIntoSession(detail);
      void get().refreshGames();
    },

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

    game: null,
    rules: null,
    players: [],
    setPools: {},
    loadingSets: {},
    packError: null,
    loadError: null,
    saveState: "idle",

    spent: 0,
    pool: [],
    deckSelections: {},
    commanders: [],
    finished: false,
    finishedDeckName: null,

    lastOpened: null,

    addToDeck: (name) => {
      const s = get();
      const available = poolQtyByName(s.pool, name);
      const current = s.deckSelections[name] ?? 0;
      if (current >= available) return;
      set({ deckSelections: { ...s.deckSelections, [name]: current + 1 } });
      queueSave();
    },
    removeFromDeck: (name) => {
      const s = get();
      const current = s.deckSelections[name] ?? 0;
      if (current <= 0) return;
      const next = { ...s.deckSelections };
      let commanders = s.commanders;
      if (current <= 1) {
        delete next[name];
        commanders = commanders.filter((c) => c.toLowerCase() !== name.toLowerCase());
      } else {
        next[name] = current - 1;
      }
      set({ deckSelections: next, commanders });
      queueSave();
    },

    toggleCommander: (name) => {
      const s = get();
      if (s.commanders.some((c) => c.toLowerCase() === name.toLowerCase())) {
        set({ commanders: s.commanders.filter((c) => c.toLowerCase() !== name.toLowerCase()) });
      } else {
        if (s.commanders.length >= 2) return;
        set({ commanders: [...s.commanders, name] });
      }
      queueSave();
    },

    basicLandCache: {},
    addBasicLands: async (name, qty) => {
      if (qty <= 0) return;
      let card = get().basicLandCache[name];
      if (!card) {
        const fetched = await scryfall.fetchCardByName(name);
        if (!fetched) return;
        // Free lands show $0 everywhere (pool, decklist, sell price) — no budget was ever spent on them.
        card = { ...fetched, price_usd: 0 };
        set((s) => ({ basicLandCache: { ...s.basicLandCache, [name]: card! } }));
      }
      const added: PoolCardRecord[] = Array.from({ length: qty }, () => ({ uid: newId(), card: card!, via: "basic" }));
      set((s) => ({ pool: [...s.pool, ...added] }));
      queueSave();
    },

    openPack: async (setCode) => {
      const { rules, setPools, loadingSets } = get();
      if (!rules || loadingSets[setCode]) return;
      if (rules.budget - get().spent < rules.packPrice) return;

      // First pack from this set pulls its card list; fetchSetCardPool caches to
      // IndexedDB, so every later pack from the same set is instant and offline.
      let setPool = setPools[setCode];
      if (!setPool) {
        set((s) => ({ loadingSets: { ...s.loadingSets, [setCode]: true }, packError: null }));
        try {
          setPool = await scryfall.fetchSetCardPool(setCode);
        } catch {
          const name = get().availableSets.find((s) => s.code === setCode)?.name ?? setCode.toUpperCase();
          set((s) => ({
            loadingSets: { ...s.loadingSets, [setCode]: false },
            packError: `Couldn't load ${name} from Scryfall — nothing was charged. Try again, or pick a different set.`,
          }));
          return;
        }
        set((s) => ({ setPools: { ...s.setPools, [setCode]: setPool! }, loadingSets: { ...s.loadingSets, [setCode]: false } }));
      }

      if (setPool.length === 0) {
        const name = get().availableSets.find((s) => s.code === setCode)?.name ?? setCode.toUpperCase();
        set({ packError: `${name} has no openable cards on Scryfall — nothing was charged. Try a different set.` });
        return;
      }

      // Re-read spend rather than reusing the pre-fetch value: the player may have
      // bought or sold something while the set was downloading.
      const { spent, pool } = get();
      if (rules.budget - spent < rules.packPrice) return;

      const opened = scryfall.openPack(setPool, rules.cardsPerPack, rules.rarityWeights);
      const newPoolCards: PoolCardRecord[] = opened.map((card) => ({ uid: newId(), card, via: "pack", fromSet: setCode }));
      set({
        spent: spent + rules.packPrice,
        pool: [...pool, ...newPoolCards],
        lastOpened: { setCode, cards: opened },
        packError: null,
      });
      queueSave();
    },
    dismissReveal: () => set({ lastOpened: null }),

    buyCard: (card, setCode) => {
      const { rules, spent, pool } = get();
      if (!rules) return;
      const price = scryfall.effectivePrice(card);
      if (rules.budget - spent < price) return;
      set({ spent: spent + price, pool: [...pool, { uid: newId(), card, via: "buy", fromSet: setCode }] });
      queueSave();
    },

    removeFromPool: (uid) => {
      const s = get();
      const entry = s.pool.find((p) => p.uid === uid);
      if (!entry) return;
      // Pack-sourced cards can be sold back too, same as bought ones — both refund a
      // fraction of the price stored on the card when it was acquired, so a later Scryfall
      // price move can't silently change what a sale is worth mid-game. The fraction is the
      // game's sell-back rate: without that spread, opening packs and liquidating them is a
      // reliable profit and the budget stops constraining anything.
      const refund = scryfall.sellValue(entry.card, scryfall.sellBackRate(s.rules));
      const nextPool = s.pool.filter((p) => p.uid !== uid);
      // Clamp the deck selection for this name in case the removed copy was one chosen for the deck.
      const available = poolQtyByName(nextPool, entry.card.name);
      const deckSelections = { ...s.deckSelections };
      let commanders = s.commanders;
      if ((deckSelections[entry.card.name] ?? 0) > available) {
        if (available <= 0) {
          delete deckSelections[entry.card.name];
          commanders = commanders.filter((c) => c.toLowerCase() !== entry.card.name.toLowerCase());
        } else {
          deckSelections[entry.card.name] = available;
        }
      }
      set({ pool: nextPool, spent: s.spent - refund, deckSelections, commanders });
      queueSave();
    },

    finishGame: async (name) => {
      const { deckSelections, commanders } = get();
      const cards: DeckCard[] = Object.entries(deckSelections)
        .filter(([, qty]) => qty > 0)
        .map(([cardName, qty]) => ({ name: cardName, qty }));
      const deckName = name.trim() || "Sealed pool";
      const deck: Deck = { id: newId(), name: deckName, cards, commanders, updatedAt: Date.now() };
      // Saved as an ordinary deck — a finished pool game produces nothing special, just a deck.
      await useGame.getState().saveDeck(deck);
      set({ finished: true, finishedDeckName: deckName });
      await saveNow();
      void get().refreshGames();
    },

    invitePlayers: async (usernames) => {
      const game = get().game;
      if (!game) return;
      const { meta, players } = await api.invitePlayers(game.id, usernames);
      set({ game: meta, players });
      void get().refreshGames();
    },

    closeGame: () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        void flushSave();
      }
      set({
        view: "list",
        activeTab: "packs",
        game: null,
        rules: null,
        players: [],
        setPools: {},
        loadingSets: {},
        packError: null,
        spent: 0,
        pool: [],
        deckSelections: {},
        commanders: [],
        finished: false,
        finishedDeckName: null,
        lastOpened: null,
        loadError: null,
        saveState: "idle",
      });
      void get().refreshGames();
    },
  };
});
