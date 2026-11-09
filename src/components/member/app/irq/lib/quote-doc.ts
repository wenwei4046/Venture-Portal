/* eslint-disable */
// @ts-nocheck — ported from the prototype; kept as it is so the documents and prices come out the same.
import { irqStorage } from "../storage";
// Shared by IR Quote and Quote Settings: the saved configuration and the quotation document.
export const STORE = "irq.config.v1";
export const PREVIEW = "irq.preview.v1";

export const COLUMNS = [
  { key: "no", label: "NO", show: true, num: false },
  { key: "item", label: "ITEM", show: true, num: false },
  { key: "desc", label: "DESCRIPTION", show: true, num: false },
  { key: "code", label: "CODE/COLOUR", show: true, num: false },
  { key: "photo", label: "PHOTO", show: true, num: false },
  { key: "qty", label: "QTY", show: true, num: true },
  { key: "price", label: "PRICE", show: false, num: true },
  { key: "sum", label: "SUM", show: false, num: true }
];

export const FACTS = [
  { key: "att", label: "ATTENTION :" }, { key: "by", label: "Prepared By" },
  { key: "bill", label: "BILLING ADDRESS:" }, { key: "building", label: "Building" },
  { key: "address", label: "ADDRESS :" }, { key: "unit", label: "Unit" },
  { key: "layout", label: "LAYOUT" }, { key: "date", label: "Date" }
];

// Custom fields: used as quotation blocks (type "field") and as building fields.
export const FIELD_KINDS = [
  { k: "short", label: "Short text", icon: "Aa" }, { k: "long", label: "Long text", icon: "¶" },
  { k: "number", label: "Number", icon: "#" }, { k: "date", label: "Date", icon: "▦" },
  { k: "link", label: "Link", icon: "↗" }, { k: "image", label: "Image", icon: "▣" },
  { k: "table", label: "Table", icon: "▤" }
];
export const COL_KINDS = [
  { k: "text", label: "Text", icon: "Aa" }, { k: "number", label: "Number", icon: "#" },
  { k: "date", label: "Date", icon: "▦" }, { k: "money", label: "Money (RM)", icon: "RM" }, { k: "image", label: "Image", icon: "▣" }
];
export const kindLabel = k => (FIELD_KINDS.find(x => x.k === k) || COL_KINDS.find(x => x.k === k) || {}).label || k;
export const isEmpty = (f, v) => f.kind === "table" ? !(Array.isArray(v) && v.some(r => Object.values(r || {}).some(x => x !== "" && x != null))) : v == null || String(v).trim() === "";
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const fmtDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : (v || ""); };
export function fileToDataUrl(file, max = 1400) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = rej;
    r.onload = () => { const img = new Image(); img.onerror = rej; img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); const x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL("image/jpeg", .85)); }; img.src = r.result; };
    r.readAsDataURL(file);
  });
}
// One field as table rows of the quotation (n = column count of the outer table).
export function fieldRows(f, v, n, b) {
  if (isEmpty(f, v)) return "";
  const size = b?.size || 12.5, al = b?.align || "left", bold = b?.bold ? "font-weight:bold;" : "";
  const td = (inner, extra = "") => `<tr><td colspan="${n}" style="text-align:${al};font-size:${size}px;${bold}padding:3px 6px;${extra}">${inner}</td></tr>`;
  // A name still the type's own ("Short text") is no name: only the answer prints (the user, 2026-11-06).
  const named = f.label && !FIELD_KINDS.some(k => k.label === f.label);
  const lab = named ? `<b>${esc(f.label)}</b>` : "";
  const labRow = named ? td(lab, "padding-top:8px") : "";
  if (["short", "number", "date", "link"].includes(f.kind)) {
    const val = f.kind === "date" ? esc(fmtDate(v)) : f.kind === "link" ? `<a href="${esc(v)}" style="color:#1C1714">${esc(v)}</a>` : esc(v);
    return td(named ? `${lab}&nbsp;&nbsp;${val}` : val);
  }
  if (f.kind === "long") return labRow + td(esc(v), "white-space:pre-wrap;line-height:1.45");
  if (f.kind === "image") return labRow + td(`<img src="${esc(v)}" style="max-width:100%;max-height:110mm">`);
  if (f.kind === "table") {
    const cols = f.columns || [];
    const cv = (c, x) => x == null || x === "" ? "" : c.kind === "image" ? `<img src="${esc(x)}" style="height:48px">` : c.kind === "money" ? "RM " + money(+x || 0) : c.kind === "date" ? esc(fmtDate(x)) : esc(x);
    const num = c => c.kind === "number" || c.kind === "money";
    const head = cols.map(c => `<td style="padding:5px 6px;background:#E7E5DE;border-top:1px solid #bbb;border-bottom:1px solid #bbb;font-weight:bold;font-size:${size - 1}px;${num(c) ? "text-align:right" : ""}">${esc(c.label)}</td>`).join("");
    const body = v.map(r => `<tr>${cols.map(c => `<td style="padding:4px 6px;border-bottom:1px solid #ddd;font-size:${size}px;${num(c) ? "text-align:right" : ""}">${cv(c, r[c.id])}</td>`).join("")}</tr>`).join("");
    return labRow + `<tr><td colspan="${n}" style="padding:2px 6px 6px"><table style="width:100%;border-collapse:collapse">${head ? `<tr>${head}</tr>` : ""}${body}</table></td></tr>`;
  }
  return "";
}

