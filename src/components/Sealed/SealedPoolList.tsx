import { useSealed } from "../../store/useSealed";
import { useInspector } from "../../store/useInspector";
import { sellBackRate, sellValue } from "../../lib/scryfall";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function SealedPoolList() {
  const pool = useSealed((s) => s.pool);
  const removeFromPool = useSealed((s) => s.removeFromPool);
  const finished = useSealed((s) => s.finished);
  const rules = useSealed((s) => s.rules);
  const openInspector = useInspector((s) => s.open);

  const rate = sellBackRate(rules);

  return (
    <div className="sealed-session-col">
      <h3 className="sealed-subhead">Your pool</h3>
      {!finished && pool.length > 0 && (
        <p className="hint sealed-sell-note">Selling pays {Math.round(rate * 100)}% of a card's market price.</p>
      )}
      <ul className="sealed-pool-list">
        {pool.map((p) => {
          const sellPrice = sellValue(p.card, rate);
          return (
            <li key={p.uid}>
              <span className="sealed-pool-name" onClick={() => openInspector(p.card)}>{p.card.name}</span>
              <span className="sealed-pool-via">{p.via === "pack" ? "pack" : p.via === "basic" ? "free" : "bought"}</span>
              {!finished && (
                <button
                  className="mini-x"
                  onClick={() => removeFromPool(p.uid)}
                  title={`Sell for ${formatPrice(sellPrice)}`}
                  aria-label={`Sell ${p.card.name} for ${formatPrice(sellPrice)}`}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
        {pool.length === 0 && <li className="hint">Nothing yet — open a pack or buy a card.</li>}
      </ul>
    </div>
  );
}
