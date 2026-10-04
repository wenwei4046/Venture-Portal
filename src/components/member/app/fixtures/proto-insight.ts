/**
 * Insight as the prototype draws it — its own data (`MY_FAIRS`, `BILLS`,
 * `BRAND_M`, `PEOPLE`, the Akemi ladder `L`) and its own derivations
 * (`renderVals()` in RevenueApp.dc.html 2703–2811), ported line for line so
 * the preview can be laid over a screenshot of the prototype. Never a live
 * screen: the live ones are built by insight-model.ts from the database.
 */
import type { BillsVM, BrandPageVM, InsightMainVM, KpiVM, OrderSheetVM } from "../insight/insight-model";
import type { Tone } from "../insight/ladder";
import type { InsightFixture } from "./proto";

const rm = (n: number) => "RM " + Math.round(n).toLocaleString("en-MY");

const MY_FAIRS = [
  { venue: "Mid Valley Megamall", dates: "4–6 Sep", brand: "Akemi", org: "Homedec Expo" },
  { venue: "IOI City Mall", dates: "11–13 Sep", brand: "Ergotex", org: "Mega Home Fair" },
  { venue: "Sunway Pyramid", dates: "18–20 Sep", brand: "Zanotti", org: "Furniture & Living Fair" },
  { venue: "1 Utama", dates: "25–27 Sep", brand: "Dunlopillo", org: "Sleep & Living Expo" },
];
const CODE: Record<string, string> = { Akemi: "AKEMI", Ergotex: "ERGOTEX", Zanotti: "ZANOTTI", Dunlopillo: "DUNLOP" };
const BILL_BRAND: Record<string, [string, string, string]> = {
  Akemi: ["AK", "var(--rv-accent)", "var(--rv-peach-bg)"],
  Ergotex: ["EG", "var(--rv-green)", "var(--rv-green-bg)"],
  Zanotti: ["ZN", "var(--rv-amber)", "var(--rv-gold-tint)"],
  Dunlopillo: ["DL", "var(--rv-brown)", "var(--rv-sand)"],
};
type Line = { name: string; amt: number; qty: number; kpi: number };
const L = (name: string, amt: number, qty = 1, kpi = 0): Line => ({ name, amt, qty, kpi });
const BRAND_M = [
  { name: "Akemi", goods: 24860, orders: 6, m: 38.2 as number | null },
  { name: "Ergotex", goods: 15240, orders: 4, m: 44.1 as number | null },
  { name: "Zanotti", goods: 11630, orders: 2, m: 36.4 as number | null },
  { name: "Dunlopillo", goods: 6200, orders: 2, m: null as number | null },
];
const RAW: { f: number; no: string; cust: string; m: number | null; wait?: string; lines: Line[] }[] = [
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
];
const BILLS = RAW.map(b => ({ ...b, brand: MY_FAIRS[b.f].brand, amt: b.lines.reduce((a, l) => a + l.amt, 0), kpi: b.lines.reduce((a, l) => a + l.kpi, 0) }));
const PEOPLE = [
  { id: "me", name: "Jia Hui Tan", title: "Senior Executive", sales: 57930, margin: 38.6 as number | null },
  { id: "do", name: "Darren Ong", title: "Executive", sales: 49300, margin: 34.1 as number | null },
  { id: "pr", name: "Priya Nair", title: "Executive", sales: 41760, margin: 38.2 as number | null },
  { id: "sa", name: "Siti Aminah", title: "Junior Executive", sales: 30150, margin: 33.0 as number | null },
  { id: "jt", name: "Jason Teh", title: "Junior Executive", sales: 22480, margin: null as number | null },
];

