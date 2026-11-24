// IR Quote's second catalogue source: the company's own Excel price list (the user, 2026-11-24: "我们的家私来源分为2样 —
// 一是 b2b, 第二个是 excel … 只要我打开，那业务的系统就能从中选择"). The b2b grabber's items and the Excel's stand side by
// side in `catalog.items`; an Excel item carries `src: "excel"`, its category (`kinds`) too. Each source has its own
// switch in Quote settings (`catalog.sources`), each item its own On / Paused as before.
//
// The sheet (The_Conts_Price_List_Master, PRICELIST): a header row with "Code", "Item Description", "中文说明",
// "Spec / Remark", "Unit", "Unit Cost", "Markup", "Selling Price", "Notes"; a row whose first cell reads "A. WALL &
// PAINTING 墙身 & 油漆" (and nothing priced) opens a category. The quote charges the Selling Price as it stands (the
// owner chose the Excel's own price over cost × the quote's markup).

export type Row = unknown[];
export type XlItem = { code: string; name: string; nameCn: string; spec: string; unit: string; cost: number; unitCost: number | null; note: string; cat: string };
export type PriceList = { cats: { key: string; label: string }[]; items: XlItem[] };
/** The parts of Quote settings' catalogue this file reads and writes (the rest of an item is kept as it is). */
export type CatItem = { id: string; src?: string; kind?: string; code?: string; name?: string; unit?: string; cost?: number | null; img?: string; imgOwn?: boolean; paused?: boolean; prevCost?: number; updatedAt?: number; [k: string]: unknown };
export type Catalog = { items?: CatItem[]; kinds?: Record<string, { label?: string; url?: string; src?: string; [k: string]: unknown }>; sources?: Partial<Record<"b2b" | "excel", { off?: boolean; file?: string; at?: number; n?: number }>> };

const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v: unknown): number | null => { if (typeof v === "number") return isFinite(v) ? v : null; const s = txt(v).replace(/[^\d.\-]/g, ""); if (!s) return null; const n = parseFloat(s); return isFinite(n) ? n : null; };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export const srcOf = (it: { src?: string } | null | undefined): "b2b" | "excel" => (it && it.src === "excel" ? "excel" : "b2b");
/** Is this item's source switched on? (a source with no setting is on) */
export const sourceOn = (catalog: Pick<Catalog, "sources"> | null | undefined, it: { src?: string }) => !((catalog && catalog.sources && catalog.sources[srcOf(it)]) || {}).off;

const HEAD: [keyof XlItem | "markup", RegExp][] = [
  ["code", /^code\b|编号/i],
  ["name", /item\s*desc|^description|^item$/i],
  ["nameCn", /中文/],
  ["spec", /spec|规格/i],
  ["unit", /^unit$|单位/i],
  ["unitCost", /unit\s*cost|成本/i],
  ["cost", /selling|售价/i],
  ["note", /notes?\b|备注/i],
];

/** The header row: the first one naming both a code and a selling price. */
function header(rows: Row[]) {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = (rows[r] || []).map(txt);
    const col: Record<string, number> = {};
    cells.forEach((c, i) => { if (!c) return; for (const [k, re] of HEAD) if (col[k] == null && re.test(c)) { col[k] = i; break; } });
    if (col.code != null && col.cost != null && col.name != null) return { r, col };
  }
  return null;
}

/** Reads the price list's rows (one sheet, as SheetJS's `sheet_to_json(…, { header: 1 })` gives them). */
export function parsePriceList(rows: Row[]): PriceList | null {
  const h = header(rows);
  if (!h) return null;
  const { col } = h, cell = (row: Row, k: string) => (col[k] == null ? "" : row[col[k]]);
  const cats: PriceList["cats"] = [], items: XlItem[] = [];
  let cat = "";
  const open = (label: string) => { const key = "xl-" + (slug(label) || "other"); if (!cats.some(c => c.key === key)) cats.push({ key, label }); cat = key; };
  for (let r = h.r + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const first = txt(row[0]), name = txt(cell(row, "name")), price = num(cell(row, "cost"));
    // "A. WALL & PAINTING 墙身 & 油漆" — a category; "— 以下空白列可自行新增项目 … —" — what follows is the sheet's own extras.
    if (/^[A-Z]\.\s+\S/.test(first) && !name && price == null) { open(first.replace(/^[A-Z]\.\s+/, "")); continue; }
    if (/^[—–-]/.test(first) && !name && price == null) { open("Others 其他"); continue; }
    if (!name || price == null || price <= 0) continue;
    if (!cat) open("Others 其他");
    items.push({ code: txt(cell(row, "code")), name, nameCn: txt(cell(row, "nameCn")), spec: txt(cell(row, "spec")), unit: txt(cell(row, "unit")),
      cost: Math.round(price * 100) / 100, unitCost: num(cell(row, "unitCost")), note: txt(cell(row, "note")), cat });
  }
  const used = new Set(items.map(i => i.cat));
  return { cats: cats.filter(c => used.has(c.key)), items };
}

