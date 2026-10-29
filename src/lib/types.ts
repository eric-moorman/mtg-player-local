export interface CardData {
  id: string;
  name: string;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  keywords: string[];
  colors: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  rarity?: string;
  /** Set code of this particular printing. Absent on older cached records, so always treat it as optional. */
  set?: string;
  price_usd: number | null;
  image_small?: string;
  image_large?: string;
}

export interface CardInstance extends CardData {
  iid: string;
}

export interface Permanent extends CardInstance {
  tapped: boolean;
  counters: Record<string, number>;
  /** Present only while attacking: either an opponent's playerId, or `pw:<iid>` for an enemy planeswalker. */
  attacking?: string;
  /** Present only while blocking: the iid of the attacking permanent this one is blocking. */
  blocking?: string;
  /** Chosen damage-assignment order (blocker iids) when this attacker has more than one blocker — set by the attacking player. */
  blockOrder?: string[];
}

export interface Zones {
  library: CardInstance[];
  hand: CardInstance[];
  battlefield: Permanent[];
  graveyard: CardInstance[];
  exile: CardInstance[];
  command: CardInstance[];
}

export type ZoneName = keyof Zones;

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  life: number;
  isHost: boolean;
  connected: boolean;
  ready: boolean;
  /** When true, this player's hand is shown to every viewer instead of being redacted. */
  handRevealed: boolean;
  zones: Zones;
  /** Player-level counters (poison, energy, experience, rad, etc.) — distinct from counters on individual permanents. */
  counters: Record<string, number>;
  /** Commander damage taken, keyed `${fromPlayerId}:${commanderName}`. */
  commanderDamage: Record<string, number>;
  /** How many times each of this player's commanders has been cast from the command zone, for commander tax. Keyed by commander name. */
  commanderCasts: Record<string, number>;
  /** This player's designated commander names — tracked independently of the command zone's current contents, since a commander can move through other zones during a game. */
  commanders: string[];
  /** Mulligans taken this game, for display only (doesn't restrict anything). */
  mulligans: number;
  /** Achieved City's Blessing (Ascend) — once true, stays true for the rest of the game. */
  cityBlessing: boolean;
}

export interface LogEntry {
  id: string;
  ts: number;
  who: string;
  text: string;
  card?: { name: string; image_small?: string };
}

export const PHASES = ["Untap", "Upkeep", "Draw", "Main Phase", "Combat", "Second Main", "End Step"] as const;
export type Phase = (typeof PHASES)[number];

export interface TurnState {
  activePlayerId: string | null;
  phase: Phase;
}

export interface GameState {
  startingLife: number;
  started: boolean;
  players: PlayerState[];
  log: LogEntry[];
  turn: TurnState;
  /** Monarch and the Initiative are each held by exactly one player (or no one) at a time, table-wide. */
  monarch: string | null;
  initiative: string | null;
  /** Day/Night is a single shared state for the whole game, not per-player. */
  dayNight: "day" | "night" | null;
}

export interface DeckCard {
  name: string;
  qty: number;
}

export interface Deck {
  id: string;
  name: string;
  cards: DeckCard[];
  /** Up to two card names designated as commanders (covers Partner pairs and companion-style extra cards). */
  commanders?: string[];
  updatedAt: number;
}

export interface Identity {
  name: string;
  color: string;
}

export type PlayMat = { id: string; name: string; kind: "builtin" | "custom"; css?: string; image?: string };

// ---- Sealed Pool minigame ----

export interface SetInfo {
  code: string;
  name: string;
  set_type: string;
  released_at: string;
  card_count: number;
}

export type Rarity = "common" | "uncommon" | "rare" | "mythic";

export interface RarityWeights {
  common: number;
  uncommon: number;
  rare: number;
  mythic: number;
}