// Fair ladder (comm_margin_bands seed): incentive >= 36 / 43, penalty <= 27 / 25 / 24.
function band(m: number | null): { l: string; tone: Tone } | null {
  if (m == null) return null;
  if (m >= 43) return { l: "Incentive Tier 2", tone: "good" };
  if (m >= 36) return { l: "Incentive Tier 1", tone: "good" };
  if (m >= 33) return { l: "Standard", tone: "neutral" };
  if (m > 27) return { l: "Low margin", tone: "warn" };
  if (m > 25) return { l: "Below Tier 1", tone: "bad" };
  if (m > 24) return { l: "Below Tier 2", tone: "bad" };
  return { l: "Below Tier 3", tone: "bad" };
}
const INK: Record<Tone, string> = { good: "var(--rv-green)", neutral: "var(--rv-ink)", warn: "var(--rv-amber)", bad: "var(--rv-red)", none: "var(--rv-sub)" };
const LADDER: [string, string, string, number, number, string][] = [
  ["Incentive Tier 2", "43% +", "Highest margin incentive", 43, 99, "var(--rv-tier-top)"],
  ["Incentive Tier 1", "36 – 43%", "Margin incentive", 36, 43, "var(--rv-tier-inc)"],
  ["Standard", "33 – 36%", "Normal commission", 33, 36, "var(--rv-tier-ref)"],
  ["Low margin", "27 – 33%", "Normal commission · watch closely", 27.0001, 33, "var(--rv-gold)"],
  ["Below Tier 1", "25 – 27%", "Commission × 0.5", 25.0001, 27.0001, "var(--rv-tier-pen1)"],
  ["Below Tier 2", "24 – 25%", "Commission × 0.25", 24.0001, 25.0001, "var(--rv-tier-pen2)"],
  ["Below Tier 3", "24% or lower", "No commission", 0, 24.0001, "var(--rv-red)"],
];
const pos = (m: number) => Math.max(2, Math.min(98, ((m - 20) / 28) * 100)).toFixed(1) + "%";
const billId = (b: (typeof BILLS)[number]) => b.no;

function main(): InsightMainVM {
  return {
    personal: {
      sales: { right: "83% of target", rightAccent: true, amount: "RM 57,930", bar: 83, sub: "RM 12,070 to your RM 70,000 target" },
      kpi: { value: "27", pill: "Hit · 10 needed", pillTone: "good", sub: "Pillows 20 · Protectors 7" },
      orders: { value: "14", pill: "Deposit cleared", sub: "2 waiting for deposit", subAmber: true },
      overall: "38.6% overall",
      brands: BRAND_M.map(x => {
        const t = band(x.m);
        return { code: CODE[x.name], name: x.name, sub: `${rm(x.goods)} goods · ${x.orders} orders`, pct: x.m == null ? "—" : x.m.toFixed(1) + "%", pill: x.m == null ? "Cost pending" : t!.l, tone: x.m == null ? "warn" : t!.tone };
      }),
      notice: { title: "Margin incentive held", body: "Dunlopillo has 1 bill without cost. Every brand must clear a tier, so Incentive Tier 1 pays once that bill is costed." },
    },
    team: {
      sales: { right: "84% of target", rightAccent: true, amount: "RM 201,620", bar: 84, sub: "RM 38,380 to the RM 240,000 team target" },
      members: { value: "5", sub: "You + 4 downlines" },
      kpiHit: { value: "3 of 5", sub: "2 still pending" },
      rows: PEOPLE.map(p => {
        const mine = p.id === "me";
        const kpi = ["me", "do", "pr"].includes(p.id) ? "KPI hit" : "KPI pending";
        return {
          id: p.id, ini: p.name.split(" ").map(w => w[0]).slice(0, 2).join(""), name: mine ? p.name + " (you)" : p.name, title: p.title,
          sales: rm(p.sales), meta: `${p.margin == null ? "Cost pending" : p.margin.toFixed(1) + "%"} · ${kpi}`, mine,
        };
      }),
    },
  };
}

