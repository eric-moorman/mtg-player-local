import { useSealed } from "../../store/useSealed";
import SealedPoolList from "./SealedPoolList";
import PackOpenReveal from "./PackOpenReveal";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function SealedPacks() {
  const budget = useSealed((s) => s.budget);
  const spent = useSealed((s) => s.spent);
  const config = useSealed((s) => s.config);
  const allowedSets = useSealed((s) => s.allowedSets);
  const availableSets = useSealed((s) => s.availableSets);
  const openPack = useSealed((s) => s.openPack);

  const remaining = budget - spent;
  const setNames = new Map(availableSets.map((s) => [s.code, s.name]));

  return (
    <>
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
        </div>

        <SealedPoolList />
      </div>

      <PackOpenReveal />
    </>
  );
}
