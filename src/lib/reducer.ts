import type { CardData, CardInstance, GameAction, GameState, LogEntry, Permanent, PlayerState, ZoneName } from "./types";
import { PHASES } from "./types";

export function newId(): string {
  return crypto.randomUUID();
}

export function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function toInstance(card: CardData): CardInstance {
  return { ...card, iid: newId() };
}

function log(state: GameState, who: string, text: string, card?: LogEntry["card"]): GameState {
  const entry: LogEntry = { id: newId(), ts: Date.now(), who, text, card };
  return { ...state, log: [...state.log.slice(-199), entry] };
}

export function createPlayer(id: string, name: string, color: string, isHost: boolean): PlayerState {
  return {
    id,
    name,
    color,
    life: 20,
    isHost,
    connected: true,
    ready: false,
    zones: { library: [], hand: [], battlefield: [], graveyard: [], exile: [], command: [] },
  };
}

export function createInitialState(): GameState {
  return { startingLife: 20, started: false, players: [], log: [], turn: { activePlayerId: null, phase: PHASES[0] } };
}

function updatePlayer(state: GameState, playerId: string, fn: (p: PlayerState) => PlayerState): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? fn(p) : p)) };
}

function nextPlayerId(state: GameState, currentId: string | null): string | null {
  if (state.players.length === 0) return null;
  const idx = state.players.findIndex((p) => p.id === currentId);
  if (idx === -1) return state.players[0].id;
  return state.players[(idx + 1) % state.players.length].id;
}

function playerName(state: GameState, id: string | null): string {
  return state.players.find((p) => p.id === id)?.name ?? "Someone";
}

export function setPlayerDeck(state: GameState, playerId: string, library: CardData[], commanders: CardData[]): GameState {
  return updatePlayer(state, playerId, (p) => ({
    ...p,
    zones: { ...p.zones, library: shuffle(library.map(toInstance)), command: commanders.map(toInstance) },
  }));
}

export function setPlayerReady(state: GameState, playerId: string, ready: boolean): GameState {
  return updatePlayer(state, playerId, (p) => ({ ...p, ready }));
}

export function startGame(state: GameState): GameState {
  const next: GameState = { ...state, started: true, players: [], turn: { activePlayerId: state.players[0]?.id ?? null, phase: PHASES[0] } };
  next.players = state.players.map((p) => {
    const drawCount = Math.min(7, p.zones.library.length);
    const hand = p.zones.library.slice(0, drawCount);
    const library = p.zones.library.slice(drawCount);
    return { ...p, life: state.startingLife, zones: { ...p.zones, hand, library } };
  });
  return log(next, "Table", "The game begins. Opening hands drawn.");
}

