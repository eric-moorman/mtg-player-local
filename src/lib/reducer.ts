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
    handRevealed: false,
    zones: { library: [], hand: [], battlefield: [], graveyard: [], exile: [], command: [] },
    counters: {},
    commanderDamage: {},
    commanderCasts: {},
    commanders: [],
    mulligans: 0,
    cityBlessing: false,
  };
}

export function createInitialState(): GameState {
  return {
    startingLife: 20,
    started: false,
    players: [],
    log: [],
    turn: { activePlayerId: null, phase: PHASES[0] },
    monarch: null,
    initiative: null,
    dayNight: null,
  };
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
    commanders: commanders.map((c) => c.name),
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

/** Strips attacking/blocking/blockOrder from every permanent, for everyone — combat is over. */
function clearCombatState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      zones: {
        ...p.zones,
        battlefield: p.zones.battlefield.map((perm) => {
          if (!perm.attacking && !perm.blocking && !perm.blockOrder) return perm;
          const { attacking, blocking, blockOrder, ...rest } = perm;
          return rest as Permanent;
        }),
      },
    })),
  };
}

export function applyAction(state: GameState, action: GameAction): GameState {
  switch (action.k) {
    case "nextPhase": {
      const idx = PHASES.indexOf(state.turn.phase);
      const leavingCombat = state.turn.phase === "Combat";
      const base = leavingCombat ? clearCombatState(state) : state;
      if (idx === PHASES.length - 1) {
        const nextId = nextPlayerId(base, base.turn.activePlayerId);
        return log({ ...base, turn: { activePlayerId: nextId, phase: PHASES[0] } }, "Table", `${playerName(base, nextId)}'s turn begins.`);
      }
      return { ...base, turn: { ...base.turn, phase: PHASES[idx + 1] } };
    }
    case "passTurn": {
      const base = clearCombatState(state);
      const nextId = nextPlayerId(base, base.turn.activePlayerId);
      return log({ ...base, turn: { activePlayerId: nextId, phase: PHASES[0] } }, "Table", `${playerName(base, nextId)}'s turn begins.`);
    }
    case "setActivePlayer": {
      if (!state.players.some((p) => p.id === action.playerId)) return state;
      return { ...clearCombatState(state), turn: { activePlayerId: action.playerId, phase: PHASES[0] } };
    }
    case "clearCombat": {
      return clearCombatState(state);
    }
    case "setMonarch": {
      return log(
        { ...state, monarch: action.playerId },
        "Table",
        action.playerId ? `${playerName(state, action.playerId)} becomes the monarch.` : "The monarchy is vacant."
      );
    }
    case "setInitiative": {
      return log(
        { ...state, initiative: action.playerId },
        "Table",
        action.playerId ? `${playerName(state, action.playerId)} takes the initiative.` : "No one has the initiative."
      );
    }
    case "setDayNight": {
      return log({ ...state, dayNight: action.value }, "Table", action.value ? `It becomes ${action.value}.` : "Day/Night is cleared.");
    }
    case "setCommanderDamage": {
      const key = `${action.fromPlayerId}:${action.commanderName}`;
      return updatePlayer(state, action.toPlayerId, (p) => {
        const nextVal = Math.max(0, (p.commanderDamage[key] ?? 0) + action.delta);
        const commanderDamage = { ...p.commanderDamage };
        if (nextVal === 0) delete commanderDamage[key];
        else commanderDamage[key] = nextVal;
        return { ...p, commanderDamage };
      });
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
          const { tapped, counters, attacking, blocking, blockOrder, ...rest } = card as Permanent;
          movedCard = rest as CardInstance;
        }
        const nextDest = [...destArr, movedCard];
        // Commander tax: cast from the command zone straight onto the battlefield.
        const commanderCasts =
          action.from === "command" && action.to === "battlefield" && p.commanders.includes(card.name)
            ? { ...p.commanderCasts, [card.name]: (p.commanderCasts[card.name] ?? 0) + 1 }
            : p.commanderCasts;
        return { ...p, commanderCasts, zones: { ...p.zones, [action.from]: nextSrc, [action.to]: nextDest } };
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
    case "setHandRevealed": {
      const next = updatePlayer(state, action.playerId, (p) => ({ ...p, handRevealed: action.revealed }));
      return log(next, player.name, action.revealed ? "reveals their hand to the table." : "hides their hand again.");
    }
    case "coinFlip": {
      const result = Math.random() < 0.5 ? "heads" : "tails";
      return log(state, player.name, `flips a coin: ${result}.`);
    }
    case "diceRoll": {
      const result = 1 + Math.floor(Math.random() * action.sides);
      return log(state, player.name, `rolls a d${action.sides}: ${result}.`);
    }
    case "untapAll": {
      const next = updatePlayer(state, action.playerId, (p) => ({
        ...p,
        zones: { ...p.zones, battlefield: p.zones.battlefield.map((perm) => ({ ...perm, tapped: false })) },
      }));
      return log(next, player.name, "untaps everything.");
    }
    case "mulligan": {
      const next = updatePlayer(state, action.playerId, (p) => {
        const library = shuffle([...p.zones.library, ...p.zones.hand]);
        const drawCount = Math.min(7, library.length);
        return {
          ...p,
          mulligans: p.mulligans + 1,
          zones: { ...p.zones, hand: library.slice(0, drawCount), library: library.slice(drawCount) },
        };
      });
      return log(next, player.name, `mulligans (${player.mulligans + 1}).`);
    }
    case "setPlayerCounter": {
      return updatePlayer(state, action.playerId, (p) => {
        const nextVal = Math.max(0, (p.counters[action.label] ?? 0) + action.delta);
        const counters = { ...p.counters };
        if (nextVal === 0) delete counters[action.label];
        else counters[action.label] = nextVal;
        return { ...p, counters };
      });
    }
    case "declareAttacker": {
      return updatePlayer(state, action.playerId, (p) => ({
        ...p,
        zones: {
          ...p.zones,
          battlefield: p.zones.battlefield.map((perm) =>
            perm.iid !== action.iid
              ? perm
              : action.target
              ? { ...perm, attacking: action.target, tapped: true }
              : (() => {
                  const { attacking, blockOrder, ...rest } = perm;
                  return rest as Permanent;
                })()
          ),
        },
      }));
    }
    case "declareBlocker": {
      return updatePlayer(state, action.playerId, (p) => ({
        ...p,
        zones: {
          ...p.zones,
          battlefield: p.zones.battlefield.map((perm) =>
            perm.iid !== action.iid
              ? perm
              : action.attackerIid
              ? { ...perm, blocking: action.attackerIid }
              : (() => {
                  const { blocking, ...rest } = perm;
                  return rest as Permanent;
                })()
          ),
        },
      }));
    }
    case "setBlockOrder": {
      return updatePlayer(state, action.playerId, (p) => ({
        ...p,
        zones: {
          ...p.zones,
          battlefield: p.zones.battlefield.map((perm) => (perm.iid === action.attackerIid ? { ...perm, blockOrder: action.order } : perm)),
        },
      }));
    }
    case "setCityBlessing": {
      return updatePlayer(state, action.playerId, (p) => ({ ...p, cityBlessing: action.achieved }));
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
 * they're sent to every viewer untouched. Hand and library are hidden by
 * default — this replaces their contents with blanks (preserving array
 * length, so counts still render) for every player who isn't the viewer
 * themselves, unless that player has explicitly revealed their hand.
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
          hand: p.handRevealed ? p.zones.hand : p.zones.hand.map(blankCard),
          library: p.zones.library.map(blankCard),
        },
      };
    }),
  };
}
