import { useState } from "react";
import ZoneBrowser from "./ZoneBrowser";
import type { CardInstance, GameAction, ZoneName } from "../../lib/types";

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
  menu?: (close: () => void) => React.ReactNode;
}

function ZoneStack({ label, count, onClick, onDropCard, menu }: StackProps) {
  const [dragOver, setDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={"zone-stack" + (onClick ? " clickable" : "")}>
      <div
        className={"zone-stack-face" + (dragOver ? " drag-over" : "")}
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
        <span className="zone-stack-count">{count}</span>
        {menu && (
          <button
            className="menubtn"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label={`More ${label} actions`}
          >
            ⋮
          </button>
        )}
      </div>
      <div className="zone-stack-label">{label}</div>
      {menuOpen && menu && (
        <div className="ctx-menu zone-stack-menu" draggable={false} onClick={(e) => e.stopPropagation()}>
          {menu(() => setMenuOpen(false))}
        </div>
      )}
    </div>
  );
}

interface Props {
  playerId: string;
  library: CardInstance[];
  graveyard: CardInstance[];
  exile: CardInstance[];
  dispatch: (a: GameAction) => void;
}

export default function ZoneStacks({ playerId, library, graveyard, exile, dispatch }: Props) {
  const [browsing, setBrowsing] = useState<ZoneName | null>(null);

  function moveFromDrag(payload: DragPayload, to: "graveyard" | "exile") {
    // Dropping a card onto the zone it's already in would otherwise re-run the
    // "enter battlefield" reset logic for nothing, or just be a no-op elsewhere.
    if (payload.from === to) return;
    dispatch({ k: "moveCard", playerId, iid: payload.iid, from: payload.from, to });
  }

  const zoneCards: Record<"library" | "graveyard" | "exile", CardInstance[]> = { library, graveyard, exile };
  const browseTitle = browsing === "library" ? "Library" : browsing === "graveyard" ? "Graveyard" : "Exile";

  return (
    <div className="zone-stacks">
      <ZoneStack
        label="Library"
        count={library.length}
        onClick={() => dispatch({ k: "draw", playerId, count: 1 })}
        menu={(close) => (
          <>
            <div className="hd">Library</div>
            <button onClick={() => { setBrowsing("library"); close(); }}>Browse / search</button>
            <button onClick={() => { dispatch({ k: "shuffleLibrary", playerId }); close(); }}>Shuffle</button>
            <button onClick={() => { dispatch({ k: "mill", playerId, count: 1 }); close(); }}>Mill 1</button>
          </>
        )}
      />
      <ZoneStack label="Graveyard" count={graveyard.length} onClick={() => setBrowsing("graveyard")} onDropCard={(p) => moveFromDrag(p, "graveyard")} />
      <ZoneStack label="Exile" count={exile.length} onClick={() => setBrowsing("exile")} onDropCard={(p) => moveFromDrag(p, "exile")} />

      {browsing && (
        <ZoneBrowser
          title={browseTitle}
          zone={browsing}
          cards={zoneCards[browsing as "library" | "graveyard" | "exile"]}
          playerId={playerId}
          dispatch={dispatch}
          onClose={() => setBrowsing(null)}
        />
      )}
    </div>
  );
}
