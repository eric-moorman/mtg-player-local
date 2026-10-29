/**
 * Commander Draft: open a pack of commanders, pass it round the table so
 * everyone else bans one out of it, then choose from what survived.
 *
 * Unlike the Sealed Pool store, nothing here is owned by this client. The
 * server holds the whole draft (worker/banDraft.ts) and every action is a
 * request that can be refused — a pack may have moved on since the last poll,
 * someone else may have banned the card being looked at. So there's no local
 * mutation and no debounced save: each action posts, and the response *is* the
 * new state. That also means the refresh poll and an action can't disagree,
 * since both write the same two fields from the same server payload.
 */
import { create } from "zustand";
import * as api from "../lib/banDraft";
import * as scryfall from "../lib/scryfall";
import { useAuth } from "./useAuth";
import type { BanDraftDetail, BanDraftListEntry, BanDraftMeta, BanDraftPack } from "../lib/types";

/** How often an open, unfinished draft re-reads the table. Packs move at human speed. */
const POLL_MS = 5000;

export type BanDraftView = "list" | "setup" | "loading" | "active";

const DEFAULT_CARDS_PER_PACK = 10;

interface BanDraftStore {
  view: BanDraftView;

  // ---- Draft list ----
  games: BanDraftListEntry[];
  gamesStatus: "idle" | "loading" | "ready";
  listError: string | null;
  refreshGames: () => Promise<void>;
  openGame: (gameId: string) => Promise<void>;
  deleteGame: (gameId: string) => Promise<void>;

  // ---- New-draft form ----
  draftName: string;
  setDraftName: (name: string) => void;
  draftCardsPerPack: number;
  setDraftCardsPerPack: (n: number) => void;
  draftInvites: string;
  setDraftInvites: (value: string) => void;
  showSetup: () => void;
  cancelSetup: () => void;
  createGame: () => Promise<void>;

  // ---- The loaded draft ----
  meta: BanDraftMeta | null;
  packs: BanDraftPack[];
  /** This player's own user id, as the server sees it. Turn order is keyed by id, not name. */
  myUserId: string | null;
  loadError: string | null;
  /** Errors from an action the player just took, shown next to the pack rather than the list. */
  actionError: string | null;
  busy: boolean;
  /** Progress text while the host's client downloads the commander list before dealing. */
  startProgress: string | null;

  /** The card the player has tapped in the pack they're acting on, awaiting confirmation. */
  selectedCardId: string | null;
  selectCard: (cardId: string | null) => void;

  refreshActive: () => Promise<void>;
  startDraft: () => Promise<void>;
  passPack: (pack: BanDraftPack) => Promise<void>;
  banCard: (pack: BanDraftPack, cardId: string) => Promise<void>;
  pickCommander: (pack: BanDraftPack, cardId: string) => Promise<void>;
  invitePlayers: (usernames: string[]) => Promise<void>;
  closeGame: () => void;
}

function isSignedIn(): boolean {
  return useAuth.getState().user != null;
}

