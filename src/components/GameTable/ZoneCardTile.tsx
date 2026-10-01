import { useRef, useState } from "react";
import { useInspector } from "../../store/useInspector";
import { startPointerDrag, consumeSuppressedClick } from "../../lib/pointerDrag";
import { useCloseOnOutside } from "../../lib/useCloseOnOutside";
import type { CardInstance, GameAction, ZoneName } from "../../lib/types";

interface Props {
  card: CardInstance;
  playerId: string;
  from: ZoneName;
  interactive?: boolean;
  mini?: boolean;
  dispatch?: (a: GameAction) => void;
  style?: React.CSSProperties;
}

const ALL_TARGETS: { zone: ZoneName; label: string }[] = [
  { zone: "battlefield", label: "Battlefield" },
  { zone: "hand", label: "Hand" },
  { zone: "graveyard", label: "Graveyard" },
  { zone: "exile", label: "Exile" },
  { zone: "command", label: "Command" },
];

const PLAYABLE_FROM: ZoneName[] = ["hand", "command"];

export default function ZoneCardTile({ card, playerId, from, interactive = true, mini, dispatch, style }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const openInspector = useInspector((s) => s.open);
  const canPlay = PLAYABLE_FROM.includes(from);
  // Hand/command cards get a dedicated "Play" button instead of repeating Battlefield here.
  const moveTargets = ALL_TARGETS.filter((t) => t.zone !== from && !(canPlay && t.zone === "battlefield"));
  const draggable = interactive && !!dispatch;

  useCloseOnOutside(menuOpen, menuRef, () => setMenuOpen(false));

  function openMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(true);
  }

  return (
    <div
      className={"handtile" + (mini ? " mini" : "") + (menuOpen ? " menu-open" : "")}
      style={style}
      onContextMenu={draggable ? openMenu : undefined}
    >
      <div
        className="tile-art"
        onClick={() => { if (consumeSuppressedClick()) return; openInspector(card); }}
        onMouseDown={
          draggable
            ? (e) =>
                startPointerDrag(
                  e,
                  (zone) => { if (zone !== from) dispatch!({ k: "moveCard", playerId, iid: card.iid, from, to: zone as ZoneName }); },
                  () => setMenuOpen(true),
                  card.image_small
                )
            : undefined
        }
      >
        {card.image_small ? (
          // img elements are natively draggable in real browsers even without a draggable
          // attribute — without this, a real mouse drag triggers Chrome's own native image
          // drag instead of the manual tracking above, and swallows the mouseup entirely.
          <img src={card.image_small} alt={card.name} draggable={false} />
        ) : (
          <div className="permtile-placeholder">{card.name.slice(0, 1)}</div>
        )}
      </div>
      {interactive && dispatch && canPlay && (
        <button
          className="play-btn"
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ k: "moveCard", playerId, iid: card.iid, from, to: "battlefield" });
          }}
          aria-label={`Play ${card.name} to the battlefield`}
        >
          Play
        </button>
      )}
      {interactive && dispatch && (
        <button
          className="menubtn"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label={`Actions for ${card.name} (or right-click or press-and-hold the card)`}
          title="Actions (or right-click or press-and-hold the card)"
        >
          ⋮
        </button>
      )}
      {menuOpen && dispatch && (
        <div className="ctx-menu" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <div className="hd">{card.name}</div>
          {moveTargets.map((m) => (
            <button
              key={m.zone}
              onClick={() => {
                dispatch({ k: "moveCard", playerId, iid: card.iid, from, to: m.zone });
                setMenuOpen(false);
              }}
            >
              Move to {m.label}
            </button>
          ))}
          <button
            onClick={() => {
              dispatch({ k: "reveal", playerId, iid: card.iid, from });
              setMenuOpen(false);
            }}
          >
            Reveal to all
          </button>
        </div>
      )}
    </div>
  );
}
