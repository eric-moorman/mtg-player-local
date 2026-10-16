import { useEffect, useMemo, useState } from "react";
import { useSealed } from "../../store/useSealed";
import { useInspector } from "../../store/useInspector";
import { effectivePrice, searchPurchasable } from "../../lib/scryfall";
import SealedPoolList from "./SealedPoolList";
import type { CardData } from "../../lib/types";

const COLOR_KEYS = ["W", "U", "B", "R", "G", "C"] as const;

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

function numOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export default function SealedBuy() {
  const rules = useSealed((s) => s.rules);
  const spent = useSealed((s) => s.spent);
  const buyCard = useSealed((s) => s.buyCard);
  const availableSets = useSealed((s) => s.availableSets);
  const openInspector = useInspector((s) => s.open);

  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [cmcMin, setCmcMin] = useState("");
  const [cmcMax, setCmcMax] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");

  const [results, setResults] = useState<CardData[]>([]);
  const [searching, setSearching] = useState(false);

  const allowedSets = useMemo(() => rules?.allowedSets ?? [], [rules]);
  const remaining = (rules?.budget ?? 0) - spent;
  const setNames = useMemo(() => new Map(availableSets.map((s) => [s.code, s.name])), [availableSets]);

  const hasCriteria =
    query.trim() !== "" ||
    colors.length > 0 ||
    typeFilter.trim() !== "" ||
    keywordFilter.trim() !== "" ||
    cmcMin.trim() !== "" ||
    cmcMax.trim() !== "" ||
    priceMin.trim() !== "" ||
    priceMax.trim() !== "";

  /**
   * Searches Scryfall live rather than scanning preloaded set pools: a game can
   * allow hundreds of sets, and downloading them all just to filter locally is
   * what used to make opening a game take minutes. Same debounce the Deck
   * Builder uses for its live search.
   */
  useEffect(() => {
    if (!hasCriteria) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      searchPurchasable(
        {
          name: query,
          colors,
          type: typeFilter,
          keyword: keywordFilter,
          cmcMin: numOrNull(cmcMin),
          cmcMax: numOrNull(cmcMax),
          priceMin: numOrNull(priceMin),
          priceMax: numOrNull(priceMax),
        },
        allowedSets,
      )
        .then((cards) => {
          if (cancelled) return;
          setResults(cards);
          setSearching(false);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setSearching(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [hasCriteria, query, colors, typeFilter, keywordFilter, cmcMin, cmcMax, priceMin, priceMax, allowedSets]);

  function toggleColor(c: string) {
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

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
          {results.map((card) => {
            const price = effectivePrice(card);
            const isEstimated = card.price_usd == null;
            const setCode = card.set ?? "";
            return (
              <div className="cardtile" key={card.id} onClick={() => openInspector(card)}>
                {card.image_small && <img src={card.image_small} alt={card.name} />}
                <span className="price-badge" title={isEstimated ? "No Scryfall market price — estimated by rarity" : "Market price, via Scryfall"}>
                  {isEstimated ? "~" : ""}{formatPrice(price)}
                </span>
                {setCode && (
                  <span className="sealed-buy-set" title={setNames.get(setCode) ?? setCode.toUpperCase()}>
                    {setCode.toUpperCase()}
                  </span>
                )}
                <button
                  className="sealed-buy-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    buyCard(card, setCode);
                  }}
                  disabled={remaining < price}
                >
                  Buy
                </button>
              </div>
            );
          })}
          {!hasCriteria && <p className="hint">Search by name, or use the filters, to find cards to buy from this game's sets.</p>}
          {hasCriteria && searching && <p className="hint">Searching Scryfall…</p>}
          {hasCriteria && !searching && results.length === 0 && (
            <p className="hint">No cards match those filters in this game's sets.</p>
          )}
        </div>
      </div>

      <SealedPoolList />
    </div>
  );
}
