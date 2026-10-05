/**
 * The prototype's Quote, as data — RevenueApp.dc.html 2105–2190 (`QBRANDS`,
 * `SOFA_MODS`, `MODELS`, `SIZES`, `FRAMES`, `KPIS`, `ACCS`, `RATIO`,
 * `DIVISOR`, `band`) and its starting state (the cart, last used sets, the
 * open sheets of `sofaSheet` / `mattressSheet` / `frameSheet`). Its arithmetic
 * stands in for the server so step 2 reads the prototype's own figures.
 * Preview only.
 */
import type { MemberBand } from "@/lib/member/types";
import type { FrameChoices } from "@/lib/member/build";
import { NO_SOFA_CHOICES, type QCatalog, type QModel, type QModule, type QSofaChoices, type QuoteMemory, type SheetState, type SizeKey, type CartLine } from "../quote/quote-model";
import type { QuoteInitial } from "../quote/useQuote";
import type { PriceTable } from "../quote/table-calc";

const QBRANDS = [
  { code: "AKEMI", name: "Akemi", sofa: false },
  { code: "ERGOTEX", name: "Ergotex", sofa: false },
  { code: "DUNLOP", name: "Dunlopillo", sofa: false },
  { code: "ZANOTTI", name: "Zanotti", sofa: true },
];

const SOFA_MODS: [string, string, number, number][] = [
  ["1A-LHF", "1-seat · left arm", 1, 0.42], ["2A-LHF", "2-seat · left arm", 2, 0.7], ["CHS-LHF", "Chaise · left", 1, 0.6],
  ["1N", "1-seat · armless", 1, 0.34], ["CNR", "Corner", 1, 0.45], ["1A-RHF", "1-seat · right arm", 1, 0.42],
  ["2A-RHF", "2-seat · right arm", 2, 0.7], ["CHS-RHF", "Chaise · right", 1, 0.6], ["OTT", "Ottoman", 0, 0.25],
];

/** [key, name, desc, list price at Queen] */
const MODELS: Record<string, [string, string, string, number][]> = {
  AKEMI: [
    ["serene","Serene Pocket","Pocket spring · medium firm",3890],
    ["cool","Cool Touch Hybrid","Hybrid · cooling knit",4690],
    ["airflow","Airflow Latex","Natural latex · soft",5290],
    ["ortho","Orthocare Firm","Bonnell spring · firm",2990],
    ["dreamlux","Dream Lux","Pocket spring · pillow top",4190],
    ["posture","Posture Plus","Zoned pocket · firm",3490],
    ["comfort","Comfort Top","Euro top · medium",3290],
    ["bamboo","Eco Bamboo","Bamboo knit · medium",3690],
    ["kids","Kids Grow","Foam · medium firm",1890],
    ["hotel","Hotel Classic","Pocket spring · plush",4890],
    ["silver","Silver Ion","Antibacterial knit · medium",3990],
    ["spine","Spine Align","Zoned latex · firm",5590],
    ["cloud","Cloud Nine","Memory foam · plush",4390],
    ["harmony","Harmony Zone","7-zone pocket · medium",4790],
    ["cotton","Pure Cotton","Organic cotton · medium",3190],
    ["firmrest","Firm Rest","Coir and foam · extra firm",2690],
  ],
  ERGOTEX: [
    ["balance","Ergo Balance","Zoned pocket · medium",3590],
    ["cloud","Ergo Cloud Plus","Memory foam · plush",4290],
    ["spine","Ergo Spine Pro","Zoned support · firm",4990],
    ["flex","Ergo Flex","Hybrid · medium",3890],
    ["cool","Ergo Cool Gel","Gel foam · medium",4490],
    ["lite","Ergo Lite","Foam · medium firm",2490],
    ["luxe","Ergo Luxe","Pocket spring · pillow top",5490],
    ["rest","Ergo Rest","Bonnell spring · firm",2890],
    ["air","Ergo Air","Open-cell foam · soft",3790],
    ["duo","Ergo Duo","Dual comfort · two sides",4690],
    ["senior","Ergo Senior","Edge support · firm",4190],
    ["travel","Ergo Fold","Foldable foam · medium",1690],
  ],
  ZANOTTI: [
    ["verona","Verona","Feather blend · linen",5200],
    ["milano","Milano","High-density foam · leather",6800],
    ["torino","Torino","Pocket coil seat · fabric",5900],
    ["siena","Siena","Low profile · boucle",4800],
    ["como","Como","Deep seat · velvet",6200],
    ["lucca","Lucca","Recliner modules · leather",7400],
    ["parma","Parma","Compact · fabric",3900],
    ["ravello","Ravello","Feather top · linen",6600],
    ["amalfi","Amalfi","Outdoor-grade fabric",5400],
    ["bari","Bari","Sleeper option · fabric",4600],
  ],
  DUNLOP: [
    ["royal","Royal Latex","Talalay latex · medium",6290],
    ["vogue","Vogue","Pocket spring · medium",3990],
    ["celestial","Celestial","Latex hybrid · plush",4890],
    ["heritage","Heritage","Latex · firm",5690],
    ["majestic","Majestic","Pocket spring · pillow top",5290],
    ["essence","Essence","Latex foam · medium",4290],
    ["serenity","Serenity","Hybrid · soft",4590],
    ["classic","Classic Firm","Bonnell spring · firm",2990],
    ["pure","Pure Latex","Natural latex · medium",5990],
    ["junior","Junior","Latex foam · medium firm",2190],
  ],
};