function bills(): BillsVM {
  const groups = MY_FAIRS.map((fr, i) => {
    const list = BILLS.filter(b => b.f === i), all = list.filter(b => !b.wait);
    const counted = all.reduce((a, b) => a + b.amt, 0), kpi = all.reduce((a, b) => a + b.kpi, 0), bb = BILL_BRAND[fr.brand];
    return {
      key: `w${i}`, title: `Week ${i + 1}`, fr, bb, counted, kpi, all,
      bills: list.map(b => {
        const tier = band(b.m);
        return {
          id: billId(b), no: b.no, sub: `${b.cust} · ${b.lines.length}${b.lines.length > 1 ? " lines" : " line"}`, amt: rm(b.amt), amtMuted: !!b.wait,
          pill: b.wait ? "Due " + b.wait : b.m == null ? "Cost pending" : b.m.toFixed(1) + "%",
          pillInk: b.wait || b.m == null ? INK.warn : INK[tier!.tone], kpiText: `KPI ${b.kpi}`,
          weekText: `Week ${b.f + 1} · ${MY_FAIRS[b.f].venue}`, wait: !!b.wait,
        };
      }),
    };
  });
  return {
    counted: { amount: "RM 57,930", sub: "14 orders · 27 KPI items" },
    waiting: { amount: "RM 8,280", sub: "2 orders · not counted yet" },
    tabs: groups.map(g => ({ key: g.key, title: g.title, brand: g.fr.brand, dates: g.fr.dates, color: g.bb[1], tint: g.bb[2] })),
    weeks: Object.fromEntries(groups.map((g, i) => [g.key, {
      brandWeek: g.fr.brand + " week", total: rm(g.counted), place: `${g.fr.venue} · ${g.fr.org}`, dates: g.fr.dates,
      stats: `${g.all.length} orders · KPI ${g.kpi}${BILLS.some(b => b.f === i && b.wait) ? " · 1 waiting" : ""}`,
      tint: g.bb[2],
      bills: g.bills.map(({ weekText: _w, wait: _x, ...b }) => b),
    }])),
    waitBills: groups.flatMap(g => g.bills).filter(b => b.wait).map(({ weekText, wait: _x, ...b }) => ({ ...b, sub: `${b.sub.split(" · ")[0]} · ${weekText}` })),
    footnote: "Sales count once the deposit clears, in the bill's commission month. Margin uses team cost (cost ÷ 0.7); a bill without cost stays pending.",
  };
}

