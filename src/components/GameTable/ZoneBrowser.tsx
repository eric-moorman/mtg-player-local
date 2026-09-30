import { useInspector } from "../../store/useInspector";
import type { CardInstance, GameAction, ZoneName } from "../../lib/types";

interface Props {
  title: string;
  zone: ZoneName;
  cards: CardInstance[];
  playerId: string;
  dispatch: (a: GameAction) => void;
  onClose: () => void;
}

export default function ZoneBrowser({ title, zone, cards, playerId, dispatch, onClose }: Props) {
  const openInspector = useInspector((s) => s.open);

  function move(iid: string, to: ZoneName) {
    dispatch({ k: "moveCard", playerId, iid, from: zone, to });
  }

  return (
    <div className="inspect-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="zone-browser">
        <div className="zone-browser-head">
          <h3>{title} ({cards.length})</h3>
          <button className="inspect-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="zone-browser-list">
          {cards.map((card) => (
            <div className="zone-browser-row" key={card.iid}>
              <div className="zone-browser-thumb" onClick={() => openInspector(card)}>
                {card.image_small ? <img src={card.image_small} alt={card.name} /> : <div className="permtile-placeholder">{card.name.slice(0, 1)}</div>}
              </div>
              <span className="zone-browser-name">{card.name}</span>
              <div className="zone-browser-actions">
                <button className="btn" onClick={() => move(card.iid, "hand")}>To hand</button>
                <button className="btn" onClick={() => move(card.iid, "battlefield")}>To field</button>
              </div>
            </div>
          ))}
          {cards.length === 0 && <p className="hint">Nothing here.</p>}
        </div>
      </div>
    </div>
  );
}
