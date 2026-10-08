/**
 * Profile on the prototype's own data — `renderVals()` lines 2902–3133 of
 * RevenueApp.dc.html, ported to the screens' view models so the preview can be
 * laid over the prototype pixel for pixel. Plain data only: it crosses from the
 * preview's server page to the app as props.
 */
import type {
  CoSheetVM, HonourBoard, HonourKind, HonoursVM, IncomeOrdersVM, IncomeVM, MemoVM, PersonSheetVM,
  ProfileMainVM, RequestDetailVM, RequestRowVM, TeamVM, Tone, VaGroupVM,
} from "../profile/profile-vm";
import type { FormOptions } from "../profile/RequestForm";
import { ordinal, rm, rm2 } from "../format";

export interface ProfileFixture {
  main: { me: ProfileMainVM; principal: ProfileMainVM; viewing: Record<string, ProfileMainVM> };
  income: { shown: IncomeVM; hidden: IncomeVM };
  orders: { shown: IncomeOrdersVM; hidden: IncomeOrdersVM };
  honours: Record<HonourKind, HonoursVM>;
  team: TeamVM;
  requests: { rows: RequestRowVM[]; details: Record<string, RequestDetailVM> };
  memos: MemoVM[];
  va: { people: { id: string; departmentId: string; name: string; ini: string; sub: string; level: number }[]; departments: Record<string, string> };
  form: FormOptions;
}

/** The prototype's `ini`: the first two words' letters. */
const ini = (n: string) => n.split(" ").map(x => x[0]).slice(0, 2).join("");

const VA_PEOPLE = ([
  ["tml", "Tan Mei Ling", "Revenue Director", "Leads Fair", "fair", 0], ["ml", "Marcus Lim", "Team Leader", "Rank A", "fair", 1], ["me", "Jia Hui Tan", "Senior Executive", "Rank B", "fair", 2],
  ["wl", "Wei Ling Chong", "Executive", "Rank B", "fair", 3], ["ai", "Aisyah Rahman", "Executive", "Rank C", "fair", 3], ["do", "Darren Ong", "Executive", "Rank C", "fair", 3], ["pr", "Priya Nair", "Executive", "Rank C", "fair", 3], ["kc", "Kelvin Chua", "Executive", "Rank C", "fair", 3], ["sa", "Siti Aminah", "Junior Executive", "Rank C", "fair", 4], ["jt", "Jason Teh", "Junior Executive", "Rank C", "fair", 4],
  ["kw", "Kris Wong", "Revenue Director", "Leads IR", "ir", 0], ["rl", "Rachael Lim", "Team Leader", "Rank A", "ir", 1], ["ho", "Hafiz Omar", "Executive", "Rank B", "ir", 3], ["gt", "Grace Tan", "Executive", "Rank C", "ir", 3],
] as const).map(([id, name, title, rank, sub, lv]) => ({ id, name, title, rank, sub, lv }));