// Plain view-model for editing one field value (IR Quote and Buildings share it).
/** The sections' answers with every picture the Principal's: an image section's own value, a table's picture cells its
 * default rows' — whatever a draft kept from before (2026-11-09: sales upload no picture of their own). */
export function principalPictures(blocks, extra) {
  const out = { ...(extra || {}) };
  (blocks || []).filter(b => b.type === "field").forEach(b => {
    if (b.kind === "image") { delete out[b.id]; return; }
    if (b.kind !== "table" || !Array.isArray(out[b.id])) return;
    const pics = (b.columns || []).filter(c => c.kind === "image").map(c => c.id), base = Array.isArray(b.value) ? b.value : [];
    if (pics.length) out[b.id] = out[b.id].map((r, i) => { const x = { ...r }; pics.forEach(id => { x[id] = (base[i] || {})[id] || ""; }); return x; });
  });
  return out;
}
// `upload: false` (the quote): sales put no picture of their own — an image is the Principal's, as Quote Settings set it (2026-11-09).
export function fieldEditor(f, v, setV, { upload = true } = {}) {
  const k = f.kind, val = k === "image" && !upload ? (f.value ?? "") : (v ?? "");
  const num = c => c.kind === "number" || c.kind === "money";
  const o = {
    label: f.label, required: !!f.required, span: ["long", "image", "table"].includes(k) ? "1 / -1" : "auto",
    isInput: ["short", "number", "date", "link"].includes(k), isLong: k === "long", isImage: k === "image", isTable: k === "table",
    inputType: k === "number" ? "number" : k === "date" ? "date" : k === "link" ? "url" : "text",
    value: k === "table" ? "" : String(val), ph: k === "link" ? "https://" : "",
    onChange: e => setV(e.target.value),
    img: k === "image" ? String(val) : "", hasImg: k === "image" && !!val, imgEmpty: val ? "" : "No image", canUpload: upload,
    onUpload: e => { const file = e.target.files && e.target.files[0]; e.target.value = ""; if (file) fileToDataUrl(file).then(setV); },
    clear: () => setV(""), cols: [], rows: [], grid: "", minW: "0", addRow: () => {}
  };
  if (k === "table") {
    const cols = f.columns || [], rows = Array.isArray(v) && v.length ? v : [{}];
    const setRows = fn => { const r = JSON.parse(JSON.stringify(rows)); fn(r); setV(r); };
    o.cols = cols.map(c => ({ label: c.label, align: num(c) ? "right" : "left" }));
    o.grid = cols.map(c => c.kind === "image" ? "84px" : "minmax(110px,1fr)").join(" ") + " 34px";
    o.minW = (cols.length * 116 + 34) + "px";
    o.rows = rows.map((r, ri) => ({
      remove: () => setRows(x => { x.splice(ri, 1); }),
      cells: cols.map(c => ({
        isImg: c.kind === "image", isInput: c.kind !== "image",
        type: num(c) ? "number" : c.kind === "date" ? "date" : "text", ph: c.kind === "money" ? "RM" : "", align: num(c) ? "right" : "left",
        value: r[c.id] ?? "", img: c.kind === "image" ? (r[c.id] || "") : "", imgEmpty: r[c.id] || !upload ? "" : "+",
        canUpload: upload, cursor: upload ? "pointer" : "default", tip: upload ? "Upload image" : "",
        onChange: e => { const x = e.target.value; setRows(R => { R[ri][c.id] = x; }); },
        onUpload: e => { const file = e.target.files && e.target.files[0]; e.target.value = ""; if (file) fileToDataUrl(file, 600).then(d => setRows(R => { R[ri][c.id] = d; })); }
      }))
    }));
    o.addRow = () => setRows(x => { x.push({}); });
  }
  return o;
}

let uid = 0;
export const newId = p => `${p}${Date.now().toString(36)}${(uid++).toString(36)}`;

export function letterRows(co) {
  co = co || {};
  return [
    { id: newId("lr-"), text: co.name || "", size: 16, bold: true },
    { id: newId("lr-"), text: co.reg || "", size: 11, bold: false },
    ...(co.addr || []).map(a => ({ id: newId("lr-"), text: a, size: 12, bold: false })),
    { id: newId("lr-"), text: `PHONE : ${co.phone || ""} // EMAIL : ${co.email || ""}`, size: 12, bold: false }
  ];
}

