import { useState } from "react";
import { useInspector } from "../../store/useInspector";
import type { CardInstance, GameAction, ZoneName } from "../../lib/types";

interface Props {
  card: CardInstance;
  playerId: string;
  from: ZoneName;
  interactive?: boolean;
  mini?: boolean;
  dispatch?: (a: GameAction) => void;
}

const ALL_TARGETS: { zone: ZoneName; label: string }[] = [
  { zone: "battlefield", label: "Battlefield" },
  { zone: "hand", label: "Hand" },
  { zone: "graveyard", label: "Graveyard" },
  { zone: "exile", label: "Exile" },
  { zone: "command", label: "Command" },
];

export default function ZoneCardTile({ card, playerId, from, interactive = true, mini, dispatch }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const openInspector = useInspector((s) => s.open);
  const moveTargets = ALL_TARGETS.filter((t) => t.zone !== from);

  return (
    <div className={"handtile" + (mini ? " mini" : "")} onClick={() => openInspector(card)}>
      {card.image_small ? <img src={card.image_small} alt={card.name} /> : <div className="permtile-placeholder">{card.name.slice(0, 1)}</div>}
      {interactive && dispatch && (
        <button
          className="menubtn"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label={`Actions for ${card.name}`}
        >
          ⋮
        </button>
      )}
      {menuOpen && dispatch && (
        <div className="ctx-menu" onClick={(e) => e.stopPropagation()}>
          <div className="hd">{card.name}</div>
          <div className="move-row">
            {moveTargets.map((m) => (
              <button
                key={m.zone}
                onClick={() => {
                  dispatch({ k: "moveCard", playerId, iid: card.iid, from, to: m.zone });
                  setMenuOpen(false);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
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
