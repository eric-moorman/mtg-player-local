import { useSealed } from "../../store/useSealed";
import { useInspector } from "../../store/useInspector";
import { sellBackRate, sellRateFor, sellValue } from "../../lib/scryfall";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

const VIA_LABEL = { pack: "pack", basic: "free", buy: "bought" } as const;

export default function SealedPoolList() {
  const pool = useSealed((s) => s.pool);
  const removeFromPool = useSealed((s) => s.removeFromPool);
  const finished = useSealed((s) => s.finished);
  const rules = useSealed((s) => s.rules);
  const openInspector = useInspector((s) => s.open);

  const packRate = sellBackRate(rules);
  const hasPackCards = pool.some((p) => p.via === "pack");
  const hasBoughtCards = pool.some((p) => p.via === "buy");

  return (
    <div className="sealed-session-col">
      <h3 className="sealed-subhead">Your pool</h3>
      {!finished && pool.length > 0 && (
        <p className="hint sealed-sell-note">
          {hasBoughtCards && "Cards you bought refund in full. "}
          {hasPackCards && `Pack pulls sell back for ${Math.round(packRate * 100)}% of market price.`}
        </p>
      )}
      <ul className="sealed-pool-list">
        {pool.map((p) => {
          // Per card, not per game: a bought single and a pack pull refund differently.
          const sellPrice = sellValue(p.card, sellRateFor(p.via, rules));
          return (
            <li key={p.uid}>
              <span className="sealed-pool-name" onClick={() => openInspector(p.card)}>{p.card.name}</span>
              <span className="sealed-pool-via">{VIA_LABEL[p.via]}</span>
              {!finished && (
                <>
                  {/* Shown rather than left in a tooltip, since the amount now depends on where the card came from. */}
                  <span className="sealed-pool-sell">{formatPrice(sellPrice)}</span>
                  <button
                    className="mini-x"
                    onClick={() => removeFromPool(p.uid)}
                    title={`Sell ${p.card.name} for ${formatPrice(sellPrice)}`}
                    aria-label={`Sell ${p.card.name} for ${formatPrice(sellPrice)}`}
                  >
                    ×
                  </button>
                </>
              )}
            </li>
          );
        })}
        {pool.length === 0 && <li className="hint">Nothing yet — open a pack or buy a card.</li>}
      </ul>
    </div>
  );
}