function kpi(): KpiVM {
  const counted = BILLS.filter(b => !b.wait);
  const byName = new Map<string, number>();
  for (const b of counted) for (const l of b.lines) if (l.kpi) byName.set(l.name, (byName.get(l.name) ?? 0) + l.kpi);
  const items = [...byName.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  const tot = items.reduce((a, i) => a + i.n, 0);
  const shades = ["--rv-tier-deep", "--rv-tier-top", "--rv-green", "--rv-kpi-4", "--rv-kpi-5", "--rv-kpi-6", "--rv-kpi-7", "--rv-kpi-8", "--rv-kpi-9"];
  return {
    enabled: true, total: "27", pill: "Threshold hit", hit: true, fill: 100, marker: 37, need: "10 needed for the threshold", above: "17 above",
    how: { title: "How you reached 27", threshold: "Threshold 10", thLeft: ((10 / tot) * 100).toFixed(1) + "%", items: items.map((i, k) => ({ ...i, color: `var(${shades[k % 9]})` })), total: "27 items" },
    weeks: MY_FAIRS.map((f, i) => ({ key: `w${i}`, week: "W" + (i + 1), brand: f.brand, n: counted.filter(b => b.f === i).reduce((a, b) => a + b.kpi, 0), color: BILL_BRAND[f.brand][1], tint: BILL_BRAND[f.brand][2] })),
    orders: counted.filter(b => b.kpi).map(b => ({ id: billId(b), no: b.no, kpi: b.kpi, items: b.lines.filter(l => l.kpi).map(l => `${l.name} × ${l.kpi}`).join(" · ") })),
    orderCount: counted.filter(b => b.kpi).length + " orders",
  };
}

function brandPageFor(name: string): BrandPageVM {
  const x = BRAND_M.find(b => b.name === name)!, bb = BILL_BRAND[x.name], t = band(x.m);
  let nextTitle: string, nextSub: string;
  if (x.m == null) { nextTitle = "Waiting for supplier cost"; nextSub = `${x.orders} orders have no cost yet. Margin and tier show once every order is costed.`; }
  else if (x.m >= 43) { nextTitle = "Top tier reached"; nextSub = `You are ${(x.m - 43).toFixed(1)}% above Incentive Tier 2. Keep new orders at 43% or more to hold it.`; }
  else {
    const tgt = x.m >= 36 ? 43 : 36, nm = x.m >= 36 ? "Incentive Tier 2" : "Incentive Tier 1", gap = tgt - x.m;
    nextTitle = `${gap.toFixed(1)}% more to reach ${nm}`;
    nextSub = `About ${rm(Math.ceil((gap / 100) * x.goods / 10) * 10)} more margin on the same ${rm(x.goods)} goods, or sell new ${x.name} orders above ${tgt}%.`;
  }
  const ords = BILLS.filter(b => b.brand === x.name && !b.wait).sort((a, b) => (a.m ?? -1) - (b.m ?? -1));
  const curI = x.m == null ? -1 : LADDER.findIndex(([, , , lo, hi]) => x.m! >= lo && x.m! < hi);
  const shortName = (n: string) => n.replace("Incentive ", "");
  const trio = curI < 0 ? null : [curI + 1, curI, curI - 1].map((k, j) => {
    if (k < 0 || k > 6) return { isCur: false, name: j === 2 ? "Top tier" : "—", range: j === 2 ? "Reached" : "", bg: "var(--rv-white)", border: "var(--rv-line)", capInk: "var(--rv-sub)", op: 0.6, wide: false };
    const [nm, range] = LADDER[k], cur = j === 1;
    return { isCur: cur, name: shortName(nm), range, bg: cur ? bb[2] : "var(--rv-white)", border: cur ? bb[1] : "var(--rv-line)", capInk: cur ? bb[1] : "var(--rv-sub)", op: cur ? 1 : 0.75, wide: cur };
  });
  return {
    code: CODE[x.name],
    tabs: BRAND_M.map(b => ({ code: CODE[b.name], label: b.name, dot: BILL_BRAND[b.name][1] })),
    title: x.name, goods: rm(x.goods) + " goods", pct: x.m == null ? "—" : x.m.toFixed(1) + "%",
    tier: x.m == null ? "Cost pending" : t!.l, tone: x.m == null ? "warn" : t!.tone, tint: bb[2], ink: bb[1],
    bar: x.m == null ? null : {
      zones: [
        { flex: 4, color: "var(--rv-zone-pen2)" }, { flex: 3, color: "var(--rv-zone-pen1)" }, { flex: 6, color: "var(--rv-zone-low)" },
        { flex: 3, color: "var(--rv-zone-ref)" }, { flex: 7, color: "var(--rv-zone-inc)" }, { flex: 5, color: "var(--rv-tier-inc)" },
      ],
      markers: [{ left: pos(36), label: "T1 36%", color: "var(--rv-tier-top)" }, { left: pos(43), label: "T2 43%", color: "var(--rv-tier-deep)" }],
      pos: pos(x.m),
    },
    nextTitle, nextSub, trio,
    ladder: LADDER.map(([nm, range, effect, lo, hi, dot]) => ({ name: nm, range, effect, dot, on: x.m != null && x.m >= lo && x.m < hi })),
    ladderCount: "All 7 margin tiers",
    orders: ords.map(o => {
      const ot = band(o.m);
      return { id: billId(o), no: o.no, meta: `${o.cust} · Week ${o.f + 1} · ${rm(o.amt)}`, pct: o.m == null ? "No cost" : o.m.toFixed(1) + "%", tier: o.m == null ? "Cost pending" : ot!.l, ink: o.m == null ? INK.warn : INK[ot!.tone] };
    }),
    footnote: "Brand margin uses commissionable goods against team cost (cost ÷ 0.7). Bed frames and accessories follow their mattress brand. Delivery and disposal are excluded.",
  };
}

function orders(): Record<string, OrderSheetVM> {
  return Object.fromEntries(BILLS.map(sb => {
    const st = band(sb.m), fr = MY_FAIRS[sb.f];
    return [billId(sb), {
      no: sb.no, ref: null, cust: sb.cust, where: `Week ${sb.f + 1} · ${fr.venue}`, amt: rm(sb.amt),
      margin: sb.m == null ? "—" : sb.m.toFixed(1) + "%", tier: sb.m == null ? "Cost pending" : st!.l,
      marginInk: sb.m == null ? INK.warn : INK[st!.tone], kpi: String(sb.kpi),
      status: sb.wait ? "Deposit due " + sb.wait : "Deposit cleared", statusTone: sb.wait ? "warn" : "good",
      lines: sb.lines.map(l => ({ name: l.name, qty: String(l.qty), amt: l.amt ? rm(l.amt) : "Free", kpi: l.kpi, isKpi: l.kpi > 0 })),
    } satisfies OrderSheetVM];
  }));
}

export function protoInsight(): InsightFixture {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  return {
    month: "2026-09",
    dateLabel: "Sep 2026",
    dateOptions: months.map((m, i) => {
      const from = `2026-${String(i + 1).padStart(2, "0")}`;
      const live = i === months.length - 1;
      return { period: { kind: "monthly" as const, from, through: from, label: `${m} 2026`, short: m }, sub: live ? "Live" : "2026", live };
    }),
    main: main(),
    bills: bills(),
    kpi: kpi(),
    brands: Object.fromEntries(BRAND_M.map(b => [CODE[b.name], brandPageFor(b.name)])),
    orders: orders(),
  };
}
