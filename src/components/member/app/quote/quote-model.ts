import type { BedframeBuild, MemberCatalogueModel, MemberProduct, OptionCharge } from "@/lib/member/types";
import { bedframeKey, categoryKey, compareHeights } from "@/lib/member/catalog";
import { chargeIn, frameBuildText, frameChoicesOf, frameCharge, kindOf, specialsCharge, type FrameChoices } from "@/lib/member/build";
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
  /** What a search also reads: the prototype's `desc`; from the Product List, a sofa's code (5071), which its name alone does not show. */
  desc: string;
  /** A mattress: the SKU of each size it comes in. */
  sizes: Partial<Record<SizeKey, string>>;
  /** A sofa: its modules, left-facing pieces first. */
  modules: QModule[];
  /** A sofa: its leg heights and specials (Product List › Modular, priced on Maintenance). A mattress has none. */
  choices: QSofaChoices;
}

/**
 * What a sofa may be built with on the Quote (user 2026-10-06): FOC or a leg
 * height Maintenance CHARGES that Modular turned ON — the bed frame's rule —
 * and the specials the same way: only one Modular turned ON that Maintenance
 * charges is offered. Charged ONCE PER SOFA however many pieces, on top, out
 * of the margin. Nothing charged = nothing to choose.
 */
export interface QSofaChoices {
  legs: OptionCharge[];
  specials: OptionCharge[];
  /** Its category's fabric upgrades (Maintenance › Fabrics, 2026-10-29): Standard, or one of these, once per sofa. */
  upgrades: OptionCharge[];
}

export const NO_SOFA_CHOICES: QSofaChoices = { legs: [], specials: [], upgrades: [] };

export interface QFrame {
  key: string;
  name: string;
  sizes: Partial<Record<SizeKey, string>>;
  /**
   * What it may be built with (user 2026-10-04): FOC or a divan, leg, gap and total height
   * Maintenance charges; the specials Maintenance charges (2026-10-06). Nothing = always FOC.
   */
  choices: FrameChoices;
}

const NO_CHOICES: FrameChoices = { divans: [], legs: [], gaps: [], totals: [], specials: [], upgrades: [] };

/** A sofa model's charged leg heights, charged specials and fabric upgrades, as the catalogue's models list them. */
function sofaChoicesOf(model: MemberCatalogueModel | undefined): QSofaChoices {
  return {
    legs: model?.charges?.leg_heights ?? [],
    specials: model?.charges?.specials ?? [],
    upgrades: model?.charges?.fabric_upgrades ?? [],
  };
}

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
  const specials = (build.specials ?? []).filter(sp => choices.specials.some(c => valueKey(c.value) === valueKey(sp)));
  const fabricUpgrade = keep(build.fabricUpgrade, choices.upgrades);
  if (divan) out.divan = divan;
  if (leg) out.leg = leg;
  if (gap) out.gap = gap;
  if (total) out.total = total;
  if (specials.length) out.specials = specials;
  if (fabricUpgrade) out.fabricUpgrade = fabricUpgrade;
  return Object.keys(out).length ? out : undefined;
}

/** `leg 6″ +RM 100 · gap 12″ +RM 20 · Hydraulic +RM 300` — a frame build as a line says it, charges beside. */
export function frameBuildMeta(choices: FrameChoices, build: BedframeBuild | undefined): string {
  if (!build) return "";
  const priced = (word: string, v: string | undefined, list: FrameChoices["divans"]) => (v ? `${word} ${v} +${rmShort(chargeIn(list, v))}` : null);
  return [
    priced("divan", build.divan, choices.divans),
    priced("leg", build.leg, choices.legs),
    priced("gap", build.gap, choices.gaps),
    priced("total height", build.total, choices.totals),
    ...(build.specials ?? []).map(sp => {
      const c = chargeIn(choices.specials, sp);
      return c > 0 ? `${sp} +${rmShort(c)}` : sp;
    }),
    build.fabricUpgrade ? `${build.fabricUpgrade} +${rmShort(chargeIn(choices.upgrades, build.fabricUpgrade))}` : null,
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
  /** *Buy separately › Accessories only* (a sofa's: *Sofa accessories only*), before ` · Akemi margin`. */
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
 * `SOFA_MODULES`, sofa-build.ts): seats = its back cushions — a seat has one, a
 * corner none (2026-10-27, the user: "一个 seat 有一个 back cushion，然后 corner 是没有
 * back cushion 的", so 1A(LHF) + 1NA + CNR + 1A(RHF) is 3 seats; the ERP counts the
 * corner one); LHF / RHF = the arm on the left / right; B = a wide arm; NA = no
 * arms; S = both arms; L = a chaise; (P) power, (R) recliner, (L) power leg.
 * Worded the prototype's way (`1-seat · left arm`).
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
  if (base === "CNR") return { desc: "Corner", seats: 0, chaise: false, rank: [1, 5, 1, 0] };
  if (base === "CONSOLE") return { desc: "Wood console", seats: 0, chaise: false, rank: [3, 6, 0, 0] };
  if (base === "STOOL" || base === "OTT") return { desc: "Ottoman / stool", seats: 0, chaise: false, rank: [3, 7, 0, 0] };
  return { desc: raw, seats: 0, chaise: false, rank: [3, 8, 0, 0] };
}