export function defaultBlocks(company) {
  return [
    { id: "b-head", type: "letterhead", align: "center", size: 12, bold: false, hidden: false, rows: letterRows(company), logo: "", logoPos: "left", logoH: 64 },
    { id: "b-title", type: "heading", text: "QUOTATION", align: "center", size: 15, bold: true, hidden: false },
    { id: "b-facts", type: "facts", align: "left", size: 12.5, bold: false, hidden: false, labels: FACTS.map(f => ({ ...f })) },
    { id: "b-intro", type: "text", text: "We refer to our meeting with regards the above captioned matter and we are pleased to submit our quotain as follow : -", align: "left", size: 12.5, bold: false, hidden: false },
    { id: "b-table", type: "table", align: "left", size: 12, bold: false, hidden: false, columns: COLUMNS.map(c => ({ ...c })) },
    { id: "b-totals", type: "totals", align: "right", size: 12.5, bold: false, hidden: false, labels: { total: "TOTAL (RM)", discount: "Discount", saving: "Package saving" } },
    { id: "b-terms", type: "terms", align: "left", size: 11.5, bold: false, hidden: false, lines: (company?.terms || []).slice() }
  ];
}

export function deriveGroups(packages) {
  const map = new Map();
  packages.forEach(p => {
    const g = p.group || p.id;
    if (!map.has(g)) map.set(g, { id: g, label: p.groupLabel || p.name, building: p.building || "", spec: p.spec || {} });
    map.get(g)[p.style === "build" ? "build" : "classic"] = p.id;
  });
  return [...map.values()];
}

/** "Classic" / "Build in" only while the room type has both: with one version there is nothing to tell apart (the user, 2026-11-06). */
export function versionWord(packages, p) {
  if (!p) return "";
  const g = p.group || p.id, both = (packages || []).some(x => x.id !== p.id && (x.group || x.id) === g);
  return both ? (p.style === "build" ? "Build in" : "Classic") : "";
}
/** A package's name as printed: without its version's word when it is the only version. */
export function packageName(packages, p) {
  if (!p) return "";
  return versionWord(packages, p) ? p.name : String(p.name || "").replace(/\s+(BUILD IN|CLASSIC)$/i, "");
}

export function defaults(packagesJson, catalogJson) {
  const building = packagesJson.building || "SKYLINE EMBASSY";
  const packages = packagesJson.packages.map(p => ({ ...p, building: p.building || building }));
  return {
    v: 1,
    company: { ...packagesJson.company },
    markup: packagesJson.markup || 1.3,
    buildings: [{ id: "bld-1", name: building, developer: packagesJson.buildingInfo?.developer || "", address: packagesJson.buildingInfo?.address || "", url: "https://www.skylineembassy.com/" }],
    packages,
    catalog: { kinds: { ...catalogJson.kinds }, items: catalogJson.items.map((it, i) => ({ id: "c" + i, ...it })) },
    doc: { font: "Times", blocks: defaultBlocks(packagesJson.company) },
    bldFields: [],
    saved: null
  };
}

