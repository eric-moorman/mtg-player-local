import { useEffect } from "react";
import { useSealed } from "../../store/useSealed";
import type { RarityWeights } from "../../lib/types";

const RARITY_LABELS: { key: keyof RarityWeights; label: string }[] = [
  { key: "common", label: "Common" },
  { key: "uncommon", label: "Uncommon" },
  { key: "rare", label: "Rare" },
  { key: "mythic", label: "Mythic" },
];

export default function SealedSetup() {
  const budget = useSealed((s) => s.budget);
  const setBudget = useSealed((s) => s.setBudget);
  const config = useSealed((s) => s.config);
  const setConfig = useSealed((s) => s.setConfig);
  const setRarityWeight = useSealed((s) => s.setRarityWeight);
  const availableSets = useSealed((s) => s.availableSets);
  const loadAvailableSets = useSealed((s) => s.loadAvailableSets);
  const allowedSets = useSealed((s) => s.allowedSets);
  const toggleSet = useSealed((s) => s.toggleSet);
  const selectAllSets = useSealed((s) => s.selectAllSets);
  const clearAllSets = useSealed((s) => s.clearAllSets);
  const loadError = useSealed((s) => s.loadError);
  const startSession = useSealed((s) => s.startSession);

  useEffect(() => {
    loadAvailableSets();
  }, [loadAvailableSets]);

  return (
    <section>
      <div className="screen-head">
        <h2>Sealed Pool</h2>
        <span className="sub">Set a budget, pick your sets, open packs or buy cards directly, then build the best deck you can</span>
      </div>

      <div className="sealed-setup-grid">
        <div className="sealed-setup-col">
          <div className="filter-block">
            <label>Budget ($)</label>
            <input type="number" min={0} value={budget} onChange={(e) => setBudget(Number(e.target.value) || 0)} />
          </div>

          <div className="filter-block">
            <label>Pack config</label>
            <div className="sealed-pack-config">
              <label className="sealed-config-row">
                <span>Cards per pack</span>
                <input
                  type="number" min={1} max={30} value={config.cardsPerPack}
                  onChange={(e) => setConfig({ cardsPerPack: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
              <label className="sealed-config-row">
                <span>Price per pack ($)</span>
                <input
                  type="number" min={0} step="0.5" value={config.packPrice}
                  onChange={(e) => setConfig({ packPrice: Math.max(0, Number(e.target.value) || 0) })}
                />
              </label>
              {RARITY_LABELS.map(({ key, label }) => (
                <label className="sealed-config-row" key={key}>
                  <span>{label} weight</span>
                  <input
                    type="number" min={0} value={config.rarityWeights[key]}
                    onChange={(e) => setRarityWeight(key, Math.max(0, Number(e.target.value) || 0))}
                  />
                </label>
              ))}
              <p className="hint">
                Weights are relative odds per card slot (not real booster slot rules, which Scryfall doesn't expose) — e.g. common
                60 vs mythic 3 means a mythic is roughly 20x rarer per card.
              </p>
            </div>
          </div>
        </div>

        <div className="sealed-setup-col sealed-sets-col">
          <div className="sealed-sets-head">
            <label>Allowed sets ({allowedSets.length} selected)</label>
            <div className="sealed-sets-bulk">
              <button className="btn" onClick={selectAllSets} disabled={availableSets.length === 0}>Select all</button>
              <button className="btn" onClick={clearAllSets} disabled={allowedSets.length === 0}>Clear</button>
            </div>
          </div>
          <div className="sealed-set-list">
            {availableSets.length === 0 && <p className="hint">Loading sets from Scryfall…</p>}
            {availableSets.map((s) => (
              <label key={s.code} className="sealed-set-row">
                <input type="checkbox" checked={allowedSets.includes(s.code)} onChange={() => toggleSet(s.code)} />
                <span className="sealed-set-name">{s.name}</span>
                <span className="sealed-set-meta">{s.code.toUpperCase()} · {s.released_at.slice(0, 4)}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {loadError && <p className="report-error">{loadError}</p>}

      <button className="btn primary" onClick={startSession}>Start sealed pool</button>
    </section>
  );
}