const SIZE_M: Record<SizeKey, number> = { S: 0.62, SS: 0.75, Q: 1, K: 1.22, SK: 1.22 };
const SIZE_KEYS: SizeKey[] = ["S", "SS", "Q", "K"];
const FRAMES: [string, string, number][] = [["haven", "Haven Divan", 1590], ["linden", "Linden Storage", 2190], ["arden", "Arden Headboard", 1290],
  ["alto", "Alto Platform", 1490], ["bellini", "Bellini Upholstered", 2390], ["cove", "Cove Wingback", 2690], ["dorset", "Dorset Panel", 1790],
  ["elm", "Elm Wooden", 1890], ["fenwick", "Fenwick Ottoman", 2490], ["grove", "Grove Slat", 1390], ["hudson", "Hudson Tufted", 2290],
  ["ivy", "Ivy Low Profile", 1590], ["juno", "Juno Storage Drawers", 2590], ["kensington", "Kensington Royal", 3190]];
const KPIS: [string, string, number][] = [["protector", "Mattress Protector", 250], ["pillowset", "Pillow Set (2)", 250], ["topper", "Comfort Topper", 390], ["sheet", "Fitted Sheet Set", 180]];
const ACCS: [string, string, number, boolean][] = [["pillow", "Latex Contour Pillow", 290, false], ["protector", "Waterproof Protector", 260, true], ["bolster", "Bolster", 180, false]];
const RATIO = { sofa: 0.45, mattress: 0.42, frame: 0.44, acc: 0.3 };
const DIVISOR = 0.7;
const sp = (q: number, z: SizeKey) => Math.round((q * SIZE_M[z]) / 10) * 10;

const sizes = (id: (z: SizeKey) => string) => Object.fromEntries(SIZE_KEYS.map(z => [z, id(z)])) as Record<SizeKey, string>;

/**
 * The prototype has no bed frame or sofa options; `?charges=1` shows what
 * Modular's ticks and Maintenance's charges would look like (2026-10-05/06).
 */
const NO_CHARGES: FrameChoices = { divans: [], legs: [], gaps: [], totals: [], specials: [] };
const DEMO_CHARGES: FrameChoices = {
  divans: [{ value: '12"', charge: 50 }],
  legs: [{ value: '6"', charge: 100 }, { value: '7"', charge: 120 }],
  gaps: [{ value: '12"', charge: 20 }],
  totals: [],
  specials: [{ value: "Hydraulic", charge: 300 }, { value: "Divan Top Fully Cover", charge: 80 }],
};
const DEMO_SOFA: QSofaChoices = {
  legs: [{ value: '4"', charge: 80 }, { value: '6"', charge: 100 }],
  specials: [{ value: "Wooden Arm", charge: 120 }, { value: "Seat Add 1ft", charge: 150 }],
};