// Package price = sum of its items (cost × qty). No separate package price.
// Room-type items follow the Catalogue (b2b price = selling price) unless marked fixed.
export function syncPrices(cfg) {
  const by = new Map(); ((cfg.catalog && cfg.catalog.items) || []).forEach(c => { if (c.code && c.cost != null && !c.noPrice) by.set(String(c.code).trim().toUpperCase(), +c.cost); });
  (cfg.packages || []).forEach(p => (p.cats || []).forEach(c => c.items.forEach(it => {
    const k = String(it.code || "").trim().toUpperCase(), cp = k ? by.get(k) : undefined;
    it.linked = cp != null;
    if (it.fixed) return;
    if (cp != null) it.cost = cp; else it.fixed = true;
  })));
  return cfg;
}
const withSum = cfg => { syncPrices(cfg); (cfg.packages || []).forEach(p => { p.price = Math.round((p.cats || []).reduce((a, c) => a + c.items.reduce((b, it) => b + (+it.cost || 0) * (+it.qty || 1), 0), 0)); }); return cfg; };
// The quote's sections — the Customize step's tabs (the user, 2026-11-09: "新增电器；是否可以在哪个位置可以让我control加什么类型";
// a new one is "多一个分页" and behaves "像家私"). Furniture and Services are built in; Quote settings › Categories adds,
// names and orders the rest. `goods`: its items are products (Change item, photos, the Style step's furniture list).
export const DEFAULT_SECTIONS = [
  { id: "furn", label: "Furniture", head: "FURNITURE & APPLIANCES", goods: true },
  { id: "serv", label: "Services", head: "SERVICES & FITTINGS", goods: false },
];
export const sectionsOf = cfg => (Array.isArray(cfg && cfg.sections) && cfg.sections.length ? cfg.sections : DEFAULT_SECTIONS).map(s => ({ ...s, head: s.head || String(s.label || "").toUpperCase() }));
/** A room type category's section: the one it names while that one exists, else by its rows (a catalogue code: Furniture). */
export const sectionOfCat = (cfg, c) => { const ids = sectionsOf(cfg).map(s => s.id); return c && c.section && ids.includes(c.section) ? c.section : (c && (c.items || []).some(i => i.kind) ? "furn" : "serv"); };
export const goodsSection = (cfg, id) => !!(sectionsOf(cfg).find(s => s.id === id) || {}).goods;
export const DEFAULT_STYLES = [{ id: "muji", name: "Muji", desc: "Light oak, linen and calm neutrals" }, { id: "modern", name: "Modern", desc: "Clean lines, darker tones, metal accents" }, { id: "nordic", name: "Nordic", desc: "Bright, airy, soft textures" }];
// Customer info: CRM fields mirror CRM › Customer form (read-only here). "own" = quote-only fields.
export const CRM_FIELDS = [
  { id: "name", label: "Name", section: "Contact", core: true },
  { id: "phone", label: "Phone", section: "Contact" },
  { id: "type", label: "Property type", section: "Property" },
  { id: "size", label: "Unit size", section: "Property" },
  { id: "loc", label: "Unit location", section: "Property" },
  { id: "req", label: "Requirement", section: "Property" },
  { id: "budget", label: "Budget", section: "Property" }
];
export const CRM_CUSTOMERS = [
  { id: "c1", name: "Tan Wei Ming", phone: "012-338 4471", ptype: "Condo", usize: "3R 2R", uloc: "Skyline Embassy, Block B", req: "Full furnish, move in by March", budget: "RM 40k – 50k" },
  { id: "c2", name: "Nurul Aisyah", phone: "019-772 0153", ptype: "Condo", usize: "2R 2R", uloc: "Skyline Embassy, Block A", req: "Rental unit, durable finishes", budget: "RM 30k – 35k" },
  { id: "c3", name: "Jason Lee", phone: "016-205 9984", ptype: "Condo", usize: "4R 2R", uloc: "Skyline Embassy, Block C", req: "Family of 5, needs study room", budget: "RM 50k+" },
  { id: "c4", name: "Priya Raman", phone: "011-6120 3348", ptype: "Condo", usize: "2R 1R", uloc: "Skyline Embassy, Block A", req: "Airbnb setup", budget: "RM 25k – 30k" },
  { id: "c5", name: "Lim Siew Ling", phone: "017-889 2210", ptype: "Landed", usize: "4R 3R", uloc: "Setia Alam", req: "Living and master bedroom only", budget: "RM 35k" }
];
// Whether a quote-only field prints on the quotation. Core fields print unless unticked — but Billing address only
// when the Principal ticks it (the user, 2026-11-09): it is also then asked on the quote's Customer step.
export const printsOwn = f => f.id === "bill" ? f.print === true : f.core ? f.print !== false : !!f.print;
export const billOn = cfg => (((cfg && cfg.custInfo) || {}).own || []).some(o => o.id === "bill" && o.print === true);
export const factsOff = cfg => { const own = ((cfg && cfg.custInfo) || {}).own || []; const off = new Set(own.filter(o => o.core && !printsOwn(o)).map(o => o.id)); if (!billOn(cfg)) off.add("bill"); return off; };
export const defaultCustInfo = () => ({
  crm: { name: { show: true, print: true }, phone: { show: true, print: false }, type: { show: true, print: false }, size: { show: true, print: false }, loc: { show: false, print: false }, req: { show: true, print: false }, budget: { show: true, print: false } },
  own: [
    { id: "unit", label: "Unit no.", type: "short", ph: "e.g. B-23-05", core: true, required: false },
    { id: "bill", label: "Billing address", type: "short", ph: "Optional", core: true, required: false },
    { id: "building", label: "Building", type: "short", ph: "e.g. Skyline Embassy", core: true, required: false },
    { id: "date", label: "Date", type: "date", ph: "", core: true, required: false },
    { id: "by", label: "Prepared by", type: "short", ph: "", core: true, required: false }
  ]
});
// Fix catalogue items whose b2b category put them in the wrong kind (e.g. TV cabinets filed under "Living room" → sofa).
export function guessKind(name, kinds, strict) {
  const N = " " + String(name || "").toUpperCase().replace(/[^A-Z]+/g, " ") + " ";
  const ALIAS = { "BED FRAME": ["BED FRAME", "BED"], "TV CABINET": ["TV CABINET", "TV CONSOLE", "MEDIA UNIT", "TV UNIT"], "TV": ["SMART TV", "GOOGLE TV", "ANDROID TV"], "SIDE TABLE": ["SIDE TABLE", "BEDSIDE", "NIGHTSTAND", "END TABLE"], "DINING CHAIR": strict ? ["DINING CHAIR"] : ["DINING CHAIR", "CHAIR"], "WARDROBE": ["WARDROBE"], "MATTRESS": ["MATTRESS"], "SOFA": ["SOFA", "SEATER", "SECTIONAL"], "COFFEE TABLE": ["COFFEE TABLE"], "DINING TABLE": strict ? ["DINING TABLE"] : ["DINING TABLE", "EXT TABLE", "RECTANGLE TABLE", "ROUND TABLE"] };
  let best = "", score = 0;
  Object.entries(kinds || {}).forEach(([k, v]) => { const L = String(v.label || k).toUpperCase(); (ALIAS[L] || [L]).forEach((w, i) => { if (N.includes(" " + w + " ")) { const s = w.length * 10 - i; if (s > score) { score = s; best = k; } } }); });
  return best;
}
export function fixKinds(cfg) { const K = cfg.catalog && cfg.catalog.kinds; (cfg.catalog && cfg.catalog.items || []).forEach(it => { if (it.kindLocked) return; if (it.kind && K[it.kind] && guessKind(it.name, { [it.kind]: K[it.kind] })) return; const g = guessKind(it.name, K, true); if (g && g !== it.kind) it.kind = g; }); return cfg; }
// A room type's name is its room count, then its Note as typed — "3R 1R", "3R 1R Type A" (the user, 2026-11-09:
// "几房几厕不动，但可能可以在后面加一点文字"). One without a room count keeps the name it was given.
export const sizeName = spec => { const b = parseInt((spec || {}).beds), t = parseInt((spec || {}).baths); return b && t ? b + "R " + t + "R" : ""; };
export const roomName = spec => [sizeName(spec), String((spec || {}).note || "").trim()].filter(Boolean).join(" ");
export function nameRooms(cfg) {
  (cfg.packages || []).forEach(p => { if (!sizeName(p.spec)) return; const lab = roomName(p.spec); p.groupLabel = lab; p.layout = lab; p.name = lab + " " + (p.style === "build" ? "BUILD IN" : "CLASSIC"); });
  return cfg;
}
export function load(packagesJson, catalogJson, key = STORE) { const c = nameRooms(withSum(fixKinds(load0(packagesJson, catalogJson, key)))); if (!c.custInfo) c.custInfo = defaultCustInfo(); if (!Array.isArray(c.styles)) c.styles = DEFAULT_STYLES.map(x => ({ ...x })); return c; }
function load0(packagesJson, catalogJson, key) {
  const base = defaults(packagesJson, catalogJson);
  try {
    const raw = irqStorage.getItem(key) || (key !== STORE ? irqStorage.getItem(STORE) : null);
    if (!raw) return base;
    const s = JSON.parse(raw);
    // Fill fields added after a config was saved (unit specs, building developer).
    if (s.packages) s.packages = s.packages.map(p => p.spec ? p : { ...p, spec: { ...(base.packages.find(b => b.id === p.id)?.spec || {}) } });
    if (s.buildings) s.buildings = s.buildings.map(b => { const o = base.buildings.find(x => x.name === b.name); return o ? { ...b, developer: b.developer ?? o.developer, address: b.address || o.address } : b; });
    const co = { ...base.company, ...(s.company || {}) };
    (s.doc?.blocks || []).forEach(b => { if (b.type === "letterhead" && !b.rows) { b.rows = letterRows(co); b.logo = b.logo || ""; b.logoPos = b.logoPos || "left"; b.logoH = b.logoH || 64; } });
    return { ...base, ...s, company: { ...base.company, ...(s.company || {}) }, doc: s.doc || base.doc, catalog: s.catalog || base.catalog, bldFields: s.bldFields || [] };
  } catch (e) { return base; }
}

