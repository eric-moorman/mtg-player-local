import { useMemo, useState } from "react";
import { useSealed } from "../../store/useSealed";
import { useInspector } from "../../store/useInspector";
import PackOpenReveal from "./PackOpenReveal";
import type { CardData } from "../../lib/types";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function SealedSession() {
  const budget = useSealed((s) => s.budget);
  const spent = useSealed((s) => s.spent);
  const config = useSealed((s) => s.config);
  const allowedSets = useSealed((s) => s.allowedSets);
  const availableSets = useSealed((s) => s.availableSets);
  const setPools = useSealed((s) => s.setPools);
  const pool = useSealed((s) => s.pool);
  const openPack = useSealed((s) => s.openPack);
  const buyCard = useSealed((s) => s.buyCard);
  const removeFromPool = useSealed((s) => s.removeFromPool);
  const setActiveTab = useSealed((s) => s.setActiveTab);
  const openInspector = useInspector((s) => s.open);

  const [query, setQuery] = useState("");
  const remaining = budget - spent;
  const setNames = new Map(availableSets.map((s) => [s.code, s.name]));

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: { card: CardData; setCode: string }[] = [];
    for (const code of allowedSets) {
      for (const card of setPools[code] ?? []) {
        if (card.name.toLowerCase().includes(q)) results.push({ card, setCode: code });
      }
      if (results.length > 60) break;
    }
    return results.slice(0, 60);
  }, [query, allowedSets, setPools]);

  return (
    <>
      <div className="sealed-budget-bar">
        <span>Remaining: <b>{formatPrice(Math.max(0, remaining))}</b> of {formatPrice(budget)}</span>
        <span className="sealed-pool-count">{pool.length} cards in pool</span>
        <button className="btn primary" onClick={() => setActiveTab("build")} disabled={pool.length === 0}>Build deck from pool →</button>
      </div>

      <div className="sealed-session-grid">
        <div className="sealed-session-col">
          <h3 className="sealed-subhead">Open a pack</h3>
          <div className="sealed-pack-buttons">
            {allowedSets.map((code) => (
              <button
                key={code}
                className="btn sealed-pack-btn"
                onClick={() => openPack(code)}
                disabled={remaining < config.packPrice}
                title={setNames.get(code)}
              >
                {setNames.get(code) ?? code.toUpperCase()}
                <span className="sealed-pack-price">{formatPrice(config.packPrice)}</span>
              </button>
            ))}
          </div>

          <h3 className="sealed-subhead">Buy a card directly</h3>
          <input type="text" placeholder="Search cards in your allowed sets…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="card-grid sealed-buy-grid">
            {searchResults.map(({ card, setCode }) => (
              <div className="cardtile" key={card.id} onClick={() => openInspector(card)}>
                {card.image_small && <img src={card.image_small} alt={card.name} />}
                <span className="price-badge">{card.price_usd != null ? formatPrice(card.price_usd) : "—"}</span>
                <button
                  className="sealed-buy-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    buyCard(card, setCode);
                  }}
                  disabled={card.price_usd != null && remaining < card.price_usd}
                >
                  Buy
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="sealed-session-col">
          <h3 className="sealed-subhead">Your pool</h3>
          <ul className="sealed-pool-list">
            {pool.map((p) => (
              <li key={p.uid}>
                <span className="sealed-pool-name" onClick={() => openInspector(p.card)}>{p.card.name}</span>
                <span className="sealed-pool-via">{p.via === "pack" ? "pack" : "bought"}</span>
                <button className="mini-x" onClick={() => removeFromPool(p.uid)} aria-label={`Remove ${p.card.name}`}>×</button>
              </li>
            ))}
            {pool.length === 0 && <li className="hint">Nothing yet — open a pack or buy a card.</li>}
          </ul>
        </div>
      </div>

      <PackOpenReveal />
    </>
  );
}
