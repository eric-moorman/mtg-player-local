import { useRef, useState } from "react";
import { useDrag } from "../../store/useDrag";
import { useCloseOnOutside } from "../../lib/useCloseOnOutside";
import ZoneBrowser from "./ZoneBrowser";
import type { CardInstance, GameAction, ZoneName } from "../../lib/types";

interface StackProps {
  label: string;
  count: number;
  onClick?: () => void;
  /** data-dropzone value for this stack, if cards can be dropped here (see src/lib/pointerDrag.ts). */
  dropZone?: string;
  menu?: (close: () => void) => React.ReactNode;
}

function ZoneStack({ label, count, onClick, dropZone, menu }: StackProps) {
  const [hovering, setHovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragActive = useDrag((s) => s.active);

  useCloseOnOutside(menuOpen, menuRef, () => setMenuOpen(false));

  return (
    <div className={"zone-stack" + (onClick ? " clickable" : "")}>
      <div
        className={"zone-stack-face" + (dragActive && hovering ? " drag-over" : "")}
        onClick={onClick}
        onContextMenu={
          menu
            ? (e) => {
                e.preventDefault();
                setMenuOpen(true);
              }
            : undefined
        }
        data-dropzone={dropZone}
        onMouseEnter={dropZone ? () => setHovering(true) : undefined}
        onMouseLeave={dropZone ? () => setHovering(false) : undefined}
      >
        <span className="zone-stack-count">{count}</span>
        {menu && (
          <button
            className="menubtn"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            aria-label={`More ${label} actions (or right-click)`}
            title="More actions (or right-click)"
          >
            ⋮
          </button>
        )}
      </div>
      <div className="zone-stack-label">{label}</div>
      {menuOpen && menu && (
        <div className="ctx-menu zone-stack-menu" ref={menuRef} onClick={(e) => e.stopPropagation()}>
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
      <ZoneStack label="Graveyard" count={graveyard.length} onClick={() => setBrowsing("graveyard")} dropZone="graveyard" />
      <ZoneStack label="Exile" count={exile.length} onClick={() => setBrowsing("exile")} dropZone="exile" />

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