export function save(config) {
  irqStorage.setItem(STORE, JSON.stringify(config));
}
export function savePreview(config) { try { irqStorage.setItem(PREVIEW, JSON.stringify(config), 600); } catch (e) {} }
export function reset() { irqStorage.removeItem(STORE); }

// "2 Bedrooms · 2 Bathrooms · Twin-Key · 841 sq.ft."
export function specText(spec, short = false) {
  if (!spec) return "";
  const pl = (n, w) => n ? `${n} ${short ? w.slice(0, 4).toLowerCase().replace("bedr", "bed").replace("bath", "bath") : w + (n === "1" ? "" : "s")}` : "";
  return [pl(spec.beds, "Bedroom"), pl(spec.baths, "Bathroom"), spec.sqft ? `${spec.sqft} sq.ft.` : ""].filter(Boolean).join(" · ");
}

export const FONTS = {
  Georgia: "Georgia, 'Noto Serif SC', serif",
  Helvetica: "Helvetica, Arial, 'Noto Sans SC', sans-serif",
  Times: "'Times New Roman', Times, 'Noto Serif SC', serif"
};

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const money = n => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Style moodboard, laid out by photo count so nothing overlaps (max 12).
export function moodRows(mb, n, b) {
  const imgs = (mb.imgs || []).filter(Boolean).slice(0, 12), k = imgs.length;
  if (!k) return "";
  const tile = (src, extra) => `<div style="${extra}min-width:0;min-height:0;overflow:hidden;border-radius:3px;background:#EEEDE8"><img src="${esc(src)}" alt="" style="display:block;width:100%;height:100%;object-fit:cover"></div>`;
  const head = `<tr style="break-after:avoid;page-break-after:avoid"><td colspan="${n}" style="padding:12px 6px 6px"><div style="display:flex;justify-content:space-between;align-items:baseline;font-size:${b.size}px"><span style="font-weight:bold;letter-spacing:.08em">STYLE PREVIEW · ${esc(String(mb.name || "").toUpperCase())}</span><span style="font-size:${b.size - 1}px;color:#6B6660">${esc([mb.note, k + " photo" + (k === 1 ? "" : "s")].filter(Boolean).join(" · "))}</span></div></td></tr>`;
  const row = (inner, pad = "0 6px 4px") => `<tr style="break-inside:avoid;page-break-inside:avoid"><td colspan="${n}" style="padding:${pad}">${inner}</td></tr>`;
  if (k <= 5) {
    // 1–5: one large photo + the rest beside it
    const L = {
      1: ["1fr", "1fr", ["'a'"]], 2: ["1fr 1fr", "1fr", ["'a b'"]], 3: ["3fr 2fr", "1fr 1fr", ["'a b'", "'a c'"]],
      4: ["2fr 1fr 1fr", "1fr 1fr", ["'a b b'", "'a c d'"]], 5: ["2fr 1fr 1fr", "1fr 1fr", ["'a b c'", "'a d e'"]]
    }[k];
    const cells = imgs.map((src, i) => tile(src, `grid-area:${"abcde"[i]};`)).join("");
    return head + row(`<div style="display:grid;grid-template-columns:${L[0]};grid-template-rows:${L[1]};grid-template-areas:${L[2].join(" ")};gap:4px;height:${k === 1 ? 300 : 260}px">${cells}</div>`, "0 6px 6px");
  }
  // 6+: rows of three (2 when it can't split evenly). Each row is its own unit so the PDF can break between rows, never through a photo.
  let out = head;
  // row sizes: threes; a leftover single photo turns the last two rows into 2 + 2 (7 → 3·2·2, 10 → 3·3·2·2)
  const sizes = Array(Math.floor(k / 3)).fill(3); if (k % 3 === 2) sizes.push(2); if (k % 3 === 1) sizes.splice(-1, 1, 2, 2);
  let i = 0;
  sizes.forEach((sz, r) => { const chunk = imgs.slice(i, i + sz); i += sz;
    out += row(`<div style="display:grid;grid-template-columns:repeat(${sz},1fr);gap:4px;height:${sz === 3 ? 150 : 180}px">${chunk.map(src => tile(src, "")).join("")}</div>`, r === sizes.length - 1 ? "0 6px 6px" : "0 6px 4px"); });
  return out;
}

