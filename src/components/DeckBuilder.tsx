import { useEffect, useMemo, useState } from "react";
import { useGame } from "../store/useGame";
import { useInspector } from "../store/useInspector";
import { parseDecklistText, searchLive, serializeDecklist } from "../lib/scryfall";
import { newId } from "../lib/reducer";
import type { CardData, Deck, DeckCard } from "../lib/types";
import "./DeckBuilder.css";

const COLOR_KEYS = ["W", "U", "B", "R", "G", "C"] as const;

function formatBytes(n?: number) {
  if (!n) return "";
  return `${Math.round(n / 1_000_000)} MB`;
}

function formatPrice(n: number | null | undefined) {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

function deckTotal(cards: DeckCard[], index: Map<string, CardData>) {
  let price = 0;
  let hasUnknown = false;
  for (const dc of cards) {
    const found = index.get(dc.name.toLowerCase());
    if (!found || found.price_usd == null) hasUnknown = true;
    price += (found?.price_usd ?? 0) * dc.qty;
  }
  return { price, hasUnknown };
}

export default function DeckBuilder() {
  const catalog = useGame((s) => s.catalog);
  const catalogStatus = useGame((s) => s.catalogStatus);
  const catalogProgress = useGame((s) => s.catalogProgress);
  const catalogInfo = useGame((s) => s.catalogInfo);
  const catalogError = useGame((s) => s.catalogError);
  const downloadCatalog = useGame((s) => s.downloadCatalog);
  const decks = useGame((s) => s.decks);
  const saveDeck = useGame((s) => s.saveDeck);
  const removeDeck = useGame((s) => s.removeDeck);
  const openInspector = useInspector((s) => s.open);

  const [query, setQuery] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [cmcMin, setCmcMin] = useState("");
  const [cmcMax, setCmcMax] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [liveResults, setLiveResults] = useState<CardData[]>([]);
  const [cardIndex, setCardIndex] = useState<Map<string, CardData>>(new Map());

  const [deckId, setDeckId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState("New deck");
  const [deckCards, setDeckCards] = useState<DeckCard[]>([]);
  const [commanders, setCommanders] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");

  const hasCatalog = catalog.length > 0;

  useEffect(() => {
    if (hasCatalog) return;
    const q = query.trim();
    if (!q) { setLiveResults([]); return; }
    const handle = setTimeout(() => {
      searchLive(q).then((cards) => {
        setLiveResults(cards);
        setCardIndex((prev) => {
          const next = new Map(prev);
          cards.forEach((c) => next.set(c.name.toLowerCase(), c));
          return next;
        });
      });
    }, 350);
    return () => clearTimeout(handle);
  }, [query, hasCatalog]);

  useEffect(() => {
    if (!hasCatalog) return;
    setCardIndex((prev) => {
      if (prev.size) return prev;
      return new Map(catalog.map((c) => [c.name.toLowerCase(), c]));
    });
  }, [hasCatalog, catalog]);

  const results = useMemo(() => {
    if (!hasCatalog) return liveResults;
    const q = query.trim().toLowerCase();
    const kw = keywordFilter.trim().toLowerCase();
    const cmcLo = cmcMin.trim() === "" ? null : Number(cmcMin);
    const cmcHi = cmcMax.trim() === "" ? null : Number(cmcMax);
    const priceLo = priceMin.trim() === "" ? null : Number(priceMin);
    const priceHi = priceMax.trim() === "" ? null : Number(priceMax);
    return catalog
      .filter((c) => {
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
  }, [hasCatalog, catalog, liveResults, query, colors, typeFilter, cmcMin, cmcMax, priceMin, priceMax, keywordFilter]);

  const total = deckCards.reduce((sum, c) => sum + c.qty, 0);
  const { price: deckPrice, hasUnknown: deckHasUnknownPrice } = deckTotal(deckCards, cardIndex);

  function toggleColor(c: string) {
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function qtyOf(name: string) {
    return deckCards.find((c) => c.name.toLowerCase() === name.toLowerCase())?.qty ?? 0;
  }

  function addOne(card: CardData) {
    setCardIndex((prev) => new Map(prev).set(card.name.toLowerCase(), card));
    setDeckCards((prev) => {
      const idx = prev.findIndex((c) => c.name.toLowerCase() === card.name.toLowerCase());
      if (idx === -1) return [...prev, { name: card.name, qty: 1 }];
      const next = [...prev];
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
      return next;
    });
  }

  function removeOne(name: string) {
    setDeckCards((prev) => {
      const idx = prev.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
      if (idx === -1) return prev;
      const next = [...prev];
      if (next[idx].qty <= 1) {
        next.splice(idx, 1);
        setCommanders((cm) => cm.filter((c) => c.toLowerCase() !== name.toLowerCase()));
      } else {
        next[idx] = { ...next[idx], qty: next[idx].qty - 1 };
      }
      return next;
    });
  }

  function toggleCommander(name: string) {
    setCommanders((prev) => {
      if (prev.some((c) => c.toLowerCase() === name.toLowerCase())) return prev.filter((c) => c.toLowerCase() !== name.toLowerCase());
      if (prev.length >= 2) return prev;
      return [...prev, name];
    });
  }

  function startNewDeck() {
    setDeckId(null);
    setDeckName("New deck");
    setDeckCards([]);
    setCommanders([]);
  }

  function loadDeck(d: Deck) {
    setDeckId(d.id);
    setDeckName(d.name);
    setDeckCards(d.cards);
    setCommanders(d.commanders ?? []);
  }

  async function handleSave() {
    const deck: Deck = { id: deckId ?? newId(), name: deckName.trim() || "Untitled deck", cards: deckCards, commanders, updatedAt: Date.now() };
    await saveDeck(deck);
    setDeckId(deck.id);
  }

  function handleImport() {
    setDeckCards(parseDecklistText(importText));
    setShowImport(false);
    setImportText("");
  }

  function handleExport() {
    navigator.clipboard?.writeText(serializeDecklist(deckCards));
  }

  return (
    <section>
      <div className="screen-head">
        <h2>Deck Builder</h2>
        <span className="sub">
          {hasCatalog
            ? `Searching cached catalog — ${catalogInfo?.count.toLocaleString() ?? catalog.length.toLocaleString()} cards`
            : "Searching Scryfall live — load the full catalog below for instant, offline search"}
        </span>
      </div>

      {!hasCatalog && (
        <div className="catalog-banner">
          {catalogStatus === "loading" && catalogProgress ? (
            <span>
              {catalogProgress.phase === "downloading"
                ? `Downloading card catalog… ${formatBytes(catalogProgress.receivedBytes)}${catalogProgress.totalBytes ? ` / ${formatBytes(catalogProgress.totalBytes)}` : ""}`
                : catalogProgress.phase === "parsing"
                ? "Parsing catalog…"
                : catalogProgress.phase === "storing"
                ? "Saving to your browser…"
                : "Checking Scryfall…"}
            </span>
          ) : (
            <>
              <span>No local card catalog yet — search works, but each query hits Scryfall live.</span>
              <button className="btn primary" onClick={downloadCatalog}>Load full catalog (one-time, ~25 MB)</button>
            </>
          )}
          {catalogError && <span className="deck-error">{catalogError}</span>}
        </div>
      )}

      <div className="db-grid">
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
                  disabled={!hasCatalog}
                  title={hasCatalog ? undefined : "Load the full catalog to filter by color"}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-block">
            <label>Type contains</label>
            <input type="text" placeholder="e.g. Creature" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} disabled={!hasCatalog} />
          </div>
          <div className="filter-block">
            <label>Mana value</label>
            <div className="range-row">
              <input
                type="number" min={0} placeholder="Min" value={cmcMin}
                onChange={(e) => setCmcMin(e.target.value)} disabled={!hasCatalog}
                title={hasCatalog ? undefined : "Load the full catalog to filter by mana value"}
              />
              <span className="range-dash">–</span>
              <input
                type="number" min={0} placeholder="Max" value={cmcMax}
                onChange={(e) => setCmcMax(e.target.value)} disabled={!hasCatalog}
                title={hasCatalog ? undefined : "Load the full catalog to filter by mana value"}
              />
            </div>
          </div>
          <div className="filter-block">
            <label>Keyword</label>
            <input
              type="text" placeholder="e.g. Flying" value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)} disabled={!hasCatalog}
              title={hasCatalog ? undefined : "Load the full catalog to filter by keyword"}
            />
          </div>
          <div className="filter-block">
            <label>Price ($)</label>
            <div className="range-row">
              <input
                type="number" min={0} step="0.01" placeholder="Min" value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)} disabled={!hasCatalog}
                title={hasCatalog ? undefined : "Load the full catalog to filter by price"}
              />
              <span className="range-dash">–</span>
              <input
                type="number" min={0} step="0.01" placeholder="Max" value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)} disabled={!hasCatalog}
                title={hasCatalog ? undefined : "Load the full catalog to filter by price"}
              />
            </div>
          </div>

          <div className="filter-block">
            <label>Your decks</label>
            <div className="deck-list-mini">
              {decks.map((d) => {
                const { price, hasUnknown } = deckTotal(d.cards, cardIndex);
                return (
                  <div key={d.id} className="deck-list-mini-row">
                    <button className="linklike" onClick={() => loadDeck(d)}>{d.name}</button>
                    <span className="deck-list-mini-price">{hasUnknown ? "≈" : ""}${price.toFixed(0)}</span>
                    <button className="mini-x" onClick={() => removeDeck(d.id)} aria-label={`Delete ${d.name}`}>×</button>
                  </div>
                );
              })}
              <button className="btn" onClick={startNewDeck}>+ New deck</button>
            </div>
          </div>
        </div>

        <div className="db-col">
          <div className="card-grid">
            {results.map((c) => (
              <div className="cardtile" key={c.id} onClick={() => openInspector(c)}>
                {c.image_small && <img src={c.image_small} alt={c.name} />}
                <span className="price-badge" title="Market price, via Scryfall">{formatPrice(c.price_usd)}</span>
                <span className="qty">
                  <button onClick={(e) => { e.stopPropagation(); removeOne(c.name); }} aria-label={`Remove one ${c.name}`}>–</button>
                  <span className="n">{qtyOf(c.name)}</span>
                  <button onClick={(e) => { e.stopPropagation(); addOne(c); }} aria-label={`Add one ${c.name}`}>+</button>
                </span>
              </div>
            ))}
            {results.length === 0 && query && <p className="hint">No cards found.</p>}
          </div>
        </div>

        <div className="db-col">
          <div className="decklist">
            <input className="deck-name-input" value={deckName} onChange={(e) => setDeckName(e.target.value)} />
            <div className="count">
              {total} cards
              {deckCards.length > 0 && (
                <span className="deck-price">
                  {" · "}
                  {deckHasUnknownPrice ? "≈ " : ""}${deckPrice.toFixed(2)}
                </span>
              )}
            </div>
            {commanders.length > 0 && (
              <div className="commander-summary">
                {commanders.length === 1 ? "Commander: " : "Commanders: "}
                {commanders.join(" & ")}
              </div>
            )}
            <ul>
              {deckCards.map((dc) => {
                const found = cardIndex.get(dc.name.toLowerCase());
                const isCommander = commanders.some((c) => c.toLowerCase() === dc.name.toLowerCase());
                const commanderDisabled = !isCommander && commanders.length >= 2;
                return (
                  <li key={dc.name}>
                    <button
                      className={"crown-btn" + (isCommander ? " active" : "")}
                      onClick={() => toggleCommander(dc.name)}
                      disabled={commanderDisabled}
                      title={isCommander ? "Unset as commander" : commanderDisabled ? "Only up to two commanders" : "Set as commander"}
                    >
                      ♛
                    </button>
                    <span className="li-name">
                      <span className="n">{dc.qty}×</span> {dc.name}
                    </span>
                    <span className="li-meta">
                      <span className="li-cost">{found?.mana_cost ?? ""}</span>
                      <span className="li-price">{found ? formatPrice(found.price_usd) : ""}</span>
                    </span>
                  </li>
                );
              })}
              {deckCards.length === 0 && <li className="hint">Click a card's + to add it here.</li>}
            </ul>
            <div className="actions">
              <button className="btn primary" onClick={handleSave}>Save deck</button>
              <button className="btn" onClick={() => setShowImport((v) => !v)}>Import list</button>
              <button className="btn" onClick={handleExport}>Export list</button>
            </div>
            {showImport && (
              <div className="import-box">
                <textarea
                  rows={6}
                  placeholder={"4 Lightning Bolt\n1 Sol Ring\n9 Island"}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <button className="btn primary" onClick={handleImport}>Load list</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