/**
 * A module's back cushions — its compartments (2026-10-27, the Houzs ERP's `SOFA_MODULES`
 * `cushions`; the user: "每一个 compartment 只会有一个 back cushion（1A 是一个 back cushion，2A 就是
 * 两个 back cushion）"): a 1A / 1B / 1NA / 1S one, a 2A / 2B / 2NA / 2S two, a 3S three; a chaise
 * one; a corner none (the user: "cnr , put = 0"), a console or a stool none; a whole sofa (`6FT`)
 * or anything else one ("都当 1 个"). A special charged by quantity counts these — on a bill
 * (`catalogue_apply_sofa_charges`) and as the Quote's first +.
 */
export function moduleCushions(code: string): number {
  const base = (code.trim().match(/^[^()\s]*/)?.[0] ?? "").toUpperCase();
  const fam = base.match(/^(\d)(A|B|NA|S)$/);
  if (fam) return Number(fam[1]);
  return base === "CNR" || base === "CONSOLE" || base === "STOOL" || base === "OTT" ? 0 : 1;
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

/** SKU Master's *Sofa Accessory* — the ERP's FABRIC_ACCESSORY: back cushions, arm rests, sofa pillows. */
export function isSofaAccessory(product: Pick<MemberProduct, "kind">): boolean {
  return (product.kind ?? "").trim().toUpperCase() === "FABRIC_ACCESSORY";
}

/**
 * One brand's quote from the Product List snapshot: its mattress or sofa
 * models, and every rider (bed frames, accessories) — riders carry no brand
 * and follow the mattress or sofa's margin (user 2026-09-12). A rider marked
 * with ANOTHER brand stays out: a quote is one brand's. A sofa brand's
 * accessories are SKU Master's *Sofa Accessory* alone, and a mattress brand's
 * every other accessory (user 2026-10-26: "沙发 accessory only"; the two
 * lists are kept apart).
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
  // Known before the loop: which accessories this quote sells depends on it.
  const sofa = live.some(p => p.brand === brand && kindOf(p) === "SOFA");
  for (const p of live) {
    const kind = kindOf(p);
    const size = sizeKeyOf(p.size);
    const mattress = kind === "OTHER" && ((p.kind ?? "").trim().toUpperCase() === "MATTRESS" || categoryKey(p.category) === "mattress");
    // A mattress or a sofa is always a brand's own; one without the brand is not this quote's.
    if ((kind === "SOFA" || mattress) && p.brand !== brand) continue;
    if (kind === "SOFA") {
      const key = p.modelId ?? p.baseModel ?? p.name;
      // A named sofa is shown by its name alone (2026-10-20); its code stays searchable.
      const model = models.get(key) ?? { key, name: p.name, desc: (p.baseModel ?? "").trim(), sizes: {}, modules: [], choices: sofaChoicesOf(p.modelId ? modelsById.get(p.modelId) : undefined) };
      const code = (p.moduleCode ?? p.size ?? "").trim() || p.code;
      const info = moduleInfo(code);
      model.modules.push({ code, desc: info.desc, seats: info.seats, chaise: info.chaise, productId: p.id, options: p.options ?? [] });
      models.set(key, model);
    } else if (mattress) {
      const key = p.modelId ?? p.name;
      const model = models.get(key) ?? { key, name: p.name, desc: "", sizes: {}, modules: [], choices: NO_SOFA_CHOICES };
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
    } else if (isSofaAccessory(p) === sofa) {
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

/** What *Buy separately* calls the accessories on their own: a sofa brand's are its sofa accessories. */
export function accOnlyTitle(catalog: Pick<QCatalog, "sofa">): string {
  return catalog.sofa ? "Sofa accessories only" : "Accessories only";
}

/** The sizes a mattress model comes in, smallest first: `Single · Queen · King`. */
export function sizesText(model: QModel): string {
  return SIZES.filter(z => model.sizes[z.key]).map(z => z.label).join(" · ");
}

/** *All models*' search: a model by its name, its `desc` (a sofa's code), its sizes or its modules. `q` comes trimmed and in small letters. */
export function modelMatches(model: QModel, q: string): boolean {
  if (!q) return true;
  const hay = [model.name, model.desc, sizesText(model), ...model.modules.map(x => `${x.code} ${x.desc}`)].join(" ").toLowerCase();
  return hay.includes(q);
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

/** Every SKU that can be bought separately, with fitted sizes in bed-size order. */
export function accVariants(acc: QAcc): { productId: string; size: SizeKey | null }[] {
  const variants: { productId: string; size: SizeKey | null }[] = acc.any ? [{ productId: acc.any, size: null }] : [];
  for (const size of ["S", "SS", "Q", "K", "SK"] as const) {
    const productId = acc.sizes[size];
    if (productId) variants.push({ productId, size });
  }
  return variants;
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
  | {
      mode: "sofa"; key: string; layout: string; mods: Record<string, number>; qty: number; kpi: string[]; height: string | null; tier: string | null;
      /** The cart's leg height and specials as the sheet opened on them, then as changed here (null = not chosen). */
      leg: string | null; specials: string[];
      /** And how many of each special charged by quantity (2026-10-26); absent on a sheet from before. */
      specialQty?: Record<string, number>;
      /** The cart's fabric upgrade, by name (2026-10-29); null / absent = Standard. */
      fabricUpgrade?: string | null;
      /** Its sofa accessories (2026-10-26), by SKU, per set — as *Sofa accessories only* picks them. */
      acc: Record<string, number>; accAll: boolean;
    }
  | { mode: "frame"; size: SizeKey; frame: string; kpi: string[]; qty: number; drop: boolean; build?: BedframeBuild }
  /** Standalone accessories are picked by SKU so several fitted sizes can be bought together. */
  | { mode: "acc"; acc: Record<string, number>; accAll: boolean };

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
    // Its KPI items and accessories ride the sofa: with no module chosen there is nothing to add.
    if (!out.length) return out;
    sh.kpi.forEach(k => kpiLine(k, sh.qty));
    accLines(out, catalog, sh.acc, sh.qty);
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
  if (sh.mode === "model") {
    for (const acc of catalog.accs) {
      const at = accAt(acc, sh.size);
      const n = (sh.acc[acc.key] ?? 0) * sets;
      if (at && n) push(out, accLine(acc, at, n));
    }
  }
  if (sh.mode === "acc") accLines(out, catalog, sh.acc, 1);
  return out;
}

function accLine(acc: QAcc, at: { productId: string; size: SizeKey | null }, qty: number): CartLine {
  return { id: `a-${acc.key}-${at.size ?? ""}`, kind: "acc", key: acc.key, name: acc.name, size: at.size ? sizeLabel(at.size) : "", qty, productId: at.productId };
}

/** Accessories picked by SKU — *Accessories only*, and a sofa's own — times the sets they come with. */
function accLines(out: CartLine[], catalog: QCatalog, picked: Record<string, number>, sets: number) {
  for (const acc of catalog.accs) {
    for (const at of accVariants(acc)) {
      const n = (picked[at.productId] ?? 0) * sets;
      if (n) push(out, accLine(acc, at, n));
    }
  }
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

/**
 * The customer quote's lines: `PEBBLE GREY · Queen (Hydraulic)` — a bed frame
 * with its own build, as the shared text words it.
 */
export function customerLines(cart: CartLine[]): { name: string; qty: number }[] {
  return cart.map(l => ({
    name: [l.name, l.size].filter(Boolean).join(" · ") + (l.bedframe ? ` (${frameBuildText(l.bedframe)})` : ""),
    qty: l.qty,
  }));
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
export function remember(memory: QuoteMemory, sh: SheetState, catalog: QCatalog): QuoteMemory {
  const brand = catalog.brand;
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
  if (sh.mode === "model" || sh.mode === "acc" || sh.mode === "sofa") {
    const used = sh.mode === "model"
      ? Object.entries(sh.acc).filter(([, n]) => n > 0).map(([k]) => k)
      : catalog.accs.filter(acc => accVariants(acc).some(at => (sh.acc[at.productId] ?? 0) > 0)).map(acc => acc.key);
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

/**
 * The cart's ONE sofa build (the calculator's `QuoteBuild`): the seat height
 * and fabric tier its modules are costed in, and the leg height and specials
 * every sofa in it is made with (user 2026-10-06 — they were the old
 * builder's and the revamp left them out).
 */
export interface SofaBuild {
  height: string | null;
  tier: string | null;
  /** null = not chosen. */
  leg: string | null;
  specials: string[];
  /**
   * How many of each special Maintenance charges BY QUANTITY (2026-10-26), for the whole
   * cart, keyed as the list spells it; a special picked with none counts 1. Absent on a build from before.
   */
  specialQty?: Record<string, number>;
  /** The sofas' fabric upgrade, by name (2026-10-29), once per sofa; null / absent = Standard. */
  fabricUpgrade?: string | null;
}

export const NO_SOFA_BUILD: SofaBuild = { height: null, tier: null, leg: null, specials: [], specialQty: {}, fabricUpgrade: null };

/** Whole quantities of 1–100, by special; anything else is dropped. */
function quantitiesOf(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>)
    .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isInteger(e[1]) && e[1] >= 1 && e[1] <= MAX_QTY));
}

/** A special's quantity in a map keyed by spelling, read by its folded spelling; 1 when it has none. */
export function qtyIn(quantities: Record<string, number> | undefined, value: string): number {
  const k = valueKey(value);
  const hit = Object.entries(quantities ?? {}).find(([sp]) => valueKey(sp) === k);
  return hit ? hit[1] : 1;
}

/** A build kept on the phone — one kept before 2026-10-06 has only the seat height and tier, before 2026-10-26 no quantities. */
export function sofaBuildOf(raw: Partial<SofaBuild> | null | undefined): SofaBuild {
  return {
    height: typeof raw?.height === "string" ? raw.height : null,
    tier: typeof raw?.tier === "string" ? raw.tier : null,
    leg: typeof raw?.leg === "string" ? raw.leg : null,
    specials: Array.isArray(raw?.specials) ? raw.specials.filter((v): v is string => typeof v === "string") : [],
    specialQty: quantitiesOf(raw?.specialQty),
    fabricUpgrade: typeof raw?.fabricUpgrade === "string" ? raw.fabricUpgrade : null,
  };
}

/** The sofa models in the cart. */
export function cartSofaKeys(cart: CartLine[]): string[] {
  return [...new Set(cart.filter(l => l.kind === "sofa").map(l => l.key))];
}

/**
 * The charged leg heights and specials EVERY sofa model named may take — one
 * build makes every sofa in the cart, so a leg one model was turned ON for and
 * another was not is not offered (the server's `buildChoicesFor`). A price is
 * the value's own, whichever model lists it (Maintenance prices a value, not a model).
 */
export function sofaChoicesIn(catalog: QCatalog, modelKeys: Iterable<string>): QSofaChoices {
  const lists = [...new Set(modelKeys)].map(k => catalog.models.find(m => m.key === k)?.choices ?? NO_SOFA_CHOICES);
  if (!lists.length) return NO_SOFA_CHOICES;
  const [first, ...rest] = lists;
  const shared = (pick: (c: QSofaChoices) => OptionCharge[]) =>
    pick(first).filter(o => rest.every(c => pick(c).some(x => valueKey(x.value) === valueKey(o.value))));
  return { legs: shared(c => c.legs), specials: shared(c => c.specials), upgrades: shared(c => c.upgrades) };
}

/**
 * What the cart's sofas are charged for their options until the server says —
 * ONCE PER SOFA (the twin of `sofaSetCharges`): each model in the cart is a
 * sofa, as many as the fewest of its pieces. A special charged BY QUANTITY
 * (2026-10-26) is its charge each times the quantity set, once for the cart
 * (`specialQtyCharges`).
 */
export function sofaCartCharge(catalog: QCatalog | null, cart: CartLine[], build: SofaBuild): number {
  if (!catalog) return 0;
  const keys = cartSofaKeys(cart);
  if (!keys.length) return 0;
  const choices = sofaChoicesIn(catalog, keys);
  const picked = new Set(build.specials.map(sp => valueKey(sp)));
  const counted = choices.specials.filter(o => o.byQuantity && picked.has(valueKey(o.value)))
    .reduce((sum, o) => sum + o.charge * qtyIn(build.specialQty, o.value), 0);
  const unit = chargeIn(choices.legs, build.leg ?? undefined) + specialsCharge(choices.specials.filter(o => !o.byQuantity), build.specials)
    + chargeIn(choices.upgrades, build.fabricUpgrade ?? undefined);
  if (!(unit > 0)) return counted;
  return counted + keys.reduce((sum, key) => {
    const pieces = cart.filter(l => l.kind === "sofa" && l.key === key).map(l => l.qty);
    return sum + unit * Math.max(1, Math.floor(Math.min(...pieces)));
  }, 0);
}

/** The value as the list spells it, while the list still has it; null = not chosen or no longer offered. */
function offeredOne(value: string | null, list: string[]): string | null {
  const k = valueKey(value);
  return k === null ? null : list.find(v => valueKey(v) === k) ?? null;
}

/** The chosen values the list still has, in the list's order. */
function offeredAll(values: string[], list: string[]): string[] {
  const keys = new Set(values.map(v => valueKey(v)));
  return list.filter(v => keys.has(valueKey(v)));
}

/**
 * The build the server is asked to cost the cart's sofas with: its seat height
 * and tier, and only the leg height and specials every sofa model in the cart
 * still takes — one turned OFF on Modular (or no longer charged) since drops
 * out.
 */
export function sofaBuildToSend(build: SofaBuild, catalog: QCatalog | null, cart: CartLine[]): SofaBuild {
  const choices = catalog ? sofaChoicesIn(catalog, cartSofaKeys(cart)) : NO_SOFA_CHOICES;
  const specials = offeredAll(build.specials, choices.specials.map(o => o.value));
  return {
    ...build, leg: offeredOne(build.leg, choices.legs.map(o => o.value)), specials, specialQty: countedOf(choices.specials, specials, build.specialQty),
    fabricUpgrade: offeredOne(build.fabricUpgrade ?? null, choices.upgrades.map(o => o.value)),
  };
}

/** Each picked special charged by quantity, with its quantity (1 when none was set), as the list spells it. */
function countedOf(list: OptionCharge[], picked: string[], quantities: Record<string, number> | undefined): Record<string, number> {
  const counted = new Set(list.filter(o => o.byQuantity).map(o => valueKey(o.value)));
  return Object.fromEntries(picked.filter(sp => counted.has(valueKey(sp))).map(sp => [sp, qtyIn(quantities, sp)]));
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
  /** What this model AND every sofa model already in the cart may take: the charged legs (FOC besides) and the charged specials. */
  legs: OptionCharge[];
  specials: OptionCharge[];
  /** The sheet's leg height and specials, as far as they are still offered. */
  leg: string | null;
  picked: string[];
  /** How many of each picked special charged by quantity, as the list spells it. */
  qty: Record<string, number>;
  /** The back cushions of every sofa in the cart and of what this sheet adds — where a special charged by quantity starts. */
  compartments: number;
  /** The fabric upgrades it may take (Standard besides), and the sheet's, while still offered (null = Standard). */
  upgrades: OptionCharge[];
  fabricUpgrade: string | null;
}

/**
 * The seat height and fabric tier a sofa sheet would add with: the sheet's
 * own choice, else the cart's, else the lowest — among the cells every module
 * chosen here AND every sofa module already in the cart is costed in. And the
 * leg height and specials it may be made with.
 */
export function sofaPick(
  sh: Extract<SheetState, { mode: "sofa" }>,
  catalog: QCatalog,
  cart: CartLine[],
  build: SofaBuild,
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
  const options = sofaChoicesIn(catalog, [sh.key, ...cartSofaKeys(cart)]);
  const picked = offeredAll(sh.specials, options.specials.map(o => o.value));
  const inCartCushions = cart.filter(l => l.kind === "sofa")
    .reduce((sum, l) => sum + moduleCushions(moduleOf(catalog, l.productId)?.code ?? "") * l.qty, 0);
  const sheetCushions = sh.qty * (model?.modules.reduce((sum, x) => sum + moduleCushions(x.code) * (sh.mods[x.code] ?? 0), 0) ?? 0);
  return {
    graded, heights: choices.heights, tiers, height, tier, clash: graded && chosen.length > 0 && !choices.heights.length,
    legs: options.legs, specials: options.specials,
    leg: offeredOne(sh.leg, options.legs.map(o => o.value)), picked, qty: countedOf(options.specials, picked, sh.specialQty),
    compartments: inCartCushions + sheetCushions,
    upgrades: options.upgrades, fabricUpgrade: offeredOne(sh.fabricUpgrade ?? null, options.upgrades.map(o => o.value)),
  };
}