/** The item table's photo, in px (Quote settings › Item table › Photo size; 80 unless set — it was 56). */
export const PHOTO_SIZE = 80;
export const photoSizeOf = tb => Math.max(40, Math.min(140, +(tb && tb.photoSize) || PHOTO_SIZE));
/** CODE/COLOUR's text, in px (Quote settings › Item table › Code / colour text; the table's own size unless set). */
export const codeSizeOf = tb => Math.max(7, Math.min(20, +(tb && tb.codeSize) || +(tb && tb.size) || 12));
/**
 * Draws each [data-fit] cell on one line, smaller only as far as it must (down to 72%); one that still does not fit wraps.
 * Measured in the page, so a short answer keeps its size (2026-11-09: "怎么有大有小" — a guess by length shrank some that fit).
 */
export const FIT_SCRIPT = "<script>(function(){var de=document.documentElement,w=de.style.width,c=document.querySelectorAll('[data-fit]');de.style.width='748px';for(var i=0;i<c.length;i++){var e=c[i],s=parseFloat(e.style.fontSize)||12,m=s*.72;e.style.whiteSpace='nowrap';while(e.scrollWidth>e.clientWidth+1&&s>m){s=Math.max(m,s-.25);e.style.fontSize=s+'px';}e.style.whiteSpace='';}de.style.width=w;})();</script>"; // measured at A4 (748px = 688px of print + the screen padding), then wrapping as usual

/**
 * The customer details in columns of their own (the user, 2026-11-09: "这边的资料排版也很奇怪，能把这些栏位是固定的，客户输入的
 * 资料，如果太多就自动缩小文字"): label | answer | label | answer at fixed widths, whatever the item table's columns are. A label prints
 * as Quote settings names it (the user sets its case); a label or answer too long for its cell is drawn smaller (`FIT_SCRIPT`). The form's own
 * fields (PHONE …) take a label and the rest of the row. Excel keeps the table's own columns.
 */
