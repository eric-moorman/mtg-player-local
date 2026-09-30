import { useMemo, useState } from "react";
import { useSealed } from "../../store/useSealed";
import { useInspector } from "../../store/useInspector";
import { useGame } from "../../store/useGame";

export default function PoolBuilder() {
  const pool = useSealed((s) => s.pool);
  const backToSession = useSealed((s) => s.backToSession);
  const saveAsDeck = useSealed((s) => s.saveAsDeck);
  const reset = useSealed((s) => s.reset);
  const openInspector = useInspector((s) => s.open);
  const refreshDecks = useGame((s) => s.refreshDecks);
  const setScreen = useGame((s) => s.setScreen);

  const [deckName, setDeckName] = useState("Sealed pool");
  const [saved, setSaved] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, { card: (typeof pool)[number]["card"]; qty: number }>();
    for (const p of pool) {
      const existing = map.get(p.card.name);
      if (existing) existing.qty += 1;
      else map.set(p.card.name, { card: p.card, qty: 1 });
    }
    return Array.from(map.values()).sort((a, b) => a.card.name.localeCompare(b.card.name));
  }, [pool]);

  async function handleSave() {
    await saveAsDeck(deckName);
    await refreshDecks();
    setSaved(true);
  }

  if (saved) {
    return (
      <section>
        <div className="screen-head"><h2>Sealed Pool</h2></div>
        <div className="lobby-card" style={{ maxWidth: 480, margin: "0 auto" }}>
          <h3>Deck saved</h3>
          <p>"{deckName}" is saved and ready to use, just like any other deck.</p>
          <div className="actions">
            <button className="btn primary" onClick={() => setScreen("lobby")}>Go to Lobby</button>
            <button className="btn" onClick={reset}>Start a new sealed pool</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="screen-head">
        <h2>Build your deck</h2>
        <span className="sub">{pool.length} cards in your pool — pick what goes in, then save</span>
      </div>

      <div className="sealed-pool-grid">
        {grouped.map(({ card, qty }) => (
          <div className="cardtile" key={card.id} onClick={() => openInspector(card)}>
            {card.image_small && <img src={card.image_small} alt={card.name} />}
            {qty > 1 && <span className="stackbadge">×{qty}</span>}
          </div>
        ))}
        {grouped.length === 0 && <p className="hint">Your pool is empty.</p>}
      </div>

      <div className="sealed-save-bar">
        <input type="text" value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder="Deck name" />
        <button className="btn" onClick={backToSession}>← Back to pool</button>
        <button className="btn primary" onClick={handleSave}>Save as deck</button>
      </div>
    </section>
  );
}
