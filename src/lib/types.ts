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
  | { k: "setActivePlayer"; playerId: string };

export type ClientToHost =
  | { t: "join"; name: string; color: string }
  | { t: "setDeck"; library: CardData[]; commanders: CardData[] }
  | { t: "ready"; ready: boolean }
  | { t: "action"; action: GameAction }
  | { t: "chat"; text: string };

export type HostToClient = { t: "state"; state: GameState } | { t: "error"; message: string };
