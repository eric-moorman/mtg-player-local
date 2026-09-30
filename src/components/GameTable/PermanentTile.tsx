import { useState } from "react";
import type { PermanentStack } from "../../lib/cardRules";
import { primaryCounterBadge, getQuadrant } from "../../lib/cardRules";
import { useInspector } from "../../store/useInspector";
import { startPointerDrag } from "../../lib/pointerDrag";
import type { GameAction, ZoneName } from "../../lib/types";

interface Props {
  stack: PermanentStack;
  playerId: string;
  mini?: boolean;
  interactive: boolean;
  dispatch?: (a: GameAction) => void;
}

const MOVE_TARGETS: { zone: ZoneName; label: string }[] = [
  { zone: "hand", label: "Hand" },
  { zone: "graveyard", label: "Graveyard" },
  { zone: "exile", label: "Exile" },
  { zone: "command", label: "Command" },
];

export default function PermanentTile({ stack, playerId, mini, interactive, dispatch }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const openInspector = useInspector((s) => s.open);
  const { representative, instances } = stack;
  const targetIid = instances[0].iid;
  const isPlaneswalker = getQuadrant(representative.type_line) === "planeswalkers";
  const badge = primaryCounterBadge(representative.counters);

  function act(action: GameAction) {
    dispatch?.(action);
    setMenuOpen(false);
  }

  const draggable = interactive && !!dispatch;

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(true);
  }

  return (
    <div
      className={"permtile" + (mini ? " mini" : "") + (representative.tapped ? " tapped" : "")}
      onContextMenu={draggable ? openMenu : undefined}
    >
      <div
        className="tile-art"
        onClick={() => openInspector(representative)}
        onMouseDown={
          draggable
            ? (e) => startPointerDrag(e, (zone) => { if (zone !== "battlefield") dispatch!({ k: "moveCard", playerId, iid: targetIid, from: "battlefield", to: zone as ZoneName }); })
            : undefined
        }
      >
        {representative.image_small ? (
          <img src={representative.image_small} alt={representative.name} />
        ) : (
          <div className="permtile-placeholder">{representative.name.slice(0, 1).toUpperCase()}</div>
        )}
      </div>
      {instances.length > 1 && <span className="stackbadge">×{instances.length}</span>}
      {badge && <span className="counterbadge">{badge}</span>}

      {interactive && dispatch && (
        <button
          className="menubtn"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label={`Actions for ${representative.name} (or right-click the card)`}
          title="Actions (or right-click the card)"
        >
          ⋮
        </button>
      )}

      {menuOpen && (
        <div className="ctx-menu" onClick={(e) => e.stopPropagation()}>
          <div className="hd">{representative.name}</div>
          <button onClick={() => act({ k: "tap", playerId, iid: targetIid })}>
            {representative.tapped ? "Untap" : "Tap"}
          </button>
          <div className="counter-row">
            <span>+1/+1</span>
            <button onClick={() => act({ k: "addCounter", playerId, iid: targetIid, label: "+1/+1", delta: -1 })}>–</button>
            <button onClick={() => act({ k: "addCounter", playerId, iid: targetIid, label: "+1/+1", delta: 1 })}>+</button>
          </div>
          {isPlaneswalker && (
            <div className="counter-row">
              <span>Loyalty</span>
              <button onClick={() => act({ k: "addCounter", playerId, iid: targetIid, label: "loyalty", delta: -1 })}>–</button>
              <button onClick={() => act({ k: "addCounter", playerId, iid: targetIid, label: "loyalty", delta: 1 })}>+</button>
            </div>
          )}
          <div className="move-row">
            {MOVE_TARGETS.map((m) => (
              <button key={m.zone} onClick={() => act({ k: "moveCard", playerId, iid: targetIid, from: "battlefield", to: m.zone })}>
                {m.label}
              </button>
            ))}
          </div>
          <button onClick={() => act({ k: "reveal", playerId, iid: targetIid, from: "battlefield" })}>Reveal to all</button>
        </div>
      )}
    </div>
  );
}