function catalog(brand: { code: string; name: string; sofa: boolean }, charges = false): QCatalog {
  const models: QModel[] = MODELS[brand.code].map(([key, name, desc]) => ({
    key,
    name,
    desc,
    sizes: brand.sofa ? {} : sizes(z => `m:${brand.code}:${key}:${z}`),
    modules: brand.sofa
      ? SOFA_MODS.map(([code, desc, seats]): QModule => ({ code, desc, seats, chaise: code.startsWith("CHS"), productId: `s:${brand.code}:${key}:${code}`, options: [] }))
      : [],
    choices: brand.sofa && charges ? DEMO_SOFA : NO_SOFA_CHOICES,
  }));
  return {
    brand: brand.code,
    name: brand.name,
    sofa: brand.sofa,
    models: [...models].sort((a, b) => a.name.localeCompare(b.name)),
    frames: FRAMES.map(([key, name]) => ({ key, name, sizes: sizes(z => `f:${key}:${z}`), choices: charges ? DEMO_CHARGES : NO_CHARGES })),
    accs: ACCS.map(([key, name, , sized]) => ({ key, name, any: sized ? null : `a:${key}:`, sizes: sized ? sizes(z => `a:${key}:${z}`) : {} })),
    kpis: KPIS.map(([key, name, price]) => ({ key, name, price, productId: `k:${key}` })),
    accSummary: "Pillow, protector, bolster",
  };
}

/** `band()`'s Fair ladder, as the bands the live app reads. */
function bands(brand: string): MemberBand[] {
  const b = (key: string, kind: MemberBand["kind"], threshold: number, multiplier: number | null): MemberBand => ({ brand, key, kind, threshold, multiplier, amount: 0 });
  return [b("Incentive Tier 2", "incentive", 43, null), b("Incentive Tier 1", "incentive", 36, null), b("Standard", "reference", 33, null),
    b("Low margin", "reference", 27, null), b("Below Tier 1", "penalty", 27, 0.5), b("Below Tier 2", "penalty", 25, 0.25), b("Below Tier 3", "penalty", 24, 0)];
}

/** One line's list price and cost, from its id. */
function priced(productId: string): { list: number; cost: number; name: string; kpi: boolean } {
  const [kind, ...rest] = productId.split(":");
  if (kind === "m") {
    const [brand, key, z] = rest as [string, string, SizeKey];
    const [, name, , q] = MODELS[brand].find(m => m[0] === key)!;
    const list = sp(q, z);
    return { list, cost: list * RATIO.mattress, name, kpi: false };
  }
  if (kind === "s") {
    const [brand, key, code] = rest;
    const [, name, , q] = MODELS[brand].find(m => m[0] === key)!;
    const list = Math.round((q * SOFA_MODS.find(x => x[0] === code)![3]) / 10) * 10;
    return { list, cost: list * RATIO.sofa, name: `${name} ${code}`, kpi: false };
  }
  if (kind === "f") {
    const [key, z] = rest as [string, SizeKey];
    const [, name, q] = FRAMES.find(f => f[0] === key)!;
    const list = sp(q, z);
    return { list, cost: list * RATIO.frame, name, kpi: false };
  }
  if (kind === "a") {
    const [key, z] = rest;
    const [, name, p, sized] = ACCS.find(a => a[0] === key)!;
    const list = sized ? sp(p, (z || "Q") as SizeKey) : p;
    return { list, cost: list * RATIO.acc, name, kpi: false };
  }
  const [key] = rest;
  const [, name, p] = KPIS.find(k => k[0] === key)!;
  return { list: p, cost: 0, name, kpi: true };
}