export interface SealedConfig {
  cardsPerPack: number;
  packPrice: number;
  rarityWeights: RarityWeights;
  /** Fraction of market price refunded when selling a card back, 0-1. See DEFAULT_SELL_BACK_RATE. */
  sellBackRate: number;
}

// ---- Network protocol ----

export type GameAction =
  | { k: "draw"; playerId: string; count: number }
  | { k: "shuffleLibrary"; playerId: string }
  | { k: "mill"; playerId: string; count: number }
  | { k: "moveCard"; playerId: string; iid: string; from: ZoneName; to: ZoneName }
  | { k: "tap"; playerId: string; iid: string }
  | { k: "addCounter"; playerId: string; iid: string; label: string; delta: number }
  | { k: "setLife"; playerId: string; life: number }
  | { k: "createToken"; playerId: string; card: CardData }
  | { k: "reveal"; playerId: string; iid: string; from: ZoneName }
  | { k: "setHandRevealed"; playerId: string; revealed: boolean }
  | { k: "coinFlip"; playerId: string }
  | { k: "diceRoll"; playerId: string; sides: number }
  | { k: "nextPhase" }
  | { k: "passTurn" }
  | { k: "setActivePlayer"; playerId: string }
  | { k: "untapAll"; playerId: string }
  | { k: "mulligan"; playerId: string }
  | { k: "setPlayerCounter"; playerId: string; label: string; delta: number }
  | { k: "setCommanderDamage"; toPlayerId: string; fromPlayerId: string; commanderName: string; delta: number }
  | { k: "declareAttacker"; playerId: string; iid: string; target: string | null }
  | { k: "declareBlocker"; playerId: string; iid: string; attackerIid: string | null }
  | { k: "setBlockOrder"; playerId: string; attackerIid: string; order: string[] }
  | { k: "clearCombat" }
  | { k: "setMonarch"; playerId: string | null }
  | { k: "setInitiative"; playerId: string | null }
  | { k: "setCityBlessing"; playerId: string; achieved: boolean }
  | { k: "setDayNight"; value: "day" | "night" | null };

export type ClientToHost =
  | { t: "join"; name: string; color: string }
  | { t: "setDeck"; library: CardData[]; commanders: CardData[] }
  | { t: "ready"; ready: boolean }
  | { t: "action"; action: GameAction }
  | { t: "chat"; text: string };

export type HostToClient = { t: "state"; state: GameState } | { t: "error"; message: string };

// ---- Pool Games (persistent, multi-player Sealed Pool sessions) ----

/**
 * The rules of a pool game, chosen by the host at creation and frozen from then on —
 * every member plays by the identical numbers, which is the whole point of inviting
 * people. Deliberately a copy of the host's settings rather than a reference to their
 * account config, so later tweaking of personal defaults can't retroactively change
 * a game in progress.
 */
export interface PoolGameSettings {
  budget: number;
  cardsPerPack: number;
  packPrice: number;
  rarityWeights: RarityWeights;
  allowedSets: string[];
  /**
   * Fraction of market price refunded when selling a card back, 0-1. Optional because
   * games created before sell-back existed have no value stored — read it through
   * sellBackRate() in scryfall.ts rather than directly, so those games get the default.
   */
  sellBackRate?: number;
}

export interface PoolGameMember {
  userId: string;
  username: string;
}

/** Shared, host-owned half of a pool game. Written once at creation (plus on invite). */
export interface PoolGameMeta {
  id: string;
  name: string;
  createdAt: number;
  hostUserId: string;
  hostUsername: string;
  settings: PoolGameSettings;
  members: PoolGameMember[];
}

export interface PoolCardRecord {
  uid: string;
  card: CardData;
  via: "pack" | "buy" | "basic";
  fromSet?: string;
}

/**
 * One member's private half of a pool game — their money, their cards, their deck.
 * Stored under its own key so each player is the only writer of their own record,
 * which is what keeps concurrent play safe on a store with no transactions.
 */
