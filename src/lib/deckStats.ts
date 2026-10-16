/**
 * Grouping and summary statistics for a decklist, for the deck inspector.
 *
 * Purely derived from the Scryfall `type_line`/`cmc`/`colors` already cached on
 * each card — no new card-specific knowledge, consistent with the app never
 * knowing what an individual card *does*.
 */
import { effectivePrice } from "./scryfall";
import type { CardData } from "./types";

export interface DeckEntry {
  card: CardData;
  qty: number;
}

export const DECK_GROUPS = [
  "Commanders",
  "Creatures",
  "Planeswalkers",
  "Instants",
  "Sorceries",
  "Artifacts",
  "Enchantments",
  "Battles",
  "Lands",
  "Other",
] as const;
export type DeckGroup = (typeof DECK_GROUPS)[number];

/**
 * First match wins, and the order encodes real precedence rather than taste:
 * an Artifact Creature is a creature to a player, and an Artifact Land is a land.
 * "Commanders" is never returned here — it's assigned by name by the caller,
 * since being a commander is a property of the deck, not of the card.
 */
export function deckGroupOf(card: CardData): DeckGroup {
  const t = card.type_line.toLowerCase();
  if (t.includes("land")) return "Lands";
  if (t.includes("creature")) return "Creatures";
  if (t.includes("planeswalker")) return "Planeswalkers";
  if (t.includes("battle")) return "Battles";
  if (t.includes("instant")) return "Instants";
  if (t.includes("sorcery")) return "Sorceries";
  if (t.includes("artifact")) return "Artifacts";
  if (t.includes("enchantment")) return "Enchantments";
  return "Other";
}

export interface ManaColumn {
  /** Mana value shared by every card in this column. */
  cmc: number;
  /** One item per physical copy, so a playset reads as four stacked cards. */
  copies: CardData[];
}

/**
 * A stack taller than this wraps into another column of the same mana value.
 * Without it, the zero-cost column in a land-heavy limited deck becomes one
 * 700px tower beside a screen of empty space.
 */
export const MAX_STACK = 7;

export interface DeckSection {
  group: DeckGroup;
  count: number;
  columns: ManaColumn[];
}

/**
 * Splits a decklist into type sections, each laid out as columns of equal mana
 * value — the arrangement a paper player uses to eyeball a curve, and what the
 * Forge deck view shows.
 */
export function buildDeckSections(entries: DeckEntry[], commanderNames: string[] = []): DeckSection[] {
  const commanders = new Set(commanderNames.map((n) => n.toLowerCase()));
  const byGroup = new Map<DeckGroup, DeckEntry[]>();
  for (const entry of entries) {
    if (entry.qty <= 0) continue;
    const group = commanders.has(entry.card.name.toLowerCase()) ? "Commanders" : deckGroupOf(entry.card);
    const list = byGroup.get(group);
    if (list) list.push(entry);
    else byGroup.set(group, [entry]);
  }

  const sections: DeckSection[] = [];
  for (const group of DECK_GROUPS) {
    const groupEntries = byGroup.get(group);
    if (!groupEntries) continue;

    // Keep each card's copies together as a run, so wrapping never strands the
    // fourth copy of a playset alone in the next column.
    const runs = new Map<number, DeckEntry[]>();
    for (const entry of groupEntries) {
      const cmc = Math.max(0, Math.round(entry.card.cmc));
      const list = runs.get(cmc);
      if (list) list.push(entry);
      else runs.set(cmc, [entry]);
    }

    const laidOut: ManaColumn[] = [];
    for (const [cmc, cmcRuns] of Array.from(runs.entries()).sort(([a], [b]) => a - b)) {
      cmcRuns.sort((a, b) => a.card.name.localeCompare(b.card.name));
      let current: CardData[] = [];
      const flush = () => {
        if (current.length) laidOut.push({ cmc, copies: current });
        current = [];
      };
      for (const run of cmcRuns) {
        // A run longer than a whole column has to be split; it's the only case that can.
        if (run.qty > MAX_STACK) {
          flush();
          for (let i = 0; i < run.qty; i += MAX_STACK) {
            laidOut.push({ cmc, copies: Array.from({ length: Math.min(MAX_STACK, run.qty - i) }, () => run.card) });
          }
          continue;
        }
        if (current.length + run.qty > MAX_STACK) flush();
        for (let i = 0; i < run.qty; i++) current.push(run.card);
      }
      flush();
    }

    sections.push({
      group,
      count: groupEntries.reduce((sum, e) => sum + e.qty, 0),
      columns: laidOut,
    });
  }
  return sections;
}

