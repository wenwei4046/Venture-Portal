import { arenaMonthFridays, arenaRankings, type MemberArenaSnapshot } from "./arena";
import type { ArenaHistorySnapshot } from "./arena-history";
import { championshipMonth, championshipStandings } from "./championship";

/**
 * My honours (user 2026-10-04): every finish counts — a member's place on the
 * month's Sales, Margin, KPI and Championship boards, total and by brand, and
 * on each week's fair board (the booth of their brand week). Joint places
 * count for everyone tied. Worked out from the Arena's own rankings, so a
 * finish can never disagree with the board it was taken from. A month the
 * portal closed is kept once it is final (`member_honours`); a month paid by
 * hand before the cutover is worked out afresh every time
 * (`loadMemberHonours`).
 */

export type HonourBoard = "Sales" | "Margin" | "KPI" | "Championship" | "Fair";

export interface HonourFinish {
  staffId: string;
  board: HonourBoard;
  title: string;
  sub: string;
  place: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const BRAND: Record<string, string> = { AKEMI: "Akemi", ERGOTEX: "Ergotex", DUNLOP: "Dunlopillo", ZANOTTI: "Zanotti" };
const brandName = (code: string) => BRAND[code] ?? code.charAt(0) + code.slice(1).toLowerCase();
/** `Sep 2026` for `2026-09`. */
export const honourMonth = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** Competition ranks (1, 2, 2, 4) of the people with a positive figure. */
function placed(rows: readonly { id: string; value: number }[]): Map<string, number> {
  const sorted = rows.filter(r => Number.isFinite(r.value) && r.value > 0).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const out = new Map<string, number>();
  let previous: number | null = null, position = 0;
  sorted.forEach((r, i) => {
    if (previous !== r.value) position = i + 1;
    previous = r.value;
    out.set(r.id, position);
  });
  return out;
}

/** Everybody's finishes of one final month. */
export function monthFinishes(input: {
  month: string;
  snapshot: MemberArenaSnapshot;
  history: ArenaHistorySnapshot | null;
  kpi: { enabled: boolean; threshold: number | null };
}): HonourFinish[] {
  const { month, snapshot, history, kpi } = input;
  const people = snapshot.people;
  const label = honourMonth(month);
  const out: HonourFinish[] = [];
  const board = (b: HonourBoard, title: string, ranked: readonly { id: string; position: number | null }[], sub = label) => {
    for (const r of ranked) if (r.position !== null) out.push({ staffId: r.id, board: b, title, sub, place: r.position });
  };

  board("Sales", "Total sales", arenaRankings(people, "sales"));
  board("Margin", "Total margin", arenaRankings(people, "margin"));
  if (kpi.enabled) board("KPI", "KPI items", arenaRankings(people, "kpi"));
  for (const { code } of snapshot.brands) {
    board("Sales", `Sales · ${brandName(code)}`, arenaRankings(people, "sales", code));
    board("Margin", `Margin · ${brandName(code)}`, arenaRankings(people, "margin", code));
  }
  const champ = championshipStandings([championshipMonth({
    month, people, brands: snapshot.brands.map(b => b.code), tiers: snapshot.tiers, history, kpi,
  })]);
  board("Championship", "Championship", champ.map(s => ({ id: s.id, position: s.position })));

  // The month's fair boards: each booth ranks everybody who sold there; a
  // member's finish is the booth of their brand week (one a week).
  const fridays = arenaMonthFridays(month);
  for (const event of history?.events ?? []) {
    const week = event.week ?? event.end;
    if (week.slice(0, 7) !== month) continue;
    const places = placed(event.people.map(p => ({ id: p.id, value: p.sales })));
    const n = fridays.indexOf(week);
    const sub = [n >= 0 ? `Week ${n + 1}` : null, event.brand ? brandName(event.brand) : null, label].filter(Boolean).join(" · ");
    for (const p of event.people) {
      const place = places.get(p.id);
      if (p.scoring === false || place === undefined) continue;
      out.push({ staffId: p.id, board: "Fair", title: `Fair · ${event.venue}`, sub, place });
    }
  }
  return out;
}
