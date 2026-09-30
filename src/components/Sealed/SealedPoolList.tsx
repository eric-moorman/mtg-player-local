import { useSealed } from "../../store/useSealed";
import { useInspector } from "../../store/useInspector";
import { effectivePrice } from "../../lib/scryfall";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function SealedPoolList() {
  const pool = useSealed((s) => s.pool);
  const removeFromPool = useSealed((s) => s.removeFromPool);
  const openInspector = useInspector((s) => s.open);

  return (
    <div className="sealed-session-col">
      <h3 className="sealed-subhead">Your pool</h3>
      <ul className="sealed-pool-list">
        {pool.map((p) => {
          const sellPrice = effectivePrice(p.card);
          return (
            <li key={p.uid}>
              <span className="sealed-pool-name" onClick={() => openInspector(p.card)}>{p.card.name}</span>
              <span className="sealed-pool-via">{p.via === "pack" ? "pack" : "bought"}</span>
              <button
                className="mini-x"
                onClick={() => removeFromPool(p.uid)}
                title={`Sell for ${formatPrice(sellPrice)}`}
                aria-label={`Sell ${p.card.name} for ${formatPrice(sellPrice)}`}
              >
                ×
              </button>
            </li>
          );
        })}
        {pool.length === 0 && <li className="hint">Nothing yet — open a pack or buy a card.</li>}
      </ul>
    </div>
  );
}
