import type { BedframeBuild, MemberCatalogueModel, MemberProduct } from "@/lib/member/types";
import { bedframeKey, categoryKey, compareHeights } from "@/lib/member/catalog";
import { chargeIn, frameBuildText, frameChoicesOf, frameCharge, kindOf, type FrameChoices } from "@/lib/member/build";
import { valueKey } from "@/lib/catalogue/keys";

/**
 * Quote — the prototype's step 1 (Products) as data: a brand's catalogue, the
 * sheet being filled in, the lines it adds and the cart they land in
 * (RevenueApp.dc.html 2315–2370, `sheetLines` / `addSheet` / `qty`).
 *
 * The prototype drew a mattress as one model in four sizes and a sofa as a
 * set of generic modules. The Product List is the same shape underneath: a
 * mattress model is one SKU per size, a sofa model one SKU per module, and
 * bed frames and accessories are riders that join any brand's cart. Nothing
 * here carries a price — the live app prices a cart on the server.
 */

export type SizeKey = "S" | "SS" | "Q" | "K" | "SK";

/** The four bed sizes a mattress or bed frame comes in, smallest first. */
export const SIZES: { key: SizeKey; label: string }[] = [
  { key: "S", label: "Single" },
  { key: "SS", label: "Super Single" },
  { key: "Q", label: "Queen" },
  { key: "K", label: "King" },
];
const LABELS: Record<SizeKey, string> = { S: "Single", SS: "Super Single", Q: "Queen", K: "King", SK: "Super King" };

export function sizeLabel(key: SizeKey): string {
  return LABELS[key];
}

