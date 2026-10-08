/**
 * Arena as the prototype draws it — its own data (`PEOPLE`, `MY_FAIRS`,
 * `RECORDS`, `CHAMP_PARTS`) and its own derivations (`ranking`, `chase`,
 * `fairTable`, `recordVals` and the Arena half of `renderVals()` in
 * RevenueApp.dc.html 2042–2290 / 2398–2466 / 2812–2900), ported line for line
 * so the preview can be laid over a screenshot of the prototype. Never a live
 * screen: the live ones are built by arena-model.ts from the database.
 */
import { arenaKey, type ArenaSub, type BoardVM, type ChampBreakdown, type FairListItem, type FairView, type HubVM, type Medal, type RankView, type RecordVM } from "../arena/arena-model";
import type { PeriodKind, PeriodOption } from "../insight/period";
import type { Board } from "../route";

export interface ArenaFixture {
  /** By `arenaKey(board, kind, sub, brand)`. */
  boards: Record<string, BoardVM>;
  hub: Record<PeriodKind, HubVM>;
  record: RecordVM;
  dateLabel: Record<PeriodKind, string>;
  dateOptions: Record<PeriodKind, PeriodOption[]>;
  /** Each kind's latest option — what the prototype opens on. */
  from: Record<PeriodKind, string>;
}


type Person = { id: string; name: string; sales: number; margin: number | null; pts: number; q: number; kpi: number; fm: [number, number, number] };
const PEOPLE: Person[] = [
  { id: "wl", name: "Wei Ling Chong", sales: 86420, margin: 36.9, pts: 142, q: 2.7, kpi: 24, fm: [3, 1, 0] },
  { id: "ml", name: "Marcus Lim", sales: 74180, margin: 42.4, pts: 121, q: 3.1, kpi: 31, fm: [3, 1, 0] },
  { id: "ai", name: "Aisyah Rahman", sales: 61050, margin: 35.8, pts: 104, q: 2.9, kpi: 22, fm: [0, 2, 1] },
  { id: "me", name: "Jia Hui Tan", sales: 57930, margin: 38.6, pts: 128, q: 3.0, kpi: 27, fm: [1, 2, 0] },
  { id: "do", name: "Darren Ong", sales: 49300, margin: 34.1, pts: 88, q: 2.6, kpi: 18, fm: [0, 1, 1] },
  { id: "pr", name: "Priya Nair", sales: 41760, margin: 38.2, pts: 96, q: 3.2, kpi: 29, fm: [1, 1, 1] },
  { id: "kc", name: "Kelvin Chua", sales: 38900, margin: 31.5, pts: 61, q: 2.8, kpi: 15, fm: [0, 0, 2] },
  { id: "sa", name: "Siti Aminah", sales: 30150, margin: 33.0, pts: 55, q: 2.5, kpi: 12, fm: [0, 0, 1] },
  { id: "jt", name: "Jason Teh", sales: 22480, margin: null, pts: 34, q: 2.4, kpi: 10, fm: [0, 0, 1] },
];
const BRANDS = ["Akemi", "Ergotex", "Zanotti", "Dunlopillo"];
const CODE: Record<string, string> = { Akemi: "AKEMI", Ergotex: "ERGOTEX", Zanotti: "ZANOTTI", Dunlopillo: "DUNLOP" };
const BOARDS: { id: Board; label: string }[] = [{ id: "sales", label: "Sales" }, { id: "margin", label: "Margin" }, { id: "kpi", label: "KPI" }, { id: "champ", label: "Championship" }];
const MY_FAIRS = [
  { venue: "Mid Valley Megamall", dates: "4–6 Sep", sales: 24860, pos: 1, of: 5 },
  { venue: "IOI City Mall", dates: "11–13 Sep", sales: 15240, pos: 2, of: 4 },
  { venue: "Sunway Pyramid", dates: "18–20 Sep", sales: 11630, pos: 2, of: 5 },
  { venue: "1 Utama", dates: "25–27 Sep", sales: 6200, pos: 4, of: 4 },
];
const CHAMP_PARTS = [
  { item: "salesByBrand", label: "Sales by brand", g: "sales", sub: "Your brand weeks share", v: 22 },
  { item: "fairResults", label: "Fair results", g: "sales", sub: "Mean of weekly fair finishes", v: 20 },
  { item: "totalSales", label: "Total sales", g: "sales", sub: "Monthly rank ladder", v: 18 },
  { item: "marginByBrand", label: "Margin by brand", g: "margin", sub: "Includes brand margin tier", v: 19 },
  { item: "totalMargin", label: "Total margin", g: "margin", sub: "Includes Incentive Tier", v: 20.5 },
  { item: "kpi", label: "KPI", g: "kpi", sub: "Includes threshold award", v: 15 },
  { item: "record", label: "Highest Fair Record", g: "record", sub: "Monthly closing rank", v: 13.5 },
] as const;
const CGROUPS = [{ id: "sales", label: "Sales" }, { id: "margin", label: "Margin" }, { id: "kpi", label: "KPI" }, { id: "record", label: "Fair Record" }] as const;
const RECORDS: Record<string, [number, string, string]> = {
  wl: [31480, "Pavilion Bukit Jalil", "13–15 Mar 2026"], ml: [28950, "Mid Valley Megamall", "5–7 Dec 2025"],
  do: [26300, "IOI City Mall", "9–11 Jan 2026"], ai: [24120, "Sunway Pyramid", "22–24 Aug 2025"],
  me: [24860, "Mid Valley Megamall", "4–6 Sep 2026"], pr: [21880, "Paradigm Mall", "6–8 Feb 2026"],
  kc: [19450, "Setia City Mall", "17–19 Oct 2025"], sa: [15960, "AEON Bukit Tinggi", "19–21 Jun 2026"],
  jt: [12300, "Mid Valley Megamall", "4–6 Sep 2026"],
};

