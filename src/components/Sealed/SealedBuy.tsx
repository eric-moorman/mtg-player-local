import { useMemo, useState } from "react";
import { useSealed } from "../../store/useSealed";
import { useInspector } from "../../store/useInspector";
import SealedPoolList from "./SealedPoolList";
import type { CardData } from "../../lib/types";

const COLOR_KEYS = ["W", "U", "B", "R", "G", "C"] as const;

function formatPrice(n: number | null | undefined) {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

export default function SealedBuy() {
  const budget = useSealed((s) => s.budget);
  const spent = useSealed((s) => s.spent);
  const allowedSets = useSealed((s) => s.allowedSets);
  const setPools = useSealed((s) => s.setPools);
  const buyCard = useSealed((s) => s.buyCard);
  const openInspector = useInspector((s) => s.open);

  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [cmcMin, setCmcMin] = useState("");
  const [cmcMax, setCmcMax] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");

  const remaining = budget - spent;

  const allCards = useMemo(() => {
    const out: { card: CardData; setCode: string }[] = [];
    for (const code of allowedSets) for (const card of setPools[code] ?? []) out.push({ card, setCode: code });
    return out;
  }, [allowedSets, setPools]);

  function toggleColor(c: string) {
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kw = keywordFilter.trim().toLowerCase();
    const cmcLo = cmcMin.trim() === "" ? null : Number(cmcMin);
    const cmcHi = cmcMax.trim() === "" ? null : Number(cmcMax);
    const priceLo = priceMin.trim() === "" ? null : Number(priceMin);
    const priceHi = priceMax.trim() === "" ? null : Number(priceMax);
    return allCards
      .filter(({ card: c }) => {
        if (q && !c.name.toLowerCase().includes(q)) return false;
        if (colors.length && !colors.some((col) => (col === "C" ? c.colors.length === 0 : c.colors.includes(col)))) return false;
        if (typeFilter && !c.type_line.toLowerCase().includes(typeFilter.toLowerCase())) return false;
        if (cmcLo != null && c.cmc < cmcLo) return false;
        if (cmcHi != null && c.cmc > cmcHi) return false;
        if (priceLo != null && (c.price_usd == null || c.price_usd < priceLo)) return false;
        if (priceHi != null && (c.price_usd == null || c.price_usd > priceHi)) return false;
        if (kw && !c.keywords.some((k) => k.toLowerCase().includes(kw))) return false;
        return true;
      })
      .slice(0, 90);
  }, [allCards, query, colors, typeFilter, cmcMin, cmcMax, priceMin, priceMax, keywordFilter]);

  return (
    <div className="db-grid sealed-buy-tab-grid">
      <div className="db-col">
        <div className="filter-block">
          <label>Search</label>
          <input type="text" placeholder="Card name…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="filter-block">
          <label>Color</label>
          <div className="pips">
            {COLOR_KEYS.map((c) => (
              <button
                key={c}
                className={"pip" + (colors.includes(c) ? " active" : "")}
                style={{ background: `var(--mana-${c.toLowerCase()})`, color: `var(--mana-${c.toLowerCase()}-ink)` }}
                onClick={() => toggleColor(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-block">
          <label>Type contains</label>
          <input type="text" placeholder="e.g. Creature" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
        </div>
        <div className="filter-block">
          <label>Mana value</label>
          <div className="range-row">
            <input type="number" min={0} placeholder="Min" value={cmcMin} onChange={(e) => setCmcMin(e.target.value)} />
            <span className="range-dash">–</span>
            <input type="number" min={0} placeholder="Max" value={cmcMax} onChange={(e) => setCmcMax(e.target.value)} />
          </div>
        </div>
        <div className="filter-block">
          <label>Keyword</label>
          <input type="text" placeholder="e.g. Flying" value={keywordFilter} onChange={(e) => setKeywordFilter(e.target.value)} />
        </div>
        <div className="filter-block">
          <label>Price ($)</label>
          <div className="range-row">
            <input type="number" min={0} step="0.01" placeholder="Min" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
            <span className="range-dash">–</span>
            <input type="number" min={0} step="0.01" placeholder="Max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="db-col">
        <div className="card-grid">
          {results.map(({ card, setCode }) => (
            <div className="cardtile" key={card.id} onClick={() => openInspector(card)}>
              {card.image_small && <img src={card.image_small} alt={card.name} />}
              <span className="price-badge" title="Market price, via Scryfall">{formatPrice(card.price_usd)}</span>
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
          {results.length === 0 && <p className="hint">No cards match those filters in your allowed sets.</p>}
        </div>
      </div>

      <SealedPoolList />
    </div>
  );
}
