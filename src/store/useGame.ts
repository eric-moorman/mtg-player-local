import { create } from "zustand";
import Peer, { type DataConnection } from "peerjs";
import * as db from "../lib/db";
import * as scryfall from "../lib/scryfall";
import * as cloud from "../lib/cloudSync";
import { useAuth } from "./useAuth";
import { generateRoomCode, roomCodeToPeerId } from "../lib/roomCode";
import {
  applyAction,
  chatLog,
  createInitialState,
  createPlayer,
  newId,
  redactStateFor,
  setPlayerDeck,
  setPlayerReady,
  startGame as startGameReducer,
} from "../lib/reducer";
import type {
  CardData,
  ClientToHost,
  Deck,
  GameAction,
  GameState,
  HostToClient,
  Identity,
  PlayMat,
} from "../lib/types";

export type Screen = "lobby" | "deckbuilder" | "sealed" | "table" | "settings";
export type Role = "offline" | "host" | "guest";

const BUILTIN_PLAYMATS: PlayMat[] = [
  { id: "slate", name: "Slate", kind: "builtin", css: "linear-gradient(135deg,#1E222A,#2E343E)" },
  { id: "forest", name: "Forest felt", kind: "builtin", css: "linear-gradient(135deg,#233524,#3E5B40)" },
  { id: "void", name: "Void", kind: "builtin", css: "linear-gradient(135deg,#241823,#3B2540)" },
  { id: "parchment", name: "Parchment", kind: "builtin", css: "linear-gradient(135deg,#E7E2D5,#D8D2C2)" },
];

// Live PeerJS/networking objects live outside the reactive store — they're
// infrastructure, not UI state. The store only ever holds serializable-ish
// snapshots derived from them.
let peer: Peer | null = null;
let hostConnections = new Map<string, DataConnection>();
let guestConnection: DataConnection | null = null;
let hostAuthoritativeState: GameState | null = null;

interface AppStore {
  screen: Screen;
  setScreen: (s: Screen) => void;

  identity: Identity;
  setIdentity: (i: Identity) => void;
  loadIdentity: () => Promise<void>;

  decks: Deck[];
  refreshDecks: () => Promise<void>;
  saveDeck: (deck: Deck) => Promise<void>;
  removeDeck: (id: string) => Promise<void>;

  catalog: CardData[];
  catalogStatus: "idle" | "loading" | "ready";
  catalogProgress: scryfall.CatalogProgress | null;
  catalogInfo: { count: number; updatedAt: number } | null;
  catalogError: string | null;
  loadCatalogFromCache: () => Promise<void>;
  downloadCatalog: () => Promise<void>;

  playmats: PlayMat[];
  selectedPlaymat: string;
  loadPlaymats: () => Promise<void>;
  selectPlaymat: (id: string) => Promise<void>;
  addCustomPlaymat: (name: string, imageDataUrl: string) => Promise<PlayMat>;

  role: Role;
  myId: string | null;
  roomCode: string | null;
  connectError: string | null;
  gameState: GameState | null;
  selectedDeckId: string | null;
  deckLoading: boolean;

  hostGame: () => Promise<void>;
  joinGame: (code: string) => Promise<void>;
  leaveGame: () => void;

  setStartingLife: (n: number) => void;
  selectDeckForGame: (deckId: string) => Promise<void>;
  setReady: (ready: boolean) => void;
  requestStart: () => void;

  dispatch: (action: GameAction) => void;
  sendChat: (text: string) => void;
}

function colorForIndex(i: number): string {
  const palette = ["#B2532F", "#3E7EAE", "#4C7350", "#8F6C1E", "#4B4258", "#A0527A"];
  return palette[i % palette.length];
}

/**
 * Signed out: decks/identity/playmat read and write local IndexedDB exactly
 * as before. Signed in: they read and write the account's synced blob
 * instead — the two never merge (see useAuth.ts / cloudSync.ts).
 */