const PEOPLE_SALES: Record<string, number> = {
  "Wei Ling Chong": 86420, "Marcus Lim": 74180, "Aisyah Rahman": 61050, "Jia Hui Tan": 57930, "Darren Ong": 49300,
  "Priya Nair": 41760, "Kelvin Chua": 38900, "Siti Aminah": 30150, "Jason Teh": 22480,
};
const MY_FAIRS = [
  { venue: "Mid Valley Megamall", dates: "4–6 Sep", brand: "Akemi", org: "Homedec Expo" },
  { venue: "IOI City Mall", dates: "11–13 Sep", brand: "Ergotex", org: "Mega Home Fair" },
  { venue: "Sunway Pyramid", dates: "18–20 Sep", brand: "Zanotti", org: "Furniture & Living Fair" },
  { venue: "1 Utama", dates: "25–27 Sep", brand: "Dunlopillo", org: "Sleep & Living Expo" },
];
/** A brand's two colours as palette tokens (the prototype's BILL_BRAND). */
const BRAND_TONE: Record<string, [string, string]> = {
  Akemi: ["var(--rv-accent)", "var(--rv-peach-bg)"], Ergotex: ["var(--rv-green)", "var(--rv-green-bg)"],
  Zanotti: ["var(--rv-amber)", "var(--rv-gold-tint)"], Dunlopillo: ["var(--rv-brown)", "var(--rv-sand)"],
};
const L = (name: string, amt: number, qty = 1, kpi = 0) => ({ name, amt, qty, kpi });
const BILLS = [
  { f: 0, no: "SO-2609-0118", cust: "Mdm Lee", m: 38.9, lines: [L("Serene Pocket · Queen", 3610), L("Haven Divan · Queen", 1590), L("Latex Contour Pillow", 0, 2, 2)] },
  { f: 0, no: "SO-2609-0121", cust: "Mr Tan", m: 37.4, lines: [L("Cool Touch Hybrid · Queen", 4370), L("Latex Contour Pillow", 520, 2, 2)] },
  { f: 0, no: "SO-2609-0124", cust: "Ms Chen", m: 39.2, lines: [L("Orthocare Firm · King", 3650), L("Waterproof Protector · King", 330, 1, 1)] },
  { f: 0, no: "SO-2609-0127", cust: "Mr Gopal", m: 38.0, lines: [L("Airflow Latex · Super Single", 3970), L("Bolster", 150)] },
  { f: 0, no: "SO-2609-0130", cust: "Mr Ong", m: 37.9, lines: [L("Serene Pocket · Super Single", 2980), L("Latex Contour Pillow", 290, 1, 1)] },
  { f: 0, no: "SO-2609-0133", cust: "Mdm Kaur", m: 38.4, lines: [L("Orthocare Firm · Queen", 2990), L("Waterproof Protector · Queen", 260, 1, 1), L("Bolster", 150)] },
  { f: 0, no: "SO-2609-0136", cust: "Mdm Siew", m: 38.6, wait: "6 Oct", lines: [L("Cool Touch Hybrid · Queen", 4690)] },
  { f: 1, no: "SO-2609-0142", cust: "Ms Wong", m: 44.6, lines: [L("Ergo Balance · Queen", 3330), L("Contour Pillow", 260, 1, 1)] },
  { f: 1, no: "SO-2609-0147", cust: "Mdm Aziz", m: 43.8, lines: [L("Ergo Spine Pro · Queen", 4470), L("Contour Pillow", 520, 2, 2)] },
  { f: 1, no: "SO-2609-0150", cust: "Ms Nadia", m: 45.1, lines: [L("Ergo Cloud Plus · Single", 2130), L("Mattress Protector · Single", 260, 1, 1)] },
  { f: 1, no: "SO-2609-0153", cust: "Ms Lau", m: 43.2, lines: [L("Ergo Spine Pro · Super Single", 3750), L("Contour Pillow", 520, 2, 2)] },
  { f: 1, no: "SO-2609-0156", cust: "Mr Yap", m: 44.0, wait: "4 Oct", lines: [L("Ergo Balance · Queen", 3590)] },
  { f: 2, no: "SO-2609-0166", cust: "Mr Rajan", m: 36.1, lines: [L("Milano 3-seater sofa", 6490), L("Fabric Guard Kit", 400, 2, 2)] },
  { f: 2, no: "SO-2609-0172", cust: "Mdm Ho", m: 36.8, lines: [L("Verona L-shape sofa", 4740), L("Throw Pillow", 0, 4, 4)] },
  { f: 3, no: "SO-2609-0190", cust: "Mr Lim", m: null, lines: [L("Vogue · Queen", 3470), L("Latex Pillow", 520, 4, 4)] },
  { f: 3, no: "SO-2609-0194", cust: "Mr Daniel", m: null, lines: [L("Celestial · Single", 1690), L("Latex Pillow", 260, 2, 2), L("Mattress Protector · Single", 260, 2, 2)] },
].map(b => ({ ...b, wait: "wait" in b ? b.wait : undefined, brand: MY_FAIRS[b.f].brand, amt: b.lines.reduce((a, l) => a + l.amt, 0), kpi: b.lines.reduce((a, l) => a + l.kpi, 0) }));

