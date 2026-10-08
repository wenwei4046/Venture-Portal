import type { MemberBand } from "@/lib/member/types";

/**
 * A brand's margin ladder, read straight off `comm_margin_bands` — never a
 * constant. The prototype drew Akemi's ladder (43 / 36 / 33 / 27 / 25 / 24);
 * Dunlopillo and Zanotti climb at 36 / 33 and have one reference row, so each
 * brand's rows, ranges and bar come from its own bands.
 *
 * How a margin finds its row is the run's rule (`bandFor`): a penalty when the
 * margin is at or under its threshold, the most severe one winning; otherwise
 * the highest incentive or reference reached. A margin under every reference
 * but above every penalty reads as the LOWEST reference — the prototype's
 * "Low margin 27 – 33%" — because nothing between them changes the pay.
 */

export type Tone = "good" | "neutral" | "warn" | "bad" | "none";

export interface LadderRow {
  label: string;
  /** `Incentive Tier 1` → `Tier 1`: what a small card has room for. */
  short: string;
  kind: MemberBand["kind"];
  /** The band's own threshold, %. */
  threshold: number;
  range: string;
  effect: string;
  /** Palette variable of the row's dot. */
  dot: string;
  tone: Tone;
  multiplier: number;
  /** Monthly incentive the band pays, RM (0 for references and penalties). */
  amount: number;
}

export interface Ladder {
  /** Top (highest incentive) to bottom (most severe penalty). */
  rows: LadderRow[];
  /** Incentive thresholds, lowest first — the bar's T1, T2 … */
  incentives: { label: string; threshold: number }[];
  /** The margin bar: coloured zones on a 20–48% scale, and the incentive markers. */
  zones: { flex: number; color: string }[];
  markers: { left: string; label: string; color: string }[];
}

const SCALE_MIN = 20;
const SCALE_MAX = 48;
const EPS = 1e-9;

/** `36` for 36, `33.5` for 33.5. */
export function pctText(n: number): string {
  return Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n)) : (Math.round(n * 10) / 10).toFixed(1);
}

