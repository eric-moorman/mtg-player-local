import { useEffect } from "react";
import { useInspector } from "../store/useInspector";
import { keywordTooltip } from "../lib/keywords";
import "./Inspector.css";

export default function Inspector() {
  const card = useInspector((s) => s.card);
  const close = useInspector((s) => s.close);

  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [card, close]);

  if (!card) return null;

  const pt = card.loyalty ? `Loyalty ${card.loyalty}` : card.power != null && card.toughness != null ? `${card.power} / ${card.toughness}` : null;

  return (
    <div className="inspect-overlay open" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="inspect-card">
        <button className="inspect-close" aria-label="Close inspector" onClick={close}>×</button>
        {card.image_large && <img src={card.image_large} alt={card.name} />}
        <div className="inspect-info">
          <h3>{card.name}</h3>
          <div className="inspect-meta">
            <span>{card.type_line}</span>
            {card.mana_cost && <span>{card.mana_cost}</span>}
            {card.price_usd != null && <span title="Market price, via Scryfall">${card.price_usd.toFixed(2)}</span>}
          </div>
          {pt && <div className="inspect-pt">{pt}</div>}
          {card.oracle_text && <p className="inspect-text">{card.oracle_text}</p>}
          {card.keywords.length > 0 && (
            <div className="inspect-keywords">
              {card.keywords.map((k) => (
                <span key={k} className="kw-chip" title={keywordTooltip(k) ?? k}>{k}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