/** The Fair ladder's tone for a margin (the prototype's `band`). */
function bandTone(m: number): Tone {
  if (m >= 36) return "good";
  if (m >= 33) return "neutral";
  if (m > 27) return "warn";
  return "bad";
}

function profileMain(): ProfileFixture["main"] {
  const badges = { requests: "1 pending", memos: "2 new" };
  const viewing = Object.fromEntries(VA_PEOPLE.map(p => [p.id, {
    name: p.name, ini: ini(p.name), sub: `HOUZS Venture · Revenue · ${p.sub === "fair" ? "Fair" : "IR"}`, title: p.title, rank: p.rank, badges,
  }]));
  return {
    me: { name: "Jia Hui Tan", ini: "JT", sub: "HOUZS Venture · Revenue · Fair", title: "Senior Executive", rank: "Rank B", badges },
    principal: { name: "Principal", ini: "PR", sub: "HOUZS Venture · Revenue", title: "Principal", rank: "All access", badges },
    viewing,
  };
}

function income(hide: boolean): IncomeVM {
  const amt = (v: number) => (hide ? "RM ••••" : rm2(v));
  const rows: [string, string, number][] = [["Fixed salary", "Monthly base", 2500], ["Personal sales commission", "RM 51,730 costed sales · 2 orders held", 2637.4], ["Team override", "4 direct reports", 486.2], ["KPI pay", "27 items × RM 25", 675], ["Open Bill bonus", "2 open bills closed", 120], ["Margin incentive", "Akemi, Ergotex and Zanotti at Tier 1 or 2", 423.9]];
  const total = hide ? "RM ••••••" : rm2(6842.5);
  return {
    period: "2026-09", periodLabel: "Sep 2026", heroLabel: "Estimated income · not settled", amount: total,
    heroNote: "Settles after month-end costing. Check your official payslip for payment.",
    rows: rows.map(([label, sub, v]) => ({ label, sub, amt: amt(v) })), total,
    held: { strong: "2 Dunlopillo orders are held.", rest: "Their commission is added once supplier cost is in." },
    past: ([["2026-08", "August 2026", "Paid 7 Sep", 6120], ["2026-07", "July 2026", "Paid 7 Aug", 5890.4], ["2026-06", "June 2026", "Paid 7 Jul", 6402.1]] as const)
      .map(([period, month, paid, v]) => ({ period, month, paid, amt: amt(v), status: "Paid", settled: true })),
    hasOrders: true, notice: null,
  };
}