function isSignedIn(): boolean {
  return useAuth.getState().user != null;
}

export const useGame = create<AppStore>((set, get) => ({
  screen: "lobby",
  setScreen: (s) => set({ screen: s }),

  identity: { name: "Player", color: colorForIndex(0) },
  setIdentity: (i) => {
    if (isSignedIn()) cloud.patchSync({ identity: i }).catch(() => {});
    else db.setIdentity(i);
    set({ identity: i });
  },
  loadIdentity: async () => {
    if (isSignedIn()) {
      const data = await cloud.getSync();
      set({ identity: data?.identity ?? get().identity });
    } else {
      set({ identity: await db.getIdentity() });
    }
  },

  decks: [],
  refreshDecks: async () => {
    if (isSignedIn()) {
      const data = await cloud.getSync();
      set({ decks: data?.decks ?? [] });
    } else {
      set({ decks: await db.listDecks() });
    }
  },
  saveDeck: async (deck) => {
    if (isSignedIn()) {
      const decks = [...get().decks.filter((d) => d.id !== deck.id), deck];
      await cloud.patchSync({ decks });
      set({ decks });
    } else {
      await db.saveDeck(deck);
      set({ decks: await db.listDecks() });
    }
  },
  removeDeck: async (id) => {
    if (isSignedIn()) {
      const decks = get().decks.filter((d) => d.id !== id);
      await cloud.patchSync({ decks });
      set({ decks });
    } else {
      await db.deleteDeck(id);
      set({ decks: await db.listDecks() });
    }
  },

  catalog: [],
  catalogStatus: "idle",
  catalogProgress: null,
  catalogInfo: null,
  catalogError: null,
  loadCatalogFromCache: async () => {
    set({ catalogStatus: "loading" });
    try {
      const [cards, info] = await Promise.all([scryfall.loadCachedCatalog(), scryfall.getCatalogInfo()]);
      set({ catalog: cards, catalogInfo: info, catalogStatus: cards.length ? "ready" : "idle" });
    } catch (e) {
      set({ catalogStatus: "idle" });
    }
  },
  downloadCatalog: async () => {
    set({ catalogStatus: "loading", catalogError: null });
    try {
      const cards = await scryfall.downloadFullCatalog((p) => set({ catalogProgress: p }));
      const info = await scryfall.getCatalogInfo();
      set({ catalog: cards, catalogInfo: info, catalogStatus: "ready", catalogProgress: null });
    } catch (e: any) {
      set({ catalogStatus: "idle", catalogError: e?.message ?? "Download failed.", catalogProgress: null });
    }
  },

  playmats: BUILTIN_PLAYMATS,
  selectedPlaymat: "slate",
  loadPlaymats: async () => {
    // Custom playmat *assets* stay local-only regardless of sign-in state (not part of the synced blob) —
    // only which playmat is selected syncs.
    const custom = await db.listCustomPlaymats();
    if (isSignedIn()) {
      const data = await cloud.getSync();
      set({ playmats: [...BUILTIN_PLAYMATS, ...custom], selectedPlaymat: data?.selectedPlaymat ?? "slate" });
    } else {
      const selected = await db.getSelectedPlaymat();
      set({ playmats: [...BUILTIN_PLAYMATS, ...custom], selectedPlaymat: selected });
    }
  },
  selectPlaymat: async (id) => {
    set({ selectedPlaymat: id });
    if (isSignedIn()) await cloud.patchSync({ selectedPlaymat: id }).catch(() => {});
    else await db.setSelectedPlaymat(id);
  },
  addCustomPlaymat: async (name, imageDataUrl) => {
    const playmat: PlayMat = { id: newId(), name, kind: "custom", image: imageDataUrl };
    await db.saveCustomPlaymat(playmat);
    set({ playmats: [...get().playmats, playmat] });
    return playmat;
  },

  role: "offline",
  myId: null,
  roomCode: null,
  connectError: null,
  gameState: null,
  selectedDeckId: null,
  deckLoading: false,

  hostGame: async () => {
    const code = generateRoomCode();
    const id = roomCodeToPeerId(code);
    const p = new Peer(id);
    peer = p;
    hostConnections = new Map();

    await new Promise<void>((resolve, reject) => {
      p.on("open", () => resolve());
      p.on("error", (err) => reject(err));
    });

    const { identity } = get();
    hostAuthoritativeState = createInitialState();
    hostAuthoritativeState.players = [createPlayer(p.id, identity.name, identity.color, true)];

    set({ role: "host", myId: p.id, roomCode: code, connectError: null });
    broadcastHostState();

    p.on("connection", (conn) => {
      hostConnections.set(conn.peer, conn);
      conn.on("data", (raw) => handleClientMessage(conn, raw as ClientToHost));
      conn.on("close", () => {
        if (!hostAuthoritativeState) return;
        hostAuthoritativeState = {
          ...hostAuthoritativeState,
          players: hostAuthoritativeState.players.map((pl) => (pl.id === conn.peer ? { ...pl, connected: false } : pl)),
        };
        broadcastHostState();
      });
    });
  },

  joinGame: async (codeRaw) => {
    const p = new Peer();
    peer = p;
    const { identity } = get();

    await new Promise<void>((resolve, reject) => {
      p.on("open", () => resolve());
      p.on("error", (err) => reject(err));
    });

    const hostId = roomCodeToPeerId(codeRaw);
    const conn = p.connect(hostId);
    guestConnection = conn;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Couldn't reach that room. Check the code and try again.")), 10000);
      conn.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      conn.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    conn.send({ t: "join", name: identity.name, color: identity.color } satisfies ClientToHost);
    conn.on("data", (raw) => {
      const msg = raw as HostToClient;
      if (msg.t === "state") applyIncomingState(msg.state);
      if (msg.t === "error") set({ connectError: msg.message });
    });
    conn.on("close", () => set({ connectError: "Lost connection to the host." }));

    set({ role: "guest", myId: p.id, roomCode: codeRaw, connectError: null });
  },

  leaveGame: () => {
    hostConnections.forEach((c) => c.close());
    guestConnection?.close();
    peer?.destroy();
    peer = null;
    hostConnections = new Map();
    guestConnection = null;
    hostAuthoritativeState = null;
    set({ role: "offline", myId: null, roomCode: null, gameState: null, connectError: null, screen: "lobby" });
  },

  setStartingLife: (n) => {
    if (get().role !== "host" || !hostAuthoritativeState) return;
    hostAuthoritativeState = { ...hostAuthoritativeState, startingLife: n };
    broadcastHostState();
  },

  selectDeckForGame: async (deckId) => {
    const deck = get().decks.find((d) => d.id === deckId);
    if (!deck) return;
    set({ selectedDeckId: deckId, deckLoading: true });

    try {
      let catalog = get().catalog;
      if (!catalog.length) await get().loadCatalogFromCache();
      catalog = get().catalog;

      let cards = scryfall.resolveDeckToCards(deck.cards, catalog);
      const resolvedNames = new Set(cards.map((c) => c.name));
      const missing = deck.cards.filter((dc) => !resolvedNames.has(dc.name));
      if (missing.length && !catalog.length) {
        // Catalog never downloaded yet — resolve this deck's cards live instead of blocking on the full bulk import.
        for (const m of missing) {
          const found = await scryfall.fetchCardByName(m.name);
          if (found) for (let i = 0; i < m.qty; i++) cards.push(found);
        }
      }

      // Commander(s) are pulled out of the resolved pool and routed to the command
      // zone separately, instead of being shuffled into the library like the rest.
      const commanderCards: CardData[] = [];
      const libraryCards = [...cards];
      for (const name of deck.commanders ?? []) {
        const idx = libraryCards.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
        if (idx !== -1) commanderCards.push(...libraryCards.splice(idx, 1));
      }

      const { role, myId } = get();
      if (role === "host" && hostAuthoritativeState && myId) {
        hostAuthoritativeState = setPlayerDeck(hostAuthoritativeState, myId, libraryCards, commanderCards);
        broadcastHostState();
      } else if (role === "guest" && guestConnection) {
        guestConnection.send({ t: "setDeck", library: libraryCards, commanders: commanderCards } satisfies ClientToHost);
      }
    } finally {
      set({ deckLoading: false });
    }
  },

  setReady: (ready) => {
    const { role, myId } = get();
    if (role === "host" && hostAuthoritativeState && myId) {
      hostAuthoritativeState = setPlayerReady(hostAuthoritativeState, myId, ready);
      broadcastHostState();
    } else if (role === "guest" && guestConnection) {
      guestConnection.send({ t: "ready", ready } satisfies ClientToHost);
    }
  },

  requestStart: () => {
    if (get().role !== "host" || !hostAuthoritativeState) return;
    hostAuthoritativeState = startGameReducer(hostAuthoritativeState);
    broadcastHostState();
  },

  dispatch: (action) => {
    const { role } = get();
    if (role === "host" && hostAuthoritativeState) {
      hostAuthoritativeState = applyAction(hostAuthoritativeState, action);
      broadcastHostState();
    } else if (role === "guest" && guestConnection) {
      guestConnection.send({ t: "action", action } satisfies ClientToHost);
    }
  },

  sendChat: (text) => {
    const { role, identity } = get();
    if (role === "host" && hostAuthoritativeState) {
      hostAuthoritativeState = chatLog(hostAuthoritativeState, identity.name, text);
      broadcastHostState();
    } else if (role === "guest" && guestConnection) {
      guestConnection.send({ t: "chat", text } satisfies ClientToHost);
    }
  },
}));

