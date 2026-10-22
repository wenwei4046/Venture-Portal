import type { MemberBand, MemberMembership } from "@/lib/member/types";
import { brandLadder } from "../insight/ladder";
import { brandName } from "../insight/insight-model";
import { rm, rm2, shortDay } from "../format";

/**
 * Commission scheme — the Profile chip's sheet (no prototype sheet: built from
 * the person sheet's parts). What the member's place in the scheme is, and
 * each brand's margin ladder exactly as the scheme has it. Which parts of the
 * scheme a month actually pays is My income's to say, not this sheet's.
 */

export interface SchemeVM {
  name: string;
  ini: string;
  role: string;
  stats: { label: string; value: string }[];
  brands: { brand: string; rows: { label: string; sub: string; value: string }[] }[];
  note: string;
}

export function schemeVM(input: {
  name: string;
  ini: string;
  /** The title and rank the member holds here. */
  title: string;
  rank: string;
  /** The member's own membership — absent in a Principal's view of somebody (it would be the Principal's). */
  membership: MemberMembership | undefined;
  /** The rate when the membership cannot say it (a Principal's view: the engine's, once My income has read it). */
  rate?: number | null;
  /** A Principal viewing a Revenue Director (2026-10-23), whose membership this view does not hold. */
  director?: boolean;
  /** The fixed salary on the member's contract; null when none is set, undefined when this view cannot know it. */
  salary: number | null | undefined;
  bands: readonly MemberBand[];
  hidden: boolean;
}): SchemeVM {
  const m = input.membership;
  const since = m?.effective ? `${shortDay(m.effective)} ${m.effective.slice(0, 4)}` : "—";
  const salary = input.salary === undefined ? "—" : input.hidden ? "RM ••••"
    : input.salary === null ? "Not set" : input.salary === 0 ? "Commission only" : rm2(input.salary);
  // A director (2026-10-14) is paid their rung's rate on their own bills and nothing of the brands' ladders —
  // and in a sub-department where their title holds no rung, no rate at all. The same in the Principal's View as.
  const director = m ? !!m.director : !!input.director;
  const rate = director && !(m ? m.rank : input.rank) ? null : m ? m.rate : input.rate ?? null;
  const codes = director ? [] : [...new Set(input.bands.map(b => b.brand))].sort((a, b) => brandName(a).localeCompare(brandName(b)));
  return {
    name: input.name,
    ini: input.ini,
    role: [input.title, input.rank].filter(Boolean).join(" · ") || "Not on the scheme yet",
    stats: [
      { label: "Rate", value: rate === null ? "—" : `${(Math.round(rate * 1000) / 10).toFixed(1)}%` },
      { label: "Fixed salary", value: salary },
      { label: "Since", value: since },
    ],
    brands: codes.map(code => ({
      brand: brandName(code),
      rows: brandLadder(input.bands.filter(b => b.brand === code)).rows.map(r => ({
        label: r.label,
        sub: r.amount > 0 ? `${r.effect} · ${rm(r.amount)}` : r.effect,
        value: r.range,
      })),
    })),
    note: director
      ? "Your own bills pay at your rank's rate. Your fixed amount and incentive are on My income; your payslip confirms it."
      : "Margin is measured brand by brand. Which of these a month pays — and what you earned — is on My income; your payslip confirms it.",
  };
}
