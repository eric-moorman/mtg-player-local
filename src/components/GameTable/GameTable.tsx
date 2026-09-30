import { useState } from "react";
import { useGame } from "../../store/useGame";
import { useDrag } from "../../store/useDrag";
import Quadrants from "./Quadrants";
import ZoneCardTile from "./ZoneCardTile";
import CommandZone from "./CommandZone";
import ZoneStacks from "./ZoneStacks";
import TurnTracker from "./TurnTracker";
import LogPanel from "./LogPanel";
import TokenModal from "./TokenModal";
import type { PlayerState } from "../../lib/types";
import "./GameTable.css";

function OpponentBoard({ player }: { player: PlayerState }) {
  return (
    <div className="opp">
      <div className="opp-head">
        <span>{player.name}</span>
        <span className="life-pill">{player.life}</span>
      </div>
      <CommandZone command={player.zones.command} playerId={player.id} interactive={false} mini />
      <Quadrants battlefield={player.zones.battlefield} playerId={player.id} interactive={false} mini />
      {player.handRevealed && player.zones.hand.length > 0 && (
        <div>
          <div className="qlabel">Hand (revealed)</div>
          <div className="hand-row">
            {player.zones.hand.map((card) => (
              <ZoneCardTile key={card.iid} card={card} playerId={player.id} from="hand" interactive={false} mini />
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

  return (
    <section>
      <div className="screen-head">
        <h2>Game Table</h2>
        <span className="sub">Battlefields are public — everyone's permanents are visible; hands and libraries stay hidden</span>
      </div>

      <TurnTracker turn={gameState.turn} players={gameState.players} dispatch={dispatch} />

      {opponents.length > 0 && (
        <div className="opp-strip">
          {opponents.map((p) => <OpponentBoard key={p.id} player={p} />)}
        </div>
      )}

      <div className="table-main">
        <div className="board">
          <div className="seat-head">
            <span className="name">{me.name} (you)</span>
            <div className="life-tracker">
              <span className="life-label">Life</span>
              <button className="life-btn minus" onClick={() => dispatch({ k: "setLife", playerId: me.id, life: me.life - 1 })} aria-label="Lose 1 life">–</button>
              <span className="val">{me.life}</span>
              <button className="life-btn plus" onClick={() => dispatch({ k: "setLife", playerId: me.id, life: me.life + 1 })} aria-label="Gain 1 life">+</button>
            </div>
            <button className="btn" onClick={() => setTokenModalOpen(true)}>+ Token</button>
          </div>

          <div
            className={"board-field" + (dragActive && hoveringBoard ? " drag-over" : "")}
            style={boardStyle}
            data-dropzone="battlefield"
            onMouseEnter={() => setHoveringBoard(true)}
            onMouseLeave={() => setHoveringBoard(false)}
          >
            <Quadrants battlefield={me.zones.battlefield} playerId={me.id} interactive dispatch={dispatch} />
          </div>

          <div className="tray">
            <div className="hand-col">
              <div className="hand-head">
                <span className="qlabel">Hand</span>
                <button
                  className="btn reveal-toggle"
                  onClick={() => dispatch({ k: "setHandRevealed", playerId: me.id, revealed: !me.handRevealed })}
                >
                  {me.handRevealed ? "Hide hand" : "Reveal hand"}
                </button>
              </div>
              <div className="hand-row">
                {me.zones.hand.map((card) => (
                  <ZoneCardTile key={card.iid} card={card} playerId={me.id} from="hand" dispatch={dispatch} />
                ))}
                {me.zones.hand.length === 0 && <span className="hint">Your hand is empty.</span>}
              </div>
            </div>
            <div className="divider" />
            <div className="dice-col">
              <button className="btn" onClick={() => dispatch({ k: "coinFlip", playerId: me.id })}>🪙 Flip</button>
              <button className="btn" onClick={() => dispatch({ k: "diceRoll", playerId: me.id, sides: 6 })}>🎲 Roll d6</button>
            </div>
            <div className="divider" />
            <CommandZone command={me.zones.command} playerId={me.id} interactive dispatch={dispatch} />
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
