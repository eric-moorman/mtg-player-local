import { useMemo, useState } from "react";
import { useSealed } from "../../store/useSealed";
import { useInspector } from "../../store/useInspector";
import { useGame } from "../../store/useGame";
import { effectivePrice } from "../../lib/scryfall";
import type { CardData } from "../../lib/types";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function PoolBuilder() {
  const pool = useSealed((s) => s.pool);
  const deckSelections = useSealed((s) => s.deckSelections);
  const addToDeck = useSealed((s) => s.addToDeck);
  const removeFromDeck = useSealed((s) => s.removeFromDeck);
  const setActiveTab = useSealed((s) => s.setActiveTab);
  const saveAsDeck = useSealed((s) => s.saveAsDeck);
  const reset = useSealed((s) => s.reset);
  const openInspector = useInspector((s) => s.open);
  const refreshDecks = useGame((s) => s.refreshDecks);
  const setScreen = useGame((s) => s.setScreen);

  const [deckName, setDeckName] = useState("Sealed pool");
  const [saved, setSaved] = useState(false);

  const poolByName = useMemo(() => {
    const map = new Map<string, { card: CardData; available: number }>();
    for (const p of pool) {
      const existing = map.get(p.card.name);
      if (existing) existing.available += 1;
      else map.set(p.card.name, { card: p.card, available: 1 });
    }
    return map;
  }, [pool]);

  const grouped = useMemo(() => Array.from(poolByName.values()).sort((a, b) => a.card.name.localeCompare(b.card.name)), [poolByName]);
  const totalInDeck = Object.values(deckSelections).reduce((sum, n) => sum + n, 0);

  async function handleSave() {
    await saveAsDeck(deckName);
    await refreshDecks();
    setSaved(true);
  }

  if (saved) {
    return (
      <div className="lobby-card" style={{ maxWidth: 480, margin: "0 auto" }}>
        <h3>Deck saved</h3>
        <p>"{deckName}" is saved and ready to use, just like any other deck.</p>
        <div className="actions">
          <button className="btn primary" onClick={() => setScreen("lobby")}>Go to Lobby</button>
          <button className="btn" onClick={reset}>Start a new sealed pool</button>
        </div>
      </div>
    );
  }

  return (
    <div className="db-grid sealed-build-grid">
      <div className="db-col">
        <h3 className="sealed-subhead">Your pool ({pool.length} cards)</h3>
        <div className="card-grid">
          {grouped.map(({ card, available }) => {
            const inDeck = deckSelections[card.name] ?? 0;
            return (
              <div className="cardtile" key={card.id} onClick={() => openInspector(card)}>
                {card.image_small && <img src={card.image_small} alt={card.name} />}
                <span className="qty">
                  <button onClick={(e) => { e.stopPropagation(); removeFromDeck(card.name); }} disabled={inDeck === 0} aria-label={`Remove one ${card.name} from deck`}>–</button>
                  <span className="n">{inDeck}/{available}</span>
                  <button onClick={(e) => { e.stopPropagation(); addToDeck(card.name); }} disabled={inDeck >= available} aria-label={`Add one ${card.name} to deck`}>+</button>
                </span>
              </div>
            );
          })}
          {grouped.length === 0 && <p className="hint">Your pool is empty — open a pack or buy a card first.</p>}
        </div>
      </div>

      <div className="db-col">
        <div className="decklist">
          <input className="deck-name-input" value={deckName} onChange={(e) => setDeckName(e.target.value)} />
          <div className="count">{totalInDeck} cards</div>
          <ul>
            {Object.entries(deckSelections).filter(([, qty]) => qty > 0).sort(([a], [b]) => a.localeCompare(b)).map(([name, qty]) => {
              const found = poolByName.get(name)?.card;
              return (
                <li key={name}>
                  <span className="li-name"><span className="n">{qty}×</span> {name}</span>
                  <span className="li-meta">
                    <span className="li-cost">{found?.mana_cost ?? ""}</span>
                    <span className="li-price">{found ? formatPrice(effectivePrice(found)) : ""}</span>
                  </span>
                </li>
              );
            })}
            {totalInDeck === 0 && <li className="hint">Click a pool card's + to add it to the deck.</li>}
          </ul>
          <div className="actions">
            <button className="btn" onClick={() => setActiveTab("packs")}>← Open Packs / Buy</button>
            <button className="btn primary" onClick={handleSave} disabled={totalInDeck === 0}>Save as deck</button>
          </div>
        </div>
      </div>
    </div>
  );
}