const rm = (n: number) => "RM " + Math.round(n).toLocaleString("en-MY");
const ordinal = (n: number) => n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");
const suffix = (n: number) => ordinal(n).replace(/^\d+/, "");
const ini = (n: string) => n.split(" ").map(x => x[0]).slice(0, 2).join("");
const first2 = (n: string) => n.split(" ").slice(0, 2).join(" ");
const medal = (pos: number | null): Medal => (pos && pos <= 3 ? (pos as Medal) : 0);
const PF: Record<PeriodKind, number> = { monthly: 0, quarterly: 1, annual: 2 };

type Ranked = Person & { v: number | null; pos: number | null };
function ranking(board: Board, kind: PeriodKind, brand: string, off = 0): Ranked[] {
  const pf = PF[kind];
  const bi = BRANDS.indexOf(brand);
  const rows = PEOPLE.map((p, i) => {
    const mult = (pf === 0 ? 1 : pf === 1 ? p.q : p.q * 3.7) * (off ? 1 + ((((i * 3 + off * 5) % 7) - 3) * 0.06) : 1);
    let v: number | null;
    if (board === "sales") {
      v = p.sales * mult;
      if (bi >= 0) { const w = BRANDS.map((_, b) => ((i * 7 + b * 5) % 6) + 2); v = v * w[bi] / w.reduce((a, c) => a + c, 0); }
    } else if (board === "margin") {
      v = p.margin == null ? null : p.margin + (pf ? (((i + pf) % 3) - 1) * 0.35 : 0) + (bi >= 0 ? (((i * 3 + bi * 7) % 9) - 4) * 0.6 : 0);
    } else if (board === "kpi") v = Math.round(p.kpi * mult);
    else v = Math.round(p.pts * mult);
    return { ...p, v, pos: null as number | null };
  });
  const ranked = rows.filter(r => r.v != null).sort((a, b) => b.v! - a.v!).map((r, k) => ({ ...r, pos: k + 1 }));
  return [...ranked, ...rows.filter(r => r.v == null)];
}
const fmtV = (board: Board, v: number | null) => v == null ? "Cost pending" : board === "sales" ? rm(v) : board === "margin" ? v.toFixed(1) + "%" : board === "kpi" ? v + " items" : v + " pts";
const gapT = (board: Board, d: number) => board === "sales" ? rm(d) : board === "margin" ? d.toFixed(1) + "% margin" : board === "kpi" ? d + " KPI items" : d + " pts";
function chase(board: Board, rows: Ranked[]) {
  const me = rows.find(r => r.id === "me")!;
  if (me.pos == null) return { c1: "Waiting for complete cost data", me, above: null as Ranked | null };
  const above = me.pos > 1 ? rows[me.pos - 2] : null;
  const c1 = above ? `${gapT(board, above.v! - me.v!)} behind ${first2(above.name)} (${ordinal(above.pos!)})` : `You lead by ${gapT(board, me.v! - rows[1].v!)}`;
  return { c1, me, above };
}