function orders(hide: boolean): IncomeOrdersVM {
  const KPI_RATE = 25, PERSONAL = 2637.4;
  const money = (v: number) => (hide ? "RM ••" : rm2(v));
  const counted = BILLS.filter(b => !b.wait);
  const paid = counted.filter(b => b.m != null);
  const rate = PERSONAL / paid.reduce((a, b) => a + b.amt, 0);
  let acc = 0;
  const mine = counted.map(b => { const held = b.m == null; const pay = held ? 0 : Math.round(b.amt * rate * 100) / 100; if (!held) acc += pay; return { b, pay, held }; });
  const lastPaid = mine.filter(x => !x.held).slice(-1)[0];
  lastPaid.pay = Math.round((lastPaid.pay + PERSONAL - acc) * 100) / 100;
  const DOWN: [string, string, number, string][] = [["Darren Ong", "SO-2609-0211", 5400, "Akemi"], ["Darren Ong", "SO-2609-0217", 6120, "Ergotex"], ["Priya Nair", "SO-2609-0225", 4980, "Akemi"], ["Priya Nair", "SO-2609-0231", 7300, "Zanotti"], ["Siti Aminah", "SO-2609-0240", 3860, "Ergotex"], ["Siti Aminah", "SO-2609-0244", 5210, "Akemi"], ["Jason Teh", "SO-2609-0252", 8150, "Akemi"], ["Jason Teh", "SO-2609-0259", 7600, "Ergotex"]];
  const sheets: Record<string, CoSheetVM> = {};
  const rowsMine = mine.map(x => {
    const b = x.b, kp = b.kpi * KPI_RATE, id = `m:${b.no}`;
    sheets[id] = {
      no: b.no, meta: `${b.cust} · Week ${b.f + 1} · ${MY_FAIRS[b.f].venue}`,
      tag: x.held ? "Commission held" : `${b.m!.toFixed(1)}% margin`, tone: x.held ? "warn" : bandTone(b.m!),
      amt: rm(b.amt), commLabel: "Commission", comm: x.held ? "Held" : money(x.pay), kpiPay: money(kp), kpiSub: `${b.kpi} × RM ${KPI_RATE}`, kpiPaid: true,
      lines: b.lines.map(l => ({ name: l.name, qty: String(l.qty), amt: l.amt ? rm(l.amt) : "Free",
        pay: x.held ? "Held" : l.amt ? money(Math.round(l.amt / b.amt * x.pay * 100) / 100) : "—",
        kpiPay: l.kpi ? money(l.kpi * KPI_RATE) : "—", kpi: !!l.kpi })),
      total: money((x.held ? 0 : x.pay) + kp),
      note: x.held ? "Commission is added once supplier cost is in. KPI items pay now." : `Commission is shared across lines by line amount. Each eligible KPI item pays RM ${KPI_RATE}, including free giveaways.`,
    };
    return { id, no: b.no, meta: `${b.cust} · Week ${b.f + 1} · ${b.brand}`, pay: x.held ? (kp ? money(kp) : "Held") : money(x.pay + kp), held: x.held,
      sub: x.held ? "Commission held" : kp ? `incl. KPI ${money(kp)}` : `of ${rm(b.amt)}` };
  });
  const rowsOv = DOWN.map(([who, no, amt, brand]) => {
    const id = `o:${no}`;
    sheets[id] = {
      no, meta: `${who} · ${brand}`, tag: "Override", tone: "good", amt: rm(amt), commLabel: "Override", comm: money(amt * 0.01),
      kpiPay: "—", kpiSub: "Paid to seller", kpiPaid: true,
      lines: [{ name: "Order total", qty: "1", amt: rm(amt), pay: money(amt * 0.01), kpiPay: "—", kpi: false }],
      total: money(amt * 0.01), note: "You earn 1.0% override on deposit-cleared orders from your direct reports. KPI pay goes to the seller.",
    };
    return { id, no, meta: `${who} · ${brand}`, pay: money(amt * 0.01), held: false, sub: `of ${rm(amt)}` };
  });
  const ovBase = DOWN.reduce((a, d) => a + d[2], 0), kpiTotal = counted.reduce((a, b) => a + b.kpi, 0) * KPI_RATE;
  return {
    periodLabel: "Sep 2026",
    mine: { tab: `My orders · ${counted.length}`, label: "Commission + KPI pay", total: money(PERSONAL + kpiTotal), base: `${money(PERSONAL)} commission`, rate: `${money(kpiTotal)} KPI · 2 orders held`, rows: rowsMine, note: "Tap an order to see each product line, its commission and its KPI pay." },
    override: { tab: `Override · ${DOWN.length}`, label: "Team override", total: money(486.2), base: `${DOWN.length} orders · ${rm(ovBase)}`, rate: "1.0% of your direct team's sales", rows: rowsOv, note: "Override is paid on deposit-cleared orders from your direct reports, in the same commission month." },
    sheets,
  };
}

