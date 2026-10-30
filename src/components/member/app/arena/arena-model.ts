import { arenaIncentive, arenaRankings, type ArenaMetric, type ArenaPerson, type ArenaRankedPerson, type ArenaTier, type MemberArenaSnapshot } from "@/lib/member/arena";
import { arenaFairRecords, type ArenaHistorySnapshot } from "@/lib/member/arena-history";
import { CHAMP_ITEMS, type ChampItem, type ChampStanding } from "@/lib/member/championship";
import type { Board } from "../route";
import type { InsightPeriod } from "../insight/period";
import { dayRange, firstName, initials, monthName, ordinal, ordinalSuffix, rm } from "../format";

/**
 * Arena (RevenueApp.dc.html 666–885, sheets 1509–1529 / 1806–1863, script
 * 2087–2104, 2212–2290, 2400–2466, 2812–2900). Every place is the Arena's own
 * board (`arenaRankings` over `member_arena_snapshot`), every finish the booth
 * history (`member_arena_booth_history`), every point the Championship engine
 * (`lib/member/championship.ts`) — the screens only lay them out.
 */
export type ArenaSub = "total" | "brand" | "fair";
/** A board view of the design preview's fixture. */
export const arenaKey = (board: Board, kind: string, sub: ArenaSub, brand: string) => `${board}|${kind}|${sub}|${brand}`;
export type Medal = 0 | 1 | 2 | 3;

export const BOARD_LABEL: Record<Board, string> = { sales: "Sales", margin: "Margin", kpi: "KPI", champ: "Championship" };
export const BOARD_ICON: Record<Board, string> = {
  sales: "M4 20V10m5 10V4m5 16v-7m5 7V8M3 20h18",
  margin: "M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  kpi: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  champ: "M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3",
};
const BOARDS: Board[] = ["sales", "margin", "kpi", "champ"];
/** The prototype's brand order; a brand it does not know follows by name. */
const BRAND_ORDER = ["AKEMI", "ERGOTEX", "ZANOTTI", "DUNLOP"];
const BRAND_NAME: Record<string, string> = { AKEMI: "Akemi", ERGOTEX: "Ergotex", ZANOTTI: "Zanotti", DUNLOP: "Dunlopillo" };
export const brandLabel = (code: string, names?: Map<string, string>) => BRAND_NAME[code] ?? names?.get(code) ?? code;

/** `128 pts`, `161.5 pts` — points keep their quarters and halves. */
export function pts(n: number): string {
  return `${n.toLocaleString("en-MY", { maximumFractionDigits: 2 })} pts`;
}

const METRIC: Record<Exclude<Board, "champ">, ArenaMetric> = { sales: "sales", margin: "margin", kpi: "kpi" };

/** One board's value, the way the prototype writes it (`fmtV`). */
export function boardValue(board: Board, value: number | null, pending = false): string {
  if (pending) return "Cost pending";
  if (value === null) return board === "sales" ? "RM 0" : board === "kpi" ? "0 items" : board === "champ" ? "0 pts" : "—";
  return board === "sales" ? rm(value) : board === "margin" ? `${value.toFixed(1)}%` : board === "kpi" ? `${value} items` : pts(value);
}

/** The gap to somebody, in the board's own unit (`gapT`). */
function gap(board: Board, d: number): string {
  return board === "sales" ? rm(d) : board === "margin" ? `${d.toFixed(1)}% margin` : board === "kpi" ? `${d} KPI items` : pts(d);
}

/** One row of a board, ranked or not, in the order the list shows it. */
export interface BoardRow {
  id: string;
  name: string;
  self: boolean;
  position: number | null;
  value: number | null;
  pending: boolean;
  active: boolean;
}

function fromRankings(rows: ArenaRankedPerson[], board: Board): BoardRow[] {
  return rows.map(r => ({
    id: r.id, name: r.name, self: r.self, position: r.position,
    // Somebody with nothing on the board shows the board's zero, not a value.
    value: r.position === null ? null : r.value, pending: r.pending && (board === "margin"), active: r.hasActivity,
  }));
}