function fairTable(kind: PeriodKind) {
  const pf = PF[kind], ev = [4, 13, 52][pf], k = [1, 3.25, 13][pf];
  const ft = PEOPLE.map((p, i) => {
    let [g, s, b] = p.fm;
    if (pf) { g = Math.max(0, Math.round(g * k) + ((i + pf) % 3) - 1); s = Math.max(0, Math.round(s * k) + ((i * 2 + pf) % 3) - 1); b = Math.max(0, Math.round(b * k) + ((i + 2 * pf) % 3) - 1); }
    return { ...p, g, s, b, ev, pos: 0, joint: false };
  }).sort((a, b) => b.g - a.g || b.s - a.s || b.b - a.b || a.name.localeCompare(b.name));
  ft.forEach((r, i) => { const p = ft[i - 1]; r.pos = p && p.g === r.g && p.s === r.s && p.b === r.b ? p.pos : i + 1; });
  ft.forEach(r => { r.joint = ft.filter(x => x.pos === r.pos).length > 1; });
  return ft;
}

function champBreakdown(kind: PeriodKind, me: Ranked, count: number): ChampBreakdown {
  const pmult = { monthly: 1, quarterly: 3.1, annual: 11.4 }[kind];
  let acc = 0;
  const parts = CHAMP_PARTS.map((c, i) => {
    const v = i < CHAMP_PARTS.length - 1 ? Math.round(c.v * pmult * 2) / 2 : me.v! - acc;
    acc += v;
    return { item: c.item, label: c.label, sub: c.sub, group: c.g, num: v, value: v.toLocaleString("en-MY", { maximumFractionDigits: 2 }) + " pts" };
  });
  const groups = CGROUPS.map(g => {
    const num = parts.filter(c => c.group === g.id).reduce((a, c) => a + c.num, 0);
    return { id: g.id, label: g.label, num, value: num.toLocaleString("en-MY", { maximumFractionDigits: 2 }) };
  });
  return { groups, parts, periodLabel: { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" }[kind], myValue: fmtV("champ", me.v), myPos: me.pos ? ordinal(me.pos) : "—", count };
}

function rankView(board: Board, kind: PeriodKind, brand: string): RankView {
  const rows = ranking(board, kind, brand);
  const ch = chase(board, rows);
  const me = ch.me;
  const top = rows.filter(r => r.pos).slice(0, 3);
  return {
    hero: { num: me.pos ? String(me.pos) : "—", suf: me.pos ? suffix(me.pos) : "", count: rows.length, value: fmtV(board, me.v), chase: ch.c1, state: me.pos ? "ranked" : "unranked" },
    podium: [top[1], top[0], top[2]].filter((r): r is Ranked => !!r).map(r => ({ id: r.id, place: r.pos as 1 | 2 | 3, ini: ini(r.name), name: r.id === "me" ? "You" : first2(r.name), value: fmtV(board, r.v) })),
    listTitle: board === "champ" ? "Standings" : "Full ranking",
    count: rows.length,
    rows: rows.map(r => {
      const mine = r.id === "me", next = !!ch.above && r.id === ch.above.id;
      return { id: r.id, pos: r.pos == null ? "—" : String(r.pos), medal: medal(r.pos), ini: ini(r.name), name: r.name, value: fmtV(board, r.v),
        tag: mine ? "you" as const : next ? "next" as const : null, mine, muted: r.v == null };
    }),
    champ: board === "champ" ? champBreakdown(kind, me, rows.length) : null,
  };
}

function fairView(kind: PeriodKind): FairView {
  const ft = fairTable(kind), myF = ft.find(r => r.id === "me")!;
  const top = ft.filter(r => r.pos <= 3);
  const untied = top.length === 3 && top.every(r => !r.joint);
  const order = untied ? [top[1], top[0], top[2]] : top;
  const ahead = ft.filter(r => r.pos < myF.pos).slice(-1)[0];
  const fairs: FairListItem[] = MY_FAIRS.map(f => ({ venue: f.venue, dates: f.dates, sales: rm(f.sales), finish: `${ordinal(f.pos)} of ${f.of}`, place: ordinal(f.pos), medal: medal(f.pos) }));
  return {
    hero: {
      num: String(myF.pos), suf: suffix(myF.pos), count: PEOPLE.length,
      medals: ([["1st", myF.g], ["2nd", myF.s], ["3rd", myF.b]] as const).map(([label, count], i) => ({ n: (i + 1) as 1 | 2 | 3, label, count })),
      chase: ahead ? (ahead.g > myF.g ? `${ahead.g - myF.g} more 1st place${ahead.g - myF.g > 1 ? "s" : ""} to catch ${first2(ahead.name)}` : `More 2nd places to pass ${first2(ahead.name)}`) : "Most fair wins this period",
      state: "ranked",
    },
    podium: order.map(r => ({ id: r.id, medal: r.pos as 1 | 2 | 3, place: ordinal(r.pos), joint: r.joint ? "Joint" : "", ini: ini(r.name), name: r.id === "me" ? "You" : first2(r.name), g: r.g, s: r.s, b: r.b, big: r.pos === 1 })),
    entrySub: `${myF.ev} fairs · tap for venues, dates and sales`,
    chips: fairs,
    tableTitle: "Finish count",
    rows: ft.map(r => {
      const mine = r.id === "me";
      return { id: r.id, pos: String(r.pos), medal: medal(r.pos), ini: ini(r.name), name: mine ? r.name + " (you)" : r.name,
        sub: r.joint ? `Joint ${ordinal(r.pos)}` : `${r.ev - r.g - r.s - r.b} × 4th or lower`, joint: r.joint, g: r.g, s: r.s, b: r.b, mine };
    }),
    sheet: { countText: myF.ev + " fairs", other: `${myF.ev - myF.g - myF.s - myF.b} finished 4th or lower`, fairs },
  };
}

const BASIS = {
  fair: "Counts how often each person finished 1st, 2nd or 3rd in their own completed weekly fairs. Ranked by firsts, then seconds, then thirds. People with the same three counts share the place, and the next place is skipped.",
  champ: "Championship adds seven contributions: Sales by brand, Fair results, Total sales, Margin by brand, Total margin, KPI and Highest Fair Record. It is a points total, not an average.",
  kpi: "All eligible KPI quantities together, including eligible giveaway items. Shows actual quantities; KPI points sit in Championship.",
  margin: "Margin uses commissionable goods revenue. Anyone with an uncosted bill stays pending until it is costed.",
  sales: "Deposit-cleared, commissionable sales. Each order counts once, in its released commission month.",
};

function board(boardId: Board, kind: PeriodKind, subIn: ArenaSub, brandName: string): BoardVM {
  const hasSub = boardId === "sales" || boardId === "margin";
  const sub: ArenaSub = hasSub ? (boardId === "margin" && subIn === "fair" ? "total" : subIn) : "total";
  const isFair = sub === "fair";
  const brand = sub === "brand" ? brandName : "All";
  const label = BOARDS.find(b => b.id === boardId)!.label;
  return {
    board: boardId,
    title: brand === "All" ? (isFair ? label + " · Fair results" : label) : `${label} · ${brand}`,
    sub,
    tabs: !hasSub ? [] : boardId === "sales"
      ? [{ id: "total", label: "Total" }, { id: "brand", label: "By brand" }, { id: "fair", label: "Fair results" }]
      : [{ id: "total", label: "Total" }, { id: "brand", label: "By brand" }],
    brands: sub === "brand" ? BRANDS.map(b => ({ code: CODE[b], label: b })) : [],
    brand: sub === "brand" ? CODE[brandName] : "",
    rank: isFair ? null : rankView(boardId, kind, brand),
    fair: isFair ? fairView(kind) : null,
    foot: boardId === "margin" ? { title: "My margin incentive", sub: "Incentive Tier 1 reached · held by 1 Dunlopillo bill without cost" } : null,
    basis: isFair ? BASIS.fair : BASIS[boardId],
  };
}

function record(): RecordVM {
  const rr = PEOPLE.map(p => ({ ...p, amt: RECORDS[p.id][0], venue: RECORDS[p.id][1], dates: RECORDS[p.id][2] }))
    .sort((a, b) => b.amt - a.amt).map((r, i) => ({ ...r, pos: i + 1 }));
  const mine = rr.find(r => r.id === "me")!;
  return {
    podium: [rr[1], rr[0], rr[2]].map(r => ({ id: r.id, place: r.pos as 1 | 2 | 3, suf: suffix(r.pos), ini: ini(r.name), name: r.id === "me" ? "You" : first2(r.name), amt: rm(r.amt), venue: r.venue, dates: r.dates })),
    count: rr.length,
    myPos: `${ordinal(mine.pos)} of ${rr.length}`,
    myAmt: rm(mine.amt),
    cardLine: `Yours: ${rm(mine.amt)} · ${ordinal(mine.pos)} of ${rr.length}`,
    rest: rr.slice(3).map(r => ({ id: r.id, pos: String(r.pos), medal: medal(r.pos), ini: ini(r.name), name: r.id === "me" ? r.name + " (you)" : r.name, where: `${r.venue} · ${r.dates}`, amt: rm(r.amt), mine: r.id === "me" })),
  };
}

function hub(kind: PeriodKind, recordLine: string): HubVM {
  return {
    updated: "2:40 pm",
    recordLine,
    cards: BOARDS.map(b => {
      const r = ranking(b.id, kind, "All"), c = chase(b.id, r), n = c.me.pos;
      return { board: b.id, label: b.label, rankNum: n ? String(n) : "—", rankSuf: n ? suffix(n) : "", of: `of ${r.length}`, value: fmtV(b.id, c.me.v), state: n ? "ranked" as const : "unranked" as const };
    }),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
function options(kind: PeriodKind): PeriodOption[] {
  if (kind === "monthly") {
    return MONTHS.map((m, i) => {
      const from = `2026-${String(i + 1).padStart(2, "0")}`, live = i === MONTHS.length - 1;
      return { period: { kind, from, through: from, label: `${m} 2026`, short: m }, sub: live ? "Live" : "2026", live };
    });
  }
  if (kind === "quarterly") {
    return [1, 2, 3].map(q => {
      const from = `2026-${String((q - 1) * 3 + 1).padStart(2, "0")}`, live = q === 3;
      return { period: { kind, from, through: from, label: `Q${q} 2026`, short: `Q${q}` }, sub: live ? "Live" : "2026", live };
    });
  }
  return ["2025", "2026"].map(y => ({ period: { kind, from: `${y}-01`, through: `${y}-12`, label: y, short: y }, sub: y === "2026" ? "Live" : "", live: y === "2026" }));
}

export function protoArena(): ArenaFixture {
  const kinds: PeriodKind[] = ["monthly", "quarterly", "annual"];
  const boards: Record<string, BoardVM> = {};
  for (const kind of kinds) {
    for (const b of BOARDS) {
      const subs: ArenaSub[] = b.id === "sales" ? ["total", "brand", "fair"] : b.id === "margin" ? ["total", "brand"] : ["total"];
      for (const sub of subs) {
        if (sub === "brand") for (const name of BRANDS) boards[arenaKey(b.id, kind, sub, CODE[name])] = board(b.id, kind, sub, name);
        else boards[arenaKey(b.id, kind, sub, "")] = board(b.id, kind, sub, "Akemi");
      }
    }
  }
  const rec = record();
  return {
    boards,
    hub: { monthly: hub("monthly", rec.cardLine), quarterly: hub("quarterly", rec.cardLine), annual: hub("annual", rec.cardLine) },
    record: rec,
    dateLabel: { monthly: "Sep 2026", quarterly: "Q3 2026", annual: "2026" },
    dateOptions: { monthly: options("monthly"), quarterly: options("quarterly"), annual: options("annual") },
    from: { monthly: "2026-09", quarterly: "2026-07", annual: "2026-01" },
  };
}