function honours(per: HonourKind): HonoursVM {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  const BOARDS_H: [HonourBoard, string][] = [["Sales", "Total sales"], ["Margin", "Total margin"], ["KPI", "KPI items"], ["Championship", "Championship"], ["Sales", "Sales · Akemi"], ["Sales", "Sales · Ergotex"], ["Margin", "Margin · Akemi"], ["Margin", "Margin · Ergotex"]];
  const VENUES = ["Mid Valley Megamall", "IOI City Mall", "Sunway Pyramid", "1 Utama"];
  const all: { mi: number; place: number; board: HonourBoard; title: string; sub: string }[] = [];
  MONTHS.forEach((mo, mi) => {
    BOARDS_H.forEach(([board, title], bi) => { const place = mi === 8 ? [4, 2, 3, 2, 2, 6, 3, 1][bi] : ((mi * 7 + bi * 5) % 8) + 1; all.push({ mi, place, board, title, sub: `${mo} 2026` }); });
    VENUES.forEach((v, vi) => { const place = mi === 8 ? [1, 2, 2, 4][vi] : ((mi * 3 + vi * 2) % 5) + 1; all.push({ mi, place, board: "Fair", title: `Fair · ${v}`, sub: `Week ${vi + 1} · ${mo} 2026` }); });
  });
  const inP = (x: { mi: number }) => (per === "monthly" ? x.mi === 8 : per === "quarterly" ? x.mi >= 6 : true);
  const list = all.filter(inP);
  const places = [...new Set(list.map(x => x.place))].sort((a, b) => a - b);
  const podC = (p: number) => list.filter(x => x.place === p).length;
  const prevList = per === "monthly" ? all.filter(x => x.mi === 7) : per === "quarterly" ? all.filter(x => x.mi >= 3 && x.mi <= 5) : null;
  const pods = podC(1) + podC(2) + podC(3);
  const prevPods = prevList ? prevList.filter(x => x.place <= 3).length : null;
  const pri: HonourBoard[] = ["Championship", "Fair", "Sales", "Margin", "KPI"];
  const minPlace = Math.min(...list.map(y => y.place));
  const best = list.filter(x => x.place === minPlace).sort((a, b) => pri.indexOf(a.board) - pri.indexOf(b.board) || b.mi - a.mi)[0];
  const d = prevPods === null ? null : pods - prevPods;
  const vs = per === "monthly" ? "Aug" : "Q2";
  return {
    periodLabel: { monthly: "Sep 2026", quarterly: "Q3 2026", annual: "2026 to date" }[per],
    eyebrow: `${{ monthly: "SEP 2026", quarterly: "Q3 2026", annual: "2026 SO FAR" }[per]} · YOUR PODIUM`,
    podiums: pods, finishes: list.length,
    delta: d === null || d === 0 ? null : d > 0 ? `+${d} vs ${vs}` : `${d} vs ${vs}`,
    podium: { gold: podC(1), silver: podC(2), bronze: podC(3) },
    highlight: best && best.place <= 3 ? `${ordinal(best.place)} · ${best.title} · ${best.sub}` : null,
    places: places.map(p => { const n = podC(p); return { place: p, label: `${ordinal(p)} place`, short: ordinal(p), count: n, unit: n === 1 ? "time" : "times" }; }),
    sheets: Object.fromEntries(places.map(p => [p, {
      title: `${ordinal(p)} place · ${podC(p)} times`,
      items: list.filter(x => x.place === p).sort((a, b) => b.mi - a.mi).map(x => ({ title: x.title, sub: x.sub, board: x.board })),
    }])),
    notice: null,
  };
}

