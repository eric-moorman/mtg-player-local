import { useRef, useState } from "react";
import { useGame } from "../../store/useGame";
import { useDrag } from "../../store/useDrag";
import { useCloseOnOutside } from "../../lib/useCloseOnOutside";
import { getQuadrant } from "../../lib/cardRules";
import Quadrants from "./Quadrants";
import type { CombatContext } from "./PermanentTile";
import ZoneCardTile from "./ZoneCardTile";
import CommandZone from "./CommandZone";
import ZoneStacks from "./ZoneStacks";
import TurnTracker from "./TurnTracker";
import LogPanel from "./LogPanel";
import TokenModal from "./TokenModal";
import type { GameAction, PlayerState } from "../../lib/types";
import "./GameTable.css";

const POISON_ENERGY_EXP = [
  { key: "poison", icon: "☠", label: "Poison", danger: 10 },
  { key: "energy", icon: "⚡", label: "Energy", danger: null as number | null },
  { key: "experience", icon: "🎓", label: "Experience", danger: null as number | null },
];

function HolderPill({
  label, icon, holderId, players, onSet,
}: { label: string; icon: string; holderId: string | null; players: PlayerState[]; onSet: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useCloseOnOutside(open, ref, () => setOpen(false));
  const holder = players.find((p) => p.id === holderId);
  return (
    <div className="status-pill" ref={ref}>
      <button className="status-pill-btn" onClick={() => setOpen((v) => !v)}>
        {icon} {label}{holder ? `: ${holder.name}` : ""}
      </button>
      {open && (
        <div className="status-pill-menu">
          {players.map((p) => (
            <button
              key={p.id}
              className={p.id === holderId ? "active" : ""}
              onClick={() => { onSet(p.id); setOpen(false); }}
            >
              {p.name}
            </button>
          ))}
          {holderId && <button onClick={() => { onSet(null); setOpen(false); }}>Clear</button>}
        </div>
      )}
    </div>
  );
}

function DayNightPill({ value, onSet }: { value: "day" | "night" | null; onSet: (v: "day" | "night" | null) => void }) {
  const next = value === null ? "day" : value === "day" ? "night" : null;
  const label = value === "day" ? "Day" : value === "night" ? "Night" : "Day/Night";
  const icon = value === "day" ? "☀️" : value === "night" ? "🌙" : "☀️/🌙";
  return (
    <button className="status-pill-btn" onClick={() => onSet(next)} title="Click to cycle Day → Night → clear">
      {icon} {label}
    </button>
  );
}

function PlayerCounters({ counters, editable, playerId, dispatch }: { counters: Record<string, number>; editable: boolean; playerId: string; dispatch: (a: GameAction) => void }) {
  const [addingLabel, setAddingLabel] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const extraEntries = Object.entries(counters).filter(([k]) => !POISON_ENERGY_EXP.some((c) => c.key === k));

  function submitCustom() {
    const label = addingLabel.trim();
    if (!label) return;
    dispatch({ k: "setPlayerCounter", playerId, label, delta: 1 });
    setAddingLabel("");
    setShowAdd(false);
  }

  return (
    <div className="player-counters">
      {POISON_ENERGY_EXP.map(({ key, icon, label, danger }) => {
        const val = counters[key] ?? 0;
        if (!editable && val === 0) return null;
        const isDanger = danger != null && val >= danger;
        return (
          <div className={"pc-pill" + (isDanger ? " danger" : "")} key={key}>
            <span>{icon} {label}</span>
            {editable ? (
              <>
                <button onClick={() => dispatch({ k: "setPlayerCounter", playerId, label: key, delta: -1 })} disabled={val === 0} aria-label={`Remove ${label}`}>–</button>
                <span className="val">{val}</span>
                <button onClick={() => dispatch({ k: "setPlayerCounter", playerId, label: key, delta: 1 })} aria-label={`Add ${label}`}>+</button>
              </>
            ) : (
              <span className="val">{val}</span>
            )}
          </div>
        );
      })}
      {extraEntries.map(([k, v]) => (
        <div className="pc-pill" key={k}>
          <span>{k}</span>
          {editable ? (
            <>
              <button onClick={() => dispatch({ k: "setPlayerCounter", playerId, label: k, delta: -1 })} aria-label={`Remove ${k}`}>–</button>
              <span className="val">{v}</span>
              <button onClick={() => dispatch({ k: "setPlayerCounter", playerId, label: k, delta: 1 })} aria-label={`Add ${k}`}>+</button>
            </>
          ) : (
            <span className="val">{v}</span>
          )}
        </div>
      ))}
      {editable && (
        showAdd ? (
          <div className="pc-add">
            <input
              type="text" placeholder="Counter name…" value={addingLabel} autoFocus
              onChange={(e) => setAddingLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitCustom(); if (e.key === "Escape") setShowAdd(false); }}
            />
            <button className="btn" onClick={submitCustom}>Add</button>
          </div>
        ) : (
          <button className="btn pc-add-btn" onClick={() => setShowAdd(true)}>+ Other counter</button>
        )
      )}
    </div>
  );
}

