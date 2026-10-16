import { useMemo, useState } from "react";
import { useSealed } from "../../store/useSealed";
import { useInspector } from "../../store/useInspector";
import { useGame } from "../../store/useGame";
import { effectivePrice, BASIC_LAND_NAMES, BASIC_LAND_MANA } from "../../lib/scryfall";
import type { CardData } from "../../lib/types";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function PoolBuilder() {
  const game = useSealed((s) => s.game);
  const pool = useSealed((s) => s.pool);
  const deckSelections = useSealed((s) => s.deckSelections);
  const addToDeck = useSealed((s) => s.addToDeck);
  const removeFromDeck = useSealed((s) => s.removeFromDeck);
  const commanders = useSealed((s) => s.commanders);
  const toggleCommander = useSealed((s) => s.toggleCommander);
  const addBasicLands = useSealed((s) => s.addBasicLands);
  const setActiveTab = useSealed((s) => s.setActiveTab);
  const finishGame = useSealed((s) => s.finishGame);
  const finished = useSealed((s) => s.finished);
  const finishedDeckName = useSealed((s) => s.finishedDeckName);
  const closeGame = useSealed((s) => s.closeGame);
  const openInspector = useInspector((s) => s.open);
  const refreshDecks = useGame((s) => s.refreshDecks);
  const setScreen = useGame((s) => s.setScreen);

  const [deckName, setDeckName] = useState(() => game?.name ?? "Sealed pool");
  const [finishing, setFinishing] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [basicQty, setBasicQty] = useState(8);
  const [addingBasic, setAddingBasic] = useState<string | null>(null);

  async function handleAddBasic(name: string) {
    setAddingBasic(name);
    await addBasicLands(name, basicQty);
    setAddingBasic(null);
  }

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

  async function handleFinish() {
    setFinishing(true);
    await finishGame(deckName);
    await refreshDecks();
    setFinishing(false);
    setConfirmFinish(false);
  }

  if (finished) {
    return (
      <div className="lobby-card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <h3>Pool game complete</h3>
        <p>
          "{finishedDeckName ?? deckName}" is saved and ready to use, just like any other deck. Your pool is still here if
          you want to look back at what you opened.
        </p>
        <div className="actions">
          <button className="btn primary" onClick={() => setScreen("lobby")}>Go to Lobby</button>
          <button className="btn" onClick={() => setScreen("deckbuilder")}>Open in Deck Builder</button>
          <button className="btn" onClick={closeGame}>← All pool games</button>
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
        <div className="filter-block">
          <label>Add basic lands (free)</label>
          <div className="basic-land-row">
            <input
              type="number" min={1} max={40} value={basicQty}
              onChange={(e) => setBasicQty(Math.max(1, Number(e.target.value) || 1))}
              aria-label="Quantity to add"
            />
            <div className="pips">
              {BASIC_LAND_NAMES.map((n) => (
                <button
                  key={n}
                  className="pip"
                  style={{ background: `var(--mana-${BASIC_LAND_MANA[n]})`, color: `var(--mana-${BASIC_LAND_MANA[n]}-ink)` }}
                  onClick={() => handleAddBasic(n)}
                  disabled={addingBasic === n}
                  title={`Add ${basicQty} ${n} to your pool, free`}
                >
                  {addingBasic === n ? "…" : BASIC_LAND_MANA[n].toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="decklist">
          <input className="deck-name-input" value={deckName} onChange={(e) => setDeckName(e.target.value)} />
          <div className="count">{totalInDeck} cards</div>
          {commanders.length > 0 ? (
            <div className="commander-summary">
              {commanders.length === 1 ? "Commander: " : "Commanders: "}
              {commanders.join(" & ")}
            </div>
          ) : (
            totalInDeck > 0 && (
              <p className="hint commander-hint">Click a card's crown (♛) to set it as your commander — up to two, for Partner pairs.</p>
            )
          )}
          <ul>
            {Object.entries(deckSelections).filter(([, qty]) => qty > 0).sort(([a], [b]) => a.localeCompare(b)).map(([name, qty]) => {
              const found = poolByName.get(name)?.card;
              const isCommander = commanders.some((c) => c.toLowerCase() === name.toLowerCase());
              const commanderDisabled = !isCommander && commanders.length >= 2;
              return (
                <li key={name}>
                  <button
                    className={"crown-btn" + (isCommander ? " active" : "")}
                    onClick={() => toggleCommander(name)}
                    disabled={commanderDisabled}
                    title={isCommander ? "Unset as commander" : commanderDisabled ? "Only up to two commanders" : "Set as commander"}
                  >
                    ♛
                  </button>
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

          {/* Finishing ends the game, so it asks once rather than firing straight off a single click. */}
          {confirmFinish ? (
            <div className="poolgame-finish-confirm">
              <p className="hint">
                This ends "{game?.name}" and saves these {totalInDeck} cards as a deck. You won't be able to open more packs
                in this game afterwards.
              </p>
              <div className="actions">
                <button className="btn primary" onClick={handleFinish} disabled={finishing}>
                  {finishing ? "Saving…" : "Finish & save deck"}
                </button>
                <button className="btn" onClick={() => setConfirmFinish(false)} disabled={finishing}>Keep building</button>
              </div>
            </div>
          ) : (
            <div className="actions">
              <button className="btn" onClick={() => setActiveTab("packs")}>← Open Packs / Buy</button>
              <button className="btn primary" onClick={() => setConfirmFinish(true)} disabled={totalInDeck === 0}>
                Finish & save deck
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