function team(): TeamVM {
  const UP: [string, string][] = [["Tan Mei Ling", "Revenue Director"], ["Marcus Lim", "Team Leader · Rank A"]];
  const KIDS: [string, string, string, [string, string][]][] = [["Darren Ong", "Executive · Rank C", "KPI hit", [["Kelvin Chua", "Executive"], ["Amelia Tan", "Joined Sep"]]], ["Priya Nair", "Executive · Rank C", "KPI hit", [["Nur Hidayah", "Junior Executive"]]], ["Siti Aminah", "Junior Executive", "KPI pending", []], ["Jason Teh", "Junior Executive", "Cost pending", []]];
  const dot = (st: string) => (st === "KPI hit" ? "good" as const : "wait" as const);
  const people: Record<string, [string, string, string, string]> = { "Tan Mei Ling": ["Revenue Director", "Leads Fair · Klang Valley", "—", "12 teams"], "Marcus Lim": ["Team Leader · Rank A", "Reports to Tan Mei Ling", "RM 74,180", "6 direct"], "Jia Hui Tan": ["Senior Executive · Rank B", "Reports to Marcus Lim", "RM 57,930", "4 direct"] };
  const sheets: Record<string, PersonSheetVM> = {};
  const sheet = (name: string, title: string): PersonSheetVM => {
    const p = people[name], kid = KIDS.find(k => k[0] === name);
    const status = kid ? kid[2] : p ? "Upline" : "New member";
    return {
      name, role: title, ini: name === "Jia Hui Tan" ? "JT" : ini(name), self: name === "Jia Hui Tan",
      stats: [
        { label: "Sales · Sep", value: p ? p[2] : rm(PEOPLE_SALES[name] || 18640), tone: "ink" },
        { label: "Status", value: status, tone: status === "KPI hit" ? "good" : status === "Upline" ? "up" : "wait" },
        { label: "Team", value: p ? p[3] : kid ? (kid[3].length ? `${kid[3].length} direct` : "None yet") : "None yet", tone: "ink" },
      ],
      reportsTo: p ? p[1] : kid ? "Reports to you" : `Reports to ${(KIDS.find(k => k[3].some(g => g[0] === name)) ?? ["you"])[0]}`,
    };
  };
  const ups = UP.map(([n, t], i) => { sheets[n] = sheet(n, t); return { level: i === 0 ? "DIRECTOR" : "UPLINE", nodes: [{ id: n, name: n, title: t, ini: ini(n), dot: "up" as const }] }; });
  sheets["Jia Hui Tan"] = sheet("Jia Hui Tan", "You · Rank B");
  const kids = KIDS.map(([n, t, st, gk]) => {
    const title = t.split(" · ")[0];
    sheets[n] = sheet(n, title);
    return { id: n, name: n, title, ini: ini(n), dot: dot(st), kids: gk.map(([kn, kt]) => { sheets[kn] = sheet(kn, kt); return { id: kn, name: kn, title: kt, ini: ini(kn), dot: "up" as const }; }) };
  });
  return {
    lede: "Fair · Klang Valley",
    capacity: { occupied: 26, capacity: 27, chip: "1 open place", full: false, note: "Waiting-list matches use eligibility, start dates and open places. Direct-report capacity is checked separately." },
    count: `${UP.length} above · ${KIDS.length + KIDS.reduce((a, k) => a + k[3].length, 0)} below`,
    legend: ["KPI hit", "Pending", "Upline"],
    ups, me: { id: "Jia Hui Tan", name: "Jia Hui Tan", title: "You · Rank B", ini: "JT", dot: "good" }, kids, sheets,
  };
}