/** Highest curve bucket; anything costlier is folded into it as "7+". */
const CURVE_CAP = 7;

export interface CurveBucket {
  label: string;
  count: number;
}

export interface ColorCount {
  /** w/u/b/r/g/c — matches the --mana-<key> CSS custom properties. */
  key: string;
  label: string;
  count: number;
}

export interface DeckStats {
  total: number;
  lands: number;
  nonLands: number;
  /** Average mana value of non-land cards; null when the deck is all lands (or empty). */
  avgMana: number | null;
  price: number;
  /** True when any card fell back to a rarity-estimated price, so the total shows as approximate. */
  hasEstimatedPrice: boolean;
  curve: CurveBucket[];
  types: { group: DeckGroup; count: number }[];
  colors: ColorCount[];
}

const COLOR_LABELS: { key: string; label: string; match: string }[] = [
  { key: "w", label: "White", match: "W" },
  { key: "u", label: "Blue", match: "U" },
  { key: "b", label: "Black", match: "B" },
  { key: "r", label: "Red", match: "R" },
  { key: "g", label: "Green", match: "G" },
];

export function computeDeckStats(entries: DeckEntry[], commanderNames: string[] = []): DeckStats {
  const sections = buildDeckSections(entries, commanderNames);
  const types = sections.map((s) => ({ group: s.group, count: s.count }));

  let total = 0;
  let lands = 0;
  let nonLands = 0;
  let cmcSum = 0;
  let price = 0;
  let hasEstimatedPrice = false;

  const curveCounts = new Array(CURVE_CAP + 1).fill(0) as number[];
  const colorCounts = new Map<string, number>();
  let colorless = 0;

  for (const { card, qty } of entries) {
    if (qty <= 0) continue;
    total += qty;
    price += effectivePrice(card) * qty;
    if (card.price_usd == null) hasEstimatedPrice = true;

    const isLand = deckGroupOf(card) === "Lands";
    if (isLand) {
      lands += qty;
    } else {
      // Lands sit outside the curve and the average: they have no meaningful cost to pay.
      nonLands += qty;
      cmcSum += Math.max(0, card.cmc) * qty;
      curveCounts[Math.min(CURVE_CAP, Math.max(0, Math.round(card.cmc)))] += qty;
    }

    // A multicolor card counts once under each of its colors, so the totals here
    // intentionally exceed the deck size — this answers "how much blue am I playing",
    // not "how do the cards partition".
    const colors = card.colors ?? [];
    if (colors.length === 0) {
      if (!isLand) colorless += qty;
    } else {
      for (const c of colors) colorCounts.set(c, (colorCounts.get(c) ?? 0) + qty);
    }
  }

  const curve: CurveBucket[] = curveCounts.map((count, i) => ({
    label: i === CURVE_CAP ? `${CURVE_CAP}+` : String(i),
    count,
  }));

  const colors: ColorCount[] = COLOR_LABELS.filter(({ match }) => (colorCounts.get(match) ?? 0) > 0).map(({ key, label, match }) => ({
    key,
    label,
    count: colorCounts.get(match) ?? 0,
  }));
  if (colorless > 0) colors.push({ key: "c", label: "Colorless", count: colorless });

  return {
    total,
    lands,
    nonLands,
    avgMana: nonLands > 0 ? cmcSum / nonLands : null,
    price,
    hasEstimatedPrice,
    curve,
    types,
    colors,
  };
}
