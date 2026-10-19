import { useEffect } from "react";
import { useSealed } from "../../store/useSealed";
import { useAuth } from "../../store/useAuth";
import type { RarityWeights } from "../../lib/types";

const RARITY_LABELS: { key: keyof RarityWeights; label: string }[] = [
  { key: "common", label: "Common" },
  { key: "uncommon", label: "Uncommon" },
  { key: "rare", label: "Rare" },
  { key: "mythic", label: "Mythic" },
];

export default function SealedSetup() {
  const draftName = useSealed((s) => s.draftName);
  const setDraftName = useSealed((s) => s.setDraftName);
  const draftBudget = useSealed((s) => s.draftBudget);
  const setDraftBudget = useSealed((s) => s.setDraftBudget);
  const draftInvites = useSealed((s) => s.draftInvites);
  const setDraftInvites = useSealed((s) => s.setDraftInvites);
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
  const createGame = useSealed((s) => s.createGame);
  const cancelSetup = useSealed((s) => s.cancelSetup);
  const user = useAuth((s) => s.user);

  useEffect(() => {
    loadAvailableSets();
  }, [loadAvailableSets]);

  return (
    <section data-tour="sealed-main">
      <div className="screen-head">
        <h2>New pool game</h2>
        <span className="sub">These rules are locked in when the game starts, and everyone you invite plays by exactly the same ones</span>
      </div>

      <div className="sealed-setup-grid">
        <div className="sealed-setup-col">
          <div className="filter-block">
            <label htmlFor="poolgame-name">Game name</label>
            <input
              id="poolgame-name"
              type="text"
              placeholder="Friday night sealed"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
          </div>

          <div className="filter-block">
            <label htmlFor="poolgame-budget">Budget ($)</label>
            <input
              id="poolgame-budget"
              type="number"
              min={0}
              value={draftBudget}
              onChange={(e) => setDraftBudget(Number(e.target.value) || 0)}
            />
          </div>

          <div className="filter-block">
            <label htmlFor="poolgame-invites">Invite players</label>
            <input
              id="poolgame-invites"
              type="text"
              placeholder="username, another_user"
              value={draftInvites}
              onChange={(e) => setDraftInvites(e.target.value)}
            />
            <p className="hint">
              Their Kitchen Table usernames, separated by commas. Each one gets their own budget and their own packs under
              these same rules — you'll all see each other's spending and card counts, but never each other's cards.
              {user && <> You're playing as <b>{user.username}</b>.</>}
            </p>
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
              <label className="sealed-config-row">
                <span>Pack sell-back (%)</span>
                <input
                  type="number" min={0} max={100} step={5}
                  value={Math.round(config.sellBackRate * 100)}
                  onChange={(e) => setConfig({ sellBackRate: Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100)) })}
                />
              </label>
              <p className="hint">
                What selling a <b>pack pull</b> back pays, as a share of its market price. Anything near 100% makes packs a
                money printer — a typical ${config.packPrice.toFixed(2)} pack holds more than that in singles, so you could
                open and liquidate forever. 50% is the usual card-shop spread and keeps the budget meaningful. Cards you
                buy individually always refund in full, so a purchase is yours to undo.
              </p>
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
            <label>Pack sets ({allowedSets.length} selected)</label>
            <div className="sealed-sets-bulk">
              <button className="btn" onClick={selectAllSets} disabled={availableSets.length === 0}>Select all</button>
              <button className="btn" onClick={clearAllSets} disabled={allowedSets.length === 0}>Clear</button>
            </div>
          </div>
          <p className="hint sealed-sets-note">
            Which sets your packs come from. Buying singles isn't limited to these — the Buy Cards tab sells any card in
            paper Magic, including ones that only ever appeared in Commander decks.
          </p>
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

      <div className="actions">
        <button className="btn primary" onClick={createGame}>Start pool game</button>
        <button className="btn" onClick={cancelSetup}>Cancel</button>
      </div>
    </section>
  );
}