function requests(): ProfileFixture["requests"] {
  const all: ["claim" | "waiting" | "replacement", string, string, string, "w" | "g" | "r"][] = [["claim", "Outstation claim · Ipoh fair", "28 Sep · RQ-2609-031", "Pending HR", "w"], ["waiting", "Waiting list · Amelia Tan", "15 Sep · RQ-2609-018", "Allocated", "g"], ["replacement", "Replacement · Marcus Lim", "2 Sep · RQ-2609-004", "Needs info", "r"], ["claim", "Airbnb claim · Penang fair", "20 Aug · RQ-2608-027", "Paid", "g"]];
  const tone: Record<string, Tone> = { w: "warn", g: "good", r: "bad" };
  const LOGS: [string, string, string, string][][] = [
    [["Submitted", "You", "28 Sep, 10:42", "Hotel Seri Malaysia Ipoh · 2 nights · RM 260.00"], ["Received by HR", "Nadia (HR)", "29 Sep, 09:15", ""]],
    [["Submitted", "You", "15 Sep, 14:03", "Amelia Tan · preferred start 1 Oct"], ["Approved", "Nadia (HR)", "17 Sep, 11:20", ""], ["Allocated to Fair · Klang Valley", "Revenue system", "18 Sep, 08:00", "Place 26 of 27"]],
    [["Submitted", "You", "2 Sep, 16:30", "Replace Marcus Lim · new member joining"], ["Returned · needs info", "Hafiz (HR)", "4 Sep, 10:05", "Please add the planned handover date and the new member's IC name."]],
    [["Submitted", "You", "20 Aug, 18:11", "Airbnb · Penang · 2 pax · RM 130.00"], ["Approved", "Nadia (HR)", "22 Aug, 09:40", ""], ["Paid", "Finance", "7 Sep, 12:00", "With August payroll"]],
  ];
  const rows: RequestRowVM[] = all.map(([kind, title, sub, status, t], i) => ({ id: `rq${i}`, kind, title, sub, status, tone: tone[t] }));
  const details: Record<string, RequestDetailVM> = Object.fromEntries(all.map(([kind, title, sub, status, t], i) => {
    const log = LOGS[i];
    return [`rq${i}`, {
      id: `rq${i}`, title, code: sub.split(" · ")[1], status, tone: tone[t],
      facts: [{ l: "Type", v: { claim: "Claim", waiting: "Waiting list", replacement: "Replacement" }[kind] }, { l: "Submitted", v: sub.split(" · ")[0] }, { l: "Current step", v: status }],
      log: log.map(([what, who, when, note], k) => ({ what, who, when, note, dot: k === log.length - 1 ? (/needs info|Cancelled/.test(what) ? "bad" as const : "good" as const) : "past" as const })),
      canCancel: t === "w" || t === "r", canUpdate: false,
    }];
  }));
  return { rows, details };
}

function memos(): MemoVM[] {
  const cat = { HR: "hr", Mgmt: "mgmt", Arena: "arena", Ops: "ops" } as const;
  const ALL: [keyof typeof cat, string, string, string, string, string[], boolean, boolean][] = [
    ["HR", "HR · Revenue", "2 Oct", "2 Oct 2026, 9:00 am", "October brand weeks are open", ["Please save your 4 brand weeks for October in Profile → My brand weeks by 5 Oct.", "Changes after 5 Oct need HR approval. Brand week shares decide your Sales by brand and Margin by brand results for the month."], true, false],
    ["Mgmt", "Management", "30 Sep", "30 Sep 2026, 6:15 pm", "Deposit rule reminder", ["Orders count toward sales, margin and KPI only once the deposit clears.", "Orders without a deposit by month end move to the next commission month. Please follow up with customers before 30 Sep."], true, false],
    ["Arena", "Revenue team", "1 Oct", "1 Oct 2026, 10:00 am", "Q3 Championship results", ["Final Q3 standings are now in Arena. Congratulations to everyone on the podium."], false, true],
    ["Ops", "Fair operations", "24 Sep", "24 Sep 2026, 2:40 pm", "Venue change · 1 Utama", ["The 25–27 Sep fair moved from Hall A to Hall C. Set-up time stays at 9:00 am on Friday."], false, true],
  ];
  return ALL.map(([c, from, when, whenFull, title, paras, ack, wasRead], i) => ({
    id: `memo${i}`, cat: cat[c], from, when, whenFull, title, paras, read: wasRead, needsAck: ack, acked: false, ackedText: "You acknowledged this memo · just now",
  }));
}