/** Where a margin sits on the bar, as a CSS left: 20% → 2%, 48% → 98%. */
export function barPos(margin: number): string {
  return Math.max(2, Math.min(98, ((margin - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100)).toFixed(1) + "%";
}

export const shortTier = (label: string) => label.replace(/^incentive\s+/i, "");

export const TONES: Record<Tone, { bg: string; ink: string }> = {
  good: { bg: "var(--rv-green-bg)", ink: "var(--rv-green)" },
  neutral: { bg: "var(--rv-neutral-bg)", ink: "var(--rv-ink)" },
  warn: { bg: "var(--rv-amber-bg)", ink: "var(--rv-amber)" },
  bad: { bg: "var(--rv-red-bg)", ink: "var(--rv-red)" },
  none: { bg: "var(--rv-none-bg)", ink: "var(--rv-sub)" },
};

function multiplierText(m: number): string {
  return m === 0 ? "No commission" : `Commission × ${String(Math.round(m * 100) / 100)}`;
}

export function brandLadder(bands: readonly MemberBand[]): Ladder {
  const incentives = bands.filter(b => b.kind === "incentive").sort((a, b) => b.threshold - a.threshold);
  const references = bands.filter(b => b.kind === "reference").sort((a, b) => b.threshold - a.threshold);
  const penalties = bands.filter(b => b.kind === "penalty").sort((a, b) => b.threshold - a.threshold);
  const topPenalty = penalties[0]?.threshold ?? null;

  const rows: LadderRow[] = [];
  const upper = [...incentives, ...references];
  upper.forEach((band, i) => {
    const above = i === 0 ? null : upper[i - 1].threshold;
    const lowestRef = band.kind === "reference" && i === upper.length - 1;
    const lo = lowestRef && topPenalty !== null ? topPenalty : band.threshold;
    const isTop = band.kind === "incentive" && i === 0;
    rows.push({
      label: band.key,
      short: shortTier(band.key),
      kind: band.kind,
      threshold: band.threshold,
      range: above === null ? `${pctText(lo)}% +` : `${pctText(lo)} – ${pctText(above)}%`,
      effect: band.kind === "incentive"
        ? (isTop ? "Highest margin incentive" : "Margin incentive")
        : lowestRef ? "Normal commission · watch closely" : "Normal commission",
      dot: band.kind === "incentive" ? (isTop ? "var(--rv-tier-top)" : "var(--rv-tier-inc)") : lowestRef ? "var(--rv-gold)" : "var(--rv-tier-ref)",
      tone: band.kind === "incentive" ? "good" : lowestRef ? "warn" : "neutral",
      multiplier: band.multiplier ?? 1,
      amount: band.amount,
    });
  });
  penalties.forEach((band, i) => {
    const below = penalties[i + 1]?.threshold;
    const last = i === penalties.length - 1;
    rows.push({
      label: band.key,
      short: shortTier(band.key),
      kind: "penalty",
      threshold: band.threshold,
      range: below === undefined ? `${pctText(band.threshold)}% or lower` : `${pctText(below)} – ${pctText(band.threshold)}%`,
      effect: multiplierText(band.multiplier ?? 1),
      dot: last ? "var(--rv-red)" : i === 0 ? "var(--rv-tier-pen1)" : "var(--rv-tier-pen2)",
      tone: "bad",
      multiplier: band.multiplier ?? 1,
      amount: band.amount,
    });
  });

  const ascending = [...incentives].reverse();
  const zones: { flex: number; color: string }[] = [];
  const push = (from: number, to: number, color: string) => {
    const a = Math.max(SCALE_MIN, Math.min(SCALE_MAX, from));
    const b = Math.max(SCALE_MIN, Math.min(SCALE_MAX, to));
    if (b - a > EPS) zones.push({ flex: Math.round((b - a) * 100) / 100, color });
  };
  const lowestPenalty = penalties[penalties.length - 1]?.threshold;
  if (lowestPenalty !== undefined) push(SCALE_MIN, lowestPenalty, "var(--rv-zone-pen2)");
  if (lowestPenalty !== undefined && topPenalty !== null) push(lowestPenalty, topPenalty, "var(--rv-zone-pen1)");
  const refsAsc = [...references].reverse();
  refsAsc.forEach((band, i) => {
    const from = i === 0 && topPenalty !== null ? topPenalty : band.threshold;
    const to = refsAsc[i + 1]?.threshold ?? ascending[0]?.threshold ?? SCALE_MAX;
    push(from, to, i === 0 ? "var(--rv-zone-low)" : "var(--rv-zone-ref)");
  });
  ascending.forEach((band, i) => {
    const top = i === ascending.length - 1;
    push(band.threshold, ascending[i + 1]?.threshold ?? SCALE_MAX, top ? "var(--rv-tier-inc)" : "var(--rv-zone-inc)");
  });

  return {
    rows,
    incentives: ascending.map(b => ({ label: b.key, threshold: b.threshold })),
    zones,
    markers: ascending.map((b, i) => ({
      left: barPos(b.threshold),
      label: `T${i + 1} ${pctText(b.threshold)}%`,
      color: i === 0 ? "var(--rv-tier-top)" : "var(--rv-tier-deep)",
    })),
  };
}

/** The row a margin falls in on this ladder; null without a margin or a ladder. */
export function rowFor(margin: number | null, ladder: Ladder): LadderRow | null {
  if (margin === null || !ladder.rows.length) return null;
  const penalty = ladder.rows
    .filter(r => r.kind === "penalty" && margin <= r.threshold + EPS)
    .sort((a, b) => a.multiplier - b.multiplier || a.threshold - b.threshold)[0];
  if (penalty) return penalty;
  const reached = ladder.rows.filter(r => r.kind !== "penalty" && margin + EPS >= r.threshold).sort((a, b) => b.threshold - a.threshold)[0];
  if (reached) return reached;
  const references = ladder.rows.filter(r => r.kind === "reference");
  return references[references.length - 1] ?? ladder.rows.filter(r => r.kind !== "penalty").pop() ?? null;
}
