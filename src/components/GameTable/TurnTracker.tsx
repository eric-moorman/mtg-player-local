import type { GameAction, PlayerState, TurnState } from "../../lib/types";

interface Props {
  turn: TurnState;
  players: PlayerState[];
  dispatch: (a: GameAction) => void;
}

export default function TurnTracker({ turn, players, dispatch }: Props) {
  return (
    <div className="turn-tracker">
      <div className="turn-players">
        {players.map((p) => (
          <button
            key={p.id}
            className={"turn-player" + (p.id === turn.activePlayerId ? " active" : "")}
            onClick={() => dispatch({ k: "setActivePlayer", playerId: p.id })}
            title={`Set ${p.name} as the active player`}
          >
            <span className="dot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>
      <div className="turn-phase">
        <span className="phase-label">{turn.phase}</span>
        <button className="btn" onClick={() => dispatch({ k: "nextPhase" })}>Next phase →</button>
        <button className="btn" onClick={() => dispatch({ k: "passTurn" })}>Pass turn ⏭</button>
      </div>
    </div>
  );
}
