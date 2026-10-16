import { useSealed } from "../../store/useSealed";
import SealedPoolList from "./SealedPoolList";
import PackOpenReveal from "./PackOpenReveal";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function SealedPacks() {
  const rules = useSealed((s) => s.rules);
  const spent = useSealed((s) => s.spent);
  const availableSets = useSealed((s) => s.availableSets);
  const openPack = useSealed((s) => s.openPack);

  if (!rules) return null;

  const remaining = rules.budget - spent;
  const canAfford = remaining >= rules.packPrice;
  const setNames = new Map(availableSets.map((s) => [s.code, s.name]));

  return (
    <>
      <div className="sealed-session-grid">
        <div className="sealed-session-col">
          <h3 className="sealed-subhead">Open a pack</h3>
          {!canAfford && (
            <p className="hint">
              Not enough left for another {formatPrice(rules.packPrice)} pack — sell something back, or head to Build Deck.
            </p>
          )}
          <div className="sealed-pack-buttons">
            {rules.allowedSets.map((code) => (
              <button
                key={code}
                className="btn sealed-pack-btn"
                onClick={() => openPack(code)}
                disabled={!canAfford}
                title={setNames.get(code)}
              >
                {setNames.get(code) ?? code.toUpperCase()}
                <span className="sealed-pack-price">{formatPrice(rules.packPrice)}</span>
              </button>
            ))}
          </div>
        </div>

        <SealedPoolList />
      </div>

      <PackOpenReveal />
    </>
  );
}