export const useBanDraft = create<BanDraftStore>((set, get) => {
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      const s = get();
      // Never poll over an in-flight action: the action's own response is newer
      // than anything a poll started before it could return.
      if (s.view !== "active" || s.busy) return;
      void s.refreshActive();
    }, POLL_MS);
  }

  /**
   * Applies a server payload. Clears the pending selection whenever the pack the
   * player was looking at has moved or lost that card, so a stale highlight can
   * never be confirmed into the wrong ban.
   */
  function applyDetail(detail: BanDraftDetail): void {
    const { selectedCardId, myUserId } = get();
    const viewer = detail.viewerUserId || myUserId;
    const stillSelectable =
      selectedCardId != null &&
      viewer != null &&
      api
        .packsAwaiting(detail.meta, detail.packs, viewer)
        .some((p) => api.liveCards(p).some((c) => c.id === selectedCardId));
    set({
      meta: detail.meta,
      packs: detail.packs,
      myUserId: viewer,
      selectedCardId: stillSelectable ? selectedCardId : null,
    });
  }

  /** Shared wrapper for the three pack actions — they differ only in what they post. */
  async function act(run: () => Promise<BanDraftDetail>): Promise<void> {
    if (get().busy) return;
    set({ busy: true, actionError: null });
    try {
      applyDetail(await run());
    } catch (e: any) {
      set({ actionError: e?.message ?? "That didn't go through." });
      // A refused action almost always means this client's view is stale, so
      // pull the real state immediately rather than leaving a wrong board up.
      try {
        const gameId = get().meta?.id;
        if (gameId) applyDetail(await api.getDraft(gameId));
      } catch {
        // Leave the existing view and the error message; the poll will retry.
      }
    } finally {
      set({ busy: false });
    }
  }

  return {
    view: "list",

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
        set({ games: await api.listDrafts(), gamesStatus: "ready" });
      } catch (e: any) {
        set({ gamesStatus: "ready", listError: e?.message ?? "Couldn't load your commander drafts." });
      }
    },
    openGame: async (gameId) => {
      set({ view: "loading", loadError: null, actionError: null, selectedCardId: null });
      try {
        const detail = await api.getDraft(gameId);
        applyDetail(detail);
        set({ view: "active" });
        startPolling();
      } catch (e: any) {
        set({ view: "list", loadError: e?.message ?? "Couldn't open that commander draft." });
        void get().refreshGames();
      }
    },
    deleteGame: async (gameId) => {
      try {
        await api.deleteDraft(gameId);
      } catch (e: any) {
        set({ listError: e?.message ?? "Couldn't remove that commander draft." });
        return;
      }
      if (get().meta?.id === gameId) get().closeGame();
      set((s) => ({ games: s.games.filter((g) => g.meta.id !== gameId) }));
    },

    draftName: "",
    setDraftName: (name) => set({ draftName: name }),
    draftCardsPerPack: DEFAULT_CARDS_PER_PACK,
    setDraftCardsPerPack: (n) => set({ draftCardsPerPack: Math.min(30, Math.max(2, Math.round(n) || 2)) }),
    draftInvites: "",
    setDraftInvites: (value) => set({ draftInvites: value }),
    showSetup: () => set({ view: "setup", loadError: null, draftName: "", draftInvites: "" }),
    cancelSetup: () => set({ view: "list", loadError: null }),
    createGame: async () => {
      const { draftName, draftCardsPerPack, draftInvites } = get();
      const invites = draftInvites
        .split(/[\s,]+/)
        .map((n) => n.trim())
        .filter((n) => n.length > 0);

      set({ view: "loading", loadError: null });
      let detail: BanDraftDetail;
      try {
        detail = await api.createDraft(draftName, draftCardsPerPack, invites);
      } catch (e: any) {
        // Back to the form with everything still filled in, so a bad username is a one-field fix.
        set({ view: "setup", loadError: e?.message ?? "Couldn't create that commander draft." });
        return;
      }
      applyDetail(detail);
      set({ view: "active", actionError: null, selectedCardId: null });
      startPolling();
      void get().refreshGames();
    },

    meta: null,
    packs: [],
    myUserId: null,
    loadError: null,
    actionError: null,
    busy: false,
    startProgress: null,

    selectedCardId: null,
    selectCard: (cardId) => set({ selectedCardId: cardId }),

    refreshActive: async () => {
      const gameId = get().meta?.id;
      if (!gameId) return;
      try {
        const detail = await api.getDraft(gameId);
        // Discard a response that landed after the player left or opened another draft.
        if (get().meta?.id === gameId) applyDetail(detail);
      } catch {
        // A dropped poll is not worth an error banner — the next one in five seconds will do.
      }
    },

    /**
     * Host only. The commander list and the shuffle both happen here, on the
     * host's machine, because the Worker has no Scryfall access and no business
     * knowing what a commander is — it just stores the packs it is handed.
     */
    startDraft: async () => {
      const { meta, draftCardsPerPack } = get();
      if (!meta || get().busy) return;
      const perPack = meta.settings.cardsPerPack || draftCardsPerPack;

      set({ busy: true, actionError: null, startProgress: "Loading the commander list from Scryfall…" });
      try {
        const pool = await scryfall.fetchCommanderPool((loaded) =>
          set({ startProgress: `Loading the commander list from Scryfall… ${loaded} so far` }),
        );
        set({ startProgress: "Dealing packs…" });
        const dealt = scryfall.dealCommanderPacks(pool, meta.members.length, perPack);
        const packs = meta.members.map((m, i) => ({ ownerUserId: m.userId, cards: dealt[i] }));
        applyDetail(await api.startDraft(meta.id, packs));
        void get().refreshGames();
      } catch (e: any) {
        set({ actionError: e?.message ?? "Couldn't deal the packs." });
      } finally {
        set({ busy: false, startProgress: null });
      }
    },

    passPack: async (pack) => {
      const meta = get().meta;
      if (!meta) return;
      await act(() => api.actOnPack(meta.id, pack.ownerUserId, "look", pack.position));
    },

    banCard: async (pack, cardId) => {
      const meta = get().meta;
      if (!meta) return;
      await act(() => api.actOnPack(meta.id, pack.ownerUserId, "ban", pack.position, cardId));
    },

    pickCommander: async (pack, cardId) => {
      const meta = get().meta;
      if (!meta) return;
      await act(() => api.actOnPack(meta.id, pack.ownerUserId, "pick", pack.position, cardId));
      void get().refreshGames();
    },

    invitePlayers: async (usernames) => {
      const meta = get().meta;
      if (!meta) return;
      applyDetail(await api.invitePlayers(meta.id, usernames));
      void get().refreshGames();
    },

    closeGame: () => {
      stopPolling();
      set({
        view: "list",
        meta: null,
        packs: [],
        myUserId: null,
        selectedCardId: null,
        actionError: null,
        loadError: null,
        startProgress: null,
        busy: false,
      });
      void get().refreshGames();
    },
  };
});