/**
 * Applies a freshly-received (already redacted) game state snapshot and,
 * the moment the match transitions from not-yet-started to started, jumps
 * the viewer to the Game Table — the one time that navigation should happen
 * automatically, since after that a player may deliberately browse away to
 * the deck builder or settings mid-game without being yanked back.
 */
function applyIncomingState(state: GameState) {
  const wasStarted = useGame.getState().gameState?.started ?? false;
  useGame.setState({ gameState: state, screen: !wasStarted && state.started ? "table" : useGame.getState().screen });
}

function broadcastHostState() {
  if (!hostAuthoritativeState) return;
  const myId = useGame.getState().myId;
  hostConnections.forEach((conn, peerId) => {
    conn.send({ t: "state", state: redactStateFor(hostAuthoritativeState!, peerId) } satisfies HostToClient);
  });
  if (myId) applyIncomingState(redactStateFor(hostAuthoritativeState, myId));
}

function handleClientMessage(conn: DataConnection, msg: ClientToHost) {
  if (!hostAuthoritativeState) return;
  const exists = hostAuthoritativeState.players.some((p) => p.id === conn.peer);

  switch (msg.t) {
    case "join": {
      if (!exists) {
        hostAuthoritativeState = {
          ...hostAuthoritativeState,
          players: [...hostAuthoritativeState.players, createPlayer(conn.peer, msg.name, msg.color, false)],
        };
      }
      break;
    }
    case "setDeck":
      hostAuthoritativeState = setPlayerDeck(hostAuthoritativeState, conn.peer, msg.library, msg.commanders);
      break;
    case "ready":
      hostAuthoritativeState = setPlayerReady(hostAuthoritativeState, conn.peer, msg.ready);
      break;
    case "action":
      hostAuthoritativeState = applyAction(hostAuthoritativeState, msg.action);
      break;
    case "chat": {
      const p = hostAuthoritativeState.players.find((pl) => pl.id === conn.peer);
      hostAuthoritativeState = chatLog(hostAuthoritativeState, p?.name ?? "Player", msg.text);
      break;
    }
  }
  broadcastHostState();
}