export interface PoolGameProgress {
  gameId: string;
  userId: string;
  username: string;
  spent: number;
  pool: PoolCardRecord[];
  deckSelections: Record<string, number>;
  commanders: string[];
  finished: boolean;
  /** Name the finished deck was saved under, for the "completed" card in the game list. */
  finishedDeckName?: string;
  updatedAt: number;
}

/** What other members are allowed to see of each other: money and counts, never card names. */
export interface PoolGamePlayerSummary {
  userId: string;
  username: string;
  spent: number;
  poolCount: number;
  deckCount: number;
  finished: boolean;
  updatedAt: number;
}

export interface PoolGameListEntry {
  meta: PoolGameMeta;
  players: PoolGamePlayerSummary[];
  /** The signed-in user's own summary, pulled out for convenience. */
  me: PoolGamePlayerSummary | null;
}

export interface PoolGameDetail {
  meta: PoolGameMeta;
  players: PoolGamePlayerSummary[];
  progress: PoolGameProgress;
}

// ---- Commander Draft (pack-passing ban draft) ----

/**
 * The rules of a commander draft, chosen by the host at creation. Deliberately
 * tiny: the whole mode is one pack per player, so the only dial that changes
 * play is how many commanders are in it.
 */
export interface BanDraftSettings {
  /**
   * Commanders dealt into each player's pack. Must be larger than the number of
   * players, since every other player bans one and the owner still needs
   * something left to choose from.
   */
  cardsPerPack: number;
}

export interface BanDraftMember {
  userId: string;
  username: string;
}

/**
 * Shared, host-owned half of a commander draft. Written only by the host (at
 * creation, on invite, and once at start) — see worker/banDraft.ts for why that
 * single-writer rule is what keeps the whole mode safe on KV.
 */
export interface BanDraftMeta {
  id: string;
  name: string;
  createdAt: number;
  hostUserId: string;
  hostUsername: string;
  settings: BanDraftSettings;
  /** Seat order. The pack passes down this list and wraps around to the front. */
  members: BanDraftMember[];
  started: boolean;
  startedAt?: number;
}

export interface BanDraftBan {
  cardId: string;
  cardName: string;
  byUserId: string;
  byUsername: string;
  at: number;
}

/** One player's pack, plus where around the table it currently sits. */
export interface BanDraftPack {
  gameId: string;
  /** The seat that opened this pack — and the only seat that picks from it. */
  ownerUserId: string;
  ownerUsername: string;
  cards: CardData[];
  bans: BanDraftBan[];
  /**
   * Seats travelled from the owner. 0 = still with the owner for their first
   * look, 1..N-1 = with the player that many seats along, who owes it a ban,
   * and N = back home for the owner's final pick.
   */
  position: number;
  /** Card id the owner settled on. Null until they pick; set once and never changed. */
  pickedCardId: string | null;
  pickedAt?: number;
  updatedAt: number;
}

/** What a player at a given moment is being asked to do with a pack in front of them. */
export type BanDraftAction = "look" | "ban" | "pick" | "done";

export interface BanDraftDetail {
  meta: BanDraftMeta;
  packs: BanDraftPack[];
  /**
   * The signed-in caller's own user id, echoed back by the Worker. Accounts are
   * identified by username everywhere in the UI, but turn order is keyed by id,
   * so the client would otherwise have to guess which member row is itself.
   */
  viewerUserId: string;
}

/**
 * The list view's per-game summary. Deliberately omits pack contents — a list of
 * games would otherwise ship every card of every pack of every draft.
 */
export interface BanDraftListEntry {
  meta: BanDraftMeta;
  /** True when at least one pack is sitting with this player awaiting a ban or a pick. */
  yourTurn: boolean;
  /** How many of the table's packs have had their commander chosen. */
  picked: number;
  total: number;
  complete: boolean;
  /** This player's own commander, once they've chosen it. */
  myCommander: string | null;
}
