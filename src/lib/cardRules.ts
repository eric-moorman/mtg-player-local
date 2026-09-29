import type { Permanent } from "./types";

export type Quadrant = "creatures" | "planeswalkers" | "lands" | "other";

export function getQuadrant(typeLine: string): Quadrant {
  const t = typeLine.toLowerCase();
  if (t.includes("land")) return "lands";
  if (t.includes("creature")) return "creatures";
  if (t.includes("planeswalker")) return "planeswalkers";
  return "other";
}

export interface PermanentStack {
  key: string;
  representative: Permanent;
  instances: Permanent[];
}

function counterSignature(counters: Record<string, number>): string {
  return Object.entries(counters)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => `${label}:${v}`)
    .join(",");
}

/** Identical cards in the identical state (same tap, same counters) collapse into one visual stack. */
export function groupPermanents(permanents: Permanent[]): PermanentStack[] {
  const groups = new Map<string, Permanent[]>();
  for (const p of permanents) {
    const key = `${p.name}|${p.tapped}|${counterSignature(p.counters)}`;
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  return Array.from(groups.entries()).map(([key, instances]) => ({
    key,
    representative: instances[0],
    instances,
  }));
}

/** Picks the one counter worth showing as a badge, favoring loyalty and +1/+1. */
export function primaryCounterBadge(counters: Record<string, number>): string | null {
  if (counters.loyalty != null) return String(counters.loyalty);
  if (counters["+1/+1"] != null) return (counters["+1/+1"] > 0 ? "+" : "") + counters["+1/+1"];
  const entries = Object.entries(counters);
  if (entries.length === 0) return null;
  const [label, value] = entries[0];
  return `${label} ${value}`;
}

export function groupByQuadrant(permanents: Permanent[]): Record<Quadrant, PermanentStack[]> {
  const buckets: Record<Quadrant, Permanent[]> = { creatures: [], planeswalkers: [], lands: [], other: [] };
  for (const p of permanents) buckets[getQuadrant(p.type_line)].push(p);
  return {
    creatures: groupPermanents(buckets.creatures),
    planeswalkers: groupPermanents(buckets.planeswalkers),
    lands: groupPermanents(buckets.lands),
    other: groupPermanents(buckets.other),
  };
}