/** The Product List's size word (`Super Single`), or null for a one-size item. */
export function sizeKeyOf(label: string | null | undefined): SizeKey | null {
  const word = (label ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const hit = (Object.entries(LABELS) as [SizeKey, string][]).find(([, l]) => l.toLowerCase() === word);
  return hit ? hit[0] : null;
}

export type LineKind = "mattress" | "sofa" | "frame" | "acc" | "kpi";

/** One sofa module of one model: `2A(LHF)` of 2376. */
export interface QModule {
  code: string;
  desc: string;
  seats: number;
  chaise: boolean;
  productId: string;
  /** The seat height × fabric tier cells the module is costed in. */
  options: { height: string; tier: string }[];
}

export interface QModel {
  key: string;
  name: string;
  /** What a search also reads: the prototype's `desc`; the Product List has none. */
  desc: string;
  /** A mattress: the SKU of each size it comes in. */
  sizes: Partial<Record<SizeKey, string>>;
  /** A sofa: its modules, left-facing pieces first. */
  modules: QModule[];
}

export interface QFrame {
  key: string;
  name: string;
  sizes: Partial<Record<SizeKey, string>>;
  /**
   * What it may be built with (user 2026-10-04): FOC or a divan, leg, gap and total height
   * Maintenance charges; the specials Modular ticked. Nothing = always FOC.
   */
  choices: FrameChoices;
}

const NO_CHOICES: FrameChoices = { divans: [], legs: [], gaps: [], totals: [], specials: [] };

/** A frame build with only what this frame still offers; undefined = all FOC, no specials. */
export function frameBuildFor(choices: FrameChoices, build: BedframeBuild | undefined): BedframeBuild | undefined {
  if (!build) return undefined;
  const keep = (v: string | undefined, list: { value: string }[]) =>
    v && list.some(o => valueKey(o.value) === valueKey(v)) ? v : undefined;
  const out: BedframeBuild = {};
  const divan = keep(build.divan, choices.divans);
  const leg = keep(build.leg, choices.legs);
  const gap = keep(build.gap, choices.gaps);
  const total = keep(build.total, choices.totals);
  const specials = (build.specials ?? []).filter(sp => choices.specials.some(c => valueKey(c) === valueKey(sp)));
  if (divan) out.divan = divan;
  if (leg) out.leg = leg;
  if (gap) out.gap = gap;
  if (total) out.total = total;
  if (specials.length) out.specials = specials;
  return Object.keys(out).length ? out : undefined;
}

/** `leg 6″ +RM 100 · gap 12″ +RM 20` — a frame build as a line says it, charges beside. */
export function frameBuildMeta(choices: FrameChoices, build: BedframeBuild | undefined): string {
  if (!build) return "";
  const priced = (word: string, v: string | undefined, list: FrameChoices["divans"]) => (v ? `${word} ${v} +${rmShort(chargeIn(list, v))}` : null);
  return [
    priced("divan", build.divan, choices.divans),
    priced("leg", build.leg, choices.legs),
    priced("gap", build.gap, choices.gaps),
    priced("total height", build.total, choices.totals),
    ...(build.specials ?? []),
  ].filter(Boolean).join(" · ");
}

/** `RM 100` / `RM 99.50` — a charge, without needless decimals. */
function rmShort(n: number): string {
  return `RM ${Number.isInteger(n) ? n.toLocaleString("en-MY") : n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface QAcc {
  key: string;
  name: string;
  /** The one-size SKU, when there is one. */
  any: string | null;
  /** Fitted SKUs by bed size. */
  sizes: Partial<Record<SizeKey, string>>;
}

export interface QKpi {
  key: string;
  name: string;
  /** Fixed amount the customer pays on top of the selling price, RM. */
  price: number;
  productId: string;
}

/** What one brand's quote sells. */
export interface QCatalog {
  brand: string;
  name: string;
  sofa: boolean;
  /** A–Z. */
  models: QModel[];
  frames: QFrame[];
  accs: QAcc[];
  /** Empty while the sub-department's KPI pay is off. */
  kpis: QKpi[];
  /** *Buy separately › Accessories only*, before ` · Akemi margin`. */
  accSummary: string;
}

export interface CartLine {
  id: string;
  kind: LineKind;
  /** The model, frame, accessory or KPI item. */
  key: string;
  name: string;
  /** `Queen`, a sofa module's description, or empty. */
  size: string;
  qty: number;
  productId: string;
  /** A bed frame's own build (2026-10-05): its charged divan / leg / gap / total height and its specials. */
  bedframe?: BedframeBuild;
  /** What that build is charged per unit, RM — on top of the price, out of the margin. */
  charge?: number;
}

/** One line can hold up to 100 units — the server's limit per product. */
export const MAX_QTY = 100;

// ── sofa modules ──────────────────────────────────────────────────────────

/**
 * What a module code says, in the ERP's own vocabulary (Houzs ERP
 * `SOFA_MODULES`, sofa-build.ts): seats = its cushions; LHF / RHF = the arm on
 * the left / right; B = a wide arm; NA = no arms; S = both arms; L = a chaise;
 * (P) power, (R) recliner, (L) power leg. Worded the prototype's way
 * (`1-seat · left arm`).
 */
export function moduleInfo(code: string): { desc: string; seats: number; chaise: boolean; rank: number[] } {
  const raw = code.trim();
  const m = raw.match(/^([^()\s]+)\s*((?:\([^)]*\))*)$/);
  const base = (m?.[1] ?? raw).toUpperCase();
  const tokens = [...(m?.[2] ?? "").matchAll(/\(([^)]*)\)/g)].map(t => (t[1] ?? "").toUpperCase());
  const side = tokens.includes("LHF") ? "left" : tokens.includes("RHF") ? "right" : null;
  const mech = tokens.includes("P") ? "power" : tokens.includes("R") ? "recliner" : tokens.includes("L") ? "power leg" : null;
  const sideRank = side === "left" ? 0 : side === "right" ? 2 : 1;
  const mechRank = mech === null ? 0 : mech === "recliner" ? 1 : mech === "power" ? 2 : 3;
  const parts = (...p: (string | null)[]) => p.filter(Boolean).join(" · ");
  const fam = base.match(/^(\d)(A|B|NA|S)$/);
  if (fam) {
    const seats = Number(fam[1]);
    const kind = fam[2];
    const familyRank = { A: 0, B: 1, NA: 2, S: 3 }[kind as "A" | "B" | "NA" | "S"];
    const desc = kind === "S"
      ? parts(`${seats}-seater`, "both arms", mech)
      : kind === "NA"
        ? parts(`${seats}-seat`, "armless", mech)
        : parts(`${seats}-seat`, side ? `${kind === "B" ? "wide " : ""}${side} arm` : kind === "B" ? "wide arm" : "arm", mech);
    return { desc, seats, chaise: false, rank: [sideRank, familyRank, seats, mechRank] };
  }
  if (base === "L" || base === "CHS") return { desc: parts("Chaise", side), seats: 1, chaise: true, rank: [sideRank, 4, 1, mechRank] };
  if (base === "CNR") return { desc: "Corner", seats: 1, chaise: false, rank: [1, 5, 1, 0] };
  if (base === "CONSOLE") return { desc: "Wood console", seats: 0, chaise: false, rank: [3, 6, 0, 0] };
  if (base === "STOOL" || base === "OTT") return { desc: "Ottoman / stool", seats: 0, chaise: false, rank: [3, 7, 0, 0] };
  return { desc: raw, seats: 0, chaise: false, rank: [3, 8, 0, 0] };
}

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** `2A(LHF) + CNR + 2× 2A(RHF)` — in the model's own module order. */
export function sofaText(modules: QModule[], mods: Record<string, number>): string {
  return modules.filter(x => (mods[x.code] ?? 0) > 0).map(x => (mods[x.code] > 1 ? `${mods[x.code]}× ` : "") + x.code).join(" + ");
}

export function sofaSeats(modules: QModule[], mods: Record<string, number>): number {
  return modules.reduce((a, x) => a + (mods[x.code] ?? 0) * x.seats, 0);
}

/** A layout only fits a model that has every one of its modules. */
export function layoutFits(model: QModel, mods: Record<string, number>): boolean {
  const codes = new Set(model.modules.map(x => x.code));
  const used = Object.entries(mods).filter(([, n]) => n > 0);
  return used.length > 0 && used.every(([code]) => codes.has(code));
}

/** The same layout written the same way, whatever order it was built in. */
export function layoutKey(mods: Record<string, number>): string {
  return JSON.stringify(Object.entries(mods).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
}

// ── the catalogue ─────────────────────────────────────────────────────────

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });

/**
 * One brand's quote from the Product List snapshot: its mattress or sofa
 * models, and every rider (bed frames, accessories) — riders carry no brand
 * and follow the mattress or sofa's margin (user 2026-09-12). A rider marked
 * with ANOTHER brand stays out: a quote is one brand's.
 */
export function catalogFromProducts(
  products: MemberProduct[],
  brand: string,
  name: string,
  kpis: QKpi[] = [],
  /** Each model's options (the snapshot's `catalogueModels`): a bed frame's charges and specials. */
  catalogueModels: readonly MemberCatalogueModel[] = [],
): QCatalog {
  const modelsById = new Map(catalogueModels.map(m => [m.id, m]));
  const live = products.filter(p => p.available && (p.brand === brand || !p.brand));
  const models = new Map<string, QModel>();
  const frames = new Map<string, QFrame>();
  const accs = new Map<string, QAcc>();
  let sofa = false;
  for (const p of live) {
    const kind = kindOf(p);
    const size = sizeKeyOf(p.size);
    const mattress = kind === "OTHER" && ((p.kind ?? "").trim().toUpperCase() === "MATTRESS" || categoryKey(p.category) === "mattress");
    // A mattress or a sofa is always a brand's own; one without the brand is not this quote's.
    if ((kind === "SOFA" || mattress) && p.brand !== brand) continue;
    if (kind === "SOFA") {
      sofa = true;
      const key = p.modelId ?? p.baseModel ?? p.name;
      const model = models.get(key) ?? { key, name: p.name, desc: "", sizes: {}, modules: [] };
      const code = (p.moduleCode ?? p.size ?? "").trim() || p.code;
      const info = moduleInfo(code);
      model.modules.push({ code, desc: info.desc, seats: info.seats, chaise: info.chaise, productId: p.id, options: p.options ?? [] });
      models.set(key, model);
    } else if (mattress) {
      const key = p.modelId ?? p.name;
      const model = models.get(key) ?? { key, name: p.name, desc: "", sizes: {}, modules: [] };
      if (size && !model.sizes[size]) model.sizes[size] = p.id;
      else if (!size && !Object.keys(model.sizes).length) model.sizes.Q = p.id;
      models.set(key, model);
    } else if (kind === "BEDFRAME") {
      const key = p.modelId ?? p.name;
      const frame = frames.get(key) ?? {
        key, name: p.name, sizes: {},
        choices: p.modelId ? frameChoicesOf(modelsById.get(p.modelId)) : NO_CHOICES,
      };
      if (size && !frame.sizes[size]) frame.sizes[size] = p.id;
      frames.set(key, frame);
    } else {
      // Accessories: one row per name, its fitted sizes beside the one-size SKU.
      const key = p.name.trim().toUpperCase();
      const acc = accs.get(key) ?? { key, name: p.name, any: null, sizes: {} };
      if (size) { if (!acc.sizes[size]) acc.sizes[size] = p.id; } else if (!acc.any) acc.any = p.id;
      accs.set(key, acc);
    }
  }
  for (const model of models.values()) {
    model.modules.sort((a, b) => compareRank(moduleInfo(a.code).rank, moduleInfo(b.code).rank) || a.code.localeCompare(b.code));
  }
  const accList = [...accs.values()].sort(byName);
  return {
    brand,
    name,
    sofa,
    models: [...models.values()].filter(m => m.modules.length || Object.keys(m.sizes).length).sort(byName),
    frames: [...frames.values()].filter(f => Object.keys(f.sizes).length).sort(byName),
    accs: accList,
    kpis,
    accSummary: `${accList.length} item${accList.length === 1 ? "" : "s"}`,
  };
}

/** The sizes a mattress model comes in, smallest first: `Single · Queen · King`. */
export function sizesText(model: QModel): string {
  return SIZES.filter(z => model.sizes[z.key]).map(z => z.label).join(" · ");
}

/** The size a sheet opens on: Queen when the model has it, else the nearest one. */
export function defaultSize(sizes: Partial<Record<SizeKey, string>>, wanted: SizeKey = "Q"): SizeKey {
  if (sizes[wanted]) return wanted;
  for (const k of ["Q", "K", "SS", "S"] as SizeKey[]) if (sizes[k]) return k;
  return wanted;
}

/** An accessory's SKU at a bed size: the fitted one, else the one-size one. */
export function accAt(acc: QAcc, size: SizeKey | null): { productId: string; size: SizeKey | null } | null {
  if (size && acc.sizes[size]) return { productId: acc.sizes[size]!, size };
  if (acc.any) return { productId: acc.any, size: null };
  return null;
}

// ── the sheet ─────────────────────────────────────────────────────────────

export interface BfPick {
  size: SizeKey;
  /** The bed frame's key; empty = none chosen yet. */
  frame: string;
  kpi: string[];
  qty: number;
  /** Its divan, leg, gap and total height — absent = FOC — and its specials (2026-10-05). */
  build?: BedframeBuild;
}

export interface FrameEdit extends BfPick {
  /** Which of the mattress's bed frames is being edited; -1 = a new one. */
  idx: number;
  drop: boolean;
}

export type SheetState =
  | { mode: "model"; key: string; size: SizeKey; acc: Record<string, number>; qty: number; bfs: BfPick[]; fx: FrameEdit | null; accAll: boolean }
  | { mode: "sofa"; key: string; layout: string; mods: Record<string, number>; qty: number; kpi: string[]; height: string | null; tier: string | null }
  | { mode: "frame"; size: SizeKey; frame: string; kpi: string[]; qty: number; drop: boolean; build?: BedframeBuild }
  | { mode: "acc"; size: SizeKey; acc: Record<string, number>; accAll: boolean };

/** The first bed frame that comes in a size, A–Z; empty when none does. */
export function firstFrame(catalog: QCatalog, size: SizeKey): string {
  return catalog.frames.find(f => f.sizes[size])?.key ?? "";
}

function push(out: CartLine[], line: CartLine) {
  const same = out.find(o => o.id === line.id);
  if (same) same.qty += line.qty;
  else out.push(line);
}

/** What a sheet adds to the cart (the prototype's `sheetLines`). */
export function sheetLines(sh: SheetState, catalog: QCatalog): CartLine[] {
  const out: CartLine[] = [];
  const kpiLine = (key: string, qty: number) => {
    const item = catalog.kpis.find(k => k.key === key);
    if (item) push(out, { id: `k-${item.key}`, kind: "kpi", key: item.key, name: item.name, size: "", qty, productId: item.productId });
  };
  if (sh.mode === "model") {
    const model = catalog.models.find(m => m.key === sh.key);
    const pid = model?.sizes[sh.size];
    if (model && pid) push(out, { id: `m-${model.key}-${sh.size}`, kind: "mattress", key: model.key, name: model.name, size: sizeLabel(sh.size), qty: sh.qty, productId: pid });
  }
  if (sh.mode === "sofa") {
    const model = catalog.models.find(m => m.key === sh.key);
    if (!model) return out;
    for (const x of model.modules) {
      const n = sh.mods[x.code] ?? 0;
      if (n > 0) push(out, { id: `s-${model.key}-${x.code}`, kind: "sofa", key: model.key, name: `${model.name} ${x.code}`, size: x.desc, qty: n * sh.qty, productId: x.productId });
    }
    if (out.length) sh.kpi.forEach(k => kpiLine(k, sh.qty));
    return out;
  }
  const bfs: BfPick[] = sh.mode === "frame" ? [sh] : sh.mode === "model" ? sh.bfs : [];
  const sets = sh.mode === "model" ? sh.qty : 1;
  for (const bf of bfs) {
    const frame = catalog.frames.find(f => f.key === bf.frame);
    const pid = frame?.sizes[bf.size];
    if (!frame || !pid) continue;
    const n = bf.qty * sets;
    // One frame built two ways is two lines (2026-10-05); FOC is no build at all.
    const build = frameBuildFor(frame.choices, bf.build);
    const charge = frameCharge(frame.choices, build);
    push(out, {
      id: `f-${frame.key}-${bf.size}${build ? `-${bedframeKey(build)}` : ""}`,
      kind: "frame", key: frame.key, name: frame.name, size: sizeLabel(bf.size), qty: n, productId: pid,
      ...(build ? { bedframe: build } : {}),
      ...(charge > 0 ? { charge } : {}),
    });
    bf.kpi.forEach(k => kpiLine(k, n));
  }
  if (sh.mode === "model" || sh.mode === "acc") {
    for (const acc of catalog.accs) {
      const n = (sh.acc[acc.key] ?? 0) * sets;
      if (!n) continue;
      const at = accAt(acc, sh.size);
      if (!at) continue;
      push(out, { id: `a-${acc.key}-${at.size ?? ""}`, kind: "acc", key: acc.key, name: acc.name, size: at.size ? sizeLabel(at.size) : "", qty: n, productId: at.productId });
    }
  }
  return out;
}

// ── the cart ──────────────────────────────────────────────────────────────

export function addLines(cart: CartLine[], lines: CartLine[]): CartLine[] {
  const next = cart.map(l => ({ ...l }));
  for (const line of lines) {
    const same = next.find(l => l.id === line.id);
    if (same) same.qty = Math.min(MAX_QTY, same.qty + line.qty);
    else next.push({ ...line, qty: Math.min(MAX_QTY, line.qty) });
  }
  return next;
}

/** − / + on a cart line; a line that reaches 0 leaves the cart. */
export function bump(cart: CartLine[], id: string, d: number): CartLine[] {
  return cart.map(l => (l.id === id ? { ...l, qty: Math.min(MAX_QTY, l.qty + d) } : l)).filter(l => l.qty > 0);
}

export function itemCount(cart: CartLine[]): number {
  return cart.reduce((a, l) => a + l.qty, 0);
}

export function itemsText(cart: CartLine[], brand: string): string {
  const n = itemCount(cart);
  return n ? `${n} item${n === 1 ? "" : "s"} · ${brand}` : "Your cart is empty";
}

/** The line's second line, as the prototype words it (`rider`). */
export function riderText(line: CartLine, brand: string): string {
  if (line.kind === "sofa") return `${brand} sofa module`;
  if (line.kind === "mattress") return brand;
  if (line.kind === "kpi") return "KPI item · fixed price";
  return `Follows ${brand} margin`;
}

export const TAGS: Record<LineKind, { label: string; tone: "orange" | "sand" | "green" | "amber" }> = {
  sofa: { label: "SOFA", tone: "orange" },
  mattress: { label: "MATTRESS", tone: "orange" },
  frame: { label: "FRAME", tone: "sand" },
  kpi: { label: "KPI", tone: "green" },
  acc: { label: "ACC", tone: "amber" },
};

/**
 * The cart sheet's meta line: `Queen · Akemi mattress`, `Follows Akemi
 * margin` — and a bed frame's own build, its charges beside (2026-10-05).
 */
export function cartMeta(line: CartLine, brand: string): string {
  return [line.size, line.kind === "mattress" ? `${brand} mattress` : riderText(line, brand), buildNote(line)].filter(Boolean).join(" · ");
}

/** `leg 6" · +RM 100 each` — a bed frame line's own build and what it is charged. */
function buildNote(line: CartLine): string {
  return [line.bedframe ? frameBuildText(line.bedframe) : "", line.charge ? `+${rmShort(line.charge)} each` : ""].filter(Boolean).join(" · ");
}

/** Step 2's line note: the rider text, and a bed frame's own build with its charge — out of the margin. */
export function lineNote(line: CartLine, brand: string): string {
  return [riderText(line, brand), buildNote(line), line.charge ? "not in margin" : ""].filter(Boolean).join(" · ");
}

// ── last used ─────────────────────────────────────────────────────────────

export type RecentSet =
  | { kind: "mattress"; key: string; size: SizeKey; bfs: BfPick[] }
  | { kind: "sofa"; key: string; mods: Record<string, number>; kpi: string[] };

export interface RecentFrame {
  size: SizeKey;
  frame: string;
  kpi: string[];
  build?: BedframeBuild;
}

/** What a member reaches for again, per brand — kept on their phone. */
export interface QuoteMemory {
  sets: Record<string, RecentSet[]>;
  /** Sofa layouts used, per brand. */
  layouts: Record<string, Record<string, number>[]>;
  frames: RecentFrame[];
  /** Accessories added before, per brand, most recent first. */
  accs: Record<string, string[]>;
}

export const EMPTY_MEMORY: QuoteMemory = { sets: {}, layouts: {}, frames: [], accs: {} };

const sameFrame = (a: RecentFrame, b: RecentFrame) =>
  a.size === b.size && a.frame === b.frame && a.kpi.join() === b.kpi.join() && bedframeKey(a.build) === bedframeKey(b.build);

/** What adding a sheet teaches the memory (the prototype's `addSheet`). */
export function remember(memory: QuoteMemory, sh: SheetState, brand: string): QuoteMemory {
  const next: QuoteMemory = { sets: { ...memory.sets }, layouts: { ...memory.layouts }, frames: memory.frames, accs: { ...memory.accs } };
  const sets = next.sets[brand] ?? [];
  if (sh.mode === "sofa") {
    const key = layoutKey(sh.mods);
    next.layouts[brand] = [{ ...sh.mods }, ...(next.layouts[brand] ?? []).filter(m => layoutKey(m) !== key)].slice(0, 3);
    next.sets[brand] = [{ kind: "sofa" as const, key: sh.key, mods: { ...sh.mods }, kpi: [...sh.kpi] },
      ...sets.filter(r => !(r.kind === "sofa" && r.key === sh.key && layoutKey(r.mods) === key))].slice(0, 3);
  }
  if (sh.mode === "model") {
    const bfs = JSON.stringify(sh.bfs);
    next.sets[brand] = [{ kind: "mattress" as const, key: sh.key, size: sh.size, bfs: sh.bfs.map(b => ({ ...b, kpi: [...b.kpi] })) },
      ...sets.filter(r => !(r.kind === "mattress" && r.key === sh.key && r.size === sh.size && JSON.stringify(r.bfs) === bfs))].slice(0, 3);
  }
  if (sh.mode === "frame") {
    const f: RecentFrame = { size: sh.size, frame: sh.frame, kpi: [...sh.kpi], ...(sh.build ? { build: { ...sh.build } } : {}) };
    next.frames = [f, ...memory.frames.filter(r => !sameFrame(r, f))].slice(0, 3);
  }
  if (sh.mode === "model" || sh.mode === "acc") {
    const used = Object.entries(sh.acc).filter(([, n]) => n > 0).map(([k]) => k);
    if (used.length) next.accs[brand] = [...used, ...(memory.accs[brand] ?? []).filter(k => !used.includes(k))].slice(0, 12);
  }
  return next;
}

/** A remembered set the catalogue can still sell. */
export function liveSets(memory: QuoteMemory, catalog: QCatalog): RecentSet[] {
  return (memory.sets[catalog.brand] ?? []).filter(r => {
    const model = catalog.models.find(m => m.key === r.key);
    if (!model) return false;
    return r.kind === "sofa" ? layoutFits(model, r.mods) : !!model.sizes[r.size];
  });
}

export function liveFrames(memory: QuoteMemory, catalog: QCatalog): RecentFrame[] {
  return memory.frames.filter(r => catalog.frames.some(f => f.key === r.frame && f.sizes[r.size]));
}

/**
 * The accessories a sheet lists: those already picked, then the remembered
 * ones, then the rest in the catalogue's own order (A–Z).
 */
export function accOrder(catalog: QCatalog, memory: QuoteMemory, picked: Record<string, number>): QAcc[] {
  const recent = memory.accs[catalog.brand] ?? [];
  const rank = (a: QAcc) => ((picked[a.key] ?? 0) > 0 ? 0 : recent.includes(a.key) ? 1 + recent.indexOf(a.key) / 100 : 2);
  const at = new Map(catalog.accs.map((a, i) => [a.key, i]));
  return [...catalog.accs].sort((a, b) => rank(a) - rank(b) || at.get(a.key)! - at.get(b.key)!);
}

/** How a remembered set reads on step 1: `King · Linden Storage · 2 KPI items`. */
export function setMeta(r: RecentSet, catalog: QCatalog): string {
  const model = catalog.models.find(m => m.key === r.key);
  if (r.kind === "sofa") return model ? [`${sofaSeats(model.modules, r.mods)} seats`, sofaText(model.modules, r.mods)].join(" · ") : "";
  const first = r.bfs[0] ? catalog.frames.find(f => f.key === r.bfs[0].frame) : undefined;
  const kpis = r.bfs.reduce((a, b) => a + b.kpi.length, 0);
  return [sizeLabel(r.size), first ? first.name + (r.bfs.length > 1 ? ` +${r.bfs.length - 1}` : "") : "No bed frame",
    ...(kpis ? [`${kpis} KPI item${kpis > 1 ? "s" : ""}`] : [])].join(" · ");
}

export function frameMeta(r: RecentFrame | BfPick, catalog: QCatalog): string {
  const frame = catalog.frames.find(f => f.key === r.frame);
  const kpis = r.kpi.length;
  const build = frame ? frameBuildMeta(frame.choices, frameBuildFor(frame.choices, r.build)) : "";
  return [sizeLabel(r.size), frame?.name ?? "No bed frame", ...(build ? [build] : []),
    ...(catalog.kpis.length ? [kpis ? `${kpis} KPI item${kpis > 1 ? "s" : ""}` : "No KPI items"] : [])].join(" · ");
}

// ── the sofa build ────────────────────────────────────────────────────────

/**
 * Seat heights the modules are costed in, lowest first, with each height's
 * fabric tiers. `every`: only cells EVERY module has — one height and one tier
 * cost the whole cart's sofas (the calculator's build). Otherwise any module's.
 */
export function sofaChoices(modules: QModule[], every = true): { heights: string[]; tiers: (height: string) => string[] } {
  const list = modules.filter(m => m.options.length);
  if (!list.length) return { heights: [], tiers: () => [] };
  const cells = list.map(m => new Set(m.options.map(o => `${o.height}\u0000${o.tier}`)));
  const all = [...new Set(list.flatMap(m => m.options.map(o => o.height)))].sort(compareHeights);
  const tiers = (height: string) => [...new Set(list.flatMap(m => m.options.filter(o => o.height === height).map(o => o.tier)))]
    .filter(t => (every ? cells.every(c => c.has(`${height}\u0000${t}`)) : true))
    .sort();
  return { heights: all.filter(h => tiers(h).length > 0), tiers };
}

/** The sofa module a cart line is, in any of the catalogue's models. */
export function moduleOf(catalog: QCatalog, productId: string): QModule | undefined {
  for (const model of catalog.models) {
    const hit = model.modules.find(x => x.productId === productId);
    if (hit) return hit;
  }
  return undefined;
}

export interface SofaBuildPick {
  /** False when the model's modules carry no cost grid (nothing to choose). */
  graded: boolean;
  heights: string[];
  tiers: string[];
  height: string | null;
  tier: string | null;
  /** Modules are chosen but no seat height costs all of them. */
  clash: boolean;
}

/**
 * The seat height and fabric tier a sofa sheet would add with: the sheet's
 * own choice, else the cart's, else the lowest — among the cells every module
 * chosen here AND every sofa module already in the cart is costed in.
 */
export function sofaPick(
  sh: Extract<SheetState, { mode: "sofa" }>,
  catalog: QCatalog,
  cart: CartLine[],
  build: { height: string | null; tier: string | null },
): SofaBuildPick {
  const model = catalog.models.find(m => m.key === sh.key);
  const chosen = model ? model.modules.filter(x => (sh.mods[x.code] ?? 0) > 0) : [];
  const inCart = cart.filter(l => l.kind === "sofa").map(l => moduleOf(catalog, l.productId)).filter((x): x is QModule => !!x);
  const graded = !!model?.modules.some(x => x.options.length);
  const choices = chosen.length ? sofaChoices([...chosen, ...inCart]) : sofaChoices(model?.modules ?? [], false);
  const wantedHeight = sh.height ?? build.height;
  const height = wantedHeight && choices.heights.includes(wantedHeight) ? wantedHeight : choices.heights[0] ?? null;
  const tiers = height ? choices.tiers(height) : [];
  const wantedTier = sh.tier ?? build.tier;
  const tier = wantedTier && tiers.includes(wantedTier) ? wantedTier : tiers[0] ?? null;
  return { graded, heights: choices.heights, tiers, height, tier, clash: graded && chosen.length > 0 && !choices.heights.length };
}