/** The groups View as shows (`va-style="a"`): FAIR · 10, IR · 4, by level. */
export function protoVaGroups(people: ProfileFixture["va"]["people"], departments: Record<string, string>, query: string, viewing: string): VaGroupVM[] {
  const q = query.trim().toLowerCase();
  return Object.entries(departments).map(([id, name]) => {
    const list = people.filter(p => p.departmentId === id && (!q || `${p.name} ${p.sub}`.toLowerCase().includes(q))).sort((a, b) => a.level - b.level);
    return { title: `${name.toUpperCase()} · ${list.length}`, people: list.map(p => ({ ...p, viewing: p.id === viewing })) };
  }).filter(g => g.people.length);
}

export function protoProfile(): ProfileFixture {
  return {
    main: profileMain(),
    income: { shown: income(false), hidden: income(true) },
    orders: { shown: orders(false), hidden: orders(true) },
    honours: { monthly: honours("monthly"), quarterly: honours("quarterly"), annual: honours("annual") },
    team: team(),
    requests: requests(),
    memos: memos(),
    va: {
      people: VA_PEOPLE.map(p => ({ id: p.id, departmentId: p.sub, name: p.name, ini: ini(p.name), sub: `${p.title} · ${p.rank}`, level: p.lv })),
      departments: { fair: "Fair", ir: "IR" },
    },
    form: {
      subName: "Fair",
      weeks: MY_FAIRS.map((f, i) => ({ key: `w${i}`, month: "SEP", n: `W${i + 1}`, brandWeek: `${f.brand} week`, brand: f.brand.toUpperCase(), dates: f.dates, venue: f.venue, org: f.org,
        fairId: `f${i}`, start: null, end: null, auto: false, claimable: true, color: BRAND_TONE[f.brand][0], tint: BRAND_TONE[f.brand][1] })),
      rates: {
        // No small-group cap: the prototype's Airbnb form is the per-person one.
        base: "Klang Valley", perSpot: 50, perPaxNight: 65, groupMaxPax: 3, groupCapPerNight: null,
        regions: ([["KL", 0], ["Penang", 4], ["Ipoh", 2], ["Melaka", 2], ["Johor", 3], ["Pahang", 3], ["Sabah", 6], ["Sarawak", 6]] as const).map(([name, spots]) => ({ id: name, name, spots, planeTicket: false })),
        // Every fair in Penang: the region the prototype's form shows picked.
        fairs: Object.fromEntries(MY_FAIRS.map((f, i) => [`f${i}`, { venue: f.venue, regionId: "Penang" }])),
      },
      members: ["Darren Ong", "Priya Nair", "Siti Aminah", "Jason Teh"].map(n => ({ id: n, name: n })),
      departments: [{ id: "fair-kv", name: "Fair · Klang Valley", capacity: 27, occupied: 26 }, { id: "fair-pg", name: "Fair · Penang", capacity: null, occupied: 0 }, { id: "showroom", name: "Showroom · Puchong", capacity: null, occupied: 0 }],
      departmentId: "fair-kv",
      waitingList: [["Amelia Tan", "RQ-2609-018 · start 1 Oct", "Approved", true], ["Nur Aisyah Hamid", "RQ-2609-022 · start 15 Oct", "Approved", true], ["Kenneth Loh", "RQ-2608-031 · start 1 Nov", "Approved", true], ["Wong Li Ying", "RQ-2610-002 · submitted 2 Oct", "Pending HR", false]]
        .map(([name, sub, status, ok]) => ({ id: String(name), name: String(name), sub: String(sub), status: String(status), ok: Boolean(ok) })),
      initial: { member: "Siti Aminah", male: 1, female: 1, department: "fair-kv" },
    },
  };
}