export function factsTable(L, q, b, cell, n) {
  const lab = t => `<td data-fit="" style="${cell(b, "font-weight:bold;padding:2px 6px;vertical-align:top;white-space:nowrap;")}">${esc(t)}</td>`;
  const val = (v, span = 1) => `<td data-fit=""${span > 1 ? ` colspan="${span}"` : ""} style="${cell(b, "padding:2px 6px;vertical-align:top;overflow-wrap:anywhere;")}">${esc(String(v || "-"))}</td>`;
  let rows = "";
  for (let i = 0; i < L.length; i += 2) {
    const a = L[i], c = L[i + 1];
    rows += "<tr>" + lab(a.label) + val(q.facts[a.key]) + (c ? lab(c.label) + val(q.facts[c.key]) : "<td></td><td></td>") + "</tr>";
  }
  (q.custRows || []).forEach(r => { rows += "<tr>" + lab(String(r.label).toUpperCase() + " :") + val(r.value, 3) + "</tr>"; });
  if (!rows) return "";
  return `<tr><td colspan="${n}" style="padding:0"><table style="width:100%;table-layout:fixed;border-collapse:collapse"><colgroup><col style="width:17%"><col style="width:33%"><col style="width:17%"><col style="width:33%"></colgroup>${rows}</table></td></tr>`;
}