function CommanderDamage({ me, opponents, dispatch }: { me: PlayerState; opponents: PlayerState[]; dispatch: (a: GameAction) => void }) {
  const sources = opponents.flatMap((p) => p.commanders.map((name) => ({ ownerId: p.id, ownerName: p.name, name })));
  if (sources.length === 0) return null;
  return (
    <div className="commander-damage">
      <div className="qlabel">Commander damage taken</div>
      {sources.map((s) => {
        const key = `${s.ownerId}:${s.name}`;
        const val = me.commanderDamage[key] ?? 0;
        return (
          <div className={"pc-pill" + (val >= 21 ? " danger" : "")} key={key}>
            <span>{s.name} ({s.ownerName})</span>
            <button onClick={() => dispatch({ k: "setCommanderDamage", toPlayerId: me.id, fromPlayerId: s.ownerId, commanderName: s.name, delta: -1 })} disabled={val === 0} aria-label={`Remove commander damage from ${s.name}`}>–</button>
            <span className="val">{val}</span>
            <button onClick={() => dispatch({ k: "setCommanderDamage", toPlayerId: me.id, fromPlayerId: s.ownerId, commanderName: s.name, delta: 1 })} aria-label={`Add commander damage from ${s.name}`}>+</button>
          </div>
        );
      })}
    </div>
  );
}

const DICE_SIZES = [4, 6, 8, 10, 12, 20, 100];

const HAND_FAN_SPREAD_DEG = 16;
const HAND_FAN_RISE_PX = 12;

/**
 * A smooth fan across the whole hand: leftmost/rightmost cards tilt outward
 * and droop down slightly, the center card stays flat and sits highest —
 * like cards actually held and fanned in a hand, not just rotated in place.
 */
function fanStyle(index: number, total: number): React.CSSProperties {
  const t = total > 1 ? index / (total - 1) - 0.5 : 0; // -0.5 (leftmost) .. 0.5 (rightmost)
  const angle = t * HAND_FAN_SPREAD_DEG;
  const rise = t * t * 4 * HAND_FAN_RISE_PX; // 0 at center, HAND_FAN_RISE_PX at either edge
  return { "--fan-rot": `${angle}deg`, "--fan-y": `${rise}px` } as React.CSSProperties;
}

function OpponentBoard({ player, dispatch }: { player: PlayerState; dispatch: (a: GameAction) => void }) {
  const totalCmdrDmg = Object.values(player.commanderDamage).reduce((s, n) => s + n, 0);
  return (
    <div className="opp">
      <div className="opp-head">
        <span>{player.name}</span>
        {player.cityBlessing && <span className="blessing-badge active" title="Has the City's Blessing">🏙️</span>}
        {totalCmdrDmg > 0 && <span className="zone-chip" title="Total commander damage taken, across all sources">⚔ {totalCmdrDmg}</span>}
        <span className="life-pill">{player.life}</span>
      </div>
      <PlayerCounters counters={player.counters} editable={false} playerId={player.id} dispatch={dispatch} />
      <CommandZone command={player.zones.command} playerId={player.id} interactive={false} mini commanderCasts={player.commanderCasts} />
      <Quadrants battlefield={player.zones.battlefield} playerId={player.id} interactive={false} mini />
      {player.handRevealed && player.zones.hand.length > 0 && (
        <div>
          <div className="qlabel">Hand (revealed)</div>
          <div className="hand-row">
            {player.zones.hand.map((card, i) => (
              <ZoneCardTile
                key={card.iid}
                card={card}
                playerId={player.id}
                from="hand"
                interactive={false}
                mini
                style={fanStyle(i, player.zones.hand.length)}
              />
            ))}
          </div>
        </div>
      )}
      <div className="tray-pills">
        <span className="zone-chip"><b>{player.zones.hand.length}</b> hand{player.handRevealed ? " (revealed)" : ""}</span>
        <span className="zone-chip"><b>{player.zones.library.length}</b> lib</span>
        <span className="zone-chip"><b>{player.zones.graveyard.length}</b> gy</span>
        <span className="zone-chip"><b>{player.zones.exile.length}</b> exile</span>
      </div>
    </div>
  );
}

