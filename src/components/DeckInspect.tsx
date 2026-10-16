import { useEffect, useMemo, useState } from "react";
import { buildDeckSections, computeDeckStats } from "../lib/deckStats";
import { effectivePrice } from "../lib/scryfall";
import { keywordTooltip } from "../lib/keywords";
import type { DeckEntry } from "../lib/deckStats";
import type { CardData } from "../lib/types";
import "./DeckInspect.css";

interface Props {
  name: string;
  entries: DeckEntry[];
  commanders?: string[];
  onClose: () => void;
}

/**
 * Full-deck visual overview: type sections, each laid out as overlapping columns
 * of equal mana value, with a preview pane and summary stats. Read-only on
 * purpose — it's for judging a deck's shape, while editing stays in the list.
 */
export default function DeckInspect({ name, entries, commanders = [], onClose }: Props) {
  const [preview, setPreview] = useState<CardData | null>(null);
  const [pinned, setPinned] = useState<CardData | null>(null);

  const sections = useMemo(() => buildDeckSections(entries, commanders), [entries, commanders]);
  const stats = useMemo(() => computeDeckStats(entries, commanders), [entries, commanders]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = preview ?? pinned ?? null;

  return (
    <div className="deckinspect-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="deckinspect">
        <header className="deckinspect-head">
          <div>
            <h3>{name || "Untitled deck"}</h3>
            <span className="deckinspect-sub">
              {stats.total} cards · {stats.lands} lands
              {stats.avgMana != null && <> · avg mana value {stats.avgMana.toFixed(2)}</>}
              {stats.total > 0 && <> · {stats.hasEstimatedPrice ? "≈" : ""}${stats.price.toFixed(2)}</>}
            </span>
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </header>

        <div className="deckinspect-body">
          <div className="deckinspect-board">
            {sections.length === 0 && <p className="hint">This deck is empty — add some cards first.</p>}
            {sections.map((section) => (
              <section key={section.group} className="deckinspect-section">
                <h4>
                  {section.group} <span className="deckinspect-count">({section.count})</span>
                </h4>
                <div className="deckinspect-columns">
                  {/* Index, not cmc: a tall stack wraps into several columns sharing one mana value. */}
                  {section.columns.map((column, ci) => (
                    <div className="deckinspect-column" key={`${column.cmc}-${ci}`}>
                      <span className="deckinspect-cmc" title={`Mana value ${column.cmc}`}>{column.cmc}</span>
                      <div className="deckinspect-stack" style={{ height: stackHeight(column.copies.length) }}>
                        {column.copies.map((card, i) => (
                          <button
                            type="button"
                            key={`${card.id}-${i}`}
                            className={"deckinspect-cardslot" + (pinned?.id === card.id ? " pinned" : "")}
                            style={{ top: i * SLOT_OFFSET }}
                            onMouseEnter={() => setPreview(card)}
                            onMouseLeave={() => setPreview(null)}
                            onFocus={() => setPreview(card)}
                            onBlur={() => setPreview(null)}
                            onClick={() => setPinned(card)}
                            title={`${card.name}${card.mana_cost ? ` ${card.mana_cost}` : ""}`}
                          >
                            {card.image_small ? (
                              <img src={card.image_small} alt={card.name} loading="lazy" />
                            ) : (
                              <span className="deckinspect-noart">{card.name}</span>
                            )}
                            {/* Sits over the art's own title bar so a stacked card is still identifiable. */}
                            <span className="deckinspect-cardname">{card.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="deckinspect-side">
            <div className="deckinspect-preview">
              {shown ? (
                <>
                  {shown.image_large ? (
                    <img src={shown.image_large} alt={shown.name} />
                  ) : (
                    <div className="deckinspect-noart big">{shown.name}</div>
                  )}
                  <div className="deckinspect-previewmeta">
                    <strong>{shown.name}</strong>
                    <span>{shown.type_line}</span>
                    {shown.oracle_text && <p>{shown.oracle_text}</p>}
                    {shown.keywords.length > 0 && (
                      <div className="inspect-keywords">
                        {shown.keywords.map((k) => (
                          <span key={k} className="kw-chip" title={keywordTooltip(k) ?? k}>{k}</span>
                        ))}
                      </div>
                    )}
                    <span className="deckinspect-previewprice">
                      {shown.price_usd == null ? "≈" : ""}${effectivePrice(shown).toFixed(2)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="hint">Hover a card to preview it here; click to keep it.</p>
              )}
            </div>

            <DeckStatsPanel stats={stats} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Vertical offset between stacked copies — enough to leave each card's title bar readable. */
const SLOT_OFFSET = 34;
const SLOT_HEIGHT = 170;

function stackHeight(copies: number): number {
  return copies > 0 ? (copies - 1) * SLOT_OFFSET + SLOT_HEIGHT : SLOT_HEIGHT;
}

function DeckStatsPanel({ stats }: { stats: ReturnType<typeof computeDeckStats> }) {
  const curveMax = Math.max(1, ...stats.curve.map((b) => b.count));
  const typeMax = Math.max(1, ...stats.types.map((t) => t.count));

  return (
    <div className="deckinspect-stats">
      <h4>Mana curve</h4>
      {stats.nonLands === 0 ? (
        <p className="hint">No nonland cards yet.</p>
      ) : (
        <>
          {/* One series, so one hue and no legend; the count sits above each of the
              eight bars rather than behind a y-axis, which would cost more ink than it saves. */}
          <div className="curve" role="img" aria-label={"Mana curve: " + stats.curve.map((b) => `${b.label} mana, ${b.count} cards`).join("; ")}>
            {stats.curve.map((bucket) => (
              <div className="curve-col" key={bucket.label} title={`${bucket.count} card${bucket.count === 1 ? "" : "s"} at mana value ${bucket.label}`}>
                <span className="curve-n">{bucket.count || ""}</span>
                <div className="curve-bar" style={{ height: `${(bucket.count / curveMax) * 100}%` }} />
                <span className="curve-x">{bucket.label}</span>
              </div>
            ))}
          </div>
          <p className="hint curve-note">Nonland cards by mana value. Lands are excluded.</p>
        </>
      )}

      <h4>Card types</h4>
      <ul className="deckinspect-bars">
        {stats.types.map((t) => (
          <li key={t.group}>
            <span className="b-label">{t.group}</span>
            <span className="b-track"><span className="b-fill" style={{ width: `${(t.count / typeMax) * 100}%` }} /></span>
            <span className="b-n">{t.count}</span>
          </li>
        ))}
      </ul>

      {stats.colors.length > 0 && (
        <>
          <h4>Colors</h4>
          {/* Mana colors are semantic, not an arbitrary categorical palette, so they can't be
              re-picked for contrast — white mana must read as white. Each pip therefore carries
              its letter and a visible count, so color is never the only cue. */}
          <div className="deckinspect-colors">
            {stats.colors.map((c) => (
              <span className="deckinspect-color" key={c.key} title={`${c.label}: ${c.count}`}>
                <span className="pip" style={{ background: `var(--mana-${c.key})`, color: `var(--mana-${c.key}-ink)` }}>
                  {c.key.toUpperCase()}
                </span>
                <span className="deckinspect-colorn">{c.count}</span>
              </span>
            ))}
          </div>
          <p className="hint">A card with two colors counts under both.</p>
        </>
      )}
    </div>
  );
}
