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