const MEMORY: QuoteMemory = {
  sets: {
    AKEMI: [
      { kind: "mattress", key: "serene", size: "Q", bfs: [] },
      { kind: "mattress", key: "cool", size: "K", bfs: [{ size: "K", frame: "linden", kpi: ["protector", "pillowset"], qty: 1 }] },
      { kind: "mattress", key: "ortho", size: "SS", bfs: [] },
    ],
    ZANOTTI: [
      { kind: "sofa", key: "verona", mods: { "1A-LHF": 1, "2A-RHF": 1 }, kpi: [] },
      { kind: "sofa", key: "como", mods: { "2A-LHF": 1, CNR: 1, "2A-RHF": 1 }, kpi: [] },
    ],
  },
  layouts: { ZANOTTI: [{ "1A-LHF": 1, "2A-RHF": 1 }, { "2A-LHF": 1, CNR: 1, "2A-RHF": 1 }, { "2A-LHF": 1, "2A-RHF": 1 }] },
  frames: [{ size: "Q", frame: "linden", kpi: ["protector", "pillowset"] }, { size: "K", frame: "haven", kpi: [] }, { size: "SS", frame: "juno", kpi: ["protector"] }],
  accs: {},
};

const CART: CartLine[] = [
  { id: "m-serene-Q", kind: "mattress", key: "serene", name: "Serene Pocket", size: "Queen", qty: 1, productId: "m:AKEMI:serene:Q" },
  { id: "f-haven-Q", kind: "frame", key: "haven", name: "Haven Divan", size: "Queen", qty: 1, productId: "f:haven:Q" },
  { id: "a-pillow-", kind: "acc", key: "pillow", name: "Latex Contour Pillow", size: "", qty: 2, productId: "a:pillow:" },
];

/** `sofaSheet` / `mattressSheet` / `mattressSheet="frame"` / `frameSheet` / `frameSheet="drop"`. */
function openSheet(name: string | undefined): SheetState | null {
  const mattress = (qty: number): SheetState => ({
    mode: "model", key: "cool", size: "K", acc: { pillow: 0, protector: 0, bolster: 0 }, qty, accAll: false,
    bfs: [{ size: "K", frame: "linden", kpi: ["protector"], qty: 2 }, { size: "K", frame: "haven", kpi: [], qty: 1 }],
    fx: name === "mattress-frame" ? { size: "K", frame: "linden", kpi: ["protector"], qty: 1, drop: false, idx: -1 } : null,
  });
  switch (name) {
    case "sofa": return { mode: "sofa", key: "verona", layout: "R1", mods: { "2A-LHF": 1, CNR: 1, "2A-RHF": 1 }, qty: 1, kpi: ["protector"], height: null, tier: null, leg: null, specials: [] };
    case "mattress": return mattress(2);
    case "mattress-frame": return mattress(1);
    case "frame": return { mode: "frame", size: "Q", frame: "linden", kpi: ["protector", "pillowset"], qty: 2, drop: false };
    case "frame-drop": return { mode: "frame", size: "Q", frame: "linden", kpi: ["protector", "pillowset"], qty: 2, drop: true };
    default: return null;
  }
}

export interface QuoteFixture {
  catalogs: Record<string, QCatalog>;
  bands: MemberBand[];
  /** Every SKU's list price and cost: the prototype's arithmetic stands in for the server. */
  prices: PriceTable;
  initial: QuoteInitial;
  costDivisor: number;
}

export function protoQuote(opts: { brand?: string; sheet?: string; charges?: boolean } = {}): QuoteFixture {
  const brand = QBRANDS.some(b => b.code === opts.brand) ? opts.brand! : "AKEMI";
  const catalogs = Object.fromEntries(QBRANDS.map(b => [b.code, catalog(b, !!opts.charges)]));
  const ids = new Set<string>();
  for (const c of Object.values(catalogs)) {
    c.models.forEach(m => { Object.values(m.sizes).forEach(id => id && ids.add(id)); m.modules.forEach(x => ids.add(x.productId)); });
    c.frames.forEach(f => Object.values(f.sizes).forEach(id => id && ids.add(id)));
    c.accs.forEach(a => { if (a.any) ids.add(a.any); Object.values(a.sizes).forEach(id => id && ids.add(id)); });
    c.kpis.forEach(k => ids.add(k.productId));
  }
  return {
    catalogs,
    bands: QBRANDS.flatMap(b => bands(b.code)),
    prices: Object.fromEntries([...ids].map(id => [id, priced(id)])),
    initial: { brand, cart: brand === "ZANOTTI" ? [] : CART, price: "5480", memory: MEMORY, sheet: openSheet(opts.sheet) },
    costDivisor: DIVISOR,
  };
}