function findZoneArray(p: PlayerState, zone: ZoneName): CardInstance[] {
  return p.zones[zone] as CardInstance[];
}

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.k) {
    case "nextPhase": {
      const idx = PHASES.indexOf(state.turn.phase);
      if (idx === PHASES.length - 1) {
        const nextId = nextPlayerId(state, state.turn.activePlayerId);
        return log({ ...state, turn: { activePlayerId: nextId, phase: PHASES[0] } }, "Table", `${playerName(state, nextId)}'s turn begins.`);
      }
      return { ...state, turn: { ...state.turn, phase: PHASES[idx + 1] } };
    }
    case "passTurn": {
      const nextId = nextPlayerId(state, state.turn.activePlayerId);
      return log({ ...state, turn: { activePlayerId: nextId, phase: PHASES[0] } }, "Table", `${playerName(state, nextId)}'s turn begins.`);
    }
    case "setActivePlayer": {
      if (!state.players.some((p) => p.id === action.playerId)) return state;
      return { ...state, turn: { activePlayerId: action.playerId, phase: PHASES[0] } };
    }
  }

  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return state;

  switch (action.k) {
    case "draw": {
      return updatePlayer(state, action.playerId, (p) => {
        const count = Math.min(action.count, p.zones.library.length);
        const drawn = p.zones.library.slice(0, count);
        return { ...p, zones: { ...p.zones, hand: [...p.zones.hand, ...drawn], library: p.zones.library.slice(count) } };
      });
    }
    case "shuffleLibrary": {
      const next = updatePlayer(state, action.playerId, (p) => ({ ...p, zones: { ...p.zones, library: shuffle(p.zones.library) } }));
      return log(next, player.name, "shuffles their library.");
    }
    case "mill": {
      return updatePlayer(state, action.playerId, (p) => {
        const count = Math.min(action.count, p.zones.library.length);
        const milled = p.zones.library.slice(0, count);
        return { ...p, zones: { ...p.zones, graveyard: [...p.zones.graveyard, ...milled], library: p.zones.library.slice(count) } };
      });
    }
    case "moveCard": {
      return updatePlayer(state, action.playerId, (p) => {
        const src = findZoneArray(p, action.from);
        const idx = src.findIndex((c) => c.iid === action.iid);
        if (idx === -1) return p;
        const card = src[idx];
        const nextSrc = [...src.slice(0, idx), ...src.slice(idx + 1)];
        const destArr = findZoneArray(p, action.to);
        let movedCard: CardInstance | Permanent;
        if (action.to === "battlefield") {
          const startingLoyalty = "loyalty" in card && card.loyalty ? parseInt(card.loyalty, 10) : undefined;
          movedCard = { ...card, tapped: false, counters: startingLoyalty ? { loyalty: startingLoyalty } : {} } as Permanent;
        } else {
          const { tapped, counters, ...rest } = card as Permanent;
          movedCard = rest as CardInstance;
        }
        const nextDest = [...destArr, movedCard];
        return { ...p, zones: { ...p.zones, [action.from]: nextSrc, [action.to]: nextDest } };
      });
    }
    case "tap": {
      const next = updatePlayer(state, action.playerId, (p) => ({
        ...p,
        zones: {
          ...p.zones,
          battlefield: p.zones.battlefield.map((perm) => (perm.iid === action.iid ? { ...perm, tapped: !perm.tapped } : perm)),
        },
      }));
      return next;
    }
    case "addCounter": {
      return updatePlayer(state, action.playerId, (p) => ({
        ...p,
        zones: {
          ...p.zones,
          battlefield: p.zones.battlefield.map((perm) => {
            if (perm.iid !== action.iid) return perm;
            const nextVal = (perm.counters[action.label] ?? 0) + action.delta;
            const counters = { ...perm.counters };
            if (nextVal === 0) delete counters[action.label];
            else counters[action.label] = nextVal;
            return { ...perm, counters };
          }),
        },
      }));
    }
    case "setLife": {
      return updatePlayer(state, action.playerId, (p) => ({ ...p, life: action.life }));
    }
    case "createToken": {
      const startingLoyalty = action.card.loyalty ? parseInt(action.card.loyalty, 10) : undefined;
      const perm: Permanent = { ...action.card, iid: newId(), tapped: false, counters: startingLoyalty ? { loyalty: startingLoyalty } : {} };
      const next = updatePlayer(state, action.playerId, (p) => ({ ...p, zones: { ...p.zones, battlefield: [...p.zones.battlefield, perm] } }));
      return log(next, player.name, `creates a token: ${action.card.name}.`, { name: action.card.name, image_small: action.card.image_small });
    }
    case "reveal": {
      const arr = findZoneArray(player, action.from);
      const card = arr.find((c) => c.iid === action.iid);
      if (!card) return state;
      return log(state, player.name, `reveals ${card.name} to the table.`, { name: card.name, image_small: card.image_small });
    }
    case "coinFlip": {
      const result = Math.random() < 0.5 ? "heads" : "tails";
      return log(state, player.name, `flips a coin: ${result}.`);
    }
    case "diceRoll": {
      const result = 1 + Math.floor(Math.random() * action.sides);
      return log(state, player.name, `rolls a d${action.sides}: ${result}.`);
    }
    default:
      return state;
  }
}

export function chatLog(state: GameState, who: string, text: string): GameState {
  return log(state, who, text);
}

function blankCard(c: CardInstance): CardInstance {
  return { id: c.iid, iid: c.iid, name: "", mana_cost: "", cmc: 0, type_line: "", oracle_text: "", keywords: [], colors: [], price_usd: null };
}

/**
 * Battlefield, graveyard, exile and the command zone are public in Magic, so
 * they're sent to every viewer untouched. Only hand and library are hidden —
 * this replaces their contents with blanks (preserving array length, so
 * counts still render) for every player who isn't the viewer themselves.
 */
export function redactStateFor(state: GameState, viewerId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id === viewerId) return p;
      return {
        ...p,
        zones: {
          ...p.zones,
          hand: p.zones.hand.map(blankCard),
          library: p.zones.library.map(blankCard),
        },
      };
    }),
  };
}