// q: { facts: {key: value}, cats: [{name, rows: [{no,item,desc,code,qty,unit,sum}]}], discount, saving, total }
export function renderDoc(config, q, { excel = false, title = "Quotation" } = {}) {
  const co = config.company;
  const blocks = config.doc.blocks.filter(b => !b.hidden);
  const tb = config.doc.blocks.find(b => b.type === "table");
  const cols = (tb ? tb.columns : COLUMNS).filter(c => c.show && !(excel && c.key === "photo"));
  const n = Math.max(cols.length, 4);
  const font = FONTS[config.doc.font] || FONTS.Georgia;
  const cell = (b, extra = "") => `text-align:${b.align};font-size:${b.size}px;${b.bold ? "font-weight:bold;" : ""}${b.italic ? "font-style:italic;" : ""}${b.underline ? "text-decoration:underline;" : ""}${extra}`;
  let out = "";
  blocks.forEach(b => {
    if (b.type === "letterhead") {
      const rows = b.rows || letterRows(co);
      const lines = rows.filter(r => r.text).map(r => `<div style="font-size:${r.size}px;${r.bold ? "font-weight:bold;" : ""}${r.italic ? "font-style:italic;" : ""}${r.underline ? "text-decoration:underline;" : ""}line-height:1.45">${esc(r.text)}</div>`).join("");
      const logo = b.logo ? `<img src="${esc(b.logo)}" style="height:${b.logoH || 64}px;width:auto">` : "";
      if (!logo || b.logoPos === "center") {
        out += `<tr><td colspan="${n}" style="text-align:${b.align};padding:1px 6px">${logo ? `<div style="text-align:center;margin-bottom:8px">${logo}</div>` : ""}${lines}</td></tr>`;
      } else {
        const lt = `<td style="width:1%;padding:0 14px 0 0;vertical-align:middle">${logo}</td>`, rt = `<td style="width:1%;padding:0 0 0 14px;vertical-align:middle">${logo}</td>`;
        const tx = `<td style="text-align:${b.align};vertical-align:middle">${lines}</td>`;
        out += `<tr><td colspan="${n}" style="padding:1px 6px"><table style="width:100%;border-collapse:collapse"><tr>${b.logoPos === "right" ? tx + rt : lt + tx}</tr></table></td></tr>`;
      }
    } else if (b.type === "heading" || b.type === "text") {
      out += `<tr><td colspan="${n}" style="${cell(b, "padding:" + (b.type === "heading" ? "14px 6px 10px;letter-spacing:.14em" : "8px 6px") + ";white-space:pre-wrap")}">${esc(b.text)}</td></tr>`;
    } else if (b.type === "spacer") {
      out += `<tr><td colspan="${n}" style="height:${b.size * 2}px"></td></tr>`;
    } else if (b.type === "field") {
      out += fieldRows(b, (q.extra || {})[b.id] ?? b.value, n, b);
    } else if (b.type === "facts") {
      const offK = factsOff(config); const L = b.labels.filter(f => !f.hidden && !offK.has(f.key));
      const half = Math.ceil(n / 2);
      if (!excel) out += factsTable(L, q, b, cell, n);
      else for (let i = 0; i < L.length; i += 2) {
        const a = L[i], c = L[i + 1];
        out += `<tr><td style="${cell(b, "font-weight:bold;padding:2px 6px")}">${esc(a.label)}</td><td colspan="${half - 1}" style="${cell(b, "padding:2px 6px")}">${esc(q.facts[a.key] || "-")}</td>` +
          (c ? `<td style="${cell(b, "font-weight:bold;padding:2px 6px")}">${esc(c.label)}</td><td colspan="${n - half - 1}" style="${cell(b, "padding:2px 6px")}">${esc(q.facts[c.key] || "-")}</td>` : "") + "</tr>";
      }
      if (excel) (q.custRows || []).forEach(r => { out += `<tr><td style="${cell(b, "font-weight:bold;padding:2px 6px")}">${esc(String(r.label).toUpperCase())} :</td><td colspan="${n - 1}" style="${cell(b, "padding:2px 6px")}">${esc(r.value || "-")}</td></tr>`; });
      const bx = q.building?.extra || {};
      (config.bldFields || []).filter(f => f.show).forEach(f => { out += fieldRows(f, bx[f.id], n, b); });
      if (q.moodboard && !excel) out += moodRows(q.moodboard, n, b);
    // Every cell framed (the user, 2026-11-09: "quotation没有线，有点难看懂"): the head, each row, each category.
    } else if (b.type === "table") {
      const ps = photoSizeOf(b), cs = codeSizeOf(b); // Quote settings › Item table: Photo size, Code / colour text (2026-11-09)
      out += `<tr style="background:#E7E5DE">${cols.map(c => `<td style="padding:6px;border:1px solid #bbb;font-weight:bold;font-size:${b.size - 1}px;${c.num ? "text-align:right" : c.key === "photo" ? "text-align:center" : ""}${+c.width > 0 ? ";width:" + Math.min(80, +c.width) + "%" : ""}">${esc(c.label)}</td>`).join("")}</tr>`;
      q.cats.forEach(cat => {
        out += `<tr><td colspan="${n}" style="padding:6px;font-weight:bold;letter-spacing:.05em;font-size:${b.size}px;border:1px solid #ccc;background:#F6F5F1">${esc(cat.name)}</td></tr>`;
        cat.rows.forEach(r => {
          out += `<tr>${cols.map(c => { if (c.key === "photo") return `<td style="padding:4px 6px;border:1px solid #ccc;width:${ps + 8}px;text-align:center;vertical-align:middle">${r.photo ? `<img src="${esc(r.photo)}" alt="" style="display:block;width:${ps}px;height:${ps}px;object-fit:contain;margin:0 auto">` : ""}</td>`; if (c.key === "code") return `<td style="padding:4px 6px;border:1px solid #ccc;font-size:${cs}px">${esc(r.code)}</td>`; const v = c.key === "price" ? money(r.unit) : c.key === "sum" ? money(r.sum) : r[c.key]; return `<td style="padding:4px 6px;border:1px solid #ccc;font-size:${b.size}px;${c.num ? "text-align:right" : ""}">${esc(v)}</td>`; }).join("")}</tr>`;
        });
      });
    } else if (b.type === "totals") {
      const rows = [];
      if (q.saving > 0) rows.push([b.labels.saving, money(-q.saving), false]);
      if (q.discount) rows.push([b.labels.discount, money(-q.discount), false]);
      (q.adjust || []).forEach(a => rows.push([a.label, money(a.amount), false]));
      rows.push([b.labels.total, money(q.total), true]);
      out += rows.map(([k, v, t]) => `<tr><td colspan="${n - 1}" style="${cell(b, "padding:" + (t ? "8px 6px;font-weight:bold;border-top:1px solid #000;font-size:" + (b.size + 2) + "px" : "3px 6px"))}">${esc(k)}</td><td style="text-align:right;padding:${t ? "8px 6px;font-weight:bold;border-top:1px solid #000;font-size:" + (b.size + 2) + "px" : "3px 6px"}">${v}</td></tr>`).join("");
    } else if (b.type === "terms") {
      out += `<tr><td colspan="${n}" style="height:12px"></td></tr>` + b.lines.map(l => `<tr><td colspan="${n}" style="${cell(b, "padding:1px 6px")}">${esc(l)}</td></tr>`).join("");
    } else if (b.type === "signature") {
      const half = Math.ceil(n / 2);
      const sg = (q.sigs || {})[b.id] || {}, L = sg.left || b.img || "", R = sg.right || "";
      const im = s => s ? `<img src="${esc(s)}" style="height:60px;width:auto;max-width:100%;display:block">` : `<div style="height:60px"></div>`;
      out += `<tr><td colspan="${n}" style="height:14px"></td></tr><tr><td colspan="${half}" style="${cell(b, "padding:0 6px;vertical-align:bottom")}">${im(L)}______________________________<br>${esc(b.text || "Prepared by")}</td><td colspan="${n - half}" style="${cell(b, "padding:0 6px;vertical-align:bottom")}">${im(R)}______________________________<br>${esc(b.text2 || "Customer acknowledgement")}</td></tr>`;
    }
  });
  const table = `<table style="width:100%;border-collapse:collapse;font-family:${font};font-size:12px;color:#1C1714;font-variant-numeric:lining-nums tabular-nums">${out}</table>`;
  if (excel) return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${table}</body></html>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>html{-webkit-text-size-adjust:100%;text-size-adjust:100%}@page{size:A4;margin:14mm}body{margin:0;padding:0}@media screen{body{padding:28px 30px}}</style></head><body>${table}${FIT_SCRIPT}</body></html>`;
}
