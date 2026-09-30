import { useState } from "react";
import { useSealed } from "../../store/useSealed";
import { useInspector } from "../../store/useInspector";

export default function PackOpenReveal() {
  const lastOpened = useSealed((s) => s.lastOpened);
  const dismissReveal = useSealed((s) => s.dismissReveal);
  const openInspector = useInspector((s) => s.open);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  if (!lastOpened) return null;

  function flip(i: number) {
    setRevealed((prev) => new Set(prev).add(i));
  }
  function showAll() {
    setRevealed(new Set(lastOpened!.cards.map((_, i) => i)));
  }
  function close() {
    setRevealed(new Set());
    dismissReveal();
  }

  return (
    <div className="inspect-overlay open" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="pack-reveal-card">
        <div className="pack-reveal-head">
          <h3>You opened a pack</h3>
          <button className="btn" onClick={showAll}>Show all</button>
        </div>
        <div className="pack-reveal-grid">
          {lastOpened.cards.map((card, i) => {
            const isRevealed = revealed.has(i);
            return (
              <div
                key={`${card.id}-${i}`}
                className={"pack-reveal-tile" + (isRevealed ? " revealed" : "")}
                onClick={() => (isRevealed ? openInspector(card) : flip(i))}
              >
                {isRevealed ? (
                  card.image_small ? <img src={card.image_small} alt={card.name} /> : <div className="permtile-placeholder">{card.name.slice(0, 1)}</div>
                ) : (
                  <div className="cardback" />
                )}
                {isRevealed && card.rarity && <span className={"pack-rarity-badge rarity-" + card.rarity}>{card.rarity[0].toUpperCase()}</span>}
              </div>
            );
          })}
        </div>
        <button className="btn primary" onClick={close}>Done</button>
      </div>
    </div>
  );
}