function fromStandings(standings: readonly ChampStanding[], selfId: string): BoardRow[] {
  return standings.map(s => ({ id: s.id, name: s.name, self: s.id === selfId, position: s.position, value: s.position === null ? null : s.total, pending: false, active: s.total > 0 }));
}

/** Placed first (by place, then name), then pending, then nobody yet. */
export function displayOrder(rows: readonly BoardRow[]): BoardRow[] {
  const rank = (r: BoardRow) => (r.position !== null ? 0 : r.pending ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

const EMPTY_CHASE: Record<Board, string> = {
  sales: "No counted sales yet", margin: "No costed sales yet", kpi: "No KPI items yet", champ: "No points yet",
};

/** The line under the hero: who is next above, or by how much the lead is (`chase`). */
export function chaseLine(board: Board, rows: readonly BoardRow[]): { line: string; aboveId: string | null } {
  const me = rows.find(r => r.self);
  if (!me || me.position === null || me.value === null) {
    return { line: me?.pending ? "Waiting for complete cost data" : EMPTY_CHASE[board], aboveId: null };
  }
  const placed = rows.filter(r => r.position !== null && r.value !== null);
  const above = placed.filter(r => r.value! > me.value!).sort((a, b) => a.value! - b.value!)[0];
  if (above) return { line: `${gap(board, above.value! - me.value!)} behind ${firstName(above.name)} (${ordinal(above.position!)})`, aboveId: above.id };
  const level = placed.find(r => r.id !== me.id && r.value === me.value);
  if (level) return { line: `Level with ${firstName(level.name)} at the top`, aboveId: null };
  const next = placed.filter(r => r.value! < me.value!).sort((a, b) => b.value! - a.value!)[0];
  return { line: next ? `You lead by ${gap(board, me.value! - next.value!)}` : "You lead", aboveId: null };
}

/**
 * `state` (2026-10-08): `ranked` shows the place; `unranked` (nothing on this board yet) says so in words — a giant
 * dash looked like a bar still loading; `loading` is a placeholder while the board is read. `lead` (2026-10-14): the
 * reader is on no board — a Revenue Director, above the ladder — so the place names who leads (`leader`, absent while
 * nobody is placed) and the value is theirs.
 */
export type HeroState = "ranked" | "unranked" | "loading" | "off" | "lead";
export interface RankHero { num: string; suf: string; count: number; value: string; chase: string; state: HeroState; leader?: string }
export interface PodiumItem { id: string; place: 1 | 2 | 3; ini: string; name: string; value: string }
export interface RankRowVM { id: string; pos: string; medal: Medal; ini: string; name: string; value: string; tag: "you" | "next" | null; mine: boolean; muted: boolean }

export interface ChampGroupVM { id: "sales" | "margin" | "kpi" | "record"; label: string; num: number; value: string }
export interface ChampPartVM { item: ChampItem; label: string; sub: string; group: ChampGroupVM["id"]; num: number; value: string }
export interface ChampBreakdown { groups: ChampGroupVM[]; parts: ChampPartVM[]; periodLabel: string; myValue: string; myPos: string; count: number }

export interface RankView {
  hero: RankHero;
  podium: PodiumItem[];
  listTitle: string;
  count: number;
  rows: RankRowVM[];
  champ: ChampBreakdown | null;
}

const medalOf = (position: number | null): Medal => (position !== null && position >= 1 && position <= 3 ? (position as Medal) : 0);

/** A director's hero: who leads, their figure, and by how much over the next. */
function leadHero(board: Board, ordered: readonly BoardRow[], count: number): RankHero {
  const placed = ordered.filter(r => r.position !== null && r.value !== null);
  const [first, second] = placed;
  if (!first) return { num: "", suf: "", count, value: "—", chase: EMPTY_CHASE[board], state: "lead" };
  const chase = !second ? `Only ${firstName(first.name)} is on the board`
    : second.value === first.value ? `Level with ${firstName(second.name)} at the top`
    : `${gap(board, first.value! - second.value!)} ahead of ${firstName(second.name)}`;
  return { num: "", suf: "", count, value: boardValue(board, first.value, first.pending), chase, state: "lead", leader: firstName(first.name) };
}

/**
 * Who leads a board this month and their figure, exactly as the hub's card names them for a reader on no board — so
 * Today's cards read the same (2026-10-26, the user: "跟 Arena 的 Hero Card 是一样的"). Championship's are its standings.
 */
export function arenaLead(board: Board, people: readonly ArenaPerson[], standings: readonly ChampStanding[] | null): { name: string; value: string } | null {
  const rows = board === "champ" ? (standings ? fromStandings(standings, "") : []) : fromRankings(arenaRankings(people, METRIC[board]), board);
  const hero = leadHero(board, displayOrder(rows), rows.length);
  return hero.leader ? { name: hero.leader, value: hero.value } : null;
}

function rankView(board: Board, rows: BoardRow[], count: number, director = false): RankView {
  const ordered = displayOrder(rows);
  const me = ordered.find(r => r.self);
  const { line, aboveId } = chaseLine(board, ordered);
  const top = ordered.filter(r => r.position !== null).slice(0, 3);
  const podium = [top[1], top[0], top[2]].filter((r): r is BoardRow => !!r).map(r => ({
    id: r.id, place: Math.min(3, r.position!) as 1 | 2 | 3, ini: initials(r.name),
    name: r.self ? "You" : firstName(r.name), value: boardValue(board, r.value, r.pending),
  }));
  return {
    hero: director ? leadHero(board, ordered, count) : {
      num: me?.position ? String(me.position) : "—",
      suf: me?.position ? ordinalSuffix(me.position) : "",
      count,
      value: me ? boardValue(board, me.value, me.pending) : "—",
      chase: line,
      state: me?.position ? "ranked" : "unranked",
    },
    podium,
    listTitle: board === "champ" ? "Standings" : "Full ranking",
    count,
    rows: ordered.map(r => ({
      id: r.id, pos: r.position === null ? "—" : String(r.position), medal: medalOf(r.position), ini: initials(r.name),
      name: r.name, value: boardValue(board, r.value, r.pending),
      tag: r.self ? "you" : r.id === aboveId ? "next" : null, mine: r.self, muted: r.value === null,
    })),
    champ: null,
  };
}

// ── Championship ─────────────────────────────────────────────────────────

const CHAMP_META: Record<ChampItem, { label: string; sub: string; group: ChampGroupVM["id"] }> = {
  salesByBrand: { label: "Sales by brand", sub: "Board of the brand you sold most", group: "sales" },
  fairResults: { label: "Fair results", sub: "Weekly fair finishes added up", group: "sales" },
  totalSales: { label: "Total sales", sub: "Monthly rank ladder", group: "sales" },
  marginByBrand: { label: "Margin by brand", sub: "Includes brand margin tier", group: "margin" },
  totalMargin: { label: "Total margin", sub: "Includes Incentive Tier", group: "margin" },
  kpi: { label: "KPI", sub: "Includes threshold award", group: "kpi" },
  record: { label: "Highest Fair Record", sub: "Monthly closing rank", group: "record" },
};
const CHAMP_GROUPS: { id: ChampGroupVM["id"]; label: string }[] = [
  { id: "sales", label: "Sales" }, { id: "margin", label: "Margin" }, { id: "kpi", label: "KPI" }, { id: "record", label: "Fair Record" },
];
const PERIOD_WORD = { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" } as const;

const pointsText = (n: number) => n.toLocaleString("en-MY", { maximumFractionDigits: 2 });

export function champBreakdown(standings: readonly ChampStanding[], selfId: string, period: InsightPeriod, kpiEnabled: boolean): ChampBreakdown {
  const me = standings.find(s => s.id === selfId);
  const parts: ChampPartVM[] = CHAMP_ITEMS.map(item => {
    const num = me?.parts[item] ?? 0;
    const meta = CHAMP_META[item];
    return { item, label: meta.label, sub: item === "kpi" && !kpiEnabled ? "Not counted this period" : meta.sub, group: meta.group, num, value: pts(num) };
  });
  const groups = CHAMP_GROUPS.map(g => {
    const num = Math.round(parts.filter(p => p.group === g.id).reduce((sum, p) => sum + p.num, 0) * 100) / 100;
    return { ...g, num, value: pointsText(num) };
  });
  return {
    groups, parts, periodLabel: PERIOD_WORD[period.kind],
    myValue: pts(me?.total ?? 0), myPos: me?.position ? ordinal(me.position) : "—", count: standings.length,
  };
}

// ── Fair results ─────────────────────────────────────────────────────────

export interface FairFinish { week: string; venue: string; brand: string | null; start: string; end: string; sales: number; position: number; of: number }
interface FairTally { id: string; name: string; self: boolean; g: number; s: number; b: number; fairs: FairFinish[]; position: number | null; joint: boolean }

/** Each person's finishes at the booth of their brand week, in the window's weeks. */
export function fairTallies(people: readonly Pick<ArenaPerson, "id" | "name" | "self">[], history: ArenaHistorySnapshot | null, from: string, through: string): FairTally[] {
  const finishes = new Map<string, FairFinish[]>();
  for (const event of history?.events ?? []) {
    const month = (event.week ?? event.end).slice(0, 7);
    if (month < from || month > through) continue;
    const ranked = event.people.filter(p => Number.isFinite(p.sales) && p.sales > 0)
      .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    let position = 0; let previous: number | null = null;
    ranked.forEach((p, i) => {
      if (previous !== p.sales) position = i + 1;
      previous = p.sales;
      // Only the booth of their brand week is theirs to count (2026-10-03).
      if (p.scoring === false) return;
      const list = finishes.get(p.id) ?? [];
      list.push({ week: event.week ?? event.end, venue: event.venue, brand: event.brand ?? null, start: event.start, end: event.end, sales: p.sales, position, of: ranked.length });
      finishes.set(p.id, list);
    });
  }
  const rows: FairTally[] = people.map(p => {
    const fairs = (finishes.get(p.id) ?? []).sort((a, b) => a.start.localeCompare(b.start) || a.venue.localeCompare(b.venue));
    const count = (n: number) => fairs.filter(f => f.position === n).length;
    return { id: p.id, name: p.name, self: p.self, g: count(1), s: count(2), b: count(3), fairs, position: null, joint: false };
  });
  const placed = rows.filter(r => r.fairs.length > 0).sort((a, b) => b.g - a.g || b.s - a.s || b.b - a.b || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  placed.forEach((r, i) => {
    const prev = placed[i - 1];
    r.position = prev && prev.g === r.g && prev.s === r.s && prev.b === r.b ? prev.position : i + 1;
  });
  for (const r of placed) r.joint = placed.filter(x => x.position === r.position).length > 1;
  return [...placed, ...rows.filter(r => r.fairs.length === 0).sort((a, b) => a.name.localeCompare(b.name))];
}

export interface FairMedalVM { n: 1 | 2 | 3; label: string; count: number }
export interface FairPodiumVM { id: string; medal: 1 | 2 | 3; place: string; joint: string; ini: string; name: string; g: number; s: number; b: number; big: boolean }
export interface FairRowVM { id: string; pos: string; medal: Medal; ini: string; name: string; sub: string; joint: boolean; g: number; s: number; b: number; mine: boolean }
export interface FairListItem { venue: string; dates: string; sales: string; finish: string; place: string; medal: Medal }
export interface FairView {
  /** The reader is on no board (2026-10-25): no fairs of their own to list. */
  lead?: boolean;
  hero: { num: string; suf: string; count: number; medals: FairMedalVM[]; chase: string; state: HeroState; leader?: string };
  podium: FairPodiumVM[];
  entrySub: string;
  chips: FairListItem[];
  tableTitle: string;
  rows: FairRowVM[];
  sheet: { countText: string; other: string; fairs: FairListItem[] };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function fairView(tallies: FairTally[], count: number, director = false): FairView {
  const placed = tallies.filter(t => t.position !== null);
  // A director is on no board: the hero is the leader's.
  const me = director ? placed[0] : tallies.find(t => t.self);
  const ahead = me?.position ? placed.filter(t => t.position! < me.position!).slice(-1)[0] : undefined;
  const two = (name: string) => firstName(name);
  let chase = "No completed fairs yet";
  if (director) {
    if (me) chase = `${two(me.name)} has the most fair wins`;
  } else if (me?.position) {
    if (!ahead) chase = "Most fair wins this period";
    else if (ahead.g > me.g) chase = `${ahead.g - me.g} more 1st place${ahead.g - me.g > 1 ? "s" : ""} to catch ${two(ahead.name)}`;
    else if (ahead.s > me.s) chase = `More 2nd places to pass ${two(ahead.name)}`;
    else chase = `More 3rd places to pass ${two(ahead.name)}`;
  }
  const top = placed.filter(t => t.position! <= 3);
  const untied = top.length === 3 && top.every(t => !t.joint);
  const order = untied ? [top[1], top[0], top[2]] : top;
  const finish = (f: FairFinish): FairListItem => ({
    venue: f.venue, dates: dayRange(f.start, f.end), sales: rm(f.sales), finish: `${ordinal(f.position)} of ${f.of}`,
    place: ordinal(f.position), medal: medalOf(f.position),
  });
  const mine = director ? [] : me?.fairs ?? [];
  const n = mine.length;
  return {
    ...(director ? { lead: true } : {}),
    hero: {
      num: !director && me?.position ? String(me.position) : director ? "" : "—", suf: !director && me?.position ? ordinalSuffix(me.position) : "", count,
      medals: [["1st", me?.g ?? 0], ["2nd", me?.s ?? 0], ["3rd", me?.b ?? 0]].map(([label, c], i) => ({ n: (i + 1) as 1 | 2 | 3, label: String(label), count: Number(c) })),
      chase,
      state: director ? "lead" : me?.position ? "ranked" : "unranked",
      ...(director && me ? { leader: two(me.name) } : {}),
    },
    podium: order.map(t => ({
      id: t.id, medal: Math.min(3, t.position!) as 1 | 2 | 3, place: ordinal(t.position!), joint: t.joint ? "Joint" : "",
      ini: initials(t.name), name: t.self ? "You" : two(t.name), g: t.g, s: t.s, b: t.b, big: t.position === 1,
    })),
    entrySub: `${plural(n, "fair")} · tap for venues, dates and sales`,
    // The card has room for a handful; the sheet lists them all.
    chips: mine.slice(-6).map(finish),
    tableTitle: "Finish count",
    rows: tallies.map(t => ({
      id: t.id, pos: t.position === null ? "—" : String(t.position), medal: medalOf(t.position), ini: initials(t.name),
      name: t.self ? `${t.name} (you)` : t.name,
      sub: t.position === null ? "No fairs" : t.joint ? `Joint ${ordinal(t.position)}` : `${t.fairs.length - t.g - t.s - t.b} × 4th or lower`,
      joint: t.joint, g: t.g, s: t.s, b: t.b, mine: t.self,
    })),
    sheet: { countText: plural(n, "fair"), other: director ? "" : `${n - (me?.g ?? 0) - (me?.s ?? 0) - (me?.b ?? 0)} finished 4th or lower`, fairs: mine.map(finish) },
  };
}

// ── the board ────────────────────────────────────────────────────────────

export interface BoardVM {
  board: Board;
  title: string;
  sub: ArenaSub;
  tabs: { id: ArenaSub; label: string }[];
  brands: { code: string; label: string }[];
  brand: string;
  rank: RankView | null;
  fair: FairView | null;
  foot: { title: string; sub: string } | null;
  basis: string;
}

export interface ArenaInput {
  board: Board;
  sub: ArenaSub;
  /** The brand chip picked (a code); empty = the first. */
  brand: string;
  period: InsightPeriod;
  /** The window's Arena (sales, margin, KPI): null while it loads. */
  snapshot: MemberArenaSnapshot | null;
  /** Every completed fair, booth by booth. */
  history: ArenaHistorySnapshot | null;
  /** The window's Championship: null while its months load. */
  standings: ChampStanding[] | null;
  selfId: string;
  subName: string;
  kpiEnabled: boolean;
  /** Everybody in the window is closed: the places will not move again. */
  final: boolean;
  /** The window's months still moving (the snapshot's `openMonths`). */
  openMonths: readonly string[];
  /** The current month, `YYYY-MM`. */
  current: string;
  /** The window's read failed: nothing is on its way, so nothing shows as loading. */
  failed?: boolean;
  /**
   * The reader is on no board — a Revenue Director (2026-10-14), or the Principal viewing nobody (2026-10-25) — so each
   * hero and each hub card names who leads, and nothing is "yours".
   */
  director?: boolean;
}

/** The scheme's brands, in the prototype's order. */
export function boardBrands(snapshot: MemberArenaSnapshot | null): { code: string; label: string }[] {
  const names = new Map((snapshot?.brands ?? []).map(b => [b.code, b.name]));
  return (snapshot?.brands ?? []).map(b => b.code)
    .sort((a, b) => (BRAND_ORDER.indexOf(a) + 99) % 99 - (BRAND_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b))
    .map(code => ({ code, label: brandLabel(code, names) }));
}

function basisText(input: ArenaInput, isFair: boolean): string {
  const { board, subName } = input;
  const base = isFair
    ? "Counts how often each person finished 1st, 2nd or 3rd in their own completed weekly fairs. Ranked by firsts, then seconds, then thirds. People with the same three counts share the place, and the next place is skipped."
    : board === "champ"
      ? "Championship adds seven contributions: Sales by brand, Fair results, Total sales, Margin by brand, Total margin, KPI and Highest Fair Record. It is a points total, not an average."
      : board === "kpi"
        ? input.kpiEnabled
          ? "All eligible KPI quantities together, including eligible giveaway items. Shows actual quantities; KPI points sit in Championship."
          : `KPI items are not counted in ${subName} for this period, so nobody is placed on this board.`
        : board === "margin"
          // Never how the cost is made up (user 2026-10-05: that leaks our numbers).
          ? "Margin uses commissionable goods revenue. Anyone with an uncosted bill stays pending until it is costed."
          : "Deposit-cleared, commissionable sales. Each order counts once, in its released commission month.";
  if (input.final) return base;
  // Until everybody on the boards is closed, a place is not final.
  const ended = input.openMonths.filter(m => m < input.current);
  const parts: string[] = [];
  if (ended.length) parts.push(`${listOf(ended.map(monthName))} ${ended.length === 1 ? "is" : "are"} still being closed`);
  if (input.period.through >= input.current) parts.push(`${monthName(input.current)} is still running`);
  return parts.length ? `${base} ${parts.join(" and ")}, so places can still move.` : base;
}

const listOf = (items: readonly string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] ?? "");

function footSub(person: ArenaPerson | undefined, tiers: readonly ArenaTier[], period: InsightPeriod, names: Map<string, string>): string {
  if (period.kind !== "monthly") return "Paid month by month · see Insight";
  if (!person) return "No costed sales yet";
  const inc = arenaIncentive(person, tiers);
  // A brand given away and never sold clears no tier (2026-10-30), so it is in the intersection too.
  const costed = inc.brands.filter(b => b.marginPct !== null || b.noSales);
  let keys = new Set(costed[0]?.cleared ?? []);
  for (const b of costed.slice(1)) keys = new Set([...keys].filter(k => b.cleared.includes(k)));
  const reached = costed.length ? tiers.filter(t => keys.has(t.bandKey)).sort((a, b) => b.amount - a.amount)[0]?.label ?? null : null;
  if (inc.blocked?.reason === "no_cost") {
    const blind = person.brands[inc.blocked.brand]?.blindOrders ?? 0;
    const held = `held by ${plural(blind, `${brandLabel(inc.blocked.brand, names)} bill`)} without cost`;
    return reached ? `${reached} reached · ${held}` : `Cost pending · ${held}`;
  }
  if (inc.blocked?.reason === "no_brand") return reached ? `${reached} reached · held by a bill with no brand` : "Held by a bill with no brand";
  if (inc.blocked?.reason === "no_ladder") return `No margin ladder for ${brandLabel(inc.blocked.brand, names)}`;
  const given = inc.brands.find(b => b.noSales);
  if (given) return `No tier · ${brandLabel(given.brand, names)} has no sales`;
  if (inc.earned.length) return `${inc.earned[0].label} reached`;
  const lowest = [...tiers].sort((a, b) => a.marginPct - b.marginPct)[0];
  return lowest ? `Below ${lowest.label}` : "No margin ladder yet";
}

export function boardModel(input: ArenaInput): BoardVM {
  const { board, snapshot, period } = input;
  const brands = board === "sales" || board === "margin" ? boardBrands(snapshot) : [];
  const hasSub = board === "sales" || board === "margin";
  const sub: ArenaSub = !hasSub ? "total" : board === "margin" && input.sub === "fair" ? "total" : input.sub;
  const brand = sub === "brand" ? (brands.find(b => b.code === input.brand)?.code ?? brands[0]?.code ?? "") : "";
  const names = new Map((snapshot?.brands ?? []).map(b => [b.code, b.name]));
  const label = BOARD_LABEL[board];
  const isFair = sub === "fair";
  const title = brand ? `${label} · ${brandLabel(brand, names)}` : isFair ? `${label} · Fair results` : label;
  const people = snapshot?.people ?? [];
  const count = board === "champ" ? (input.standings?.length ?? people.length) : people.length;

  let rank: RankView | null = null;
  let fair: FairView | null = null;
  const director = !!input.director;
  if (isFair) {
    fair = fairView(fairTallies(people, input.history, period.from, period.through), people.length, director);
  } else if (board === "champ") {
    const rows = input.standings ? fromStandings(input.standings, input.selfId) : [];
    rank = rankView("champ", rows, count, director);
    // How YOUR points add up: nothing to add for a reader on no board.
    if (input.standings && !director) rank.champ = champBreakdown(input.standings, input.selfId, period, input.kpiEnabled);
  } else {
    const metric = METRIC[board];
    const enabled = board !== "kpi" || input.kpiEnabled;
    const rows = enabled ? fromRankings(arenaRankings(people, metric, brand || undefined), board)
      : people.map(p => ({ id: p.id, name: p.name, self: p.self, position: null, value: null, pending: false, active: false }));
    rank = rankView(board, rows, count, director);
    if (!enabled) {
      // KPI switched off for the sub-department: nobody has a count to show.
      rank.hero.value = "Not counted";
      rank.hero.chase = "KPI items are not counted this period";
      // Nobody will ever have a place here: not "Not ranked yet" — nor a leader.
      rank.hero = { ...rank.hero, num: "—", suf: "", state: "off", leader: undefined };
      rank.rows = rank.rows.map(r => ({ ...r, value: "—" }));
    }
  }
  // Still being read: a placeholder in the hero, never "No counted sales yet" — that is what a month with no
  // sales says, and the two looked the same (2026-10-08).
  const loading = !input.failed && (board === "champ" && !isFair ? !input.standings : !snapshot);
  if (loading && rank) rank.hero = { ...rank.hero, num: "", suf: "", value: "", chase: "Loading the board…", state: "loading" };
  if (loading && fair) fair.hero = { ...fair.hero, num: "", suf: "", chase: "Loading the fairs…", state: "loading" };

  return {
    board, title, sub,
    tabs: !hasSub ? [] : board === "sales"
      ? [{ id: "total", label: "Total" }, { id: "brand", label: "By brand" }, { id: "fair", label: "Fair results" }]
      : [{ id: "total", label: "Total" }, { id: "brand", label: "By brand" }],
    brands: sub === "brand" ? brands : [],
    brand,
    rank, fair,
    // My margin incentive: the reader's own — none for a reader on no board.
    foot: board === "margin" && !director ? { title: "My margin incentive", sub: footSub(people.find(p => p.self), snapshot?.tiers ?? [], period, names) } : null,
    basis: basisText(input, isFair),
  };
}

// ── the hub ──────────────────────────────────────────────────────────────

/**
 * `lead`: the reader is on no board — the card names who is first (`leader`, absent while nobody is placed) where a place
 * would stand, their figure as its head (`value`): as Today's cards (2026-10-25, the user: "就放第一名是谁就好了", then
 * "can same"); Championship's first is the most points ("championship i want is show 1st in championship point").
 */
export interface HubCardVM { board: Board; label: string; rankNum: string; rankSuf: string; of: string; value: string; state: HeroState; leader?: string }
/** `director`: the reader is on no board (a Revenue Director, the Principal viewing nobody) — the head says the cards name who leads. */
export interface HubVM { updated: string; cards: HubCardVM[]; recordLine: string; director?: boolean }

/** `2:40 pm` in Kuala Lumpur. */
export function klTime(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit", hour12: true }).format(t).toLowerCase();
}

export function hubModel(input: Omit<ArenaInput, "board" | "sub" | "brand">): HubVM {
  const cards = BOARDS.map(board => {
    const vm = boardModel({ ...input, board, sub: "total", brand: "" });
    const hero = vm.rank?.hero;
    const loading = hero?.state === "loading";
    return {
      board, label: BOARD_LABEL[board],
      rankNum: hero?.num ?? "—", rankSuf: hero?.suf ?? "",
      // "of 23" counts the reader's own place: a reader on no board has none, KPI off or on.
      of: !input.director && (hero?.state === "ranked" || hero?.state === "off") ? `of ${hero?.count ?? 0}` : "",
      value: loading ? "" : hero?.value ?? "—",
      state: hero?.state ?? "unranked",
      ...(hero?.leader ? { leader: hero.leader } : {}),
    };
  });
  return {
    updated: input.snapshot ? klTime(input.snapshot.asOf) : "", cards, recordLine: recordModel(input.history, input.selfId, !!input.director).cardLine,
    ...(input.director ? { director: true } : {}),
  };
}

// ── Highest Fair Record ──────────────────────────────────────────────────

export interface RecordPodiumVM { id: string; place: 1 | 2 | 3; suf: string; ini: string; name: string; amt: string; venue: string; dates: string }
export interface RecordRowVM { id: string; pos: string; medal: Medal; ini: string; name: string; where: string; amt: string; mine: boolean }
/** `lead`: the reader is on no board (2026-10-25) — no best of their own; the hub's line names who holds the record. */
export interface RecordVM { podium: RecordPodiumVM[]; myPos: string; myAmt: string; rest: RecordRowVM[]; cardLine: string; count: number; lead?: boolean }

const withYear = (start: string, end: string) => `${dayRange(start, end)} ${end.slice(0, 4)}`;

export function recordModel(history: ArenaHistorySnapshot | null, selfId: string, lead = false): RecordVM {
  const records = history ? arenaFairRecords(history) : [];
  const ranked = records.filter(r => r.position !== null && r.value !== null);
  if (lead) {
    const top = ranked[0];
    const vm = recordModel(history, "");
    return { ...vm, lead: true, cardLine: top ? `${firstName(top.name)} holds it · ${rm(top.value!)}` : history ? "No fair record yet" : "" };
  }
  const mine = ranked.find(r => r.id === selfId);
  const podium = [ranked[1], ranked[0], ranked[2]].filter((r): r is typeof ranked[number] => !!r).map(r => ({
    id: r.id, place: Math.min(3, r.position!) as 1 | 2 | 3, suf: ordinalSuffix(r.position!), ini: initials(r.name),
    name: r.id === selfId ? "You" : firstName(r.name), amt: rm(r.value!), venue: r.venue, dates: withYear(r.start, r.end),
  }));
  return {
    podium,
    count: ranked.length,
    myPos: mine ? `${ordinal(mine.position!)} of ${ranked.length}` : "No record yet",
    myAmt: mine ? rm(mine.value!) : "RM 0",
    cardLine: mine ? `Yours: ${rm(mine.value!)} · ${ordinal(mine.position!)} of ${ranked.length}` : history ? "No fair record yet" : "",
    rest: ranked.slice(3).map(r => ({
      id: r.id, pos: String(r.position), medal: medalOf(r.position), ini: initials(r.name),
      name: r.id === selfId ? `${r.name} (you)` : r.name, where: `${r.venue} · ${withYear(r.start, r.end)}`, amt: rm(r.value!), mine: r.id === selfId,
    })),
  };
}
