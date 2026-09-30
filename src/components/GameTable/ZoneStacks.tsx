import { useState } from "react";
import type { GameAction, ZoneName } from "../../lib/types";

interface DragPayload {
  iid: string;
  from: ZoneName;
  playerId: string;
}

function parseDrag(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData("application/x-kitchentable-card");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface StackProps {
  label: string;
  count: number;
  onClick?: () => void;
  onDropCard?: (payload: DragPayload) => void;
}

function ZoneStack({ label, count, onClick, onDropCard }: StackProps) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      className={"zone-stack" + (onClick ? " clickable" : "") + (dragOver ? " drag-over" : "")}
      onClick={onClick}
      onDragOver={onDropCard ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={onDropCard ? () => setDragOver(false) : undefined}
      onDrop={
        onDropCard
          ? (e) => {
              e.preventDefault();
              setDragOver(false);
              const payload = parseDrag(e);
              if (payload) onDropCard(payload);
            }
          : undefined
      }
    >
      <div className="zone-stack-face">
        <span className="zone-stack-count">{count}</span>
      </div>
      <div className="zone-stack-label">{label}</div>
    </div>
  );
}

interface Props {
  playerId: string;
  library: number;
  graveyard: number;
  exile: number;
  dispatch: (a: GameAction) => void;
}

export default function ZoneStacks({ playerId, library, graveyard, exile, dispatch }: Props) {
  const [libMenuOpen, setLibMenuOpen] = useState(false);

  function moveFromDrag(payload: DragPayload, to: "graveyard" | "exile") {
    // Dropping a card onto the zone it's already in would otherwise re-run the
    // "enter battlefield" reset logic for nothing, or just be a no-op elsewhere.
    if (payload.from === to) return;
    dispatch({ k: "moveCard", playerId, iid: payload.iid, from: payload.from, to });
  }

  return (
    <div className="zone-stacks">
      <div className="pill-menu-wrap">
        <ZoneStack label="Library" count={library} onClick={() => setLibMenuOpen((v) => !v)} />
        {libMenuOpen && (
          <div className="ctx-menu lib-menu">
            <button onClick={() => { dispatch({ k: "draw", playerId, count: 1 }); setLibMenuOpen(false); }}>Draw 1</button>
            <button onClick={() => { dispatch({ k: "shuffleLibrary", playerId }); setLibMenuOpen(false); }}>Shuffle</button>
            <button onClick={() => { dispatch({ k: "mill", playerId, count: 1 }); setLibMenuOpen(false); }}>Mill 1</button>
          </div>
        )}
      </div>
      <ZoneStack label="Graveyard" count={graveyard} onDropCard={(p) => moveFromDrag(p, "graveyard")} />
      <ZoneStack label="Exile" count={exile} onDropCard={(p) => moveFromDrag(p, "exile")} />
    </div>
  );
}