/** Of a workbook's sheets, the one that reads as a price list: PRICELIST by name, else the first that parses. */
export function pickSheet(sheets: { name: string; rows: Row[] }[]): { name: string; list: PriceList } | null {
  const order = [...sheets].sort((a, b) => Number(!/price\s*list/i.test(b.name)) - Number(!/price\s*list/i.test(a.name)));
  for (const s of order) { const list = parsePriceList(s.rows); if (list && list.items.length) return { name: s.name, list }; }
  return null;
}

/**
 * Puts a price list into the catalogue in place of the Excel items it had: the b2b items are not touched. An item that
 * was Paused stays Paused when the new list has it again (same code and name); a photo the Principal gave it stays.
 * An Excel category no item (and no room type) uses any more goes.
 */
export function mergeExcel(catalog: Catalog, list: PriceList, file: string, now: number, newId: (p: string) => string, usedKinds: Set<string> = new Set()) {
  const old = (catalog.items || []).filter(x => x.src === "excel");
  const keyOf = (x: { code?: string; name?: string; unit?: string }) => [x.code || "", x.name || "", x.unit || ""].join("|").toUpperCase();
  const was = new Map<string, CatItem>(old.map(x => [keyOf(x), x]));
  const fresh: CatItem[] = list.items.map(i => {
    const o = was.get(keyOf(i));
    return { id: o ? o.id : newId("x"), src: "excel", kind: i.cat, kindLocked: true, code: i.code, name: i.name, nameCn: i.nameCn, spec: i.spec, unit: i.unit, note: i.note,
      cost: i.cost, unitCost: i.unitCost, noPrice: false, sample: false, specs: [i.spec, i.unit].filter(Boolean).join(" · "),
      img: o && o.imgOwn ? o.img : "", imgOwn: !!(o && o.imgOwn), paused: !!(o && o.paused),
      prevCost: o && Number(o.cost) !== i.cost ? (o.cost ?? undefined) : o ? o.prevCost : undefined,
      updatedAt: o && Number(o.cost) === i.cost && o.name === i.name ? o.updatedAt || now : now, checkedAt: now };
  });
  catalog.items = [...(catalog.items || []).filter(x => x.src !== "excel"), ...fresh];
  const K = (catalog.kinds = catalog.kinds || {});
  list.cats.forEach(c => { K[c.key] = { ...(K[c.key] || {}), label: c.label, url: "", src: "excel" }; });
  Object.keys(K).forEach(k => { if (K[k].src === "excel" && !list.cats.some(c => c.key === k) && !usedKinds.has(k)) delete K[k]; });
  const S = (catalog.sources = catalog.sources || {});
  S.excel = { ...(S.excel || {}), file, at: now, n: fresh.length };
  return { added: fresh.filter(x => !was.has(keyOf(x))).length, changed: fresh.filter(x => x.prevCost != null && x.updatedAt === now && was.has(keyOf(x))).length, removed: old.filter(o => !fresh.some(f => f.id === o.id)).length, total: fresh.length };
}

/** The part of SheetJS this file reads. */
type Sheets = {
  read: (data: ArrayBuffer) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json: (ws: unknown, o: { header: 1; defval: string }) => Row[] };
};

/** SheetJS, loaded once from its CDN as Quote settings' other Excel readers load it. */
export function loadXlsx(): Promise<Sheets> {
  const w = window as unknown as { XLSX?: Sheets };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  return new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"; sc.onload = () => (w.XLSX ? res(w.XLSX) : rej(new Error("SheetJS did not load"))); sc.onerror = rej; document.head.appendChild(sc); });
}

/** Reads an uploaded workbook into its price list, or says why not (in the words Quote settings shows). */
export async function readPriceListFile(file: File): Promise<{ name: string; list: PriceList } | { error: string }> {
  try {
    const X = await loadXlsx(), wb = X.read(await file.arrayBuffer());
    const found = pickSheet(wb.SheetNames.map(n => ({ name: n, rows: X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" }) })));
    return found || { error: "No price list found in " + file.name + ". It needs a header row with Code, Item Description and Selling Price." };
  } catch { return { error: "Could not read this file." }; }
}

/** The kinds the room types still use: an Excel category one of them names is not dropped by an upload. */
export const kindsInPackages = (cfg: { packages?: { cats?: { items?: { kind?: string | null }[] }[] }[] }) => {
  const used = new Set<string>();
  (cfg.packages || []).forEach(p => (p.cats || []).forEach(ct => (ct.items || []).forEach(i => { if (i.kind) used.add(i.kind); })));
  return used;
};

export const uploadMessage = (r: { total: number; added: number; changed: number; removed: number }, sheet: string) =>
  `Excel price list: ${r.total} items from ${sheet} (${r.added} new, ${r.changed} price changed, ${r.removed} gone). Press Publish to save.`;
