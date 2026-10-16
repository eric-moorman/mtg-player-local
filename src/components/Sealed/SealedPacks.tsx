import { useMemo, useState } from "react";
import { useSealed } from "../../store/useSealed";
import SealedPoolList from "./SealedPoolList";
import PackOpenReveal from "./PackOpenReveal";

function formatPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

/** Above this many allowed sets, the button wall needs a filter box to be usable. */
const FILTER_THRESHOLD = 12;
/** Hard cap on buttons rendered at once; a game can allow every set in Magic's history. */
const MAX_VISIBLE = 60;

export default function SealedPacks() {
  const rules = useSealed((s) => s.rules);
  const spent = useSealed((s) => s.spent);
  const availableSets = useSealed((s) => s.availableSets);
  const openPack = useSealed((s) => s.openPack);
  const loadingSets = useSealed((s) => s.loadingSets);
  const setPools = useSealed((s) => s.setPools);
  const packError = useSealed((s) => s.packError);

  const [filter, setFilter] = useState("");

  const setNames = useMemo(() => new Map(availableSets.map((s) => [s.code, s.name])), [availableSets]);

  const allowed = rules?.allowedSets ?? [];
  const showFilter = allowed.length > FILTER_THRESHOLD;

  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allowed;
    return allowed.filter((code) => code.toLowerCase().includes(q) || (setNames.get(code) ?? "").toLowerCase().includes(q));
  }, [allowed, filter, setNames]);

  if (!rules) return null;

  const remaining = rules.budget - spent;
  const canAfford = remaining >= rules.packPrice;
  const visible = matches.slice(0, MAX_VISIBLE);
  const hidden = matches.length - visible.length;

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
          {packError && <p className="report-error">{packError}</p>}

          {showFilter && (
            <div className="sealed-set-filter">
              <input
                type="text"
                placeholder={`Search ${allowed.length} sets…`}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filter sets"
              />
              {filter && <button className="btn" onClick={() => setFilter("")}>Clear</button>}
            </div>
          )}

          <div className="sealed-pack-buttons">
            {visible.map((code) => {
              const loading = loadingSets[code];
              return (
                <button
                  key={code}
                  className="btn sealed-pack-btn"
                  onClick={() => openPack(code)}
                  disabled={!canAfford || loading}
                  title={setNames.get(code)}
                >
                  {setNames.get(code) ?? code.toUpperCase()}
                  <span className="sealed-pack-price">
                    {loading ? "Loading set…" : formatPrice(rules.packPrice)}
                    {/* The first pack from a set downloads it; after that it's cached locally. */}
                    {!loading && !setPools[code] && <span className="sealed-pack-firstload" title="First pack from this set loads it from Scryfall"> ·&nbsp;↓</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {matches.length === 0 && <p className="hint">No sets match "{filter}".</p>}
          {hidden > 0 && (
            <p className="hint">
              Showing {visible.length} of {matches.length} sets — {showFilter ? "search above to narrow it down." : "refine your filter."}
            </p>
          )}
        </div>

        <SealedPoolList />
      </div>

      <PackOpenReveal />
    </>
  );
}