export default function GameTable() {
  const gameState = useGame((s) => s.gameState);
  const myId = useGame((s) => s.myId);
  const role = useGame((s) => s.role);
  const dispatch = useGame((s) => s.dispatch);
  const sendChat = useGame((s) => s.sendChat);
  const setScreen = useGame((s) => s.setScreen);
  const playmats = useGame((s) => s.playmats);
  const selectedPlaymat = useGame((s) => s.selectedPlaymat);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [hoveringBoard, setHoveringBoard] = useState(false);
  const [diceSides, setDiceSides] = useState(6);
  const dragActive = useDrag((s) => s.active);

  if (role === "offline" || !gameState) {
    return (
      <section>
        <div className="screen-head">
          <h2>Game Table</h2>
          <span className="sub">No active game</span>
        </div>
        <p className="hint">
          Create or join a table from the <button className="linklike" onClick={() => setScreen("lobby")}>Lobby</button> first.
        </p>
      </section>
    );
  }

  if (!gameState.started) {
    return (
      <section>
        <div className="screen-head">
          <h2>Game Table</h2>
          <span className="sub">Waiting for the host to start the game</span>
        </div>
        <p className="hint">
          Head back to the <button className="linklike" onClick={() => setScreen("lobby")}>Lobby</button> to pick a deck and get ready.
        </p>
      </section>
    );
  }

  const me = gameState.players.find((p) => p.id === myId);
  const opponents = gameState.players.filter((p) => p.id !== myId);
  const playmat = playmats.find((p) => p.id === selectedPlaymat);
  const boardStyle = playmat
    ? playmat.kind === "builtin"
      ? { backgroundImage: playmat.css }
      : { backgroundImage: `url(${playmat.image})`, backgroundSize: "cover" as const }
    : undefined;

  if (!me) {
    return (
      <section>
        <div className="screen-head"><h2>Game Table</h2></div>
        <p className="hint">You're not seated at this table.</p>
      </section>
    );
  }

  const combat: CombatContext = {
    attackTargets: [
      ...opponents.map((p) => ({ id: p.id, label: p.name })),
      ...opponents.flatMap((p) =>
        p.zones.battlefield
          .filter((perm) => getQuadrant(perm.type_line) === "planeswalkers")
          .map((pw) => ({ id: `pw:${pw.iid}`, label: `${pw.name} (${p.name})` }))
      ),
    ],
    activeAttackers: gameState.players.flatMap((p) =>
      p.zones.battlefield.filter((perm) => perm.attacking).map((perm) => ({ iid: perm.iid, label: `${perm.name} (${p.name})`, ownerId: p.id }))
    ),
    blockersFor: gameState.players.reduce<Record<string, { iid: string; name: string }[]>>((map, p) => {
      for (const perm of p.zones.battlefield) {
        if (perm.blocking) (map[perm.blocking] ??= []).push({ iid: perm.iid, name: perm.name });
      }
      return map;
    }, {}),
  };

  return (
    <section>
      <div className="screen-head">
        <h2>Game Table</h2>
        <span className="sub">Battlefields are public — everyone's permanents are visible; hands and libraries stay hidden</span>
      </div>

      <TurnTracker turn={gameState.turn} players={gameState.players} dispatch={dispatch} />

      <div className="status-bar">
        <HolderPill label="Monarch" icon="👑" holderId={gameState.monarch} players={gameState.players} onSet={(id) => dispatch({ k: "setMonarch", playerId: id })} />
        <HolderPill label="Initiative" icon="🗝️" holderId={gameState.initiative} players={gameState.players} onSet={(id) => dispatch({ k: "setInitiative", playerId: id })} />
        <DayNightPill value={gameState.dayNight} onSet={(v) => dispatch({ k: "setDayNight", value: v })} />
        <button className="status-pill-btn" onClick={() => dispatch({ k: "clearCombat" })} title="Clear all attacking/blocking marks">Clear combat</button>
      </div>

      {opponents.length > 0 && (
        <div className="opp-strip">
          {opponents.map((p) => <OpponentBoard key={p.id} player={p} dispatch={dispatch} />)}
        </div>
      )}

      <div className="table-main">
        <div className="board">
          <div className="seat-head">
            <span className="name">{me.name} (you)</span>
            <button
              className={"blessing-badge" + (me.cityBlessing ? " active" : "")}
              onClick={() => dispatch({ k: "setCityBlessing", playerId: me.id, achieved: !me.cityBlessing })}
              title={me.cityBlessing ? "You have the City's Blessing — click to unset" : "Click once you control 10+ permanents to gain the City's Blessing"}
            >
              🏙️
            </button>
            <div className="life-tracker">
              <span className="life-label">Life</span>
              <button className="life-btn minus" onClick={() => dispatch({ k: "setLife", playerId: me.id, life: me.life - 1 })} aria-label="Lose 1 life">–</button>
              <span className="val">{me.life}</span>
              <button className="life-btn plus" onClick={() => dispatch({ k: "setLife", playerId: me.id, life: me.life + 1 })} aria-label="Gain 1 life">+</button>
            </div>
            <button className="btn" onClick={() => dispatch({ k: "untapAll", playerId: me.id })}>Untap All</button>
            <button className="btn" onClick={() => setTokenModalOpen(true)}>+ Token</button>
          </div>

          <div className="seat-status">
            <PlayerCounters counters={me.counters} editable playerId={me.id} dispatch={dispatch} />
            <CommanderDamage me={me} opponents={opponents} dispatch={dispatch} />
          </div>

          <div
            className={"board-field" + (dragActive && hoveringBoard ? " drag-over" : "")}
            style={boardStyle}
            data-dropzone="battlefield"
            onMouseEnter={() => setHoveringBoard(true)}
            onMouseLeave={() => setHoveringBoard(false)}
          >
            <Quadrants battlefield={me.zones.battlefield} playerId={me.id} interactive dispatch={dispatch} combat={combat} />
          </div>

          <div className="tray">
            <div className="hand-col">
              <div className="hand-head">
                <span className="qlabel">Hand</span>
                <button
                  className="btn"
                  onClick={() => dispatch({ k: "mulligan", playerId: me.id })}
                  title="Shuffle your hand into your library and draw a fresh 7 — then bottom extra cards via each card's Move menu"
                >
                  Mulligan{me.mulligans > 0 ? ` (${me.mulligans})` : ""}
                </button>
                <button
                  className="btn reveal-toggle"
                  onClick={() => dispatch({ k: "setHandRevealed", playerId: me.id, revealed: !me.handRevealed })}
                >
                  {me.handRevealed ? "Hide hand" : "Reveal hand"}
                </button>
              </div>
              <div className="hand-row">
                {me.zones.hand.map((card, i) => (
                  <ZoneCardTile
                    key={card.iid}
                    card={card}
                    playerId={me.id}
                    from="hand"
                    dispatch={dispatch}
                    style={fanStyle(i, me.zones.hand.length)}
                  />
                ))}
                {me.zones.hand.length === 0 && <span className="hint">Your hand is empty.</span>}
              </div>
            </div>
            <div className="divider" />
            <div className="dice-col">
              <button className="btn" onClick={() => dispatch({ k: "coinFlip", playerId: me.id })}>🪙 Flip</button>
              <div className="dice-roll-row">
                <select value={diceSides} onChange={(e) => setDiceSides(Number(e.target.value))} aria-label="Die size">
                  {DICE_SIZES.map((n) => <option key={n} value={n}>d{n}</option>)}
                </select>
                <button className="btn" onClick={() => dispatch({ k: "diceRoll", playerId: me.id, sides: diceSides })}>🎲 Roll</button>
              </div>
            </div>
            <div className="divider" />
            <CommandZone command={me.zones.command} playerId={me.id} interactive dispatch={dispatch} commanderCasts={me.commanderCasts} />
          </div>
        </div>

        <div className="side-col">
          <ZoneStacks
            playerId={me.id}
            library={me.zones.library}
            graveyard={me.zones.graveyard}
            exile={me.zones.exile}
            dispatch={dispatch}
          />
          <LogPanel log={gameState.log} onSend={sendChat} />
        </div>
      </div>

      {tokenModalOpen && <TokenModal playerId={me.id} dispatch={dispatch} onClose={() => setTokenModalOpen(false)} />}
    </section>
  );
}
