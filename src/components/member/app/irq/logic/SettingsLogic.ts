/* eslint-disable */
// @ts-nocheck — ported from the prototype (.design/ir-quote/design_handoff_ir_quote/Quote Settings v3 Bold.dc.html), kept line for line so the screens behave as it does.
import { DcLogic } from "../dc";
import React from "react";
import * as quoteDocLib from "../lib/quote-doc";
import { irqStorage } from "../storage";
import seedPackages from "../data/packages.json";
import seedCatalog from "../data/catalog.json";
import * as catalogImport from "../lib/catalog-import";
import { sortCatalog, nextCatalogSort } from "../lib/catalog-import";
const ICON = {
  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  chart: "M4 20V10m5 10V4m5 16v-7m5 7V8M3 20h18",
  trophy: "M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3",
  user: "M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  quoteDesk: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 7h6M9 11h1M12 11h1M15 11h0M9 15h1M12 15h1M9 18h1M12 18h1M15 15v3",
  eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  eyeOff: "m3 3 18 18M10 5c7-1 12 7 12 7s-2 4-5 5M6 6c-3 2-4 6-4 6s3 7 10 7c2 0 3-.3 4-1"
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const NAMES = { field: "Field", letterhead: "Letterhead", heading: "Heading", text: "Text", facts: "Customer details", table: "Item table", totals: "Totals", terms: "Terms", signature: "Signature", spacer: "Spacer" };
const REMOVABLE = ["heading", "text", "spacer", "signature", "field"];
const FACT_NAMES = { att: "Customer name", by: "Prepared by", bill: "Billing address", building: "Building", address: "Address", unit: "Unit", layout: "Layout", date: "Date" };
const BADGE = { letterhead: "Company", heading: "Heading", text: "Paragraph", facts: "Details", table: "Items", totals: "Totals", terms: "Terms", signature: "Signature", spacer: "Free space" };
const TABS = [["doc", "Quotation document"], ["cust", "Customer info"], ["units", "Room types"], ["styles", "Styles"], ["cat", "Catalogue"], ["kinds", "Categories"]];
const SIZES = ["1-1", "2-1", "2-2", "3-2", "3-3", "4-2", "4-3", "4-4"];
const sizeKey = sp => { const b = parseInt((sp || {}).beds), t = parseInt((sp || {}).baths); return b && t ? b + "-" + t : ""; };
const sizeLabel = k => k ? k.split("-").map(n => n + "R").join(" ") : "No room count";
const SECTION = { doc: ["doc", "company"], cust: ["custInfo"], units: ["packages"], styles: ["styles"], cat: ["catalog"], kinds: [], bld: ["buildings", "bldFields"], price: ["markup"] };
const rm0 = n => "RM " + Math.round(n).toLocaleString("en-MY");
const money = n => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const imgFor = code => /^(\d{6}|K\d{5})$/.test(code || "") ? `https://mm.hinlim.com/cache/b2bfs/product/${code}/${code}-550x500.jpg` : "";
const num = v => { const n = parseFloat(String(v).replace(/[^\d.]/g, "")); return isNaN(n) ? 0 : n; };
const cost = p => p.cats.reduce((a, c) => a + c.items.reduce((x, i) => x + (+i.cost || 0) * (+i.qty || 0), 0), 0);

export class SettingsLogic extends DcLogic {
  state = { lib: null, base: null, cfg: null, savedJson: "", tab: "doc", sel: null, drag: null, over: null, arm: "", notice: "", pid: "p0", newUnit: null, kindFilter: "all", catQ: "", newKind: "" };

  bmRef = el => { this._bm = el; if (el && this.ci) el.setAttribute("href", this.ci.BOOKMARKLET); };
  impMsg(msg, err) { this.setState({ impMsg: msg, impErr: !!err }); }
  stage(items, source, page) {
    const ci = this.ci, cfg = this.state.cfg;
    if (!items.length) { this.impMsg("No products found there.", true); return; }
    const rows = ci.diff(cfg.catalog.items, items);
    const kindGuess = Object.entries(cfg.catalog.kinds).find(([k, v]) => v.url && page && page.startsWith(v.url.replace(/\/$/, "")))?.[0] || (this.state.kindFilter !== "all" ? this.state.kindFilter : Object.keys(cfg.catalog.kinds)[0] || "");
    const sel = {}; rows.forEach(r => { sel[r.key] = r.status !== "same"; });
    const sing = s => String(s || "").toUpperCase().replace(/[^A-Z]/g, "").replace(/S$/, "");
    const catKind = {}; [...new Set(items.map(x => x.cat).filter(Boolean))].forEach(c => { const m = Object.entries(cfg.catalog.kinds).find(([k, v]) => sing(v.label) === sing(c) || sing(k) === sing(c)); catKind[c] = "+web"; });
    this.setState({ rev: { rows, source, kind: kindGuess, sel, filter: "all", cat: "all", catKind }, impMsg: "" });
  }
  guessKind(name, kinds) {
    const N = " " + String(name || "").toUpperCase().replace(/[^A-Z]+/g, " ") + " ";
    const ALIAS = { "BED FRAME": ["BED FRAME", "BED"], "TV CABINET": ["TV CABINET", "TV CONSOLE", "MEDIA UNIT", "TV UNIT"], "TV": ["TV"], "SIDE TABLE": ["SIDE TABLE", "BEDSIDE", "NIGHTSTAND", "END TABLE"], "DINING CHAIR": ["DINING CHAIR", "CHAIR"], "WARDROBE": ["WARDROBE"], "MATTRESS": ["MATTRESS"], "SOFA": ["SOFA", "SEATER", "SECTIONAL"], "COFFEE TABLE": ["COFFEE TABLE"], "DINING TABLE": ["DINING TABLE", "EXT TABLE", "RECTANGLE TABLE", "ROUND TABLE"] };
    let best = "", score = 0;
    Object.entries(kinds).forEach(([k, v]) => { const L = String(v.label || k).toUpperCase(); (ALIAS[L] || [L]).forEach((w, i) => { if (N.includes(" " + w + " ")) { const s = w.length * 10 - i; if (s > score) { score = s; best = k; } } }); });
    return best;
  }
  kindForCat(c, cat, room) {
    const K = c.catalog.kinds, sing = s => String(s || "").toUpperCase().replace(/[^A-Z]/g, "").replace(/S$/, "");
    const ALIAS = { BEDFRAME: "BED", TVCABINET: "MEDIAUNIT", SIDETABLE: "BEDSIDETABLE", DININGTABLE: "TABLE", DININGCHAIR: "CHAIR", COFFEETABLE: "OCCASIONALTABLE" };
    let k = Object.keys(K).find(x => K[x].webCat === cat) || Object.keys(K).find(x => sing(K[x].label) === sing(cat)) || Object.keys(K).find(x => !K[x].webCat && ALIAS[sing(K[x].label)] === sing(cat));
    if (!k) { k = String(cat).toLowerCase().replace(/[^a-z0-9]+/g, "-"); while (K[k] && K[k].webCat !== cat) k += "-2"; K[k] = K[k] || { label: String(cat).toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase()), url: "" }; }
    K[k].webCat = cat; if (room) K[k].room = room;
    return k;
  }
  // One package group per unit size (beds + baths). Extra groups of the same size are dropped; the first one is kept.
  oneGroupPerSize() {
    const c0 = this.state.cfg; if (!c0) return;
    const seen = {}, drop = [];
    c0.packages.forEach(p => { const k = sizeKey(p.spec); if (!k) return; if (seen[k] == null) seen[k] = p.group; else if (seen[k] !== p.group && !drop.includes(p.group)) drop.push(p.group); });
    if (!drop.length) return;
    this.upd(c => { c.packages = c.packages.filter(p => !drop.includes(p.group)); Object.values(seen).forEach(g => this.nameBySize(c, g)); });
    this.setState(s => ({ pid: s.cfg.packages.some(p => p.id === s.pid) ? s.pid : s.cfg.packages[0]?.id }));
  }
  nameBySize(c, group) {
    const ps = c.packages.filter(p => p.group === group); if (!ps.length) return;
    const lab = sizeLabel(sizeKey(ps[0].spec)); if (!sizeKey(ps[0].spec)) return;
    ps.forEach(p => { p.groupLabel = lab; p.layout = lab; p.name = lab + " " + (p.style === "build" ? "BUILD IN" : "CLASSIC"); p.building = ""; });
  }
  applyRev() {
    const rv = this.state.rev, lib = this.state.lib; if (!rv) return;
    let n = 0;
    this.upd(c => {
      rv.rows.forEach(r => {
        const now = Date.now(); c.catalog.syncedAt = now;
        if (r.cur) { const y = c.catalog.items.find(z => z.id === r.cur.id); if (y) { const i0 = r.inc; if (i0.cat) { y.webCat = i0.cat; if (i0.room) y.room = i0.room; } if (i0.col) y.collection = i0.col; if (i0.stock != null) y.stock = i0.stock; if (i0.group) { y.group = i0.group; y.color = i0.color || ""; } y.checkedAt = now; } }
        if (!rv.sel[r.key] || r.status === "same") return;
        const inc = r.inc; n++;
        if (r.cur) {
          const x = c.catalog.items.find(y => y.id === r.cur.id); if (!x) return;
          if (inc.price != null) { if (+inc.price !== +x.cost) x.prevCost = x.cost; x.cost = +inc.price; x.sample = false; x.noPrice = false; }
          x.updatedAt = Date.now();
          if (inc.name && !inc.truncated) x.name = inc.name;
          if (inc.img) x.img = inc.img;
          if (inc.specs) x.specs = inc.specs;
          if (inc.url) x.url = inc.url;
          if (inc.code && !x.code) x.code = inc.code;
          if (inc.col) x.collection = inc.col;
          if (inc.color) x.color = [...new Set([...String(x.color || "").split(/\s*,\s*/), ...String(inc.color).split(/\s*,\s*/)].filter(Boolean))].join(", ");
          if (inc.cat) { x.webCat = inc.cat; if (inc.room) x.room = inc.room; }
        } else {
          const map = inc.cat ? rv.catKind[inc.cat] : rv.kind; if (inc.cat && !map) { n--; return; }
          const kd = map === "+web" ? this.kindForCat(c, inc.cat, inc.room) : map || this.guessKind(inc.name, c.catalog.kinds); if (!kd) { n--; return; }
          c.catalog.items.push({ id: lib.newId("c"), kind: kd, code: inc.code || "", name: inc.name || "Untitled", cost: inc.price ?? null, sample: false, noPrice: inc.price == null, img: inc.img || "", specs: inc.specs || "", url: inc.url || "", collection: inc.col || "", color: inc.color || "", group: inc.group || "", webCat: inc.cat || "", room: inc.room || "", stock: inc.stock ?? null, updatedAt: Date.now(), checkedAt: Date.now() });
        }
      });
    });
    this.setState({ rev: null, impMsg: `Updated ${n} item${n === 1 ? "" : "s"}. Publish to use them in IR Quote.`, impErr: false });
  }
  bulkVals(rows, st) {
    const sel = st.sel || {}, ids = Object.keys(sel), n = ids.length;
    const allSel = rows.length > 0 && rows.every(r => sel[r.id]);
    const apply = (fn, msg) => { this.upd(c => { c.catalog.items.forEach(x => { if (sel[x.id]) fn(x); }); }); this.setState({ sel: {}, catMsg: msg.replace("#", n + " item" + (n === 1 ? "" : "s")) + " Press Publish to save.", catErr: false }); };
    return {
      selOn: n > 0, selText: n + " selected", allSel,
      toggleAll: () => this.setState(s => { const m = { ...(s.sel || {}) }; rows.forEach(r => { if (allSel) delete m[r.id]; else m[r.id] = true; }); return { sel: m }; }),
      selClear: () => this.setState({ sel: {} }),
      bulkKind: e => { const v = e.target.value; if (v) apply(x => { x.kind = v; }, "Moved #."); },
      bulkOn: () => apply(x => { x.paused = false; }, "# now show in IR Quote."),
      bulkPause: () => apply(x => { x.paused = true; }, "Hid # from IR Quote."),
      bulkConfirm: () => apply(x => { if (!x.noPrice) x.sample = false; }, "Marked # as confirmed (items with no price skipped)."),
      bulkSample: () => apply(x => { if (!x.noPrice) x.sample = true; }, "Marked # as sample price (items with no price skipped)."),
      bulkRemove: () => { if (!confirm("Delete " + n + " item" + (n === 1 ? "" : "s") + "?")) return; this.upd(c => { c.catalog.items = c.catalog.items.filter(x => !sel[x.id]); }); this.setState({ sel: {}, catMsg: "Deleted " + n + " item" + (n === 1 ? "" : "s") + ". Press Publish to save.", catErr: false }); }
    };
  }
  componentWillUnmount() { window.removeEventListener("message", this._onMsg); }
  componentDidMount() {
    window.addEventListener("keydown", e => { if (e.key === "Escape" && this.state.ctx) this.setState({ ctx: null }); });
    this._onMsg = e => {
      const d = e.data;
      if (typeof d !== "string" || !d.startsWith("IRQ1:")) return;
      try { e.source && e.source.postMessage("irq-ack", "*"); } catch (er) {}
      if (d === this._lastGrab) return;
      this._lastGrab = d;
      try { window.focus(); } catch (er) {}
      const go = () => { if (this._fromClip && this.state.cfg && this.ci) { this.setState({ tab: "cat" }); this._fromClip(d); } else setTimeout(go, 300); };
      go();
    };
    window.addEventListener("message", this._onMsg);
    Promise.resolve(catalogImport).then(ci => { this.ci = ci; if (this._bm) this._bm.setAttribute("href", ci.BOOKMARKLET); this.forceUpdate(); });
    Promise.all([Promise.resolve({ ...quoteDocLib, CRM_FIELDS: this.props.crmFields || quoteDocLib.CRM_FIELDS }), Promise.resolve(seedPackages), Promise.resolve(seedCatalog)])
      .then(([lib, pj, cj]) => {
        const cfg = lib.load(pj, cj, lib.PREVIEW), live = irqStorage.getItem(lib.PREVIEW) ? lib.load(pj, cj, lib.STORE) : cfg;
        this.setState({ lib, base: { pj, cj }, cfg, savedJson: JSON.stringify(live), pid: cfg.packages[0]?.id });
        const gsz = {}; lib.deriveGroups(cfg.packages).forEach(g => { const k = sizeKey((cfg.packages.find(x => x.id === (g.classic || g.build)) || {}).spec); if (k) (gsz[k] = gsz[k] || []).push(g.id); });
        const solo = Object.values(gsz).filter(a => a.length === 1).map(a => a[0]).filter(id => cfg.packages.some(p => p.group === id && !/^\dR \dR/.test(p.groupLabel || "")));
        const multi = Object.values(gsz).filter(a => a.length > 1);
        if (solo.length || multi.length) setTimeout(() => this.upd(c => {
          multi.forEach(a => { const drop = a.slice(1); c.packages = c.packages.filter(p => !drop.includes(p.group)); this.nameBySize(c, a[0]); });
          solo.forEach(id => this.nameBySize(c, id));
          if (!c.packages.some(p => p.id === this.state.pid)) setTimeout(() => this.setState({ pid: c.packages[0]?.id }), 0);
        }), 0);
        if (multi.length) setTimeout(() => this.setState({ notice: "Old layouts combined: one package per room type. Publish to keep, or Cancel to undo." }), 0);
      });
  }
  componentDidUpdate(pp, ps) { if (!this.props.readOnly && this.state.cfg && ps.cfg && ps.cfg !== this.state.cfg) { clearTimeout(this._pvT); this._pvT = setTimeout(() => this.state.lib.savePreview(this.state.cfg), 350); } }
  u(src) { const x = String(src || ""); if (!x.startsWith("data:")) return x; this._blobs = this._blobs || new Map(); if (this._blobs.has(x)) return this._blobs.get(x);
    try { const [h, b64] = x.split(","), mime = (h.match(/data:([^;]+)/) || [])[1] || "image/jpeg", bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const url = URL.createObjectURL(new Blob([arr], { type: mime })); this._blobs.set(x, url); return url; } catch (e) { return ""; } }
  loadXlsx() { if (window.XLSX) return Promise.resolve(window.XLSX); return new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"; sc.onload = () => res(window.XLSX); sc.onerror = rej; document.head.appendChild(sc); }); }
  async dlTemplate(ep) {
    const rows = [["CATEGORY", "ITEM", "DESCRIPTION", "CODE/COLOUR", "QTY", "PRICE"]];
    (ep.cats || []).forEach(c => { if (!c.items.length) rows.push([c.name, "", "", "", "", ""]); c.items.forEach(i => rows.push([c.name, i.name, i.desc || "", i.code || "", i.qty ?? 1, i.cost ?? ""])); });
    if (rows.length === 1) rows.push(["LIVING", "TV CABINET", "", "336103", 1, 519]);
    const fname = ((ep.groupLabel || "Room type") + " " + (ep.style === "build" ? "Build in" : "Classic")).replace(/[\\/:*?"<>|]+/g, "-");
    try {
      const X = await this.loadXlsx(); const ws = X.utils.aoa_to_sheet(rows); ws["!cols"] = [{ wch: 16 }, { wch: 34 }, { wch: 20 }, { wch: 16 }, { wch: 6 }, { wch: 10 }];
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Items"); X.writeFile(wb, fname + ".xlsx");
    } catch (e) {
      const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(",")).join("\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = fname + ".csv"; a.click();
    }
  }
  async readXl(file, pid) {
    let rows = [];
    try {
      if (/\.csv$/i.test(file.name)) { const t = await file.text(); rows = t.split(/\r?\n/).map(l => l.split(",").map(x => x.replace(/^"|"$/g, "").trim())); }
      else { const X = await this.loadXlsx(); const wb = X.read(await file.arrayBuffer()); rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }); }
    } catch (e) { this.setState({ xl: { pid, cats: [], err: "Could not read this file.", mode: "replace", name: file.name } }); return; }
    const low = r => r.map(c => String(c).trim().toLowerCase());
    const hi = rows.findIndex(r => low(r).some(c => /^(item|name|description of item|product)/.test(c)));
    if (hi < 0) { this.setState({ xl: { pid, cats: [], err: "Couldn't find a header row with an ITEM column.", mode: "replace", name: file.name } }); return; }
    const h = low(rows[hi]), itemCols = h.map((c, k) => /^(item|name|product)/.test(c) ? k : -1).filter(k => k >= 0);
    const starts = itemCols.map(k => (k > 0 && /^(no|#|bil)$/.test(h[k - 1])) ? k - 1 : k);
    const num = v => { const n = parseFloat(String(v).replace(/[^\d.]/g, "")); return isNaN(n) ? null : n; };
    const kinds = this.state.cfg.catalog.kinds, cats = [];
    starts.forEach((st0, bi) => {
      const end = bi + 1 < starts.length ? starts[bi + 1] : h.length, col = re => { for (let k = st0; k < end; k++) if (re.test(h[k])) return k; return -1; };
      const cI = itemCols[bi], cD = col(/^desc/), cC = col(/code|colou?r/), cQ = col(/^qty|quantity/), cP = col(/price|cost|unit/), cK = col(/^categ|^area|^room/);
      let cur = null;
      rows.slice(hi + 1).forEach(r => {
        const name = String(r[cI] ?? "").trim().replace(/^[-–•\s]+/, ""); if (!name && !(cK >= 0 && String(r[cK]).trim())) return;
        if (/^(total|sub ?total|grand total|discount)/i.test(name)) return;
        const catName = cK >= 0 ? String(r[cK]).trim() : "", qty = cQ >= 0 ? num(r[cQ]) : null, price = cP >= 0 ? num(r[cP]) : null;
        if (catName && (!cur || cur.name !== catName.toUpperCase())) { cur = { name: catName.toUpperCase(), label: catName, items: [] }; cats.push(cur); }
        if (cK < 0 && name && qty == null && price == null && !(cC >= 0 && String(r[cC]).trim())) { cur = { name: name.toUpperCase(), label: name, items: [] }; cats.push(cur); return; }
        if (!name) return; if (!cur) { cur = { name: "ITEMS", label: "Items", items: [] }; cats.push(cur); }
        cur.items.push({ name: name.toUpperCase(), desc: cD >= 0 ? String(r[cD]).trim() : "", code: cC >= 0 ? String(r[cC]).trim() : "", qty: qty == null ? 1 : qty, cost: price == null ? 0 : price, kind: this.guessKind(name, kinds) || null });
      });
    });
    this.setState({ xl: { pid, cats: cats.filter(c => c.items.length), err: cats.length ? "" : "No items found.", mode: "replace", name: file.name } });
  }
  upd(fn) { this.setState(s => { const c = JSON.parse(JSON.stringify(s.cfg)); fn(c); const L = s.lib || this.state.lib; if (L && L.syncPrices) L.syncPrices(c); return { cfg: c, notice: "", arm: "" }; }); }
  arm(key, fn) { if (this.state.arm === key) { this.setState({ arm: "" }); fn(); } else this.setState({ arm: key }); }
  block(id) { return this.state.cfg.doc.blocks.find(b => b.id === id); }
  dnd(key, i, move) {
    const d = this.state.dl;
    const on = d && d.k === key;
    return {
      line: on && d.over === i && d.from !== i ? (d.from < i ? "0 2px 0 #111111" : "0 -2px 0 #111111") : "none",
      op: on && d.from === i ? .45 : 1,
      dragStart: e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key); const r = e.currentTarget.parentElement; if (r && e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(r, 20, 20); this.setState({ dl: { k: key, from: i, over: i } }); },
      dragOver: e => { const s = this.state.dl; if (!s || s.k !== key) return; e.preventDefault(); if (s.over !== i) this.setState({ dl: { ...s, over: i } }); },
      drop: e => { const s = this.state.dl; if (!s || s.k !== key) return; e.preventDefault(); this.setState({ dl: null }); if (s.from !== i) move(s.from, i); },
      dragEnd: () => this.setState({ dl: null })
    };
  }
  styleBtns(o, set) {
    const t = k => ({ bg: o[k] ? "#1F1F1C" : "transparent", ink: o[k] ? "#FFFFFF" : "#1F1F1C", toggle: () => set(k) });
    return { b: t("bold"), i: t("italic"), u: t("underline") };
  }
  setColSel(fid, cid) { this.setState(s => ({ colSel: { ...(s.colSel || {}), [fid]: cid } })); }
  kindChips(list, cur, pick) {
    return list.map(k => { const on = cur === k.k; return { label: k.label, icon: k.icon, bg: on ? "#1F1F1C" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C", border: on ? "#1F1F1C" : "#DEDED8", pick: () => pick(k.k) }; });
  }
  defaultCols() { const lib = this.state.lib; return [{ id: lib.newId("col-"), label: "Item", kind: "text" }, { id: lib.newId("col-"), label: "Qty", kind: "number" }]; }
  fieldSettings(f, setF) {
    const lib = this.state.lib, cs = (this.state.colSel || {})[f.id];
    const cols = f.columns || [], col = cols.find(c => c.id === cs);
    const ck = k => lib.COL_KINDS.find(x => x.k === k) || {};
    return {
      label: f.label, onLabel: e => { const v = e.target.value; setF(x => { x.label = v; }); },
      kinds: this.kindChips(lib.FIELD_KINDS, f.kind, k => setF(x => { if (x.kind !== k) x.value = undefined; x.kind = k; if (k === "table" && !(x.columns || []).length) x.columns = this.defaultCols(); })),
      isTable: f.kind === "table", colCount: `${cols.length} column${cols.length === 1 ? "" : "s"}`,
      cols: cols.map(c => ({ label: c.label, icon: ck(c.kind).icon, kindLabel: ck(c.kind).label, line: c.id === cs ? "inset 0 -2px 0 #1F1F1C" : "none", select: () => this.setColSel(f.id, c.id === cs ? null : c.id) })),
      addCol: () => { const id = lib.newId("col-"); setF(x => { x.columns = [...(x.columns || []), { id, label: `Column ${(x.columns || []).length + 1}`, kind: "text" }]; }); this.setColSel(f.id, id); },
      col: col ? {
        label: col.label, onLabel: e => { const v = e.target.value; setF(x => { x.columns.find(y => y.id === col.id).label = v; }); },
        kinds: this.kindChips(lib.COL_KINDS, col.kind, k => setF(x => { x.columns.find(y => y.id === col.id).kind = k; })),
        remove: () => { setF(x => { x.columns = x.columns.filter(y => y.id !== col.id); }); this.setColSel(f.id, null); },
        close: () => this.setColSel(f.id, null)
      } : false
    };
  }
  composer(key, kinds, ph, onAdd, needName, cta) {
    const c0 = (this.state.comp || {})[key] || {}, kind = c0.kind || kinds[0].k, name = c0.name || "";
    const set = v => this.setState(s => ({ comp: { ...(s.comp || {}), [key]: { kind, name, ...v } } }));
    const ok = !needName(kind) || name.trim();
    const add = () => { if (!ok) return; onAdd(kind, name.trim()); set({ name: "", open: false }); };
    const isOpen = !!c0.open, close = () => set({ open: false, name: "" });
    const chips = list => this.kindChips(list, kind, k => set({ kind: k }));
    const groups = kinds.some(k => k.group) ? [...new Set(kinds.map(k => k.group))].map(g => ({ title: g, kinds: chips(kinds.filter(k => k.group === g)) })) : [{ title: "", kinds: chips(kinds) }];
    return { name, ph, cta, isOpen, closed: !isOpen, open: () => set({ open: true }), close, onName: e => set({ name: e.target.value }), onKey: e => { if (e.key === "Enter") add(); if (e.key === "Escape") close(); }, groups, add, btnBg: ok ? "#111111" : "#B5B6AE" };
  }
  setBlock(id, fn) { this.upd(c => { const b = c.doc.blocks.find(x => x.id === id); if (b) fn(b, c); }); }
  move(from, to) {
    if (!from || from === to) return;
    this.upd(c => { const L = c.doc.blocks; const i = L.findIndex(b => b.id === from); const [b] = L.splice(i, 1); const j = L.findIndex(x => x.id === to); L.splice(j < 0 ? L.length : j, 0, b); });
  }
  pkgOf(c, id) { return c.packages.find(p => p.id === id); }

  setRead(id, v) { this.setState(s => ({ bldRead: { ...(s.bldRead || {}), [id]: v } })); }
  async readSite(id, url) {
    url = (url || "").trim();
    if (!/^https?:\/\//i.test(url)) { this.setRead(id, { status: "error", msg: "Paste a full link starting with https://" }); return; }
    this.setRead(id, { status: "busy", msg: "Reading the website…" });
    try {
      const res = await fetch("https://r.jina.ai/" + url, { headers: { Accept: "text/plain" } });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = (await res.text()).slice(0, 60000);
      let found;
      if (window.claude?.complete) {
        const out = await window.claude.complete("From this property project website text, return ONLY JSON: {\"name\":\"project name\",\"developer\":\"\",\"address\":\"full address\",\"units\":[{\"type\":\"A\",\"beds\":\"2+1\",\"baths\":\"2\",\"sqft\":\"853\",\"note\":\"Twin-Key or empty\"}]}. Use empty strings when unknown. type is the unit type letter/code only.\n\n" + text);
        found = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
      } else {
        const units = []; const re = /Type\s+([A-Z][0-9]?)[^\n]{0,200}?([\d,]{3,5})\s*sq\.?\s*ft/gi; let m;
        while ((m = re.exec(text))) if (!units.find(u => u.type === m[1].toUpperCase())) units.push({ type: m[1].toUpperCase(), sqft: m[2] });
        found = { name: (text.match(/^Title:\s*(.+)$/m) || [])[1] || "", developer: "", address: "", units };
      }
      const n = (found.units || []).length;
      this.setRead(id, { status: "ok", msg: `Found ${n} unit type${n === 1 ? "" : "s"}. Check before applying.`, found });
    } catch (e) {
      this.setRead(id, { status: "error", msg: "Could not read this site. Fill the fields by hand." });
    }
  }
  applyRead(id, f) {
    if (!f) return;
    this.upd(c => {
      const b = c.buildings.find(x => x.id === id); if (!b) return;
      if (f.developer) b.developer = f.developer;
      if (f.address) b.address = f.address;
      (f.units || []).forEach(u => {
        const t = String(u.type || "").toUpperCase(); if (!t) return;
        c.packages.filter(p => p.building === b.name || !p.building).filter(p => new RegExp("TYPE\\s+" + t[0] + "(\\b|[^A-Z])", "i").test(p.layout)).forEach(p => {
          p.spec = { ...(p.spec || {}) };
          ["beds", "baths", "sqft", "note"].forEach(k => { if (!p.spec[k] && u[k]) p.spec[k] = String(u[k]); });
        });
      });
    });
    this.setRead(id, { status: "ok", msg: "Applied. Publish to make it live." });
  }
  renderVals() {
    const st = this.state, cfg = st.cfg, lib = st.lib;
    const d = new Date();
    const base = {
      dateLine: `${DAYS[d.getDay()].toUpperCase()} ${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()} ${d.getFullYear()}`,
      deskAside: !this.props.inApp, hdrDisplay: this.props.inApp ? "none" : "flex", rootH: this.props.rootH || "100vh",
      userInitials: String((this.props.user && this.props.user.name) || "?").split(/s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase(),
      deskNav: [["Today", ICON.home], ["Insight", ICON.chart], ["Quote", ICON.quoteDesk], ["Arena", ICON.trophy], ["Profile", ICON.user]].map(([label, dd]) => ({ label, d: dd, href: "#", go: e => { e && e.preventDefault && e.preventDefault(); this.props.onNav && this.props.onNav(label); }, bg: "transparent", color: "#A3A3A3", weight: 550 })),
      loading: !cfg,
      onPreview: () => { if (!cfg || !lib) return; lib.savePreview(cfg); this._pv = true; if (this.props.onPreview && this.props.onPreview() === false) this.setState({ notice: "Your browser blocked the preview tab. Allow pop-ups for this site, then press Preview again." }); }
    };
    if (!cfg) return { ...base, tabs: [], tabDoc: false, savedText: "", statusText: "", dirtyDot: "#D5D2C8", dirtyCount: "", dirtyRest: "", dirtyOpacity: .5, saveBg: "#EEEEEA", saveInk: "#97978F" };
    const saved = JSON.parse(st.savedJson);
    const dirtyTabs = TABS.filter(([k]) => SECTION[k].some(f => JSON.stringify(cfg[f]) !== JSON.stringify(saved[f]))).map(t => t[0]);
    const dirty = dirtyTabs.length > 0;
    const savedTextShort = cfg.saved ? `Published ${new Date(cfg.saved.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "";
    const m = +cfg.markup || 1.3;
    const markupText = (Math.round(m * 100) / 100).toFixed(2);
    const fontCss = lib.FONTS[cfg.doc.font] || lib.FONTS.Georgia;

    // sample quote
    const p0 = cfg.packages.find(p => p.id === st.pid) || cfg.packages[0];
    const tb = cfg.doc.blocks.find(b => b.type === "table");
    const cols = (tb ? tb.columns : lib.COLUMNS).filter(c => c.show);
    let n = 0, shown = 0, totalRows = 0;
    const sampleCats = [];
    (p0 ? p0.cats : []).forEach(c => {
      totalRows += c.items.length;
      if (sampleCats.length >= 2) return;
      sampleCats.push({ name: c.name, rows: c.items.map(it => { n++; shown++; const unit = Math.round((+it.cost || 0) * m); const r = { no: n, item: it.name, desc: it.desc, code: it.code, qty: it.qty, price: money(unit), sum: money(unit * it.qty) }; return { cells: cols.map(cl => ({ v: r[cl.key], align: cl.num ? "right" : "left" })) }; }) });
    });
    const sampleFacts = { att: "MR HANDSOME", by: "WILLIAM", bill: "-", building: p0?.building || "", address: p0?.building || "", unit: p0 ? [p0.layout, lib.specText(p0.spec)].filter(Boolean).join(" · ") : "", layout: p0?.name || "", date: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    const edit = (fn) => e => { const v = e.currentTarget.innerText.replace(/\n+$/, ""); fn(v); };

    const fieldPreview = f => {
      const k = f.kind, v = f.value, has = !lib.isEmpty(f, v), ink = has ? "#5A5048" : "#97978F";
      const o = { label: lib.FIELD_KINDS.some(x => x.label === f.label) ? "" : f.label, ink, inline: ["short", "number", "date", "link"].includes(k), block: k === "long", image: k === "image", table: k === "table",
        sample: has ? (k === "date" ? lib.fmtDate(v) : String(v)) : "Filled in by IR" + (f.required ? " · required" : " · left out if empty"),
        img: k === "image" && has ? v : "", imgBorder: has ? "transparent" : "#DEDED8", imgEmpty: has ? "" : "Image · filled in by IR", grid: "1fr", cols: [], rows: [] };
      if (k === "table") {
        const cols = f.columns || [], num = c => c.kind === "number" || c.kind === "money";
        o.grid = cols.map(c => c.kind === "image" ? "60px" : num(c) ? "minmax(50px,.6fr)" : "minmax(80px,1fr)").join(" ") || "1fr";
        o.cols = cols.map(c => ({ label: c.label, align: num(c) ? "right" : "left" }));
        o.rows = (has ? v : [{}]).map(r => ({ cells: cols.map(c => { const x = r[c.id]; return { v: x == null || x === "" ? "—" : c.kind === "image" ? "[image]" : c.kind === "money" ? "RM " + money(+x || 0) : c.kind === "date" ? lib.fmtDate(x) : String(x), align: num(c) ? "right" : "left", ink: x ? "#000000" : "#C4C1B6" }; }) }));
      }
      return o;
    };
    const coL = cfg.company;
    const DESC = { letterhead: "Company name, address and logo", facts: "Customer, unit and date", table: "Furniture list", totals: "Discount and total", terms: "Payment terms", signature: "Signature lines", spacer: "Empty space" };
    const descOf = b => b.type === "field" ? `${lib.kindLabel(b.kind)} · IR fills in${b.required ? " · required" : ""}` : (b.type === "heading" || b.type === "text") ? (b.text || "").replace(/\s+/g, " ").slice(0, 60) : DESC[b.type] || "";
    const showPill = b => ({ eyeD: b.hidden ? "M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.3 7.6A17 17 0 0 0 2 12s4 6 10 6a9.6 9.6 0 0 0 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" : "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", showLabel: b.hidden ? "Hidden" : "Shown", showBg: b.hidden ? "#FFFFFF" : "#EEF5F0", showBorder: b.hidden ? "#DEDED8" : "#CFE3D6", showInk: b.hidden ? "#6B6B66" : "#2F6B47", showDot: b.hidden ? "#C4C1B6" : "#3E8A5C", toggleHide: e => { e.stopPropagation(); this.setBlock(b.id, x => { x.hidden = !x.hidden; }); } });
    const blockViews = cfg.doc.blocks.map((b, i) => {
      const on = st.sel === b.id, over = st.over === b.id && st.drag && st.drag !== b.id;
      return {
        id: b.id, name: b.type === "field" ? (b.label || "Untitled field") : NAMES[b.type], nameCaps: (b.type === "field" ? (b.label || "Field") : NAMES[b.type]).toUpperCase(), selected: on,
        badge: b.type === "field" ? lib.kindLabel(b.kind) : BADGE[b.type], isField: b.type === "field", removable: REMOVABLE.includes(b.type),
        reqBg: b.required ? "#111111" : "#D5D2C8", reqJustify: b.required ? "flex-end" : "flex-start", reqTitle: b.required ? "Required" : "Optional",
        toggleReq: e => { e.stopPropagation(); this.setBlock(b.id, x => { x.required = !x.required; }); },
        removeX: e => { e.stopPropagation(); this.upd(c => { c.doc.blocks = c.doc.blocks.filter(x => x.id !== b.id); }); if (st.sel === b.id) this.setState({ sel: null }); },
        pv: b.type === "field" ? fieldPreview(b) : {},
        sigImg: b.img || "", sigHint: b.signCust ? "Customer signs on screen" : "",
        desc: descOf(b), listOpacity: b.hidden ? .5 : 1, ...showPill(b),
        lh: b.type === "letterhead" ? {
          hasLogo: !!b.logo, logo: b.logo || "", logoPx: (b.logoH || 64) + "px", logoW: Math.round((b.logoH || 64) * (b.logoRatio || 2.5)) + "px",
          dir: !b.logo ? "column" : b.logoPos === "right" ? "row-reverse" : b.logoPos === "center" ? "column" : "row",
          rows: (b.rows || lib.letterRows(coL)).map((r, ri) => ({ text: r.text, px: r.size + "px", fw: r.bold ? 700 : 400, fst: r.italic ? "italic" : "normal", td: r.underline ? "underline" : "none", onBlur: edit(v => this.setBlock(b.id, x => { x.rows = x.rows || lib.letterRows(coL); x.rows[ri].text = v; })) }))
        } : {},
        rowBg: on ? "#FFEBD9" : "#FFFFFF", ink: on ? "#111111" : b.hidden ? "#97978F" : "#1F1F1C", weight: on ? 650 : 500, rowOpacity: st.drag === b.id ? .5 : 1,
        eye: b.hidden ? ICON.eyeOff : ICON.eye, dropLine: over ? "inset 0 2px 0 #111111" : "none",
        outline: on ? "2px solid #111111" : "1px dashed transparent", docOpacity: b.hidden ? .3 : st.drag === b.id ? .5 : 1,
        align: b.align, sizePx: b.size + "px", bigPx: (b.size + 4) + "px", smallPx: (b.size - 1) + "px", spacerPx: (b.size * 2) + "px", fw: b.bold ? 700 : 400, fst: b.italic ? "italic" : "normal", td: b.underline ? "underline" : "none",
        isLetterhead: b.type === "letterhead", isHeading: b.type === "heading", isText: b.type === "text", isSpacer: b.type === "spacer", isFacts: b.type === "facts", isTable: b.type === "table", isTotals: b.type === "totals", isTerms: b.type === "terms", isSignature: b.type === "signature",
        text: b.text || "", labels: b.labels || {}, sig1: b.text || "Prepared by", sig2: b.text2 || "Customer acknowledgement",
        hasX: b.type === "table" && (b.extraRows || []).some(r => r.item), xTitle: b.extraTitle || "OTHERS",
        xrows: b.type === "table" ? (b.extraRows || []).filter(r => r.item).map((r, ri) => { const rr = { no: "", item: r.item, desc: "", code: "", qty: +r.qty || 1, price: money(+r.price || 0), sum: money((+r.price || 0) * (+r.qty || 1)) }; return { cells: cols.map(cl => ({ v: rr[cl.key], align: cl.num ? "right" : "left" })) }; }) : [],
        adjPv: b.type === "totals" ? (b.extras || []).filter(e => e.label).map(e => ({ label: e.label + (e.mode === "percent" ? ` (${e.value || 0}%)` : ""), v: (e.sign === "less" ? "-" : "") + (e.mode === "percent" ? "…" : money(+e.value || 0)) })) : [],
        facts: b.type === "facts" ? b.labels.map((f, fi) => ({ f, fi })).filter(o => !o.f.hidden).map(({ f, fi }) => ({ label: f.label, sample: sampleFacts[f.key] || "-", onBlur: edit(v => this.setBlock(b.id, x => { x.labels[fi].label = v; })) })) : [],
        terms: b.type === "terms" ? b.lines.map((l, li) => ({ value: l, onBlur: edit(v => this.setBlock(b.id, x => { x.lines[li] = v; })) })) : [],
        onTextBlur: edit(v => this.setBlock(b.id, x => { x.text = v; })),
        onSaving: edit(v => this.setBlock(b.id, x => { x.labels.saving = v; })), onDiscount: edit(v => this.setBlock(b.id, x => { x.labels.discount = v; })), onTotal: edit(v => this.setBlock(b.id, x => { x.labels.total = v; })),
        onSig1: edit(v => this.setBlock(b.id, x => { x.text = v; })), onSig2: edit(v => this.setBlock(b.id, x => { x.text2 = v; })),
        select: () => this.setState({ sel: on ? null : b.id }),
        toggleHide: e => { e.stopPropagation(); this.setBlock(b.id, x => { x.hidden = !x.hidden; }); },
        ctxBg: st.ctx && st.ctx.id === b.id ? "#F2F2EF" : "transparent",
        ctxOpen: e => { e.preventDefault(); e.stopPropagation(); this.setState({ ctx: { id: b.id, x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 290) } }); },
        dragStart: e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.id); this.setState({ drag: b.id }); },
        dragOver: e => { e.preventDefault(); if (st.over !== b.id) this.setState({ over: b.id }); },
        drop: e => { e.preventDefault(); const from = st.drag; this.setState({ drag: null, over: null }); this.move(from, b.id); },
        dragEnd: () => this.setState({ drag: null, over: null })
      };
    });

    const sb = this.block(st.sel);
    const co = cfg.company;
    const coField = (label, get, set) => ({ label, value: get(), onChange: e => { const v = e.target.value; this.upd(c => set(c.company, v)); } });
    let sel = null;
    if (sb) {
      const t = sb.type;
      const armKey = "del-" + sb.id;
      sel = {
        nameCaps: (t === "field" ? (sb.label || "Field") : NAMES[t]).toUpperCase(), size: sb.size, removable: REMOVABLE.includes(t),
        title: t === "field" ? (sb.label || "Untitled field") : NAMES[t], ...showPill(sb),
        back: () => this.setState({ sel: null }),
        moveUp: () => this.upd(c => { const L = c.doc.blocks, i = L.findIndex(x => x.id === sb.id); if (i > 0) L.splice(i - 1, 0, L.splice(i, 1)[0]); }),
        moveDown: () => this.upd(c => { const L = c.doc.blocks, i = L.findIndex(x => x.id === sb.id); if (i < L.length - 1) L.splice(i + 1, 0, L.splice(i, 1)[0]); }),
        ...this.styleBtns(sb, k => this.setBlock(sb.id, x => { x[k] = !x[k]; })),
        factRows: t === "facts" ? sb.labels.map((f, i) => ({
          ...this.dnd("facts", i, (a, b) => this.setBlock(sb.id, x => { const L = x.labels; L.splice(b, 0, L.splice(a, 1)[0]); })),
          label: f.label, custom: !!f.custom, hint: f.custom ? "IR fills in" : (FACT_NAMES[f.key] || f.key),
          boxBorder: f.hidden ? "1.5px solid #C4C1B6" : "0", boxBg: f.hidden ? "#FFFFFF" : "#111111",
          toggle: () => this.setBlock(sb.id, x => { x.labels[i].hidden = !x.labels[i].hidden; }),
          onLabel: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.labels[i].label = v; }); },
          up: () => this.setBlock(sb.id, x => { if (i > 0) x.labels.splice(i - 1, 0, x.labels.splice(i, 1)[0]); }),
          down: () => this.setBlock(sb.id, x => { if (i < x.labels.length - 1) x.labels.splice(i + 1, 0, x.labels.splice(i, 1)[0]); }),
          remove: () => this.setBlock(sb.id, x => { x.labels.splice(i, 1); })
        })) : false,
        addFact: () => this.setBlock(sb.id, x => { x.labels.push({ key: lib.newId("x-"), label: "New detail", custom: true }); }),
        xrows: t === "table" ? (sb.extraRows || []).map((r, i) => ({
          item: r.item || "", qty: String(r.qty ?? 1), price: String(r.price ?? ""),
          onItem: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.extraRows[i].item = v; }); },
          onQty: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.extraRows[i].qty = v; }); },
          onPrice: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.extraRows[i].price = v; }); },
          remove: () => this.setBlock(sb.id, x => { x.extraRows.splice(i, 1); })
        })) : false,
        hasX: t === "table" && (sb.extraRows || []).length > 0, xTitle: sb.extraTitle || "OTHERS",
        onXTitle: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.extraTitle = v; }); },
        addX: () => this.setBlock(sb.id, x => { x.extraRows = [...(x.extraRows || []), { id: lib.newId("xr-"), item: "", qty: 1, price: "" }]; }),
        adj: t === "totals" ? (sb.extras || []).map((a, i) => {
          const set = k => e => { const v = e.target.value; this.setBlock(sb.id, x => { x.extras[i][k] = v; }); };
          return { label: a.label || "", sign: a.sign || "add", mode: a.mode || "percent", value: String(a.value ?? ""), onLabel: set("label"), onSign: set("sign"), onMode: set("mode"), onValue: set("value"), remove: () => this.setBlock(sb.id, x => { x.extras.splice(i, 1); }) };
        }) : false,
        addAdj: () => this.setBlock(sb.id, x => { x.extras = [...(x.extras || []), { id: lib.newId("aj-"), label: "", sign: "add", mode: "percent", value: "" }]; }),
        sig: t === "signature" ? (() => {
          const tg = k => ({ bg: sb[k] ? "#3E8A5C" : "#D5D2C8", justify: sb[k] ? "flex-end" : "flex-start", toggle: () => this.setBlock(sb.id, x => { x[k] = !x[k]; }) });
          return { leftLabel: sb.text || "Prepared by", img: sb.img || "", hasImg: !!sb.img, imgEmpty: sb.img ? "" : "None", uploadLabel: sb.img ? "Replace" : "Upload image",
            onUpload: e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) lib.fileToDataUrl(f, 600).then(d => this.setBlock(sb.id, x => { x.img = d; })); },
            clear: () => this.setBlock(sb.id, x => { x.img = ""; }), ir: tg("signIr"), cust: tg("signCust") };
        })() : false,
        isSpacer: t === "spacer", showStyle: t !== "spacer", sizeText: sb.size + "px", spaceText: Math.round(sb.size * 2) + "px",
        req: { bg: sb.required ? "#3E8A5C" : "#D5D2C8", justify: sb.required ? "flex-end" : "flex-start", toggle: e => { e.preventDefault(); this.setBlock(sb.id, x => { x.required = !x.required; }); } },
        fs: t === "field" ? this.fieldSettings(sb, fn => this.setBlock(sb.id, fn)) : false,
        def: t === "field" ? lib.fieldEditor({ ...sb, label: "Default", required: false }, sb.value, v => this.setBlock(sb.id, x => { x.value = v; })) : false,
        removeLabel: st.arm === armKey ? "Click again to delete" : "Delete section", removeBg: st.arm === armKey ? "#EEEEEA" : "transparent",
        remove: () => this.arm(armKey, () => { this.upd(c => { c.doc.blocks = c.doc.blocks.filter(x => x.id !== sb.id); }); this.setState({ sel: null }); }),
        aligns: [["left", "Left", "M4 6h16M4 12h10M4 18h14"], ["center", "Centre", "M4 6h16M7 12h10M5 18h14"], ["right", "Right", "M4 6h16M10 12h10M6 18h14"]].map(([k, label, dd]) => ({ label, d: dd, bg: sb.align === k ? "#FFFFFF" : "transparent", shadow: sb.align === k ? "0 1px 2px rgba(20,20,18,.14)" : "none", color: sb.align === k ? "#111111" : "#6B6B66", pick: () => this.setBlock(sb.id, x => { x.align = k; }) })),
        smaller: () => this.setBlock(sb.id, x => { x.size = Math.max(8, Math.round((x.size - .5) * 2) / 2); }),
        bigger: () => this.setBlock(sb.id, x => { x.size = Math.min(32, Math.round((x.size + .5) * 2) / 2); }),
        toggleBold: () => this.setBlock(sb.id, x => { x.bold = !x.bold; }),
        boldBorder: sb.bold ? "#111111" : "#DEDED8", boldBg: sb.bold ? "#FFEBD9" : "#FFFFFF", boldInk: sb.bold ? "#111111" : "#1F1F1C",
        isText: t === "text" || t === "heading", text: sb.text || "", onText: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.text = v; }); },
        showTypo: t !== "letterhead",
        lh: t === "letterhead" ? (() => {
          const L = sb.rows || [], setL = fn => this.setBlock(sb.id, x => { x.rows = x.rows || lib.letterRows(co); fn(x); });
          return {
            logo: sb.logo || "", hasLogo: !!sb.logo, logoEmptyLbl: sb.logo ? "" : "+ Logo", logoEmpty: sb.logo ? "" : "No logo", uploadLabel: sb.logo ? "Replace" : "Upload logo", logoH: sb.logoH || 64, logoSizeText: (sb.logoH || 64) + "px",
            onUpload: e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) lib.fileToDataUrl(f, 600).then(d => { const im = new Image(); im.onload = () => setL(x => { x.logo = d; x.logoRatio = im.width / im.height || 2.5; }); im.src = d; }); },
            clearLogo: () => setL(x => { x.logo = ""; }),
            logoSmaller: () => setL(x => { x.logoH = Math.max(24, (x.logoH || 64) - 8); }),
            logoBigger: () => setL(x => { x.logoH = Math.min(160, (x.logoH || 64) + 8); }),
            positions: [["left", "Logo left"], ["center", "Logo on top"], ["right", "Logo right"]].map(([k, label]) => { const on = (sb.logoPos || "left") === k; return { label, bg: on ? "#FFFFFF" : "transparent", shadow: on ? "0 1px 2px rgba(20,20,18,.14)" : "none", color: on ? "#111111" : "#6B6B66", pick: () => setL(x => { x.logoPos = k; }) }; }),
            rows: L.map((r, i) => ({
              ...this.dnd("lh", i, (a, b2) => setL(x => { x.rows.splice(b2, 0, x.rows.splice(a, 1)[0]); })),
              text: r.text, size: String(r.size), fw: r.bold ? 700 : 400,
              onSize: e => { const v = +e.target.value; setL(x => { x.rows[i].size = v; }); },
              ...this.styleBtns(r, k => setL(x => { x.rows[i][k] = !x.rows[i][k]; })),
              boldBorder: r.bold ? "#111111" : "#DEDED8", boldBg: r.bold ? "#FFEBD9" : "#FFFFFF", boldInk: r.bold ? "#111111" : "#1F1F1C",
              onText: e => { const v = e.target.value; setL(x => { x.rows[i].text = v; }); },
              smaller: () => setL(x => { x.rows[i].size = Math.max(8, x.rows[i].size - 1); }),
              bigger: () => setL(x => { x.rows[i].size = Math.min(32, x.rows[i].size + 1); }),
              toggleBold: () => setL(x => { x.rows[i].bold = !x.rows[i].bold; }),
              up: () => setL(x => { if (i > 0) x.rows.splice(i - 1, 0, x.rows.splice(i, 1)[0]); }),
              down: () => setL(x => { if (i < x.rows.length - 1) x.rows.splice(i + 1, 0, x.rows.splice(i, 1)[0]); }),
              remove: () => setL(x => { x.rows.splice(i, 1); })
            })),
            addLine: () => setL(x => { x.rows.push({ id: lib.newId("lr-"), text: "", size: 12, bold: false }); })
          };
        })() : false,
        fields: t === "letterhead" ? null : false ? [
          coField("Company name", () => co.name, (o, v) => { o.name = v; }), coField("Registration no.", () => co.reg, (o, v) => { o.reg = v; }),
          ...co.addr.map((a, i) => coField(`Address line ${i + 1}`, () => a, (o, v) => { o.addr[i] = v; })),
          coField("Phone", () => co.phone, (o, v) => { o.phone = v; }), coField("Email", () => co.email, (o, v) => { o.email = v; })
        ] : false ? sb.labels.map((f, i) => ({ label: FACT_NAMES[f.key] || f.key, value: f.label, onChange: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.labels[i].label = v; }); } }))
          : t === "totals" ? [["total", "Total"], ["discount", "Discount"], ["saving", "Package saving"]].map(([k, label]) => ({ label, value: sb.labels[k], onChange: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.labels[k] = v; }); } }))
          : t === "signature" ? [{ label: "Left line", value: sb.text || "Prepared by", onChange: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.text = v; }); } }, { label: "Right line", value: sb.text2 || "Customer acknowledgement", onChange: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.text2 = v; }); } }]
          : null,
        columns: t === "table" ? sb.columns.map((c, i) => ({
          ...this.dnd("cols", i, (a, b) => this.setBlock(sb.id, x => { const L = x.columns; L.splice(b, 0, L.splice(a, 1)[0]); })),
          label: c.label, boxBorder: c.show ? "0" : "1.5px solid #C4C1B6", boxBg: c.show ? "#111111" : "#FFFFFF",
          toggle: () => this.setBlock(sb.id, x => { x.columns[i].show = !x.columns[i].show; }),
          onLabel: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.columns[i].label = v; }); },
          up: () => this.setBlock(sb.id, x => { if (i > 0) x.columns.splice(i - 1, 0, x.columns.splice(i, 1)[0]); }),
          down: () => this.setBlock(sb.id, x => { if (i < x.columns.length - 1) x.columns.splice(i + 1, 0, x.columns.splice(i, 1)[0]); })
        })) : null,
        lines: t === "terms" ? sb.lines.map((l, i) => ({ ...this.dnd("terms", i, (a, b) => this.setBlock(sb.id, x => { const L = x.lines; L.splice(b, 0, L.splice(a, 1)[0]); })), value: l, onChange: e => { const v = e.target.value; this.setBlock(sb.id, x => { x.lines[i] = v; }); }, remove: () => this.setBlock(sb.id, x => { x.lines.splice(i, 1); }) })) : null,
        addLine: () => this.setBlock(sb.id, x => { x.lines.push("New line"); })
      };
    }
    const addBlock = type => () => {
      const id = lib.newId("b-");
      const at = cfg.doc.blocks.findIndex(b => b.id === st.sel);
      this.upd(c => { c.doc.blocks.splice(at < 0 ? c.doc.blocks.length : at + 1, 0, { id, type, text: type === "heading" ? "NEW HEADING" : type === "text" ? "New paragraph" : type === "signature" ? "Prepared by" : "", text2: type === "signature" ? "Customer acknowledgement" : undefined, align: type === "heading" ? "center" : "left", size: type === "heading" ? 14 : 12.5, bold: type === "heading", hidden: false }); });
      this.setState({ sel: id });
    };
    const coEdit = (get, set) => ({ value: get(), onBlur: edit(v => this.upd(c => set(c.company, v))) });

    // unit types
    const groups = lib.deriveGroups(cfg.packages);
    const buildingOpts = cfg.buildings.map(b => ({ v: b.name, l: b.name }));
    const kindOpts = [{ v: "", l: "—" }, ...Object.entries(cfg.catalog.kinds).map(([k, v]) => ({ v: k, l: v.label }))];
    const ep = cfg.packages.find(p => p.id === st.pid);
    let ed = null;
    if (ep) {
      const pc = cost(ep), armKey = "delpkg-" + ep.id;
      const setP = fn => this.upd(c => { const p = this.pkgOf(c, ep.id); if (p) fn(p, c); });
      ed = {
        title: `${sizeKey(ep.spec) ? sizeLabel(sizeKey(ep.spec)) : (ep.groupLabel || ep.name)} · ${ep.style === "build" ? "Build in" : "Classic"}`, sub: sizeKey(ep.spec) ? "" : "Set bedrooms & bathrooms",
        groupLabel: ep.groupLabel || "", layout: ep.layout || "", building: ep.building || "", price: String(ep.price ?? ""),
        onGroupLabel: e => { const v = e.target.value; this.upd(c => c.packages.filter(p => p.group === ep.group).forEach(p => { p.groupLabel = v; })); },
        onLayout: e => { const v = e.target.value; setP(p => { p.layout = v; }); },
        sizes: SIZES.map(k => ({ label: sizeLabel(k), ...((on) => ({ border: on ? "#1F1F1C" : "#DEDED8", bg: on ? "#1F1F1C" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C" }))(sizeKey(ep.spec) === k), pick: () => { const [b, t] = k.split("-"); const other = groups.find(g => g.id !== ep.group && sizeKey((cfg.packages.find(x => x.id === (g.classic || g.build)) || {}).spec) === k); if (other) { this.setState({ notice: `${sizeLabel(k)} already has a package. Each room type can only have one.` }); return; } this.upd(c => { c.packages.filter(p => p.group === ep.group).forEach(p => { p.spec = { ...(p.spec || {}), beds: b, baths: t }; }); this.nameBySize(c, ep.group); }); } })),
        onPrice: e => { const v = num(e.target.value); setP(p => { p.price = v; }); },
        sp: (() => {
          const sp = ep.spec || {}, setS = (k, v) => this.upd(c => c.packages.filter(p => p.group === ep.group).forEach(p => { p.spec = { ...(p.spec || {}), [k]: v }; }));
          const bN = parseInt(sp.beds) || 0, plus = /\+\s*1/.test(String(sp.beds || "")), tN = parseInt(sp.baths) || 0, clamp = n => Math.max(0, Math.min(9, n));
          const setSize = (beds, baths) => { const k = sizeKey({ beds, baths }); if (k && groups.some(g => g.id !== ep.group && sizeKey((cfg.packages.find(x => x.id === (g.classic || g.build)) || {}).spec) === k)) { this.setState({ notice: `${sizeLabel(k)} already has a package. Each room type can only have one.` }); return; } this.upd(c => { c.packages.filter(p => p.group === ep.group).forEach(p => { p.spec = { ...(p.spec || {}), beds, baths }; }); this.nameBySize(c, ep.group); }); };
          const setBeds = (n, p) => { const v = clamp(n); setSize(v ? v + (p ? "+1" : "") : "", sp.baths || ""); };
          const o = { ...sp, bedsN: bN ? String(bN) : "", bathsN: tN ? String(tN) : "",
            bedsDn: () => setBeds(bN - 1, plus), bedsUp: () => setBeds(bN + 1, plus), onBedsN: e => setBeds(parseInt(e.target.value.replace(/\D/g, "")) || 0, plus),
            togglePlus: () => setBeds(bN || 1, !plus), plusBg: plus ? "#111111" : "#FFFFFF", plusInk: plus ? "#FFFFFF" : "#6B6B66", plusBorder: plus ? "#111111" : "#DEDED8",
            bathsDn: () => setSize(sp.beds || "", clamp(tN - 1) ? String(clamp(tN - 1)) : ""), bathsUp: () => setSize(sp.beds || "", String(clamp(tN + 1))), onBathsN: e => { const n = clamp(parseInt(e.target.value.replace(/\D/g, "")) || 0); setSize(sp.beds || "", n ? String(n) : ""); },
            plan: sp.plan || "", hasPlan: !!sp.plan, planEmpty: sp.plan ? "" : "No plan", preview: lib.specText(sp) || "Shown on unit cards and the quotation",
            clearPlan: () => setS("plan", ""),
            hasPhotos: (sp.photos || []).length > 0, noPhotos: !(sp.photos || []).length, showStrip: (sp.photos || []).length > 0 && !!st.phStrip, stripBorder: st.phStrip ? "#111111" : "#DEDED8", toggleStrip: () => this.setState(z => ({ phStrip: !z.phStrip })),
            modes: [["slide", "Slideshow", "M7 4v16l13-8z"], ["cover", "Cover only", "M12 17v5M5 3h14l-2 7 3 4H4l3-4z"]].map(([k, label, d]) => { const on = (sp.photoMode || "slide") === k; return { label, d, bg: on ? "#FFFFFF" : "transparent", shadow: on ? "0 1px 2px rgba(20,20,18,.14)" : "none", color: on ? "#111111" : "#6B6B66", pick: () => setS("photoMode", k) }; }),
            modeHint: (sp.photoMode || "slide") === "cover" ? "IR Quote shows the cover. IR can still swipe to see the rest." : "IR Quote plays the photos automatically. IR can also swipe.",
            photos: (sp.photos || []).map((src, k) => ({ src: this.u(src), cover: k === 0, notCover: k > 0, pin: () => { const a = [...(sp.photos || [])]; const [x] = a.splice(k, 1); a.unshift(x); setS("photos", a); }, ring: st.phDrag === k ? "0 0 0 2px #F5871F" : "none",
              remove: () => setS("photos", (sp.photos || []).filter((_, j) => j !== k)),
              dragStart: () => this.setState({ phDrag: k }), dragOver: e => e.preventDefault(),
              drop: e => { e.preventDefault(); const f = this.state.phDrag; this.setState({ phDrag: null }); if (f == null || f === k) return; const a = [...(sp.photos || [])]; const [x] = a.splice(f, 1); a.splice(k, 0, x); setS("photos", a); } })),
            onPhotos: e => { const fs = [...(e.target.files || [])]; e.target.value = ""; if (!fs.length) return; Promise.all(fs.map(f => lib.fileToDataUrl(f, 1000))).then(ds => { setS("photos", [...(sp.photos || []), ...ds]); this.setState({ phStrip: true }); }); },
            onUpload: e => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const img = new Image(); img.onload = () => { const k = Math.min(1, 1400 / Math.max(img.width, img.height)); const cv = document.createElement("canvas"); cv.width = img.width * k; cv.height = img.height * k; const x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height); setS("plan", cv.toDataURL("image/jpeg", .82)); }; img.src = r.result; }; r.readAsDataURL(f); e.target.value = ""; } };
          ["beds", "baths", "sqft", "note"].forEach(k => { o[k] = sp[k] || ""; o["on_" + k] = e => setS(k, e.target.value); });
          return o;
        })(),
        cost: rm0(pc), suggested: rm0(pc * m), effective: pc ? "×" + (ep.price / pc).toFixed(2) : "—",
        useSuggested: () => setP(p => { p.price = Math.round(cost(p) * m); }),
        itemCount: `${ep.cats.reduce((a, c) => a + c.items.length, 0)} items`,
        onXl: e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) this.readXl(f, ep.id); }, dlTpl: () => this.dlTemplate(ep), removeLabel: st.arm === armKey ? "Confirm delete" : "Delete", removeBg: st.arm === armKey ? "#F6E1DA" : "transparent",
        remove: () => this.arm(armKey, () => { this.upd(c => { c.packages = c.packages.filter(p => p.id !== ep.id); }); this.setState({ pid: cfg.packages.find(p => p.id !== ep.id)?.id }); }),
        addCat: () => setP(p => { p.cats.push({ name: "NEW CATEGORY", label: "New category", items: [] }); }),
        cats: ep.cats.map((c, ci) => ({
          name: c.name, open: !(st.catShut || {})[ep.id + ":" + ci], rot: (st.catShut || {})[ep.id + ":" + ci] ? "rotate(-90deg)" : "none", toggle: () => this.setState(z => ({ catShut: { ...(z.catShut || {}), [ep.id + ":" + ci]: !(z.catShut || {})[ep.id + ":" + ci] } })), count: `${c.items.length} item${c.items.length === 1 ? "" : "s"}`, sum: money(c.items.reduce((a, i) => a + (+i.cost || 0) * (+i.qty || 0), 0)),
          onName: e => { const v = e.target.value.toUpperCase(); setP(p => { p.cats[ci].name = v; p.cats[ci].label = v.charAt(0) + v.slice(1).toLowerCase(); }); },
          remove: () => setP(p => { p.cats.splice(ci, 1); }),
          addRow: () => setP(p => { p.cats[ci].items.push({ name: "", desc: "", code: "", cost: 0, qty: 1, kind: null }); }),
          rows: c.items.map((it, ii) => {
            const setI = fn => setP(p => fn(p.cats[ci].items[ii]));
            return {
              name: it.name, desc: it.desc || "", code: it.code || "", kind: it.kind || "", cost: String(it.cost ?? ""),
              src: it.fixed ? "FIXED" : "B2B", locked: !it.fixed, costBg: it.fixed ? "#FFFFFF" : "#F2F2EF", costBorder: it.fixed ? "#DEDED8" : "transparent",
              ...(() => { const mode = it.adjust ? "adj" : it.fixed ? "fix" : "b2b";
                const L = { b2b: ["#B5B5AE", "b2b", "Follows the b2b price · click to change"], fix: ["#111111", "fixed", "Fixed price · IR can't change it · click to change"], adj: ["#F5871F", "edit", "IR can edit this price in the quote · click to change"] }[mode];
                return { srcDot: L[0], srcLabel: L[1], srcTip: L[2],
                  toggleFix: () => setI(x => { if (mode === "b2b") { x.fixed = true; x.adjust = false; } else if (mode === "fix") { x.fixed = true; x.adjust = true; } else { x.adjust = false; x.fixed = !it.linked; } }) }; })(), kindBorder: it.kind ? "#DEDED8" : "transparent", kindBg: it.kind ? "#FFFFFF" : "transparent", kindInk: it.kind ? "#1F1F1C" : "#C4C4BD", kindApp: it.kind ? "auto" : "none", selKey: ep.id + ":" + ci + ":" + ii + ":" + (it.kind || "") + ":" + kindOpts.length,
              qty: String(it.qty ?? ""), sum: money((+it.cost || 0) * (+it.qty || 0)), bg: ii % 2 ? "#F8F8F6" : "#FFFFFF",
              onName: e => { const v = e.target.value; setI(x => { x.name = v; }); }, onDesc: e => { const v = e.target.value; setI(x => { x.desc = v; }); },
              onCode: e => { const v = e.target.value; setI(x => { x.code = v; }); }, onKind: e => { const v = e.target.value || null; setI(x => { x.kind = v; }); },
              onCost: e => { if (!it.fixed) return; const v = num(e.target.value); setI(x => { x.cost = v; }); }, onQty: e => { const v = Math.round(num(e.target.value)); setI(x => { x.qty = v; }); },
              remove: () => setP(p => { p.cats[ci].items.splice(ii, 1); })
            };
          })
        }))
      };
    }
    const nu = st.newUnit;
    const nuGroup = nu && nu.size ? groups.find(g => sizeKey((cfg.packages.find(x => x.id === (g.classic || g.build)) || {}).spec) === nu.size) : null;
    const nuDup = !!(nuGroup && nuGroup[nu.style]);
    const nuOk = nu && nu.size && !nuDup;
    const nuView = nu ? {
      label: nu.label, from: nu.from, building: nu.building,
      onLabel: e => { const v = e.target.value; this.setState(s => ({ newUnit: { ...s.newUnit, label: v } })); },
      onFrom: e => { const v = e.target.value; this.setState(s => ({ newUnit: { ...s.newUnit, from: v } })); },
      sizes: SIZES.map(k => ({ label: sizeLabel(k), ...((on) => ({ border: on ? "#1F1F1C" : "#DEDED8", bg: on ? "#1F1F1C" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C" }))(nu.size === k), pick: () => this.setState(s => ({ newUnit: { ...s.newUnit, size: k } })) })),
      styles: [["classic", "Classic"], ["build", "Build in"]].map(([k, label]) => ({ label, bg: nu.style === k ? "#FFFFFF" : "transparent", shadow: nu.style === k ? "0 1px 2px rgba(20,20,18,.14)" : "none", color: nu.style === k ? "#111111" : "#6B6B66", pick: () => this.setState(s => ({ newUnit: { ...s.newUnit, style: k } })) })),
      fromOpts: [{ v: "", l: "Blank" }, ...cfg.packages.map(p => ({ v: p.id, l: `${p.groupLabel || p.name} · ${p.style === "build" ? "Build in" : "Classic"}` }))],
      hint: !nu.size ? "Pick a unit size" : nuDup ? `${sizeLabel(nu.size)} ${nu.style === "build" ? "Build in" : "Classic"} already exists` : "", hasHint: !nu.size || nuDup,
      btnBg: nuOk ? "#111111" : "#EEEEEA", btnInk: nuOk ? "#FFFFFF" : "#97978F",
      create: () => {
        if (!nuOk) return;
        const id = lib.newId("p"), label = sizeLabel(nu.size); const [nb, nt] = (nu.size || "").split("-");
        const existing = nuGroup;
        const src = cfg.packages.find(p => p.id === nu.from);
        const pkg = { id, name: `${label.toUpperCase()} ${nu.style === "build" ? "BUILD IN" : "CLASSIC"}`, layout: label.toUpperCase(), group: existing ? existing.id : lib.newId("g"), groupLabel: existing ? existing.label : label, style: nu.style, building: "", spec: { ...((src && src.spec) || {}), plan: "", ...(nu.size ? { beds: nb, baths: nt } : {}) }, price: src ? src.price : 0, cost: 0, cats: src ? JSON.parse(JSON.stringify(src.cats)) : [{ name: "LIVING", label: "Living", items: [] }] };
        this.upd(c => { c.packages.push(pkg); });
        this.setState({ pid: id, newUnit: null });
      }
    } : {};

    // catalogue
    if (cfg.catalog.items.some(it => it.sample && +it.cost === 0 && it.img)) setTimeout(() => this.upd(c => { c.catalog.items.forEach(it => { if (it.sample && +it.cost === 0 && it.img) { it.sample = false; it.noPrice = true; it.cost = null; } }); }), 0);
    const items = cfg.catalog.items;
    const q = st.catQ.trim().toLowerCase();
    const kinds = cfg.catalog.kinds;
    const catRows = sortCatalog(items.filter(it => (st.kindFilter === "all" || it.kind === st.kindFilter) && (!q || (it.code + " " + it.name).toLowerCase().includes(q))), st.catSort, kinds).map(it => {
      const setC = fn => this.upd(c => { const x = c.catalog.items.find(y => y.id === it.id); if (x) fn(x); });
      return {
        id: it.id, selected: !!(st.sel || {})[it.id], onSel: () => this.setState(s => { const m = { ...(s.sel || {}) }; if (m[it.id]) delete m[it.id]; else m[it.id] = true; return { sel: m }; }),
        img: it.img || imgFor(it.code), specs: it.specs || "", initials: "",
        code: it.code || "", name: it.name, kind: it.kind, cost: it.noPrice || it.cost == null ? "" : String(it.cost),
        chip: it.noPrice ? "NO PRICE" : it.sample ? "SAMPLE" : "", chipBg: it.noPrice ? "#EEEEEA" : it.sample ? "#F5E1AE" : "#E8F3ED", chipInk: it.noPrice ? "#8A2E1C" : it.sample ? "#D96E0B" : "#387557",
        onCode: e => { const v = e.target.value; setC(x => { x.code = v; }); }, onName: e => { const v = e.target.value; setC(x => { x.name = v; }); },
        onKind: e => { const v = e.target.value; setC(x => { x.kind = v; }); }, onCost: e => { const raw = e.target.value, v = num(raw); setC(x => { if (raw.trim() === "") { x.cost = null; x.noPrice = true; } else { x.cost = v; x.sample = false; x.noPrice = false; } }); },
        toggleSample: () => setC(x => { if (!x.noPrice) x.sample = !x.sample; }),
        remove: () => this.upd(c => { c.catalog.items = c.catalog.items.filter(y => y.id !== it.id); }),
        ...(() => { const t = it.updatedAt || it.checkedAt, d = t ? new Date(t) : null, ago = t ? Math.floor((Date.now() - t) / 86400000) : null;
          const pc = it.prevCost != null && it.cost != null && +it.prevCost !== +it.cost ? +it.cost - +it.prevCost : 0;
          return { stock: it.stock == null ? "—" : String(it.stock), stockInk: it.stock === 0 ? "#8A2E1C" : it.stock == null ? "#97978F" : "#1F1F1C", stockW: it.stock === 0 ? "700" : "500",
            upd: !d ? "—" : ago === 0 ? "Today" : ago === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
            updTitle: [it.updatedAt ? "Changed " + new Date(it.updatedAt).toLocaleString("en-GB") : "", it.checkedAt ? "Checked " + new Date(it.checkedAt).toLocaleString("en-GB") : ""].filter(Boolean).join(" · "),
            prev: pc ? (pc > 0 ? "▲ " : "▼ ") + "was " + it.prevCost : "", prevInk: pc > 0 ? "#8A2E1C" : "#387557" }; })(),
        ...(() => { const kp = !!(kinds[it.kind] || {}).paused, on = !it.paused && !kp; return { rowBg: on ? "#FFFFFF" : "#F8F7F3", pauseLabel: on ? "On" : "Paused", pauseInk: on ? "#387557" : "#97978F", trackBg: on ? "#111111" : "#D5D2C8", knobX: on ? "14px" : "2px", pauseTitle: kp ? "Whole category is paused" : on ? "Hide from IR Quote (keeps the item)" : "Show in IR Quote again", togglePause: () => setC(x => { x.paused = !x.paused; }) }; })()
      };
    });
    const sampleN = items.filter(i => i.sample).length, noPriceN = items.filter(i => i.noPrice).length;
    const ci = this.ci;
    const fromClip = this._fromClip = text => {
      const s = String(text || "").trim();
      if (/^javascript:|SCRAPE|IR%20price%20grabber/i.test(s)) { this.impMsg("That's the grabber button itself, not product data. Open the b2b product list, click the bookmark there, then come back and paste.", true); return; }
      const d = ci && ci.parseClip(s);
      if (!d) { this.impMsg(s ? "That isn't from the price grabber. Click the bookmark on the b2b page first." : "Clipboard is empty. Click the bookmark on the b2b page first.", true); return; } const np = d.items.filter(x => x.price != null).length;
      if (!np) { this.impMsg(`Got ${d.items.length} items but no prices. On the b2b page, make sure you're logged in and prices show, then click the bookmark again.`, true); return; }
      this.setState({ pasteBox: false, grabV: d.v || "old" }); this.stage(d.items, `Price grabber · ${np} of ${d.items.length} with price · ` + (d.page || "b2b"), d.page); };
    const readUrl = u => { u = (u || "").trim(); if (!/^https?:\/\//i.test(u)) { this.impMsg("Paste a full link starting with https://", true); return; } this.setState({ impBusy: true, impMsg: "Reading the page…", impErr: false }); ci.readLink(u).then(list => { this.setState({ impBusy: false }); this.stage(list, u, u); }, () => { this.setState({ impBusy: false }); this.impMsg("Could not read this page. Try the price grabber instead.", true); }); };
    const imp = {
      url: st.impUrl || "", readLabel: st.impBusy ? "Reading…" : "Read",
      onUrl: e => this.setState({ impUrl: e.target.value }),
      onPasteUrl: e => { const v = (e.clipboardData?.getData("text") || "").trim(); if (/^https?:\/\//i.test(v) && ci) setTimeout(() => readUrl(v), 0); },
      read: () => ci && readUrl(st.impUrl),
      bmClick: e => { e.preventDefault(); this.impMsg("Drag this button to your bookmarks bar, then click it on the b2b website."); },
      paste: async () => { if (!ci) return; try { fromClip(await navigator.clipboard.readText()); } catch (er) { this.setState({ pasteBox: true, impMsg: "Your browser blocked reading the clipboard. Click the box and press Ctrl+V (Cmd+V on Mac).", impErr: false }); } },
      openGuide: () => this.setState({ bmHelp: true, bmCopied: false, impTools: true }), toolsOpen: !!st.impTools, toolsLabel: st.impTools ? "Hide options" : "Other ways", toggleTools: () => this.setState(s => ({ impTools: !s.impTools })),
      bmManual: !!st.bmManual, bmCode: ci ? ci.BOOKMARKLET_BODY : "", selAll: e => e.target.select(), outdated: !!(st.grabV && ci && st.grabV !== ci.GRABBER_VERSION), ver: ci ? ci.GRABBER_VERSION : "",
      steps: [
        { text: "Copy the latest code.", btn: st.bmCopied ? "Copied ✓" : "Copy code", act: () => { const t = ci ? ci.BOOKMARKLET_BODY : ""; if (!t) return; const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0"; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (er) {} ta.remove(); const done = () => this.setState({ bmCopied: true, bmManual: false }); if (ok) done(); else if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => this.setState({ bmManual: true })); else this.setState({ bmManual: true }); } },
        { text: "Right-click IR price grabber on your bookmarks bar › Edit. First time? Right-click the bar › Add page." },
        { text: "Name it:", code: "IR price grabber" },
        { text: "Clear the URL box, type this first, then press Ctrl+V (Cmd+V on Mac) right after it:", code: "javascript:" },
        { text: "Click Save. Next time you click it on b2b, this message goes away." }
      ].map((s, i) => ({ n: String(i + 1), code: "", btn: "", act: null, ...s, dotBg: i === 0 && st.bmCopied ? "#4E9A6E" : "#1F1F1C", dotInk: "#FFFFFF" })),
      bmHelp: !!st.bmHelp, closeHelp: () => this.setState({ bmHelp: false }),
      showBox: !!st.pasteBox, onBox: e => fromClip(e.target.value),
      onFile: e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f || !ci) return; this.impMsg("Reading " + f.name + "…"); ci.readFile(f).then(list => this.stage(list, f.name, ""), () => this.impMsg("Could not read this file.", true)); },
      msg: st.impMsg || "", msgInk: st.impErr ? "#8A2E1C" : "#387557"
    };
    let rev = false;
    if (st.rev) {
      const rv = st.rev, cnt = s => rv.rows.filter(r => r.status === s).length;
      const CH = { new: ["NEW", "#E6EEF8", "#2D5788"], changed: ["CHANGED", "#F5E1AE", "#D96E0B"], same: ["SAME", "#EEEEEA", "#6B6B66"] };
      const nSel = rv.rows.filter(r => rv.sel[r.key] && r.status !== "same").length;
      const COL = /\s+(\d{2,4}\/\d{2,5}|[A-Z]{1,3}\d{2,4})$/i, SZ = /\b(\d+(?:\.\d)?)\s*SEATER\b/i;
      const byColour = {}, bySize = {}, variants = {};
      rv.rows.forEach(r => { const n = String(r.inc.name || "").trim(); const cm = n.match(COL); const base = n.replace(COL, ""); if (cm) (byColour[base] = byColour[base] || new Set()).add(cm[1]); const sm = base.match(SZ); if (sm) { const sb = base.replace(SZ, "#"); (bySize[sb] = bySize[sb] || new Set()).add(sm[1]); } });
      rv.rows.forEach(r => { const n = String(r.inc.name || "").trim(), base = n.replace(COL, ""), sb = base.replace(SZ, "#"); variants[r.key] = { colours: [...(byColour[base] || [])], sizes: base.match(SZ) ? [...(bySize[sb] || [])].sort((a, b) => a - b) : [] }; });
      rev = {
        total: rv.rows.length, source: rv.source, kind: rv.kind, hasNew: cnt("new") > 0 && !Object.keys(rv.catKind || {}).length,
        hasCats: Object.keys(rv.catKind || {}).length > 0, cat: rv.cat,
        onCat: e => { const v = e.target.value; this.setState(s => ({ rev: { ...s.rev, cat: v } })); },
        catOpts: [{ v: "all", l: "All categories" }, ...Object.keys(rv.catKind || {}).map(c => ({ v: c, l: `${c} (${rv.rows.filter(r => r.inc.cat === c).length})` }))],
        catMap: Object.keys(rv.catKind || {}).filter(c => rv.rows.some(r => r.inc.cat === c && r.status === "new")).map(c => ({ name: c, n: rv.rows.filter(r => r.inc.cat === c && r.status === "new").length, kind: rv.catKind[c] || "", warn: !rv.catKind[c],
          onKind: e => { const v = e.target.value; this.setState(s => ({ rev: { ...s.rev, catKind: { ...s.rev.catKind, [c]: v } } })); } })),
        onKind: e => { const v = e.target.value; this.setState(s => ({ rev: { ...s.rev, kind: v } })); },
        filters: [["all", "All " + rv.rows.length], ["new", "New " + cnt("new")], ["changed", "Changed " + cnt("changed")], ["same", "Same " + cnt("same")]].map(([k, label]) => { const on = rv.filter === k; return { label, bg: on ? "#1F1F1C" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C", border: on ? "#1F1F1C" : "#DEDED8", pick: () => this.setState(s => ({ rev: { ...s.rev, filter: k } })) }; }),
        rows: rv.rows.filter(r => (rv.filter === "all" || r.status === rv.filter) && (rv.cat === "all" || r.inc.cat === rv.cat)).map(r => {
          const inc = r.inc, cur = r.cur, [chip, chipBg, chipInk] = CH[r.status];
          const D = [], add = (k, v, tone, full) => D.push({ k, v, full: full || (k + " " + v), bg: tone === "up" ? "#EEEEEA" : tone === "down" ? "#E3F1E8" : "#F0EEE8", ink: tone === "up" ? "#8A2E1C" : tone === "down" ? "#2F6B47" : "#564C44" });
          if (inc.cat && rv.cat === "all") add("", inc.cat);
          if (inc.col) add("Collection", inc.col);
          if (inc.color) add("Colour", inc.color);
          if (cur && inc.price != null && +inc.price !== +cur.cost) {
            const d = +inc.price - +cur.cost, pct = cur.cost ? Math.round(d / cur.cost * 1000) / 10 : 0;
            add("Price", `RM ${money(+cur.cost)} → RM ${money(+inc.price)} (${d > 0 ? "+" : ""}${money(d)}${cur.cost ? `, ${pct > 0 ? "+" : ""}${pct}%` : ""})`, d > 0 ? "up" : "down");
          } else if (!cur && inc.price != null) add("Price", "RM " + money(+inc.price));
          if (cur?.sample && inc.price != null) add("", "Replaces sample price", "down");
          if (cur && r.what.includes("name")) add("Name", `${cur.name} → ${inc.name}`);
          if (cur && r.what.includes("specs")) add("Specs", cur.specs ? `${cur.specs} → ${inc.specs}` : inc.specs);
          else if (!cur && inc.specs) add("Specs", inc.specs);
          if (cur && r.what.includes("picture")) add("", cur.img || imgFor(cur.code) ? "New picture" : "Picture added");
          if (inc.stock != null) add("Stock", String(inc.stock), inc.stock === 0 ? "up" : "");
          const sz = String(inc.name || "").match(/(\d+(?:\.\d)?)\s*SEATER/i); if (sz) add("Size", sz[1] + " seater");
          const vg = variants[r.key];
          if (vg && vg.colours.length > 1) add("Colours", vg.colours.length + ": " + vg.colours.join(", "));
          if (vg && vg.sizes.length > 1) add("Sizes", vg.sizes.join(", ") + " seater");
          if (inc.price == null && !cur) add("", "No price on public page, use the price grabber");
          const p = inc.price != null ? "RM " + money(+inc.price) : "—";
          return { name: inc.name || cur?.name || "", meta: [inc.code || cur?.code, inc.stock != null ? "Stock " + inc.stock : "", r.status === "changed" ? r.what.join(", ") + " changed" : inc.specs, inc.truncated && !cur ? "name cut off on the list page, check it" : ""].filter(Boolean).join(" · "),
            img: inc.img || cur?.img || imgFor(inc.code || cur?.code), chip, chipBg, chipInk, locked: r.status === "same", op: r.status === "same" ? .55 : 1,
            price: inc.price != null ? "RM " + money(+inc.price) : cur ? "RM " + money(+cur.cost) : "—",
            details: D, hasDetails: D.length > 0,
            sel: !!rv.sel[r.key], toggle: () => this.setState(s => ({ rev: { ...s.rev, sel: { ...s.rev.sel, [r.key]: !s.rev.sel[r.key] } } })) };
        }),
        applyLabel: nSel ? `Update ${nSel} item${nSel === 1 ? "" : "s"}` : "Nothing to update",
        apply: () => this.applyRev(), discard: () => this.setState({ rev: null })
      };
    }

    const pkgCountByBld = name => lib.deriveGroups(cfg.packages.filter(p => p.building === name)).length;

    return {
      ...base,
      tabs: TABS.map(([k, label]) => ({ label, dirty: dirtyTabs.includes(k), color: st.tab === k ? "#111111" : "#6B6B66", weight: st.tab === k ? 650 : 500, line: st.tab === k ? "inset 0 -3px 0 #F5871F" : "none", go: () => this.setState({ tab: k }) })),
      imp, rev, bmRef: this.bmRef,
      tabDoc: st.tab === "doc", tabUnits: st.tab === "units", tabCat: st.tab === "cat", closeNotice: () => this.setState({ notice: "" }), xl: st.xl ? (() => { const x = st.xl, n = x.cats.reduce((a, c) => a + c.items.length, 0);
        return { sub: x.name + " · " + n + " items in " + x.cats.length + " categories", err: x.err, cats: x.cats.map(c => ({ name: c.name, n: c.items.length + " items", rows: c.items.map(i => ({ name: i.name, code: i.code, qty: "× " + i.qty, price: i.cost ? money(i.cost) : "—" })) })),
          modes: [["replace", "Replace list"], ["append", "Add to list"]].map(([k, label]) => ({ label, bg: x.mode === k ? "#FFFFFF" : "transparent", ink: x.mode === k ? "#111111" : "#6B6B66", pick: () => this.setState(s2 => ({ xl: { ...s2.xl, mode: k } })) })),
          tpl: "data:text/csv;charset=utf-8," + encodeURIComponent("CATEGORY,ITEM,DESCRIPTION,CODE/COLOUR,QTY,PRICE\nLIVING,TV CABINET,,336103,1,519\nLIVING,COFFEE TABLE,,132055,1,323\nDINING,DINING CHAIR,,241655,4,188\nSERVICES,INSTALLATION,,,1,780\n"),
          okBg: n ? "#111111" : "#D2D2CB", close: () => this.setState({ xl: null }), stop: e => e.stopPropagation(),
          apply: () => { if (!n) return; this.upd(c => { const p = c.packages.find(y => y.id === x.pid); if (!p) return; if (x.mode === "replace") p.cats = JSON.parse(JSON.stringify(x.cats)); else x.cats.forEach(nc => { const ex = p.cats.find(y => y.name === nc.name); if (ex) ex.items.push(...nc.items); else p.cats.push(JSON.parse(JSON.stringify(nc))); }); }); this.setState({ xl: null, notice: "Imported " + n + " items. Press Publish to save." }); } }; })() : false,
      tabStyles: st.tab === "styles", tabKinds: st.tab === "kinds", tabCust: st.tab === "cust",
      ...(() => { const ci = cfg.custInfo || lib.defaultCustInfo(), sw = (on, lock) => ({ bg: on ? "#111111" : "#D2D2CB", fill: on ? "#111111" : "#FFFFFF", tick: on ? 1 : 0, x: on ? "18px" : "2px", op: lock ? .45 : 1 });
        const setCI = fn => this.upd(c => { c.custInfo = c.custInfo || lib.defaultCustInfo(); fn(c.custInfo); });
        const own = ci.own || [];
        return {
          ciCrm: lib.CRM_FIELDS.map(f => { const v = ci.crm[f.id] || {}, show = f.core || !!v.show, print = !!v.print && show;
            const req = f.core || !!v.required; return { label: f.label, section: f.section, core: !!f.core, rq: sw(req && show, f.core || !show), lockReq: !!f.core || !show, toggleReq: () => setCI(x => { const o = x.crm[f.id] = x.crm[f.id] || {}; o.required = !o.required; }), sh: sw(show, f.core), pr: sw(print, !show), lockShow: !!f.core, lockPrint: !show,
              toggleShow: () => setCI(x => { const o = x.crm[f.id] = x.crm[f.id] || {}; o.show = !o.show; if (!o.show) o.print = false; }),
              togglePrint: () => setCI(x => { const o = x.crm[f.id] = x.crm[f.id] || {}; o.print = !o.print; }) }; }),
          ciOwn: own.map((f, i) => { const mv = d => () => setCI(x => { const [z] = x.own.splice(i, 1); x.own.splice(i + d, 0, z); }), ak = "ci-" + f.id;
            return { app: f.core ? "none" : "auto", label: f.label, type: f.type || "short", core: !!f.core, never: false, typeOp: f.core ? .55 : 1, rq: sw(!!f.required), pr: sw(f.core ? f.print !== false : !!f.print, false),
              first: i === 0, last: i === own.length - 1, upOp: i === 0 ? .35 : 1, downOp: i === own.length - 1 ? .35 : 1, up: mv(-1), down: mv(1),
              onLabel: e => { const v = e.target.value; setCI(x => { x.own[i].label = v; }); }, onType: e => { const v = e.target.value; setCI(x => { x.own[i].type = v; }); },
              toggleReq: () => setCI(x => { x.own[i].required = !x.own[i].required; }), togglePrint: () => setCI(x => { const o = x.own[i]; o.print = o.core ? o.print === false : !o.print; }),
              delOp: f.core ? .25 : 1, delBg: st.arm === ak ? "#F6E1DA" : "transparent", remove: () => this.arm(ak, () => setCI(x => { x.own.splice(i, 1); })) }; }),
          ciPvTabs: [["phone", "Phone", "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2"], ["desk", "Desktop", "M3 4h18v12H3zM8 20h8M12 16v4"]].map(([k, label, d]) => { const on = (st.ciPv || "phone") === k; return { label, d, bg: on ? "#FFFFFF" : "transparent", ink: on ? "#111111" : "#6B6B66", shadow: on ? "0 1px 2px rgba(20,20,18,.14)" : "none", pick: () => this.setState({ ciPv: k }) }; }),
          ciPv: { phone: (st.ciPv || "phone") === "phone", desk: st.ciPv === "desk" },
          ciPrevForm: [...lib.CRM_FIELDS.filter(f => f.core || (ci.crm[f.id] || {}).show).map(f => ({ label: f.label, req: !!f.core || !!(ci.crm[f.id] || {}).required })), ...own.map(f => ({ label: f.label, req: !!f.required }))],
          ciPrevPrint: (() => { const SAMPLE = { name: "Tan Wei Ming", phone: "012-338 4471", ptype: "Condo", usize: "3R 2R", uloc: "Block B", type: "Condo", size: "3R 2R", loc: "Block B", req: "Full furnish", budget: "RM 40k–50k", unit: "B-23-05", bill: "—", building: "Skyline Embassy", date: "5 Nov 2026", by: "William Lim" };
            const core = own.filter(f => f.core && f.print !== false).map(f => ({ label: f.label.toUpperCase() + " :", value: SAMPLE[f.id] || "—" }));
            return [{ label: "ATTENTION :", value: SAMPLE.name }, ...core, ...lib.CRM_FIELDS.filter(f => f.id !== "name" && (ci.crm[f.id] || {}).show && (ci.crm[f.id] || {}).print).map(f => ({ label: f.label.toUpperCase() + " :", value: SAMPLE[f.id] })), ...own.filter(f => !f.core && f.print).map(f => ({ label: f.label.toUpperCase() + " :", value: "…" }))]; })(),
          ciAdd: e => { e.preventDefault(); const n = (e.target.nf.value || "").trim(); if (!n) return; e.target.nf.value = ""; setCI(x => { x.own.push({ id: lib.newId("cf-"), label: n, type: "short", ph: "", required: false, print: true }); }); }
        }; })(),
      styleCount: `${(cfg.styles || []).length} style${(cfg.styles || []).length === 1 ? "" : "s"}`,
      addStyle: () => this.upd(c => { c.styles = [...(c.styles || []), { id: lib.newId("st-"), name: "New style", desc: "" }]; }),
      styleRows: (cfg.styles || []).map((x, i, arr) => { const set = k => e => { const v = e.target.value; this.upd(c => { c.styles[i][k] = v; }); }, mv = d => () => this.upd(c => { const [z] = c.styles.splice(i, 1); c.styles.splice(i + d, 0, z); }), ak = "sty" + x.id;
        const photos = x.photos && x.photos.length ? x.photos : (x.cover ? [x.cover] : []), setPh = arr => this.upd(c => { c.styles[i].photos = arr; c.styles[i].cover = arr[0] || ""; });
        return { photos: photos.map((src, j) => ({ src: this.u(src), notCover: j > 0, ring: j === 0 ? "0 0 0 2px #F5871F" : "none", remove: () => setPh(photos.filter((_, q) => q !== j)), pin: () => { const a = [...photos]; const [y] = a.splice(j, 1); a.unshift(y); setPh(a); } })),
          onFiles: e => { const fs = [...(e.target.files || [])]; e.target.value = ""; Promise.all(fs.map(f => lib.fileToDataUrl(f, 1000))).then(ds => setPh([...photos, ...ds])); },
          name: x.name || "", desc: x.desc || "", cover: this.u(x.cover), hasCover: !!x.cover, noCover: !x.cover, onName: set("name"), onDesc: set("desc"),
          onCover: e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) lib.fileToDataUrl(f, 900).then(d => this.upd(c => { c.styles[i].cover = d; })); },
          clearCover: () => this.upd(c => { c.styles[i].cover = ""; c.styles[i].photos = []; }),
          first: i === 0, last: i === arr.length - 1, upOp: i === 0 ? .4 : 1, downOp: i === arr.length - 1 ? .4 : 1, up: mv(-1), down: mv(1),
          delLabel: st.arm === ak ? "Click again to delete" : "Delete", delBg: st.arm === ak ? "#F6E1DA" : "transparent",
          remove: () => this.arm(ak, () => this.upd(c => { c.styles.splice(i, 1); })) }; }),
      tabBld: st.tab === "bld", tabPrice: st.tab === "price",
      savedText: cfg.saved ? `Last published ${new Date(cfg.saved.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${cfg.saved.by}` : "Using the Excel price list",
      dirtyCount: dirty ? `${dirtyTabs.length} section${dirtyTabs.length === 1 ? "" : "s"}` : "No changes", dirtyRest: dirty ? "changed · publish to update IR Quote" : "",
      statusText: dirty ? `${dirtyTabs.length} unpublished change${dirtyTabs.length === 1 ? "" : "s"}` : (cfg.saved ? savedTextShort : "Using the Excel price list"), dirtyDot: dirty ? "#111111" : "#7FA88E",
      dirtyOpacity: dirty ? 1 : .5, saveBg: dirty ? "#111111" : "#EEEEEA", saveInk: dirty ? "#FFFFFF" : "#97978F",
      onCancel: () => { if (dirty) this.setState({ cfg: JSON.parse(st.savedJson), arm: "" }); },
      onSave: () => {
        if (!dirty) return;
        const c = { ...cfg, saved: { at: new Date().toISOString(), by: (this.props.user && this.props.user.name) || "" } };
        c.packages = c.packages.map(p => ({ ...p, cost: cost(p) }));
        lib.save(c); lib.savePreview(c);
        this.setState({ cfg: c, savedJson: JSON.stringify(c), notice: "Published. IR Quote now uses these settings." });
      },
      notice: st.notice,
      // document
      fonts: Object.keys(lib.FONTS).map(k => ({ label: k, bg: cfg.doc.font === k ? "#FFFFFF" : "transparent", shadow: cfg.doc.font === k ? "0 1px 2px rgba(20,20,18,.14)" : "none", color: cfg.doc.font === k ? "#111111" : "#6B6B66", pick: () => this.upd(c => { c.doc.font = k; }) })),
      sizeOpts: [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28].map(v => ({ v: String(v), l: String(v) })),
      addOpen: !!st.addOpen, addClosed: !st.addOpen, openAdd: () => this.setState({ addOpen: true }), closeAdd: () => this.setState({ addOpen: false }),
      addGroups: (() => {
        const mk = nb => () => { const id = lib.newId("b-"), at = cfg.doc.blocks.findIndex(b => b.id === st.sel); this.upd(c => { c.doc.blocks.splice(at < 0 ? c.doc.blocks.length : at + 1, 0, { id, align: "left", size: 12.5, bold: false, hidden: false, ...nb }); }); this.setState({ sel: id, addOpen: false }); };
        const FD = { short: "One line, e.g. car park no.", long: "Several lines of notes", number: "A number", date: "Pick a date", link: "A web address", image: "Photo or drawing", table: "Rows and columns" };
        return [
          { title: "IR fills in", sub: "a question on every quote", items: lib.FIELD_KINDS.map(k => ({ label: k.label, desc: FD[k.k] || "", add: mk({ type: "field", label: k.label, kind: k.k, required: false, columns: k.k === "table" ? this.defaultCols() : undefined }) })) },
          { title: "Fixed content", sub: "same on every quote", items: [
            { label: "Heading", desc: "A title line", add: mk({ type: "heading", text: "NEW HEADING", align: "center", size: 14, bold: true }) },
            { label: "Paragraph", desc: "A block of text", add: mk({ type: "text", text: "New paragraph" }) },
            { label: "Signature", desc: "Two signing lines", add: mk({ type: "signature", text: "Prepared by", text2: "Customer acknowledgement" }) },
            { label: "Free space", desc: "Empty gap", add: mk({ type: "spacer", size: 12 }) }
          ] }
        ];
      })(),
      docComp: this.composer("doc", [...lib.FIELD_KINDS.map(k => ({ ...k, group: "IR FILLS IN" })), ...[{ k: "heading", label: "Heading" }, { k: "paragraph", label: "Paragraph" }, { k: "signature", label: "Signature" }, { k: "space", label: "Free space" }].map(k => ({ ...k, group: "FIXED CONTENT" }))], "Name", (kind, name) => {
        const id = lib.newId("b-"), at = cfg.doc.blocks.findIndex(b => b.id === st.sel);
        const base = { id, align: "left", size: 12.5, bold: false, hidden: false };
        const nb = kind === "heading" ? { ...base, type: "heading", text: name || "NEW HEADING", align: "center", size: 14, bold: true }
          : kind === "paragraph" ? { ...base, type: "text", text: name || "New paragraph" }
          : kind === "signature" ? { ...base, type: "signature", text: name || "Prepared by", text2: "Customer acknowledgement" }
          : kind === "space" ? { ...base, type: "spacer", size: 12 }
          : { ...base, type: "field", label: name, kind, required: false, columns: kind === "table" ? this.defaultCols() : undefined };
        this.upd(c => { c.doc.blocks.splice(at < 0 ? c.doc.blocks.length : at + 1, 0, nb); });
        this.setState({ sel: id });
      }, k => !["heading", "paragraph", "signature", "space"].includes(k), "Add block"),
      bldComp: this.composer("bld", lib.FIELD_KINDS, "Field name, e.g. Completion date", (kind, name) => {
        const id = lib.newId("bf-");
        this.upd(c => { c.bldFields = [...(c.bldFields || []), { id, label: name, kind, show: false, columns: kind === "table" ? this.defaultCols() : undefined }]; });
        this.setState({ bfSel: id });
      }, () => true, "Add field"),
      bfCount: `${(cfg.bldFields || []).length} field${(cfg.bldFields || []).length === 1 ? "" : "s"}`,
      bfRows: (cfg.bldFields || []).map(f => {
        const open = st.bfSel === f.id, setF = fn => this.upd(c => { const x = c.bldFields.find(y => y.id === f.id); if (x) fn(x); });
        return { label: f.label || "Untitled field", badge: lib.kindLabel(f.kind), open, rowBg: open ? "#FFEBD9" : "#FFFFFF", ink: open ? "#111111" : "#1F1F1C",
          eye: f.show ? ICON.eye : ICON.eyeOff, showText: f.show ? "On quotation" : "Hidden",
          select: () => this.setState({ bfSel: open ? null : f.id }),
          toggleShow: e => { e.stopPropagation(); setF(x => { x.show = !x.show; }); },
          remove: e => { e.stopPropagation(); this.upd(c => { c.bldFields = c.bldFields.filter(y => y.id !== f.id); c.buildings.forEach(b => { if (b.extra) delete b.extra[f.id]; }); }); },
          fs: open ? this.fieldSettings(f, setF) : false };
      }),
      addBlocks: [["heading", "Heading"], ["text", "Text"], ["signature", "Signature"], ["spacer", "Spacer"]].map(([t, label]) => ({ label, add: addBlock(t) })),
      ctx: (() => {
        const cx = st.ctx; if (!cx) return false;
        if (cx.pkg) {
          const p = cfg.packages.find(x => x.id === cx.pkg); if (!p) return false;
          const close = () => this.setState({ ctx: null, arm: "" }), go = fn => () => { close(); fn(); };
          const it = (label, run, o = {}) => ({ label, run, key: "", ink: o.danger ? "#8A2E1C" : "#1F1F1C", disabled: !!o.off, op: o.off ? .4 : 1, sep: !!o.sep });
          const g = groups.find(x => x.classic === p.id || x.build === p.id) || {}, other = p.style === "build" ? "classic" : "build", otherLabel = other === "build" ? "Build in" : "Classic";
          const clone = (extra) => { const id = lib.newId("p"); const cp = { ...JSON.parse(JSON.stringify(p)), id, ...extra(id) }; this.upd(c => { const k = c.packages.findIndex(x => x.id === p.id); c.packages.splice(k + 1, 0, cp); }); this.setState({ pid: id }); };
          const armK = "pdel-" + p.id, last = cfg.packages.length < 2;
          return { x: cx.x + "px", y: cx.y + "px", name: (p.groupLabel || p.name || "").toUpperCase() + " · " + (p.style === "build" ? "BUILD IN" : "CLASSIC"), close, items: [
            it("Open", go(() => this.setState({ pid: p.id }))),
            it("Duplicate", go(() => clone(() => { const gl = (p.groupLabel || p.layout || "Package") + " copy"; return { group: lib.newId("g"), groupLabel: gl, layout: gl.toUpperCase(), spec: { ...p.spec, beds: "", baths: "" }, name: `${gl.toUpperCase()} ${p.style === "build" ? "BUILD IN" : "CLASSIC"}` }; }))),
            it(`Add ${otherLabel} version`, go(() => clone(() => ({ style: other, name: `${(p.groupLabel || p.layout || "").toUpperCase()} ${other === "build" ? "BUILD IN" : "CLASSIC"}` }))), { off: !!g[other] }),
            it(st.arm === armK ? "Click again to delete" : "Delete", () => { if (last) return; if (st.arm === armK) { close(); this.upd(c => { c.packages = c.packages.filter(x => x.id !== p.id); }); this.setState({ pid: cfg.packages.find(x => x.id !== p.id)?.id }); } else this.setState({ arm: armK }); }, { danger: true, sep: true, off: last })
          ] };
        }
        const bl = cfg.doc.blocks, i = bl.findIndex(x => x.id === cx.id); if (i < 0) return false;
        const b = bl[i], bv = blockViews[i], close = () => this.setState({ ctx: null });
        const go = fn => () => { close(); fn(); };
        const mv = d => go(() => this.upd(c => { const a = c.doc.blocks; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); }));
        const it = (label, run, o = {}) => ({ label, run, key: o.key || "", ink: o.danger ? "#8A2E1C" : "#1F1F1C", disabled: !!o.off, op: o.off ? .4 : 1, sep: !!o.sep });
        return { x: cx.x + "px", y: cx.y + "px", name: (bv && bv.name || "").toUpperCase(), close, items: [
          it("Edit", go(() => this.setState({ sel: b.id }))),
          it(b.hidden ? "Show on quotation" : "Hide on quotation", go(() => this.setBlock(b.id, x => { x.hidden = !x.hidden; }))),
          it("Duplicate", go(() => { const id = lib.newId("b-"); this.upd(c => { const cp = JSON.parse(JSON.stringify(c.doc.blocks[i])); cp.id = id; c.doc.blocks.splice(i + 1, 0, cp); }); this.setState({ sel: id }); })),
          it("Move up", mv(-1), { off: i === 0, sep: true }),
          it("Move down", mv(1), { off: i === bl.length - 1 }),
          it("Delete", go(() => { this.upd(c => { c.doc.blocks = c.doc.blocks.filter(x => x.id !== b.id); }); if (st.sel === b.id) this.setState({ sel: null }); }), { danger: true, sep: true, key: "Del" })
        ] };
      })(),
      noSel: !sel, blockViews, blockCount: `${cfg.doc.blocks.filter(b => !b.hidden).length} of ${cfg.doc.blocks.length} shown`, sel,
      docFont: fontCss,
      coName: coEdit(() => co.name, (o, v) => { o.name = v; }), coReg: coEdit(() => co.reg, (o, v) => { o.reg = v; }),
      coPhone: coEdit(() => co.phone, (o, v) => { o.phone = v; }), coEmail: coEdit(() => co.email, (o, v) => { o.email = v; }),
      coAddr: co.addr.map((a, i) => coEdit(() => a, (o, v) => { o.addr[i] = v; })),
      colAdd: { stop: e => e.stopPropagation(), addCustom: e => { e.preventDefault(); const v = (e.target.cn.value || "").trim(); if (!v) return; const key = "c_" + lib.newId(""); this.setBlock(tb.id, x => { const at = x.columns.findIndex(c => c.key === "qty"); x.columns.splice(at < 0 ? x.columns.length : at, 0, { key, label: v.toUpperCase(), show: true, num: false, custom: true }); }); this.setState({ colAddOpen: false }); }, addRow: e => { if (e) e.stopPropagation(); this.setBlock(tb.id, x => { x.extraRows = [...(x.extraRows || []), { id: lib.newId("xr-"), item: "", qty: 1, price: "" }]; }); this.setState({ sel: tb.id }); }, btnD: st.colHover || st.colAddOpen ? "grid" : "none", enter: () => { if (!this.state.colHover) this.setState({ colHover: true }); }, leave: () => this.setState({ colHover: false, colAddOpen: false }), open: !!st.colAddOpen, toggle: e => { if (e) e.stopPropagation(); this.setState(z => ({ colAddOpen: !z.colAddOpen })); },
        opts: [["kind", "CATEGORY"], ["collection", "COLLECTION"], ["color", "COLOUR"], ["remark", "REMARKS"]].map(([key, label]) => { const has = (tb.columns || []).some(c => c.key === key); return { label: label.charAt(0) + label.slice(1).toLowerCase(), off: has, op: has ? .4 : 1, add: () => { this.setBlock(tb.id, x => { const at = x.columns.findIndex(c => c.key === "qty"); x.columns.splice(at < 0 ? x.columns.length : at, 0, { key, label, show: true, num: false, custom: true }); }); this.setState({ colAddOpen: false }); } }; }) },
      tableHead: cols.map(c => ({ label: c.label, align: c.num ? "right" : "left", onBlur: edit(v => this.setBlock(tb.id, x => { const col = x.columns.find(y => y.key === c.key); col.label = v; })) })),
      tableCols: cols.map(c => c.key === "no" ? "28px" : c.key === "item" ? "minmax(120px,2.2fr)" : c.num ? "minmax(44px,.6fr)" : "minmax(70px,1fr)").join(" "),
      sampleCats, sampleMore: false ? `Sample from ${p0.groupLabel || p0.name} · ${totalRows - shown} more rows on the real quotation` : "",
      sampleTotal: p0 ? money(p0.price - 500) : "",
      // units
      unitCount: `${cfg.packages.length} packages`,
      toggleNewUnit: () => { const src = cfg.packages.find(p => p.id === st.pid) || cfg.packages[0], id = lib.newId("p"), gid = lib.newId("g");
        const pkg = { id, name: "NEW PACKAGE CLASSIC", layout: "NEW PACKAGE", group: gid, groupLabel: "New package", style: "classic", building: "", spec: { ...((src && src.spec) || {}), beds: "", baths: "", plan: "", photos: [] }, price: 0, cost: 0, cats: src ? JSON.parse(JSON.stringify(src.cats)) : [{ name: "LIVING", label: "Living", items: [] }] };
        this.upd(c => { c.packages.unshift(pkg); }); this.setState({ pid: id, newUnit: null, notice: "New package created · set bedrooms & bathrooms" }); },
      newUnitOpen: !!nu, nu: nuView, buildingOpts, kindOpts, kindOptsReq: kindOpts.slice(1),
      unitGroups: (() => { const keyOf = g => sizeKey((cfg.packages.find(x => x.id === (g.classic || g.build)) || {}).spec);
        const ks = [...new Set(groups.map(keyOf))].sort((a, b) => { if (!a) return 1; if (!b) return -1; const [a1, a2] = a.split("-").map(Number), [b1, b2] = b.split("-").map(Number); return a1 - b1 || a2 - b2; });
        return ks.map(sk => { const gs = groups.filter(g => keyOf(g) === sk), multi = gs.length > 1 && sk;
          const keep = gs.find(g => g.classic === st.pid || g.build === st.pid) || gs[0], armK = "comb-" + sk;
          return { label: sizeLabel(sk), building: multi ? (st.arm === armK ? `Keep ${keep.label}, delete ${gs.length - 1}?` : `${gs.length} versions`) : "", canCombine: !!multi, combineLabel: st.arm === armK ? "Confirm" : "Combine",
            combine: () => this.arm(armK, () => this.upd(c => { const drop = gs.filter(g => g !== keep).map(g => g.id); c.packages = c.packages.filter(p => !drop.includes(p.group)); this.nameBySize(c, keep.id); })),
            rows: gs.flatMap(g => [["classic", "Classic"], ["build", "Build in"]].filter(([k]) => g[k]).map(([k, label]) => { const p = cfg.packages.find(x => x.id === g[k]); const on = p.id === st.pid; return { style: (sk ? sizeLabel(sk) : g.label) + ((g.classic && g.build) || multi ? " · " + label : ""), price: rm0(cost(p)), bg: on || (st.ctx && st.ctx.pkg === p.id) ? "#FFEBD9" : "#FFFFFF", ctxOpen: e => { e.preventDefault(); e.stopPropagation(); this.setState({ pid: p.id, arm: "", ctx: { pkg: p.id, x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 240) } }); }, bar: on ? "inset 3px 0 0 #111111" : "none", ink: on ? "#111111" : "#1F1F1C", weight: on ? 650 : 500, pick: () => this.setState({ pid: p.id, arm: "" }) }; })) }; }); })(),
      ed,
      // catalogue
      kindRooms: (() => { const chip = (k, label, count, paused) => { const on = st.kindFilter === k; return { label, count, op: paused ? ".5" : "1", border: on ? "#111111" : "#DEDED8", bg: on ? "#F0F0ED" : "#FFFFFF", color: on ? "#111111" : "#1F1F1C", weight: on ? "650" : "500", pick: () => this.setState({ kindFilter: k }) }; };
        const rooms = []; Object.entries(kinds).forEach(([k, v]) => { const r = v.room || ""; let g = rooms.find(x => x.room === r); if (!g) { g = { room: r, chips: [] }; rooms.push(g); } g.chips.push(chip(k, v.label, items.filter(i => i.kind === k).length, v.paused)); });
        rooms.sort((a, b) => (a.room ? 1 : 0) - (b.room ? 1 : 0));
        return [{ room: rooms.some(r => r.room) ? " " : "", chips: [chip("all", "All", items.length)] }, ...rooms.map(r => ({ ...r, room: r.room || (rooms.some(x => x.room) ? "OTHER" : "") }))]; })(),
      ...(() => { const mv = items.filter(it => it.webCat && (kinds[it.kind] || {}).webCat !== it.webCat);
        return { useWebLabel: mv.length ? `Use website categories (${mv.length})` : "Use website categories", useWeb: () => { if (!mv.length) { this.setState({ catMsg: items.some(i => i.webCat) ? "Every item already follows the website categories." : "Items don't know their website category yet. On b2b: bookmark › Everything › Copy, then Paste from website › Update (this also fills Stock).", catErr: !items.some(i => i.webCat) }); return; } this.upd(c => { c.catalog.items.forEach(x => { if (x.webCat) x.kind = this.kindForCat(c, x.webCat, x.room); }); }); this.setState({ kindFilter: "all", catMsg: `Moved ${mv.length} items to their website categories. Check, then Save and publish.`, catErr: false }); } }; })(),
      catSortH: Object.fromEntries(["code", "name", "kind", "cost", "show"].map(k => { const on = st.catSort && st.catSort.key === k; return [k, { mark: on ? (st.catSort.dir > 0 ? " ▲" : " ▼") : "", go: () => this.setState(s => ({ page: 0, catSort: nextCatalogSort(s.catSort, k) })) }]; })),
      kindFilter: st.kindFilter, onKindFilter: e => this.setState({ kindFilter: e.target.value, sel: {}, page: 0 }),
      kindSelOpts: [{ v: "all", l: "All categories (" + items.length + ")" }, ...Object.entries(kinds).map(([k, v]) => ({ v: k, l: v.label + " (" + items.filter(i => i.kind === k).length + ")" }))],
      sync: (() => { const t = cfg.catalog.syncedAt, d = t ? Math.floor((Date.now() - t) / 86400000) : null, old = d == null || d >= 7;
        return { title: d == null ? "Prices not updated yet" : d === 0 ? "Prices updated today" : d === 1 ? "Prices updated yesterday" : (old ? "Prices not updated for " : "Prices updated ") + d + " days" + (old ? "" : " ago"), bg: old ? "#FAF0D8" : "#FFFFFF", line: old ? "#FFC999" : "#E7E7E2", dot: old ? "#F5871F" : "#4E9A6E" }; })(),
      kindChips: [["all", "All", items.length], ...Object.entries(kinds).map(([k, v]) => [k, v.label, items.filter(i => i.kind === k).length])].map(([k, label, count]) => ({ label, count, border: st.kindFilter === k ? "#111111" : "#DEDED8", bg: st.kindFilter === k ? "#FFEBD9" : "#FFFFFF", color: st.kindFilter === k ? "#111111" : "#1F1F1C", weight: st.kindFilter === k ? 650 : 500, pick: () => this.setState({ kindFilter: k }) })),
      stale: (() => { const t = cfg.catalog.syncedAt, d = t ? Math.floor((Date.now() - t) / 86400000) : null; return { on: d == null || d >= 7, text: d == null ? "The catalogue hasn't been updated from the website yet." : `Last updated from the website ${d} days ago.` }; })(),
      lastSync: cfg.catalog.syncedAt ? "Last updated " + new Date(cfg.catalog.syncedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
      catMsg: st.catMsg || "", catMsgInk: st.catErr ? "#8A2E1C" : "#387557",
      catQ: st.catQ, onCatQ: e => this.setState({ catQ: e.target.value, page: 0 }),
      catRows, ...(() => { const per = st.perPage || 50, n = catRows.length, pages = Math.max(1, Math.ceil(n / per)), pg = Math.min(st.page || 0, pages - 1), rows = catRows.slice(pg * per, pg * per + per);
        return { catPageRows: rows, ...this.bulkVals(rows, st), pager: { show: n > 25, range: n ? `${pg * per + 1}–${Math.min(n, pg * per + per)} of ${n}` : "", label: `${pg + 1} / ${pages}`, first: pg === 0, last: pg >= pages - 1, prevOp: pg === 0 ? .4 : 1, nextOp: pg >= pages - 1 ? .4 : 1,
          prev: () => this.setState({ page: Math.max(0, pg - 1) }), next: () => this.setState({ page: Math.min(pages - 1, pg + 1) }),
          sizes: [25, 50, 100].map(k => ({ label: String(k), bg: per === k ? "#FFFFFF" : "transparent", ink: per === k ? "#111111" : "#6B6B66", shadow: per === k ? "0 1px 2px rgba(20,20,18,.14)" : "none", pick: () => this.setState({ perPage: k, page: 0 }) })) } }; })(), catCount: `${catRows.length} item${catRows.length === 1 ? "" : "s"}`, catSampleText: [items.filter(i => i.paused || (kinds[i.kind] || {}).paused).length ? `· ${items.filter(i => i.paused || (kinds[i.kind] || {}).paused).length} paused` : "", noPriceN ? `· ${noPriceN} without a price (hidden from IR)` : "", sampleN ? `· ${sampleN} with a sample price` : ""].filter(Boolean).join(" ") || "· every price confirmed",
      ...(() => { const moves = items.filter(it => { const g = this.guessKind(it.name, kinds); return g && g !== it.kind; });
        return { autoSortLabel: moves.length ? `Sort by name (${moves.length} to move)` : "Sort by name", autoSort: () => { if (!moves.length) { this.setState({ catMsg: "Every item is already in the category its name says.", catErr: false }); return; } const ids = {}; moves.forEach(m => { ids[m.id] = this.guessKind(m.name, kinds); }); this.upd(c => { c.catalog.items.forEach(x => { if (ids[x.id]) x.kind = ids[x.id]; }); }); this.setState({ catMsg: `Moved ${moves.length} items to the category their name says. Check, then Save and publish.`, catErr: false }); } }; })(),
      addCatItem: () => { const k = st.kindFilter === "all" ? Object.keys(kinds)[0] : st.kindFilter; this.upd(c => { c.catalog.items.unshift({ id: lib.newId("c"), kind: k, code: "", name: "NEW ITEM", cost: 0 }); }); },
      kindRows: Object.entries(kinds).map(([k, v]) => ({ key: k, label: v.label, url: v.url || "", room: v.room || "", onRoom: e => { const val = e.target.value.toUpperCase(); this.upd(c => { c.catalog.kinds[k].room = val; }); },
        pauseLabel: v.paused ? "Paused" : "On", pauseInk: v.paused ? "#97978F" : "#387557", trackBg: v.paused ? "#D5D2C8" : "#4E9A6E", knobX: v.paused ? "2px" : "14px", togglePause: () => this.upd(c => { c.catalog.kinds[k].paused = !c.catalog.kinds[k].paused; }), onLabel: e => { const val = e.target.value; this.upd(c => { c.catalog.kinds[k].label = val; }); }, onUrl: e => { const val = e.target.value; this.upd(c => { c.catalog.kinds[k].url = val; }); }, remove: () => this.upd(c => { delete c.catalog.kinds[k]; }) })),
      newKind: st.newKind, onNewKind: e => this.setState({ newKind: e.target.value }),
      addKind: () => { const label = st.newKind.trim(); if (!label) return; const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-"); this.upd(c => { c.catalog.kinds[key] = { label, url: "" }; }); this.setState({ newKind: "" }); },
      // buildings
      bldCount: `${cfg.buildings.length} building${cfg.buildings.length === 1 ? "" : "s"}`,
      addBuilding: () => this.upd(c => { c.buildings.push({ id: lib.newId("bld-"), name: "NEW BUILDING", developer: "", address: "" }); }),
      bldRows: cfg.buildings.map((b, i) => {
        const cnt = pkgCountByBld(b.name);
        return {
          name: b.name, address: b.address || "", developer: b.developer || "", onDeveloper: e => { const v = e.target.value; this.upd(c => { c.buildings[i].developer = v; }); }, count: cnt, removeInk: cnt ? "#C4C1B6" : "#6B6B66", removeTitle: cnt ? "Move its unit types to another building first" : "Remove",
          onName: e => { const v = e.target.value; this.upd(c => { const old = c.buildings[i].name; c.buildings[i].name = v; c.packages.forEach(p => { if (p.building === old) p.building = v; }); }); },
          onAddress: e => { const v = e.target.value; this.upd(c => { c.buildings[i].address = v; }); },
          hasExtra: (cfg.bldFields || []).length > 0,
          extra: (cfg.bldFields || []).map(f => lib.fieldEditor(f, (b.extra || {})[f.id], v => this.upd(c => { const bb = c.buildings[i]; bb.extra = { ...(bb.extra || {}), [f.id]: v }; }))),
          ...(() => {
            const rd = (st.bldRead || {})[b.id] || {}, busy = rd.status === "busy";
            return {
              url: b.url || "", readBusy: busy, readLabel: busy ? "Reading…" : "Read",
              status: rd.msg || "", hasStatus: !!rd.msg, statusInk: rd.status === "error" ? "#8A2E1C" : "#6B6B66",
              onUrl: e => { const v = e.target.value; this.upd(c => { c.buildings[i].url = v; }); },
              onPasteUrl: e => { const v = (e.clipboardData?.getData("text") || "").trim(); if (/^https?:\/\//i.test(v)) setTimeout(() => this.readSite(b.id, v), 0); },
              read: () => this.readSite(b.id, b.url),
              found: rd.found ? { ...rd.found, units: (rd.found.units || []).map(u => ({ type: u.type, text: lib.specText(u, true) || "—" })) } : false,
              dismiss: () => this.setRead(b.id, {}),
              apply: () => this.applyRead(b.id, rd.found)
            };
          })(),
          remove: () => { if (!cnt) this.upd(c => { c.buildings.splice(i, 1); }); }
        };
      }),
      // pricing
      markupInput: String(cfg.markup), markupText, markupExample: rm0(1000 * m),
      onMarkup: e => { const v = e.target.value.replace(/[^\d.]/g, ""); this.upd(c => { c.markup = v === "" ? "" : (isNaN(+v) ? c.markup : v.endsWith(".") ? v : +v); }); },
      priceSub: "Package price ÷ cost. Build in packages sit lower than Classic in the Excel.",
      priceRows: cfg.packages.map((p, i) => {
        const pc = cost(p), eff = pc ? p.price / pc : 0;
        return { name: p.groupLabel || p.name, style: p.style === "build" ? "Build in" : "Classic", cost: rm0(pc), price: String(p.price), effective: pc ? "×" + eff.toFixed(2) : "—", effInk: eff && eff < 1.15 ? "#D96E0B" : "#1F1F1C", suggested: rm0(pc * m), bg: i % 2 ? "#F8F8F6" : "#FFFFFF", onPrice: e => { const v = num(e.target.value); this.upd(c => { c.packages[i].price = v; }); } };
      }),
      restoreLabel: st.arm === "restore" ? "Confirm: restore the Excel price list" : "Restore the Excel price list", restoreBg: st.arm === "restore" ? "#EEEEEA" : "#FFFFFF",
      onRestore: () => this.arm("restore", () => { this.setState({ cfg: lib.defaults(st.base.pj, st.base.cj) }); })
    };
  }
}
