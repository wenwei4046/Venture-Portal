/* eslint-disable */
// @ts-nocheck — ported from the prototype (.design/ir-quote/design_handoff_ir_quote/IR Quote v10.dc.html), kept line for line so the screens behave as it does.
import { DcLogic } from "../dc";
import React from "react";
import * as quoteDocLib from "../lib/quote-doc";
import * as wsStore from "../lib/workspace-store";
import { productSlug } from "../lib/catalog-import";
import { irqStorage } from "../storage";
import seedPackages from "../data/packages.json";
import seedCatalog from "../data/catalog.json";
const ICON = {
  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  chart: "M4 20V10m5 10V4m5 16v-7m5 7V8M3 20h18",
  trophy: "M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3",
  user: "M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  quoteDesk: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 7h6M9 11h1M12 11h1M15 11h0M9 15h1M12 15h1M9 18h1M12 18h1M15 15v3",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  download: "M12 4v11m-5-5 5 5 5-5M5 20h14",
  doc: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M9 13h6M9 17h4",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1"
};
const BEDROOM = /BEDROOM/;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const money = n => (n < 0 ? "−" : "") + Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm = n => (n < 0 ? "−RM " : "RM ") + Math.abs(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rm0 = n => "RM " + Math.round(n).toLocaleString("en-MY");
const signed = n => (n > 0 ? "+RM " : n < 0 ? "−RM " : "RM ") + Math.abs(Math.round(n)).toLocaleString("en-MY");
const title = s => s.toLowerCase().replace(/(^|[\s/(+])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bTv\b/g, "TV").replace(/\bAirbnb\b/g, "Airbnb").replace(/(\d)Seater/i, "$1 Seater");
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const imgFor = code => /^(\d{6}|K\d{5})$/.test(code || "") ? `https://mm.hinlim.com/cache/b2bfs/product/${code}/${code}-550x500.jpg` : "";
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// v10 Customer step: Property type is one of these two; Budget is shown without its "RM" and kept with it.
export const PROPERTY_TYPES = ["Landed", "Condo"];
export const propertyType = v => PROPERTY_TYPES.find(o => o.toLowerCase() === String(v || "").trim().toLowerCase()) || "";
export const budgetShown = v => String(v || "").replace(/^\s*RM\s*/i, "");
export const budgetStored = typed => { const val = String(typed || "").replace(/[^0-9.,\-\sk+–]/gi, "").replace(/^\s+/, ""); /* "RM" typed or pasted leaves no second space */ return val ? "RM " + val : ""; };
export const budgetWithRm = v => { const s = String(v || "").trim(); return !s || /^RM(?![a-z])/i.test(s) ? s.replace(/^RM\s*/i, "RM ") : "RM " + s; };
const longDate = iso => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export class QuoteLogic extends DcLogic {
  state = {
    data: null, catalog: null, width: 1440, step: 1, pid: "p0", filter: "all",
    cust: { att: "", bill: "", building: "", unit: "", date: todayIso(), by: (this.props.user && this.props.user.name) || "" },
    home: true, lines: [], extra: {}, sigs: {}, pad: null, discount: "", sheet: null, q: "", custom: { code: "", name: "", cost: "" }, toast: ""
  };
  draftKey() { return "irq.drafts." + ((this.props.user && this.props.user.id) || "me"); }
  drafts() { try { return JSON.parse(irqStorage.getItem(this.draftKey())) || []; } catch (_) { return []; } }
  saveDraft() {
    const st = this.state, { total } = this.calc(), p = st.data && st.data.packages.find(x => x.id === st.pid);
    const id = st.draftId || "d" + Date.now().toString(36);
    const d = { id, at: Date.now(), name: st.cust.att || "Unnamed customer", room: p ? [p.groupLabel || p.name, this.lib.versionWord(st.data?.packages, p)].filter(Boolean).join(" · ") : "", total,
      s: { step: st.step, pid: st.pid, cust: st.cust, crm: st.crm || {}, crmId: st.crmId || null, crmPick: st.crmPick || null, extra: st.extra, sigs: st.sigs, lines: st.lines, discount: st.discount, styleId: st.styleId || null, room: st.room || null, withMood: !!st.withMood } };
    const list = [d, ...this.drafts().filter(x => x.id !== id)];
    if (this.props.readOnly) { this.flash("Read-only while viewing as"); return; }
    try { irqStorage.setItem(this.draftKey(), JSON.stringify(list)); this.setState({ draftId: id, draftAt: d.at }); this.flash("Draft saved"); } catch (e) { this.flash("Couldn't save: storage is full"); }
  }
  openDraft(d) { this.setState({ withMood: false, selOpen: null, ...d.s, home: false, draftId: d.id, draftAt: d.at, draftsOpen: false, sheet: null }); this.flash("Draft opened"); }
  rootRef = React.createRef();
  padRef = React.createRef();
  padPt(e) { const c = this.padRef.current, r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  padDown = e => {
    const c = this.padRef.current; if (!c) return;
    const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    if (c.width !== Math.round(r.width * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); }
    const x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); x.lineWidth = 2.6; x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#16224F";
    const [px, py] = this.padPt(e); x.beginPath(); x.moveTo(px, py); x.lineTo(px + .1, py + .1); x.stroke();
    this._draw = true; this._inked = true; try { c.setPointerCapture(e.pointerId); } catch (er) {}
  };
  padMove = e => { if (!this._draw) return; const x = this.padRef.current.getContext("2d"), [px, py] = this.padPt(e); x.lineTo(px, py); x.stroke(); };
  padUp = () => { this._draw = false; };
  padClear = () => { const c = this.padRef.current; if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height); this._inked = false; };
  padSave = () => {
    const c = this.padRef.current, p = this.state.pad; if (!c || !p) return;
    let url = "";
    if (this._inked) {
      const x = c.getContext("2d"), { data, width: w, height: hh } = x.getImageData(0, 0, c.width, c.height);
      let x0 = w, y0 = hh, x1 = 0, y1 = 0;
      for (let y = 0; y < hh; y += 2) for (let i = 0; i < w; i += 2) if (data[(y * w + i) * 4 + 3] > 20) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 > x0) { const pad = 8, o = document.createElement("canvas"); o.width = x1 - x0 + pad * 2; o.height = y1 - y0 + pad * 2; o.getContext("2d").drawImage(c, x0 - pad, y0 - pad, o.width, o.height, 0, 0, o.width, o.height); url = o.toDataURL("image/png"); }
    }
    this._inked = false;
    this.setState(s => ({ pad: null, sigs: { ...s.sigs, [p.id]: { ...(s.sigs[p.id] || {}), [p.side]: url } } }));
  };

  componentDidMount() {
    setTimeout(() => this.loadDrive(), 400);
    this.onZoomKey = e => { if (!this.state.zoomList) return; if (e.key === "ArrowRight") this.stepZoom(1); else if (e.key === "ArrowLeft") this.stepZoom(-1); else if (e.key === "Escape") this.setState({ zoomList: null }); };
    window.addEventListener("keydown", this.onZoomKey);
    this.wsMod = wsStore;
    this.onUser = () => { const nm = this.wsMod ? this.wsMod.currentUser().name : ""; this.setState(s => ({ drive: {}, draftId: null, draftAt: null, cust: { ...s.cust, by: nm || s.cust.by } })); this.loadDrive(); this.flash("Switched to " + (this.wsMod ? this.wsMod.currentUser().name : "account")); };
    window.addEventListener("irq-user", this.onUser);
    this._slideT = setInterval(() => { const sl = (this._slides || []).filter(x => x.k !== this._hover && x.k !== this._held); if (!sl.length || document.hidden) return; this.setState(s => { const ci = { ...(s.ci || {}) }; sl.forEach(x => { ci[x.k] = ((ci[x.k] || 0) + 1) % x.n; }); return { ci }; }); }, 3500);
    Promise.all([Promise.resolve({ ...quoteDocLib, CRM_FIELDS: this.props.crmFields || quoteDocLib.CRM_FIELDS, CRM_CUSTOMERS: [] }), Promise.resolve(seedPackages), Promise.resolve(seedCatalog)])
      .then(([lib, pj, cj]) => {
        // Quote settings publishes to the same store; without it this is the Excel price list.
        this.preview = !!this.props.preview;
        const key = this.preview ? lib.PREVIEW : lib.STORE;
        const cfg = lib.load(pj, cj, key);
        const mk = cfg => ({ company: cfg.company, markup: +cfg.markup || 1.3, building: cfg.buildings[0]?.name || "", buildings: cfg.buildings, packages: cfg.packages, groups: lib.deriveGroups(cfg.packages) });
        const data = mk(cfg);
        this.lib = lib; this.cfg = cfg;
        this.onStore = e => { if (e.key !== key) return; const c2 = lib.load(pj, cj, key); this.cfg = c2; const d2 = mk(c2); this.setState({ data: d2, catalog: c2.catalog, liveAt: Date.now() }); if (this.state.pid && !c2.packages.some(p => p.id === this.state.pid)) this.load((d2.groups[0] || {}).classic, d2); this.flash(this.preview ? "Preview updated from Quote Settings" : "Settings updated"); };
        this.offStore = irqStorage.on(this.onStore);
        const first = data.groups.find(g => g.building === this.state.cust.building) || data.groups[0];
        this.setState({ data, catalog: cfg.catalog });
        this.load(first.classic || first.build, data);
      })
      .catch(e => { console.error("[irq] price list", e); this.flash("Could not load the price list"); });
    this.setState({ width: window.innerWidth });
    this.onWinResize = () => { if (!this.ro) this.setState({ width: window.innerWidth }); };
    window.addEventListener("resize", this.onWinResize);
    this.attachRo();
  }
  attachRo() { const el = this.rootRef.current; if (this.ro || !el || !window.ResizeObserver) return; this.ro = new ResizeObserver(e => { const w = e[0].contentRect.width; if (Math.abs(w - this.state.width) > 1) this.setState({ width: w }); }); this.ro.observe(el); }
  componentDidUpdate() { if (!this.ro) this.attachRo(); }
  componentWillUnmount() { window.removeEventListener("resize", this.onWinResize); clearInterval(this._slideT); window.removeEventListener("keydown", this.onZoomKey); window.removeEventListener("irq-user", this.onUser); this.ro && this.ro.disconnect(); clearTimeout(this.tt); this.offStore && this.offStore(); clearTimeout(this._crmT); }

  load(pid, data = this.state.data, keep = false) {
    const p = data.packages.find(x => x.id === pid);
    const lines = [];
    p.cats.forEach((c, ci) => c.items.forEach((it, ii) => lines.push({ id: `${pid}-${ci}-${ii}`, ci, ...it, orig: { ...it } })));
    if (keep && this.state.lines.length) {
      // Switching Classic ↔ Build in: carry every edit outside the bedrooms onto the new package.
      const old = data.packages.find(x => x.id === this.state.pid);
      const okey = o => [o.name, o.desc, o.code, o.cost, o.qty].join("|");
      this.state.lines.forEach(l => {
        const cname = old.cats[l.ci].name;
        if (BEDROOM.test(cname)) return;
        const ci = p.cats.findIndex(c => c.name === cname);
        if (ci < 0) return;
        if (!l.orig) { lines.push({ ...l, ci }); return; }
        const changed = l.cost !== l.orig.cost || l.qty !== l.orig.qty || l.code !== l.orig.code || l.name !== l.orig.name;
        if (!changed) return;
        const t = lines.find(x => x.ci === ci && x.orig && okey(x.orig) === okey(l.orig));
        if (t) Object.assign(t, { name: l.name, desc: l.desc, code: l.code, cost: l.cost, qty: l.qty });
      });
    }
    this.setState({ pid, lines });
  }
  flash(msg) { clearTimeout(this.tt); this.setState({ toast: msg }); this.tt = setTimeout(() => this.setState({ toast: "" }), 2200); }
  setLine(id, fn) { this.setState(s => ({ lines: s.lines.map(l => (l.id === id ? fn(l) : l)) })); }
  bump(id, d) { this.setLine(id, l => ({ ...l, qty: Math.max(0, l.qty + d) })); }
  undo(l) {
    if (!l.orig) this.setState(s => ({ lines: s.lines.filter(x => x.id !== l.id) }));
    else this.setLine(l.id, x => ({ ...x, img: "", color: null, ...x.orig, orig: x.orig }));
  }
  openSheet(sheet) {
    let col = "";
    if (sheet && sheet.mode === "swap") { const l = this.state.lines.find(x => x.id === sheet.id), it = l && (this.state.catalog?.items || []).find(c => (c.code && c.code === l.code) || c.name === l.name); if (it && it.collection) col = it.collection; }
    col = "";
    this.setState({ sheet, sheetView: "cat", q: "", col, clr: "", vsel: {}, custom: { code: "", name: "", cost: "" } });
  }
  collectionPlan(col) {
    const st = this.state, kinds = st.catalog?.kinds || {}, live = it => !it.paused && !(kinds[it.kind] || {}).paused && it.cost != null && !it.noPrice;
    const pool = (st.catalog?.items || []).filter(it => it.collection === col && live(it));
    return st.lines.filter(l => l.kind && l.qty > 0).map(l => { const c = pool.filter(it => it.kind === l.kind); if (!c.length) return null; const best = c.reduce((a, b) => Math.abs(b.cost - l.cost) < Math.abs(a.cost - l.cost) ? b : a); return best.name === l.name && best.code === l.code ? null : { id: l.id, item: best }; }).filter(Boolean);
  }
  applyCollection(col) {
    const plan = this.collectionPlan(col); if (!plan.length) { this.flash("Nothing to change for this collection"); return; }
    this.setState(s => ({ lines: s.lines.map(l => { const p = plan.find(x => x.id === l.id); return p ? { ...l, name: p.item.name, code: p.item.code || "", desc: p.item.desc || l.desc, cost: +p.item.cost || 0, img: p.item.img || "", color: p.item.color || "" } : l; }), sheet: null }));
    this.flash(`${plan.length} item${plan.length === 1 ? "" : "s"} switched to ${col.replace(/^.* · /, "")}`);
  }
  openZoom(list, idx) { this.setState({ zoomList: list, zoomIdx: Math.max(0, idx) }); }
  stepZoom(d) { const n = (this.state.zoomList || []).length; if (n > 1) this.setState(s => ({ zoomIdx: (s.zoomIdx + d + n) % n })); }
  // data: URLs contain ";" which breaks inline style parsing; serve them as blob: URLs instead.
  u(src) { const s = String(src || ""); if (!s.startsWith("data:")) return s; this._blobs = this._blobs || new Map(); if (this._blobs.has(s)) return this._blobs.get(s);
    try { const [h, b64] = s.split(","), mime = (h.match(/data:([^;]+)/) || [])[1] || "image/jpeg", bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const url = URL.createObjectURL(new Blob([arr], { type: mime })); this._blobs.set(s, url); return url; } catch (e) { return ""; } }
  itemFor(l) { const its = (this.state.catalog && this.state.catalog.items) || []; return l.code ? its.find(c => c.code === l.code) : undefined; }
  imgFor(l) { if (l.img) return l.img; const it = this.itemFor(l); return (it && it.img) || ""; }
  colorFor(l) { if (l.color != null) return l.color; const it = this.itemFor(l); return (it && it.color) || ""; }
  apply(item) {
    const sh = this.state.sheet;
    if (!sh) return;
    if (sh.mode === "swap") this.setLine(sh.id, l => ({ ...l, name: item.name, code: item.code || "", desc: item.desc || l.desc, cost: +item.cost || 0, kind: l.kind, img: item.img || "", color: item.color || "" }));
    else this.setState(s => ({ lines: [...s.lines, { id: "n" + Date.now(), ci: sh.ci, name: item.name, desc: item.desc || "", code: item.code || "", cost: +item.cost || 0, qty: 1, kind: item.kind || null, orig: null, img: item.img || "", color: item.color || "" }] }));
    if (!this._desk) this.setState({ sheet: null });
    this.flash(sh.mode === "swap" ? `Changed to ${title(item.name)}` : `Added ${title(item.name)}`);
  }

  calc() {
    const { data, lines, discount, pid } = this.state;
    const m = 1; // total = sum of items at listed price
    const pkg = data ? data.packages.find(p => p.id === pid) : null;
    let diff = 0;
    const changes = [];
    lines.forEach(l => {
      const now = l.cost * l.qty, was = l.orig ? l.orig.cost * l.orig.qty : 0;
      const changed = !l.orig || l.cost !== l.orig.cost || l.qty !== l.orig.qty || l.code !== l.orig.code || l.name !== l.orig.name;
      if (changed) {
        const d = Math.round((now - was) * m);
        diff += now - was;
        const tag = !l.orig ? "Added" : l.qty === 0 ? "Removed" : (l.code !== l.orig.code || l.name !== l.orig.name || l.cost !== l.orig.cost) ? "Changed" : "Quantity";
        changes.push({ l, d, tag });
      }
    });
    const changeSell = Math.round(diff * m);
    const disc = parseFloat(discount) || 0;
    const blocks = this.cfg?.doc.blocks || [];
    const tb = blocks.find(b => b.type === "table" && !b.hidden), tt = blocks.find(b => b.type === "totals" && !b.hidden);
    const xrows = (tb?.extraRows || []).filter(r => r.item);
    const xsum = xrows.reduce((a, r) => a + (+r.price || 0) * (+r.qty || 1), 0);
    const base = pkg ? pkg.price + changeSell + xsum - disc : 0;
    let total = base;
    const adjust = (tt?.extras || []).filter(e => e.label).map(e => {
      const v = e.mode === "percent" ? Math.round(base * (+e.value || 0)) / 100 : (+e.value || 0);
      const amount = e.sign === "less" ? -v : v; total += amount;
      return { label: e.label + (e.mode === "percent" ? ` (${e.value || 0}%)` : ""), amount };
    });
    return { m, pkg, changes, changeSell, disc, total, xrows, xsum, adjust, xTitle: tb?.extraTitle || "OTHERS" };
  }

  // v10: the style moodboard — the company's photos of the style picked in step 3 (Quote Settings › Styles), or its cover.
  moodPhotos() { const styles = (this.cfg && this.cfg.styles) || [], sx = styles.find(x => x.id === this.state.styleId) || styles[0] || {}; const ok = s => /^(data:image|https?:|blob:)/.test(String(s || "")) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(String(s || "")) || /^\/files\//.test(String(s || ""));
    return { sx, imgs: (sx.photos && sx.photos.length ? sx.photos : (sx.cover ? [sx.cover] : [])).filter(ok) }; }
  moodboard() { if (!this.state.withMood) return null; const { sx, imgs } = this.moodPhotos(); if (!imgs.length) return null;
    const pkg = this.state.data && this.state.data.packages.find(x => x.id === this.state.pid); return { name: sx.name || "", note: this.lib.versionWord(this.state.data?.packages, pkg), imgs }; } // one version says no Classic / Build in (2026-11-06)
  docRows(pkg, m) {
    let n = 0;
    return pkg.cats.map((c, ci) => {
      const rows = this.state.lines.filter(l => l.ci === ci && l.qty > 0).map(l => {
        const unit = Math.round(l.cost * m);
        const ci2 = (l.code && (this.state.catalog?.items || []).find(x => x.code === l.code)) || {}; const clr = this.colorFor(l); return { no: ++n, item: l.name, desc: l.desc || "", code: [l.code, clr].filter(Boolean).join(" / "), photo: this.imgFor(l), qty: l.qty, unit, sum: unit * l.qty, kind: ((this.state.catalog?.kinds || {})[l.kind] || {}).label || "", collection: ci2.collection || "", color: clr, remark: l.remark || "" };
      });
      return { name: c.name, rows };
    }).filter(c => c.rows.length).concat((() => {
      const { xrows, xTitle } = this.calc();
      return xrows.length ? [{ name: xTitle, rows: xrows.map(r => { const unit = +r.price || 0, qty = +r.qty || 1; return { no: ++n, item: r.item, desc: r.desc || "", code: "", qty, unit, sum: unit * qty }; }) }] : [];
    })());
  }

  unitFact(pkg) { const s = this.lib?.specText(pkg.spec); return s ? `${pkg.layout} · ${s}` : pkg.layout; }
  facts(pkg) {
    const c = this.state.cust;
    return [
      { k: "ATTENTION :", v: c.att || "-" }, { k: "Prepared By", v: c.by || "-" },
      { k: "BILLING ADDRESS:", v: c.bill || "-" }, { k: "Building", v: c.building || "-" },
      { k: "ADDRESS :", v: [c.unit, c.building].filter(Boolean).join(", ") || "-" }, { k: "Unit", v: this.unitFact(pkg) },
      { k: "LAYOUT", v: pkg.name }, { k: "Date", v: longDate(c.date) }
    ];
  }

  docHtml(forExcel) {
    if (this.lib) {
      const { m, pkg, total, disc, adjust } = this.calc();
      const adjSum = adjust.reduce((a, x) => a + x.amount, 0);
      const cfg = JSON.parse(JSON.stringify(this.cfg));
      const tb = cfg.doc.blocks.find(b => b.type === "table");
      if (tb && this.props.showItemPrices) tb.columns.forEach(c => { if (c.key === "price" || c.key === "sum") c.show = true; });
      const priced = tb && tb.columns.some(c => c.show && (c.key === "price" || c.key === "sum"));
      const cats = this.docRows(pkg, m);
      const list = cats.reduce((a, c) => a + c.rows.reduce((x, r) => x + r.sum, 0), 0);
      const c = this.state.cust;
      const facts = { att: c.att, by: c.by, bill: c.bill, building: c.building, address: [c.unit, c.building, cfg.buildings?.find(b => b.name === c.building)?.address].filter(Boolean).join(", "), unit: this.unitFact(pkg), layout: this.lib.packageName(this.state.data?.packages, pkg), date: longDate(c.date) };
      (cfg.doc.blocks.find(b => b.type === "facts")?.labels || []).filter(f => f.custom).forEach(f => { facts[f.key] = this.state.extra[f.key] || ""; });
      const ci = cfg.custInfo || {}, custRows = [...(this.lib.CRM_FIELDS || []).filter(f => f.id !== "name" && (ci.crm || {})[f.id] && ci.crm[f.id].show && ci.crm[f.id].print).map(f => ({ label: f.label, value: (this.state.crm || {})[f.id] })), ...(ci.own || []).filter(f => !["unit", "bill", "building", "date", "by"].includes(f.id) && f.print).map(f => ({ label: f.label, value: this.state.extra["ci_" + f.id] }))];
      return this.lib.renderDoc(cfg, { facts, adjust, custRows, extra: this.lib.principalPictures(cfg.doc.blocks, this.state.extra), sigs: this.state.sigs, building: cfg.buildings?.find(b => b.name === c.building), cats, discount: disc, saving: priced ? Math.max(0, list - (total - adjSum) - disc) : 0, total, moodboard: this.moodboard() }, { excel: forExcel, title: this.fileBase() });
    }
    return this.docHtmlLegacy(forExcel);
  }
  docHtmlLegacy(forExcel) {
    const { data } = this.state;
    const { m, pkg, total, disc } = this.calc();
    const co = data.company, show = !!this.props.showItemPrices;
    const cats = this.docRows(pkg, m);
    const list = cats.reduce((a, c) => a + c.rows.reduce((x, r) => x + r.sum, 0), 0);
    const cols = show ? 7 : 5;
    const facts = this.facts(pkg);
    const td = (v, st = "") => `<td style="padding:4px 6px;border-bottom:1px solid #ddd;${st}">${esc(v)}</td>`;
    let body = "";
    cats.forEach(c => {
      body += `<tr><td colspan="${cols}" style="padding:10px 6px 3px;font-weight:bold;letter-spacing:.05em">${esc(c.name)}</td></tr>`;
      c.rows.forEach(r => { body += `<tr>${td(r.no)}${td(r.item)}${td(r.desc)}${td(r.code)}${td(r.qty, "text-align:right")}${show ? td(money(r.unit), "text-align:right") + td(money(r.sum), "text-align:right") : ""}</tr>`; });
    });
    const sums = [];
    if (show && list - (total + disc) > 0) sums.push(["Package saving", money(-(list - total - disc))]);
    if (disc) sums.push(["Discount", money(-disc)]);
    const sumRows = sums.map(([k, v]) => `<tr><td colspan="${cols - 1}" style="text-align:right;padding:3px 6px">${k}</td><td style="text-align:right;padding:3px 6px">${v}</td></tr>`).join("");
    const factRows = [0, 2, 4, 6].map(i => `<tr><td style="font-weight:bold;padding:2px 6px">${esc(facts[i].k)}</td><td colspan="${cols > 5 ? 3 : 2}" style="padding:2px 6px">${esc(facts[i].v)}</td><td style="font-weight:bold;padding:2px 6px">${esc(facts[i + 1].k)}</td><td colspan="${cols > 5 ? 2 : 1}" style="padding:2px 6px">${esc(facts[i + 1].v)}</td></tr>`).join("");
    const head = ["NO", "ITEM", "DESCRIPTION", "CODE/COLOUR", "QTY"].concat(show ? ["PRICE", "SUM"] : []);
    const table = `<table style="width:100%;border-collapse:collapse;font-family:Georgia,serif;font-size:12px;color:#17201D">
<tr><td colspan="${cols}" style="text-align:center;font-weight:bold;font-size:15px">${esc(co.name)} ${esc(co.reg)}</td></tr>
${co.addr.map(a => `<tr><td colspan="${cols}" style="text-align:center">${esc(a)}</td></tr>`).join("")}
<tr><td colspan="${cols}" style="text-align:center">PHONE : ${esc(co.phone)} // EMAIL : ${esc(co.email)}</td></tr>
<tr><td colspan="${cols}" style="text-align:center;font-weight:bold;font-size:14px;letter-spacing:.16em;padding:14px 0 10px">QUOTATION</td></tr>
${factRows}
<tr><td colspan="${cols}" style="padding:12px 6px 8px">We refer to our meeting with regards the above captioned matter and we are pleased to submit our quotain as follow : -</td></tr>
<tr style="background:#1F1F1C;font-weight:bold">${head.map((h, i) => `<td style="padding:6px;border-top:1px solid #bbb;border-bottom:1px solid #bbb;${i >= 4 ? "text-align:right" : ""}">${h}</td>`).join("")}</tr>
${body}${sumRows}
<tr><td colspan="${cols - 1}" style="text-align:right;padding:8px 6px;font-weight:bold;font-size:14px;border-top:1px solid #000">TOTAL (RM)</td><td style="text-align:right;padding:8px 6px;font-weight:bold;font-size:14px;border-top:1px solid #000">${money(total)}</td></tr>
<tr><td colspan="${cols}" style="height:14px"></td></tr>
${co.terms.map(t => `<tr><td colspan="${cols}" style="padding:1px 6px;font-size:11px">${esc(t)}</td></tr>`).join("")}
</table>`;
    if (forExcel) return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${table}</body></html>`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(this.fileBase())}</title><style>@page{size:A4;margin:14mm}body{margin:0}</style></head><body>${table}</body></html>`;
  }
  fileBase() {
    const { cust } = this.state; const { pkg } = this.calc();
    return `Quotation ${cust.building} ${cust.unit || pkg.layout} ${cust.date}`.replace(/[\\/:*?"<>|]+/g, "-");
  }
  custView(setCust) {
    const st = this.state, lib = this.lib, ci = (this.cfg && this.cfg.custInfo) || (lib ? lib.defaultCustInfo() : { crm: {}, own: [] }), CF = lib ? lib.CRM_FIELDS : [];
    const ini = n => String(n || "?").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
    const crmVal = id => id === "name" ? st.cust.att : (st.crm || {})[id] || "";
    const setCrm = id => e => { const val = e.target.value; if (id === "name") this.setState(s => ({ cust: { ...s.cust, att: val } })); else this.setState(s => ({ crm: { ...(s.crm || {}), [id]: val } })); };
    const fields = [
      // v10: the CRM's Property type (`type`; the prototype's `ptype`) is a Landed / Condo dropdown that also sets step 2's chips; Budget is "RM …".
      ...CF.filter(f => f.core || (ci.crm[f.id] || {}).show).map(f => { const sel = f.id === "type" || f.id === "ptype", money = f.id === "budget", raw = crmVal(f.id);
        const value = money ? budgetShown(raw) : sel ? propertyType(raw) : raw;
        const onChange = money ? e => { const val = budgetStored(e.target.value); this.setState(s => ({ crm: { ...(s.crm || {}), [f.id]: val } })); } : setCrm(f.id);
        return { label: f.label, value, ph: f.id === "name" ? "Customer name" : money ? "0" : "", type: "text", onChange, crm: true, req: !!f.core || !!(ci.crm[f.id] || {}).required,
          isSelect: sel, isMoney: money, isPlain: !sel && !money, selInk: value ? "#1F1F1C" : "#97978F", selLabel: value || "Select",
          open: sel && st.selOpen === f.id, selBorder: sel && st.selOpen === f.id ? "#111111" : "rgba(20,20,18,.12)", selRing: sel && st.selOpen === f.id ? "0 0 0 3px rgba(17,17,17,.12)" : "none",
          toggle: () => this.setState(s => ({ selOpen: s.selOpen === f.id ? null : f.id })), close: () => this.setState({ selOpen: null }),
          opts: sel ? PROPERTY_TYPES.map(o => ({ label: o, on: o === value, bg: o === value ? "#FFF5EC" : "transparent", fw: o === value ? 650 : 500, pick: () => this.setState(s => ({ selOpen: null, crm: { ...(s.crm || {}), [f.id]: o }, cust: { ...s.cust, ptype: o } })) })) : [] }; }),
      // v10: Billing address is asked only while the Principal ticks it to print (2026-11-09; `billOn`).
      ...(ci.own || []).filter(f => f.id !== "bill" || (lib && lib.billOn(this.cfg))).map(f => { const core = ["unit", "bill", "building", "date", "by"].includes(f.id), key = "ci_" + f.id;
        return { label: f.label, value: core ? st.cust[f.id] : st.extra[key] || "", ph: f.ph || "", type: f.type === "date" ? "date" : f.type === "number" ? "number" : "text", crm: false, req: !!f.required, isPlain: true,
          onChange: core ? setCust(f.id) : e => { const val = e.target.value; this.setState(s => ({ extra: { ...s.extra, [key]: val } })); } }; }),
      ...((this.cfg?.doc.blocks.find(b => b.type === "facts" && !b.hidden)?.labels) || []).filter(f => f.custom && !f.hidden).map(f => ({ label: f.label, value: st.extra[f.key] || "", ph: "", type: "text", crm: false, req: false, isPlain: true, onChange: e => { const val = e.target.value; this.setState(s => ({ extra: { ...s.extra, [f.key]: val } })); } }))
    ];
    const q = (st.crmQ || "").trim().toLowerCase(), digits = q.replace(/\D/g, "");
    const list = (st.crmHits || []).filter(c => !q || c.name.toLowerCase().includes(q) || (digits && String(c.phone || "").replace(/\D/g, "").includes(digits))).slice(0, 6);
    const picked = st.crmId ? st.crmPick || null : null;
    return {
      custFields: fields,
      crmPicked: picked ? { name: st.cust.att || picked.name, initials: ini(st.cust.att || picked.name), sub: [picked.phone, picked.usize, picked.uloc].filter(Boolean).join(" · ") } : false,
      crmSearch: !picked, crmQ: st.crmQ || "", crmOpen: !picked && !!st.crmOpen, crmNone: !list.length,
      onCrmQ: e => { const v = e.target.value; this.setState({ crmQ: v, crmOpen: true }); this.searchCrm(v); }, crmFocus: () => this.setState({ crmOpen: true }), crmBlur: () => this.setState({ crmOpen: false }),
      crmClear: () => this.setState({ crmId: null, crmQ: "", crm: {}, crmOpen: true }),
      crmResults: list.map(c => ({ name: c.name, initials: ini(c.name), sub: [c.phone, c.usize, c.uloc].filter(Boolean).join(" · "), pick: () => this.pickCrm(c) }))
    };
  }
  searchCrm(v) {
    clearTimeout(this._crmT);
    const q = String(v || "").trim(), ask = this.props.searchCrm;
    if (q.length < 2 || !ask) { this.setState({ crmHits: [] }); return; }
    this._crmT = setTimeout(() => ask(q).then(hits => { if ((this.state.crmQ || "").trim() === q) this.setState({ crmHits: hits }); }).catch(() => {}), 220);
  }
  pickCrm(c) {
    const crm = {}; (this.lib.CRM_FIELDS || []).forEach(f => { if (f.id !== "name") crm[f.id] = c[f.id] || ""; });
    // v10: the CRM's budget keeps one "RM" (it prints as typed), its property type the dropdown's own word (step 2's chips too).
    if (crm.budget) crm.budget = budgetWithRm(crm.budget);
    if (crm.type) crm.type = propertyType(crm.type) || crm.type;
    this.setState(s => ({ crmId: c.id, crmPick: c, crmOpen: false, crmQ: "", crm, cust: { ...s.cust, att: c.name, ptype: propertyType(c.ptype) || s.cust.ptype } }));
    const m = String(c.usize || "").match(/(\d+)\s*R\s*(\d+)/i), data = this.state.data;
    if (m && data) { const k = m[1] + "-" + m[2]; const p = data.packages.find(p => { const sp = p.spec || {}; return parseInt(sp.beds) + "-" + parseInt(sp.baths) === k && p.style !== "build"; }) || data.packages.find(p => { const sp = p.spec || {}; return parseInt(sp.beds) + "-" + parseInt(sp.baths) === k; });
      if (p) { this.setState({ room: (p.spec.beds || "?") + "-" + (p.spec.baths || "?") }); this.load(p.id); this.flash(`${c.name} added · ${c.usize} selected in step 2`); return; } }
    this.flash(c.name + " added from CRM");
  }
  checkReq() {
    const own = ((this.cfg && this.cfg.custInfo && this.cfg.custInfo.own) || []).filter(f => (f.id !== "bill" || this.lib.billOn(this.cfg)) && f.required && !(["unit", "bill", "building", "date", "by"].includes(f.id) ? this.state.cust[f.id] : this.state.extra["ci_" + f.id]));
    const crmMiss = ((this.lib && this.lib.CRM_FIELDS) || []).filter(f => f.id !== "name" && ((this.cfg?.custInfo?.crm || {})[f.id] || {}).show && ((this.cfg?.custInfo?.crm || {})[f.id] || {}).required && !(this.state.crm || {})[f.id]); own.unshift(...crmMiss);
    if (!this.state.cust.att || own.length) { this.flash(`Fill in ${[...(!this.state.cust.att ? ["Name"] : []), ...own.map(f => f.label)].join(", ")} first`); this.setState({ step: 1 }); return false; }
    const miss = (this.cfg?.doc.blocks || []).filter(b => b.type === "field" && !b.hidden && b.required && b.kind !== "image" /* the Principal's picture: nothing for sales to fill in */ &&this.lib.isEmpty(b, this.state.extra[b.id] ?? b.value));
    if (!miss.length) return true;
    this.flash(`Fill in ${miss.map(b => b.label).join(", ")} first`);
    this.setState({ step: 1 });
    return false;
  }
  styleStep(group, byId, style) {
    const st = this.state, styles = (this.cfg && this.cfg.styles) || [], drive = this.props.salesPhotos ? (st.drive || {}) : {}; // v10: style photos are the company's alone (Quote Settings › Styles)
    const sid = st.styleId && styles.some(x => x.id === st.styleId) ? st.styleId : (styles[0] || {}).id;
    const styleCards = styles.map(x => { const imgs = drive[x.id] || [], cover = x.cover || (imgs[0] && imgs[0].src) || "", on = x.id === sid;
      return { name: x.name, desc: x.desc || "", count: imgs.length ? imgs.length + " photo" + (imgs.length === 1 ? "" : "s") : "", cover: this.u(cover), noCover: !cover, on, border: on ? "#111111" : "#E7E7E2", ring: on ? "0 0 0 1px #111111, 0 10px 24px rgba(17,17,17,.12)" : "0 1px 2px rgba(20,20,18,.04)", pick: () => this.setState({ styleId: x.id, gi: 0 }), chipBg: on ? "#111111" : "#FFFFFF", chipInk: on ? "#FFFFFF" : "#1F1F1C", chipBorder: on ? "#111111" : "#DEDED8" }; });
    if (!group) return { styleCards, styleTabs: [], sv: false };
    const opts = [["classic", "Classic"], ["build", "Build in"]].filter(([k]) => group[k]);
    const styleTabs = opts.length < 2 ? [] : opts.map(([k, label]) => { const p = byId(group[k]), on = style === k; return { label, price: rm0(p.price), bg: on ? "#FFFFFF" : "transparent", ink: on ? "#111111" : "#6B6B66", shadow: on ? "0 1px 3px rgba(20,20,18,.14)" : "none", pick: () => { if (!on) this.load(group[k], st.data, true); } }; });
    const p = byId(group[style]) || byId(group.classic || group.build); if (!p) return { styleCards, styleTabs, sv: false };
    const sx = styles.find(x => x.id === sid) || {};
    const okSrc = s => /^(data:image|https?:|blob:)/.test(String(s || "")); const imgs = [...((sx.photos && sx.photos.length ? sx.photos : (sx.cover ? [sx.cover] : [])).map((src, k) => ({ src, title: sx.name + (k ? " · " + (k + 1) : ""), sectionName: "Overview", items: [] }))), ...(drive[sid] || []).filter(x => okSrc(x.src))];
    const gi = Math.min(st.gi || 0, Math.max(0, imgs.length - 1)), im = imgs[gi];
    const inIm = () => false;
    const live = c => c.items.filter(i => (i.qty ?? 1) > 0), isF = c => c.section ? c.section === "furn" : c.items.some(i => i.kind);
    const fItems = p.cats.filter(isF).flatMap(live), zl = fItems.map(i => { const im = this.imgFor(i); return im ? { img: im, name: title(i.name), code: i.code || "", delta: rm0((i.cost || 0) * (i.qty ?? 1)), item: null } : null; }).filter(Boolean), furn = fItems.map(i => { const im = this.imgFor(i); return { name: title(i.name), qty: i.qty > 1 ? "× " + i.qty : "", price: rm0((i.cost || 0) * (i.qty ?? 1)), cur: im ? "zoom-in" : "default", view: () => { if (im) this.openZoom(zl, zl.findIndex(z => z.img === im)); } }; });
    const sCats = p.cats.filter(c => !isF(c) && live(c).length), sItems = sCats.flatMap(live), sSum = sItems.reduce((a, i) => a + (i.cost || 0) * (i.qty ?? 1), 0);
    const serv = sCats.length ? { count: sItems.length + " items", sum: rm0(sSum), open: !!st.servOpen, rot: st.servOpen ? "rotate(180deg)" : "none", toggle: () => this.setState(s => ({ servOpen: !s.servOpen })),
      cats: sCats.map(c => ({ name: String(c.name).toUpperCase(), rows: live(c).map(i => ({ name: title(i.name), qty: i.qty > 1 ? "× " + i.qty : "", price: rm0((i.cost || 0) * (i.qty ?? 1)) })) })) } : false;
    const cats = p.cats.map(c => ({ name: String(c.name).toUpperCase(), rows: c.items.filter(i => (i.qty ?? 1) > 0).map(i => ({ name: title(i.name), qty: i.qty > 1 ? "× " + i.qty : "", price: rm0((i.cost || 0) * (i.qty ?? 1)), hl: inIm(i.name) ? "#FFEBD9" : "transparent" })) })).filter(c => c.rows.length);
    const n = imgs.length, set = k => this.setState({ gi: (k + n) % n });
    return { styleCards, styleTabs, sv: {
      furn, furnOpen: st.furnOpen ?? !this._phone, furnRot: (st.furnOpen ?? !this._phone) ? "rotate(180deg)" : "none", furnToggle: () => this.setState(s => ({ furnOpen: !(s.furnOpen ?? !this._phone) })), furnCount: fItems.length + " items", furnSum: rm0(fItems.reduce((a, i) => a + (i.cost || 0) * (i.qty ?? 1), 0)), serv, name: sx.name || "Style", pkgName: p.groupLabel || title(p.name), hasPkgTabs: opts.length > 1, price: rm0(p.price), count: `${cats.reduce((a, c) => a + c.rows.length, 0)} items`,
      hasImg: !!im, noImg: !im, src: im ? this.u(im.src) : "", title: im ? im.title || "" : "", note: im ? im.note || "" : "", multi: n > 1, counter: `${gi + 1} / ${n}`,
      prev: () => set(gi - 1), next: () => set(gi + 1), enlarge: () => this.openZoom(imgs.map(t => ({ img: this.u(t.src), name: t.title || sx.name || "", code: t.sectionName && !/^images$/i.test(t.sectionName) ? t.sectionName : (sx.name || ""), delta: (imgs.indexOf(t) + 1) + " / " + n, item: null })), gi),
      ...(() => { const secOf = t => (t.sectionName && !/^images$/i.test(t.sectionName)) ? t.sectionName : (t === imgs[0] && sx.cover && t.src === sx.cover ? "Overview" : ""); const names = [...new Set(imgs.map(secOf).filter(Boolean))], cur = im ? secOf(im) : "";
        return { hasSecs: names.length > 1, secs: names.map(nm => { const on = nm === cur; return { label: nm, bg: on ? "#111111" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C", border: on ? "#111111" : "#DEDED8", pick: () => set(imgs.findIndex(t => secOf(t) === nm)) }; }), secLabel: cur }; })(),
      thumbs: imgs.map((t, k) => ({ src: this.u(t.src), ring: k === gi ? "0 0 0 2px #F5871F" : "none", op: k === gi ? 1 : .6, pick: () => set(k) })),
      inPhoto: "", cats } };
  }
  loadDrive() { Promise.resolve(wsStore).then(ws => ws.byStyle()).then(drive => this.setState({ drive })).catch(() => {}); }
  wsKey() { const c = this.state.cust || {}; return [c.building, c.unit, c.att].map(x => (x || "").trim()).join("|") || "draft"; }
  wsLabel() { const c = this.state.cust || {}; return [c.att || "New customer", [c.building, c.unit].filter(Boolean).join(" ")].filter(Boolean).join(" · "); }
  refreshWsCount() { Promise.resolve(wsStore).then(ws => ws.countFor(this.wsKey())).then(n => { if (n !== this.state.wsCount) this.setState({ wsCount: n }); }).catch(() => {}); }
  async exportPdf() {
    if (!this.checkReq()) return;
    let html = this.docHtml(false);
    try { const ws = await Promise.resolve(wsStore); const sx = ((this.cfg && this.cfg.styles) || []).find(x => x.id === this.state.styleId) || ((this.cfg && this.cfg.styles) || [])[0] || {}; const extra = this.props.salesPhotos ? await ws.pdfHtml(sx.id, sx.name) : ""; if (extra) html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, extra + "</body>") : html + extra; } catch (e) {}
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(f);
    const d = f.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 1500); }, 250);
  }
  exportExcel() {
    if (!this.checkReq()) return;
    const blob = new Blob(["\ufeff" + this.docHtml(true)], { type: "application/vnd.ms-excel" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = this.fileBase() + ".xls";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.flash("Excel file downloaded");
  }
  shareText() {
    const { pkg, total, changes, disc, adjust } = this.calc(); const c = this.state.cust;
    const lines = [`Quotation · ${c.building}${c.unit ? " " + c.unit : ""}`, `${pkg.name}`, c.att ? `Attention: ${c.att}` : "", "",
      ...changes.map(x => `${x.tag}: ${title(x.l.name)}${x.l.qty !== 1 ? " × " + x.l.qty : ""}`),
      disc ? `Discount: ${rm(-disc)}` : "", ...adjust.map(a => `${a.label}: ${rm(a.amount)}`), `Total: ${rm(total)}`, "", `Prepared by ${c.by} · ${longDate(c.date)}`];
    return lines.filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i > 0)).join("\n");
  }
  async share() {
    if (!this.checkReq()) return;
    const text = this.shareText();
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text); this.flash("Quote copied — paste it to the customer");
    } catch (e) { /* closed */ }
  }
  async copy() { if (!this.checkReq()) return; try { await navigator.clipboard.writeText(this.shareText()); this.flash("Copied"); } catch (e) { this.flash("Could not copy"); } }

  renderVals() {
    const st = this.state;
    const vp = this.props.viewport ?? "auto";
    const desk = vp === "desktop" ? true : vp === "phone" ? false : st.width >= 1024; this._desk = desk;
    const phone = !desk; this._phone = phone;
    const { m, pkg, changes, changeSell, disc, total } = this.calc();
    const data = st.data, co = data?.company;
    const step = st.step;
    const setCust = k => e => { const v = e.target.value; this.setState(s => ({ cust: { ...s.cust, [k]: v } })); };
    const go = n => () => { if (!pkg) return; this.setState({ step: n }); const el = this.rootRef.current?.querySelector("main"); if (el) el.scrollTop = 0; };
    const stepNames = ["Customer", "Room type", "Style", "Customize", "Quotation"];
    const steps = stepNames.map((label, i) => ({ n: i + 1, label, rule: i > 0, on: step === i + 1, done: step > i + 1, off: step < i + 1, go: go(i + 1), bar: step >= i + 1 ? "#F5871F" : "#E7E7E2" }));
    const stepNow = { label: stepNames[step - 1] || "", n: step + " / " + stepNames.length };
    const d = new Date();
    const byId = id => data.packages.find(p => p.id === id);
    const style = pkg ? pkg.style : "classic";
    const group = pkg && data.groups ? data.groups.find(g => g.id === pkg.group) : null;
    const bedItems = p => [...new Set(p.cats.filter(c => BEDROOM.test(c.name)).flatMap(c => c.items.map(i => title(i.name).replace(/ - .*$/, ""))))].join(" · ");
    const kinds = st.catalog?.kinds || {};
    const catViews = pkg ? pkg.cats.map((c, ci) => {
      const ls = st.lines.filter(l => l.ci === ci);
      return {
        _ci: ci, countOrSum: phone ? String(ls.filter(l => l.qty > 0).length) : `${ls.filter(l => l.qty > 0).length} item${ls.filter(l => l.qty > 0).length === 1 ? "" : "s"}`, label: c.label, count: `${ls.filter(l => l.qty > 0).length} item${ls.filter(l => l.qty > 0).length === 1 ? "" : "s"}`,
        canAdd: c.items.some(i => i.kind),
        add: () => this.openSheet({ mode: "add", ci }),
        lines: ls.map(l => {
          const ch = changes.find(x => x.l.id === l.id);
          const tone = !ch ? null : ch.tag === "Removed" ? ["#8A2E1C", "#F6E1DA"] : ch.tag === "Added" ? ["#2F6B47", "#E8F3ED"] : ["#B35A00", "#FFEBD9"];
          return {
            title: title(l.name), meta: [l.desc, l.code, this.colorFor(l)].filter(Boolean).join(" · "), qty: l.qty,
            adj: !!(l.adjust || (l.orig && l.orig.adjust)), locked: !(l.adjust || (l.orig && l.orig.adjust)) && !!(l.fixed || (l.orig && l.orig.fixed)), costV: String(l.cost ?? ""), onCost: e => { const n = parseFloat(e.target.value.replace(/[^\d.]/g, "")); this.setLine(l.id, x => ({ ...x, cost: isNaN(n) ? 0 : n })); },
            sumText: rm0((+l.cost || 0) * Math.max(l.qty, 0)), eachText: l.qty === 1 ? "" : `${rm0(+l.cost || 0)} each`,
            strike: l.qty === 0 ? "line-through" : "none", nameColor: l.qty === 0 ? "#6B6B66" : "#1F1F1C",
            tag: ch ? ch.tag.toUpperCase() : "", delta: ch ? signed(ch.d) : "", tagInk: tone ? tone[0] : "", tagBg: tone ? tone[1] : "",
            ...((im) => ({ lImg: im, lCursor: im ? "zoom-in" : "default", lView: () => { if (!im) return; const zl = st.lines.filter(x => x.qty > 0).map(x => { const i2 = this.imgFor(x); const c2 = changes.find(y => y.l.id === x.id); return i2 ? { img: i2, name: title(x.name), code: x.code || "", delta: c2 ? signed(c2.d) : "In package", item: null } : null; }).filter(Boolean); this.openZoom(zl, zl.findIndex(z => z.img === im)); } }))(this.imgFor(l)),
            canSwap: !!l.kind, swap: () => this.openSheet({ mode: "swap", id: l.id }),
            remarkOn: !!((this.cfg?.doc.blocks.find(b => b.type === "table")?.columns) || []).find(c => c.key === "remark" && c.show), remarkV: l.remark || "", onRemark: e => { const v = e.target.value; this.setLine(l.id, x => ({ ...x, remark: v })); },
            minus: () => this.bump(l.id, -1), plus: () => this.bump(l.id, 1), onQty: e => { const n = Math.max(0, Math.min(999, parseInt(e.target.value.replace(/\D/g, "")) || 0)); this.setLine(l.id, x => ({ ...x, qty: n })); }, undo: e => { if (e) e.stopPropagation(); this.undo(l); }
          };
        })
      };
    }) : [];
    const isFurn = ci => pkg && (pkg.cats[ci].section ? pkg.cats[ci].section === "furn" : pkg.cats[ci].items.some(i => i.kind));
    const grpSum = vs => rm0(vs.reduce((a, cv) => a + st.lines.filter(l => l.ci === cv._ci).reduce((b, l) => b + (+l.cost || 0) * Math.max(l.qty, 0), 0), 0));
    const furnV = catViews.filter(cv => isFurn(cv._ci)), servV = catViews.filter(cv => !isFurn(cv._ci));
    const catGroups = [{ key: "furn", short: "Furniture", label: "FURNITURE & APPLIANCES", cats: furnV }, { key: "serv", short: "Services", label: "SERVICES & FITTINGS", cats: servV }].filter(g => g.cats.length).map(g => ({ ...g, sum: grpSum(g.cats) }));
    const czKey = catGroups.some(g => g.key === st.czTab) ? st.czTab : (catGroups[0] || {}).key;
    const czTabs = phone && catGroups.length > 1 ? catGroups.map(g => { const on = g.key === czKey; return { label: g.short, sum: g.sum, bg: on ? "#FFFFFF" : "transparent", ink: on ? "#111111" : "#6B6B66", sub: on ? "#D96E0B" : "#97978F", shadow: on ? "0 1px 3px rgba(20,20,18,.12)" : "none", pick: () => { this.setState({ czTab: g.key }); const el = this.rootRef.current && this.rootRef.current.querySelector("main"); if (el) el.scrollTop = 0; } }; }) : false;
    const catGroupsShown = phone && catGroups.length > 1 ? catGroups.filter(g => g.key === czKey).map(g => ({ ...g, label: "", sum: "" })) : catGroups;

    // sheet
    let sheet = { eyebrow: "", title: "", sub: "", url: "" }, options = [];
    const hideOpts = !!st.sheet && st.sheetView === "col" && !st.col && !(st.q || "").trim();
    if (st.sheet && pkg && st.catalog) {
      const q = st.q.trim().toLowerCase();
      const colView = st.sheetView === "col", col = colView ? st.col || "" : "", clr = st.clr || "", colorsOf = it => String(it.color || "").split(/\s*,\s*/).filter(Boolean);
      const live = it => !it.paused && !(kinds[it.kind] || {}).paused;
      const match = it => live(it) && (!q || (it.name + " " + it.code + " " + (it.collection || "")).toLowerCase().includes(q)) && (!col || it.collection === col) && (!clr || colorsOf(it).includes(clr));
      if (st.sheet.mode === "swap") {
        const l = st.lines.find(x => x.id === st.sheet.id);
        const base = l.orig || l, k = kinds[l.kind] || {};
        const baseImg = this.imgFor(base) || imgFor(base.code);
        sheet = { eyebrow: "CHANGE ITEM", title: title(l.orig ? l.orig.name : l.name), sub: `${k.label || "Item"} · ${rm0(base.cost * m)}`, url: k.url || "", img: baseImg, zoom: e => { e.stopPropagation(); this.openZoom([{ img: baseImg, name: title(base.name), code: base.code || "", delta: rm0(base.cost * m), item: null }], 0); } };
        options = st.catalog.items.filter(it => it.kind === l.kind && it.cost != null && !it.noPrice && match(it)).map(it => {
          const dd = Math.round((it.cost - base.cost) * m) * (l.qty || 1);
          const cur = it.code === l.code && it.name === l.name;
          return { ...it, item: it, cur, delta: cur ? "Selected" : dd === 0 ? "Same price" : signed(dd), ink: cur ? "#2F6B47" : dd > 0 ? "#1F1F1C" : "#2F6B47" };
        });
      } else {
        const c = pkg.cats[st.sheet.ci];
        const ks = [...new Set(c.items.map(i => i.kind).filter(Boolean))];
        sheet = { eyebrow: "ADD ITEM", title: c.label, sub: "Priced at cost × " + m, url: (kinds[ks[0]] || {}).url || "https://www.b2bfurnituresupply.com" };
        options = st.catalog.items.filter(it => ks.includes(it.kind) && it.cost != null && !it.noPrice && match(it)).map(it => ({ ...it, item: it, delta: signed(Math.round(it.cost * m)), ink: "#1F1F1C" }));
      }
      const VAR = /\s*\(#\)|\s+\d{2,4}\/\d{2,5}(?:\/\d{1,5})*$|\b(?:LEFT|RIGHT|LHF|RHF|LHS|RHS|LH|RH|REVERSIBLE)(?:\s+(?:FACING|HAND|ARM|CHAISE|SIDE))?\b/gi;
      const lead = /^[\d\/\s-]{6,}(?=[A-Z])/i;
      const gk = n => String(n || "").toUpperCase().replace(lead, "").replace(VAR, " ").replace(/\s+/g, " ").trim();
      const vl = n => { const u = String(n || "").toUpperCase().replace(lead, ""); const p = []; let m; const re = new RegExp(VAR.source, "gi"); while ((m = re.exec(u))) { const t = m[0].replace(/[()#]/g, "").trim(); if (t) p.push(t); } return p.join(" · "); };
      const groups = []; const gi = {};
      // b2b's own grouping (its product page's OPTION list, `group`) where the import read it, else by the name. One product is one option: b2b lists it under a category and every collection, and two products may share a code.
      const pid = o => productSlug(o.url) || o.code;
      options.forEach(o => { const k = o.group ? "g:" + o.group : gk(o.name); if (gi[k] == null) { gi[k] = groups.length; groups.push({ k, list: [] }); } const list = groups[gi[k]].list, same = list.findIndex(x => pid(x) && pid(x) === pid(o)); if (same < 0) list.push(o); else if (o.cur) list[same] = o; });
      const words = n => String(n || "").toUpperCase().replace(lead, "").trim().split(/\s+/);
      const shared = vs => { const a = words(vs[0].name); let i = 0; while (i < a.length && vs.every(v => words(v.name)[i] === a[i])) i++; return i; };
      options = groups.map(g => { const vs = g.list; const selId = (st.vsel || {})[g.k]; const o = vs.find(v => v.id === selId) || vs.find(v => v.cur) || vs[0]; const same = shared(vs);
        const vars = vs.length > 1 ? vs.map(v => { const on = v === o; return { label: (v.group ? title(words(v.name).slice(same).join(" ")) : vl(v.name)) || v.code || "—", bg: on ? "#1F1F1C" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C", border: on ? "#1F1F1C" : "#DEDED8", pick: e => { e.stopPropagation(); this.setState(s => ({ vsel: { ...(s.vsel || {}), [g.k]: v.id } })); } }; }) : [];
        return { ...o, vars, hasVars: vars.length > 1, varCount: vars.length > 1 ? vars.length + " options" : "", gname: vs.length > 1 ? (o.group ? words(o.name).slice(0, same).join(" ") || o.name : g.k) : o.name }; });
      const zl = options.map(o => { const im = o.img || o.item?.img || imgFor(o.code); return im ? { img: im, name: title(o.name), code: [o.code, o.color].filter(Boolean).join(" · "), delta: o.delta, item: o.item } : null; }).filter(Boolean);
      options = options.map(o => { const im = o.img || o.item?.img || imgFor(o.code); return {
        name: title(o.gname), code: [o.code || "—", o.color].filter(Boolean).join(" · "), img: im, initials: im ? "" : (o.name.match(/\b[A-Z]/g) || []).slice(0, 2).join(""),
        collection: o.collection || "", vars: o.vars, hasVars: o.hasVars, varCount: o.varCount,
        sample: !!o.sample, delta: o.delta, ink: o.ink, pick: () => this.apply(o.item),
        zoomTitle: im ? "View larger" : "", zoomCursor: im ? "zoom-in" : "inherit",
        zoom: e => { if (!im) return; e.stopPropagation(); this.openZoom(zl, zl.findIndex(z => z.img === im)); }
      }; });
    }
    const cu = st.custom, cuOk = cu.name.trim() && +cu.cost > 0;
    const kindForCustom = st.sheet?.mode === "swap" ? st.lines.find(x => x.id === st.sheet.id)?.kind : null;

    const docCats = pkg ? this.docRows(pkg, m).map(c => ({ name: c.name, rows: c.rows.map(r => ({ ...r, price: money(r.unit), sum: money(r.sum) })) })) : [];
    const listTotal = docCats.length ? this.docRows(pkg, m).reduce((a, c) => a + c.rows.reduce((x, r) => x + r.sum, 0), 0) : 0;
    const show = !!this.props.showItemPrices;
    const docSums = [];
    if (show && listTotal - (total + disc) > 0) docSums.push({ k: "Package saving", v: money(-(listTotal - total - disc)) });
    if (disc) docSums.push({ k: "Discount", v: money(-disc) });

    const primary = step === 1 ? { label: "Room type", d: ICON.arrowRight, run: go(2) }
      : step === 2 ? { label: "Style", d: ICON.arrowRight, run: go(3) }
      : step === 3 ? { label: "Customize", d: ICON.arrowRight, run: go(4) }
      : step === 4 ? { label: "Preview quotation", d: ICON.arrowRight, run: go(5) }
      : { label: "Download PDF", d: ICON.download, run: () => this.exportPdf() };
    const nChanges = changes.length;

    return {
      rootRef: this.rootRef, desk, phone, stepBarD: phone ? "none" : "flex", deskOnlyFlex: phone ? "none" : "flex",
      mood: (() => { const { sx, imgs } = this.moodPhotos(), on = !!st.withMood && imgs.length > 0, none = !imgs.length;
        return { on, none, boxBg: on ? "#F5871F" : "#FFFFFF", boxBorder: on ? "#F5871F" : "#C9C9C2", op: none ? .5 : 1, cursor: none ? "not-allowed" : "pointer",
          sub: none ? "No photos for " + (sx.name || "this style") + " in Quote Settings" : (sx.name || "Style") + " · " + imgs.length + " photo" + (imgs.length === 1 ? "" : "s") + " under the customer details",
          toggle: () => { if (!none) this.setState(s => ({ withMood: !s.withMood })); } }; })(),
      saveDraftC: () => { this.saveDraft(); this.setState({ confirm: { title: "Draft saved", sub: "Find it anytime under Quote · Drafts." } }); },
      doPdfC: () => { this.exportPdf(); this.setState({ confirm: { title: "PDF ready", sub: "Choose “Save as PDF” in the next screen to keep it on this device." } }); },
      confirmBox: st.confirm ? { ...st.confirm, close: () => this.setState({ confirm: null }) } : false,
      openShare: () => { if (this.checkReq()) this.setState({ shareOpen: true }); },
      shareSheet: st.shareOpen ? { close: () => this.setState({ shareOpen: false }), apps: (() => { const t = () => encodeURIComponent(this.shareText()), done = () => this.setState({ shareOpen: false });
        return [
          { label: "WhatsApp", bg: "#E5F7EC", ink: "#1E9E55", d: "M3 21l1.6-4.7A8.5 8.5 0 1 1 7.8 19.6ZM9 8.5c0 3.5 2.5 6.5 6.5 6.5l1-1.5-2-1-1 1c-1.2-.5-2.2-1.5-2.7-2.7l1-1-1-2Z", run: () => { window.open("https://wa.me/?text=" + t(), "_blank"); done(); } },
          { label: "Email", bg: "#EAF0FB", ink: "#2D5788", d: "M3 5h18v14H3zM3 6l9 7 9-7", run: () => { window.location.href = "mailto:?subject=" + encodeURIComponent("Quotation") + "&body=" + t(); done(); } },
          { label: "Telegram", bg: "#E6F3FA", ink: "#2A8BC7", d: "M21 4 3 11l6 2 2 6 3-4 5 4Z", run: () => { window.open("https://t.me/share/url?text=" + t(), "_blank"); done(); } },
          { label: "Copy", bg: "#F2F2EF", ink: "#1F1F1C", d: "M9 9h11v11H9zM5 15H4V4h11v1", run: () => { done(); this.copy(); } },
          { label: "More", bg: "#F2F2EF", ink: "#1F1F1C", d: "M5 12h.01M12 12h.01M19 12h.01", run: () => { done(); this.share(); } }
        ]; })() } : false, selAll: e => e.target.select(), docBoxD: !phone || st.docFull ? "flex" : "none", docBox: phone ? (() => { return { pos: "fixed", z: 160, b: "0", r: "0", full: true }; })() : { pos: "relative", z: "auto", b: "1px solid #E7E7E2", r: "14px", full: false }, openDoc: () => this.setState({ docFull: true }, () => { setTimeout(() => { const f = this.rootRef.current && this.rootRef.current.querySelector("iframe[title=\"Quotation preview\"]"); if (f && this._fitDoc) this._fitDoc({ currentTarget: f }); }, 60); }), closeDoc: () => this.setState({ docFull: false }), phoneStep: phone && !st.home, cgPad: phone ? "2px 4px 0" : "10px 4px 0", cz: phone ? { pad: "0", h: "14.5px", meta: "none", add: "38px", r: "0", b: "0", bg: "transparent", sh: "none", plus: true, addRow: false, stepCols: "26px 24px 26px", stepH: "30px", cntW: "22px", cntH: "22px", cntP: "6px", cntBg: "#FFFFFF", rowPad: "12px 4px 12px 10px", hPad: "4px 4px 4px 10px", hPos: "sticky", hBg: "#EEEEEA", hR: "8px", hMargin: "10px 0 2px", swapBg: "transparent" } : { pad: "18px", h: "19px", meta: "block", add: "44px", r: "14px", b: "1px solid rgba(20,20,18,.05)", bg: "#FFFFFF", sh: "0 1px 2px rgba(20,20,18,.04),0 8px 24px rgba(20,20,18,.045)", plus: false, addRow: true, stepCols: "32px 28px 32px", stepH: "34px", cntW: "0", cntH: "auto", cntP: "0", cntBg: "transparent", rowPad: "12px 0", hPad: "0", hPos: "static", hBg: "transparent", hR: "0", hMargin: "0 0 2px", swapBg: "#F0F0ED" }, svCard: phone ? { r: "0", b: "0", bg: "transparent", m: "-20px", ar: "4/3", ir: "0", thumbs: "none", bedLbl: "none", segFlex: "1 1 100%" } : { r: "14px", b: "1px solid #E7E7E2", bg: "#FFFFFF", m: "0", ar: "16/10", ir: "0", thumbs: "flex", bedLbl: "inline", segFlex: "0 0 auto" }, mainPad: phone ? "8px 20px 28px" : "20px 28px 36px", appNavD: (phone && !st.home) || /embed=1/.test(location.search) ? "none" : "block", phoneHome: phone && !!st.home, phoneFooterD: phone && st.home ? "none" : "block", homeNew: () => { this.setState({ home: false }); if (this._newQuote) this._newQuote(); }, chgTxt: phone ? "none" : "inline", chgIco: phone ? "block" : "none", chgPad: phone ? "4px" : "14px", thumbD: phone ? "none" : "flex", priceIn: phone ? "block" : "none", nameBasis: phone ? "140px" : "160px", stGridD: phone ? "none" : "grid", stWrap: phone ? { tc: "none", flow: "column", col: "38%", ox: "auto", m: "-20px", p: "20px", desc: "none" } : { tc: "repeat(auto-fill,minmax(min(100%,190px),1fr))", flow: "row", col: "auto", ox: "visible", m: "0", p: "0", desc: "block" }, inH: phone ? "50px" : "42px", phoneDrafts: phone && !!st.draftsOpen, stopProp: e => e.stopPropagation(), secPad: phone ? "0" : "18px", secBorder: phone ? "0" : "1px solid rgba(20,20,18,.05)", secBg: phone ? "transparent" : "#FFFFFF", secShadow: phone ? "none" : "0 1px 2px rgba(20,20,18,.04),0 8px 24px rgba(20,20,18,.045)",
      sizeWrap: phone ? { tc: "none", d: "grid", flow: "column", col: "62%", ox: "auto", m: "-20px", p: "20px" } : { tc: "repeat(auto-fill,minmax(min(100%,220px),1fr))", d: "grid", flow: "row", col: "auto", ox: "visible", m: "0", p: "0" }, frameMax: vp === "phone" ? "430px" : "none",
      ...(() => { const ws = this.wsMod, me = this.props.user || { id: "", name: "" }, ini = n => String(n || "?").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase();
        return { userName: me.name, userInitials: ini(me.name), acctOpen: !!this.state.acctOpen,
          toggleAcct: () => this.props.onNav && this.props.onNav("Profile"), closeAcct: () => this.setState({ acctOpen: false }),
          acctList: ws ? ws.users().map(u => ({ name: u.name, initials: ini(u.name), on: u.id === me.id, bg: u.id === me.id ? "#F2F2EF" : "transparent", avBg: u.id === me.id ? "#F5871F" : "#EEEEEA", pick: () => { this.setState({ acctOpen: false }); ws.setUser(u.id); } })) : [],
          addAcct: e => { e.preventDefault(); const n = e.target.nm.value; if (ws && ws.addUser(n)) this.setState({ acctOpen: false }); } }; })(),
      dateLine: `${DAYS[d.getDay()].toUpperCase()} ${d.getDate()} ${MONTHS[d.getMonth()].toUpperCase()} ${d.getFullYear()}`,
      deskNav: [["Today", ICON.home], ["Insight", ICON.chart], ["Quote", ICON.quoteDesk], ["Workspace", "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01"], ["Arena", ICON.trophy], ["Profile", ICON.user]].map(([label, dd]) => { const on = label === "Workspace" ? !!this.state.wsOpen : label === "Quote" && !this.state.wsOpen; return { label, d: dd, bg: on ? "#F5871F" : "transparent", color: on ? "#111111" : "#A3A3A3", weight: on ? 650 : 550, go: label === "Workspace" ? () => this.setState({ wsOpen: true }) : label === "Quote" ? () => this.setState({ wsOpen: false }) : undefined }; }),
      wsOpen: !!this.state.wsOpen, openWs: () => this.setState({ wsOpen: true }), closeWs: () => { this.setState({ wsOpen: false }); this.loadDrive(); },
      wsStyles: ((this.cfg && this.cfg.styles) || []).map(x => ({ id: x.id, label: x.name })), wsStyleId: this.state.styleId || (((this.cfg && this.cfg.styles) || [])[0] || {}).id || "",
      wsFurniture: [...new Set(((this.state.data && this.state.data.packages) || []).flatMap(p => p.cats.flatMap(c => c.items.map(i => i.name))))].sort().map(nm => ({ id: nm, name: nm })),
      wsKey: this.wsKey(), wsLabel: this.wsLabel(), wsCount: String(this.state.wsCount || 0),
      wsStyle: (((this.state.data && this.state.data.packages) || []).find(p => p.id === this.state.pid) || {}).name || "",
      wsItems: (this.state.lines || []).map(l => ({ id: String(l.id), name: String(l.name || "") })),
      navLeft: [{ label: "Today", d: ICON.home }, { label: "Insight", d: ICON.chart }].map(n => ({ ...n, go: () => this.props.onNav && this.props.onNav(n.label) })),
      navRight: [{ label: "Arena", d: ICON.trophy }, { label: "Profile", d: ICON.user }].map(n => ({ ...n, go: () => this.props.onNav && this.props.onNav(n.label) })),
      deskAside: desk && !this.props.inApp, deskHeader: desk && !this.props.inApp, rootH: this.props.rootH || "100vh", canSettings: !!this.props.canSettings, settingsHref: "#",
      openSettings: e => { e.preventDefault(); this.props.onSettings && this.props.onSettings(); },
      phoneBack: phone ? !st.home : step > 1, phoneLogo: phone ? !!st.home : step === 1, backLabel: stepNames[step - 2] || "", goBack: step === 1 ? () => this.setState({ home: true }) : go(step - 1),
      steps, stepNow, showPrice: step > 1 && !!pkg, noPrice: step === 1, stepCust: step === 1 && !!pkg, stepRoom: step === 2 && !!pkg, stepStyle: step === 3 && !!pkg, stepEarly: step <= 3 && !!pkg, step1: false, step2: step === 4 && !!pkg, step3: step === 5 && !!pkg, loading: !pkg,
      ...(() => { const fl = this.lib ? (this.cfg?.doc.blocks || []).filter(b => b.type === "field" && !b.hidden) : []; return { hasExtra: fl.length > 0, extraFields: fl.map(f => { const ex = this.lib.principalPictures([f], st.extra); return this.lib.fieldEditor(f, ex[f.id] ?? f.value, v => this.setState(s => ({ extra: { ...s.extra, [f.id]: v } })), { upload: false }); }) }; })(),
      ...(() => {
        const sb = this.lib ? (this.cfg?.doc.blocks || []).filter(b => b.type === "signature" && !b.hidden) : [];
        const slots = [];
        sb.forEach(b => {
          [["left", "signIr", b.text || "Prepared by"], ["right", "signCust", b.text2 || "Customer acknowledgement"]].forEach(([side, flag, label]) => {
            if (!b[flag]) return;
            const img = (st.sigs[b.id] || {})[side] || "";
            slots.push({ label, img, signed: !!img, empty: img ? "" : "Not signed", status: img ? "Signed" : side === "left" && b.img ? "Using company signature" : "Not signed yet", cta: img ? "Sign again" : "Sign",
              open: () => this.setState({ pad: { id: b.id, side, title: label } }),
              clear: () => this.setState(s => ({ sigs: { ...s.sigs, [b.id]: { ...(s.sigs[b.id] || {}), [side]: "" } } })) });
          });
        });
        return { hasSigs: slots.length > 0, sigSlots: slots };
      })(),
      pad: st.pad, padRef: this.padRef, padDown: this.padDown, padMove: this.padMove, padUp: this.padUp, padClear: this.padClear, padSave: this.padSave, padCancel: () => { this._inked = false; this.setState({ pad: null }); },
      cust: st.cust, unitText: st.cust.unit || "Unit not set",
      ...this.custView(setCust),
      ...(() => {
        if (!data?.groups) return { roomTypes: [], unitSizes: [], sizeCards: [], missingSizes: "", propTypes: [], pkgCountText: "" };
        const gp = g => byId(g.classic || g.build) || {}, rk = g => { const s = gp(g).spec || {}; return s.beds || s.baths ? `${s.beds || "?"}-${s.baths || "?"}` : "other"; };
        const curKey = st.room || (group ? rk(group) : "");
        const keys = [...new Set(data.groups.map(rk))].sort((a, b) => a === "other" ? 1 : b === "other" ? -1 : a.localeCompare(b, undefined, { numeric: true }));
        const roomTypes = keys.map(k => { const gs = data.groups.filter(g => rk(g) === k), on = k === curKey, [b, t] = k.split("-"), min = Math.min(...gs.map(g => gp(g).price || Infinity));
          return { beds: k === "other" ? "—" : b, bedWord: k === "other" ? "Other" : b === "1" ? "Bedroom" : "Bedrooms", baths: k === "other" ? "Layouts without a room count" : `${t} Bathroom${t === "1" ? "" : "s"}`, meta: `${gs.length} layout${gs.length === 1 ? "" : "s"}${isFinite(min) ? " · from " + rm0(min) : ""}`,
            border: on ? "#111111" : "#E7E7E2", ring: on ? "inset 0 0 0 1px #111111" : "none", bg: on ? "#FFEBD9" : "#FFFFFF",
            pick: () => { this.setState({ room: k }); if (!group || rk(group) !== k) { const g = gs[0]; this.load(g.classic || g.build); } } }; });
        const shown = data.groups.filter(g => rk(g) === curKey);
        const multiB = new Set(data.groups.map(g => g.building)).size > 1;
        this._multiB = multiB;
        const SIZES = ["2-1", "2-2", "3-2", "3-3", "4-2", "4-3", "4-4"];
        const chip = (on, avail = true) => ({ border: on ? "#1F1F1C" : "#DEDED8", bg: on ? "#1F1F1C" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C", op: avail ? "1" : ".45" });
        const numK = k => k.split("-").map(n => parseInt(n) || 0); const unitSizes = [...new Set([...SIZES, ...keys.filter(k => k !== "other")])].sort((a, b) => { const [a1, a2] = numK(a), [b1, b2] = numK(b); return a1 - b1 || a2 - b2; }).map(k => { const gs = data.groups.filter(g => rk(g) === k), [b, t] = k.split("-"), min = Math.min(...gs.map(g => gp(g).price || Infinity));
          return { _k: k, _gs: gs, _from: gs.length ? rm0(min) : "", label: `${b}R ${t}R`, tip: gs.length ? `${b} bedroom ${t} bathroom · from ${rm0(min)}` : "No package for this size yet", ...chip(k === curKey, gs.length > 0),
            pick: () => { if (this._swiped && Date.now() - this._swiped < 400) return; if (!gs.length) { this.flash(`No package for ${b}R ${t}R yet. Add one in Quote Settings.`); return; } this.setState({ room: k }); if (!group || rk(group) !== k) { const g = gs[0]; this.load(g.classic || g.build); } } }; });
        const propTypes = ["Condo", "Landed"].map(l => ({ label: l, tip: "", ...chip((st.cust.ptype || "") === l), pick: () => this.setState(s => ({ cust: { ...s.cust, ptype: s.cust.ptype === l ? "" : l } })) }));
        const NOSHOW = /SERVICE|PAINT|CLEAN|ELECTRIC|PLUMB|INSTALL|TRANSPORT|DELIVER/i;
        const slides = []; this._slides = slides;
        const sizeCards = unitSizes.filter(u => u._gs.length).map(u => { const p = gp(u._gs[0]), sp = p.spec || {}, on = u._k === curKey;
          const names = [...new Set((p.cats || []).filter(c => !NOSHOW.test(c.name)).flatMap(c => c.items.map(i => title(i.name).replace(/ - .*$/, "").replace(/\s*\(.*\)$/, ""))))];
          const hl = names.slice(0, 3).map((t, i) => ({ t, line: i ? "1px solid #DEDED8" : "0" })); if (hl.length) hl[0].line = "0";
          if (names.length > 3) hl.push({ t: "+" + (names.length - 3) + " more", line: "1px solid #DEDED8" });
          const [b, t] = u._k.split("-");
          const ph = sp.photos || [], n = ph.length, ci = Math.min((st.ci || {})[u._k] || 0, Math.max(0, n - 1)), step = d => this.setState(s => ({ ci: { ...(s.ci || {}), [u._k]: (ci + d + n) % n } })), go = d => e => { e.stopPropagation(); this._held = u._k; step(d); };
          if (n > 1 && (sp.photoMode || "slide") === "slide") slides.push({ k: u._k, n });
          return { ...u, on, img: this.u(ph[ci] || ""), noImg: !n, multi: n > 1, prev: go(-1), next: go(1),
            tStart: e => { this._tx = e.touches[0].clientX; }, tEnd: e => { const dx = e.changedTouches[0].clientX - (this._tx ?? 0); this._tx = null; if (n > 1 && Math.abs(dx) > 35) { this._held = u._k; this._swiped = Date.now(); step(dx < 0 ? 1 : -1); } },
            hoverOn: () => { this._hover = u._k; }, hoverOff: () => { if (this._hover === u._k) this._hover = null; }, dots: ph.map((_, k) => ({ op: k === ci ? 1 : .55 })),
            eyebrow: `${b} bedroom${b > 1 ? "s" : ""} · ${t} bathroom${t > 1 ? "s" : ""}`, sqft: sp.sqft ? sp.sqft + " sq.ft." : "", title: [u.label, String(sp.note || "").trim()].filter(Boolean).join(" ") /* the room type's name: room count + Note (2026-11-09) */, price: u._from,
            cShadow: on ? "inset 0 0 0 3px #F5871F" : "none", rowRing: on ? "inset 0 0 0 2px #F5871F" : "0 1px 2px rgba(20,20,18,.05)", radioBorder: on ? "#F5871F" : "#DEDED8", radioBg: on ? "#F5871F" : "#FFFFFF" }; });
        const missingSizes = unitSizes.filter(u => !u._gs.length).map(u => u.label).join(", ");
        return { unitSizes, sizeCards, missingSizes, propTypes, roomTypes, pkgCountText: `${shown.length} layout${shown.length === 1 ? "" : "s"} for this room type`, _shown: shown };
      })(),
      pkgRows: data?.groups ? data.groups.filter(g => { const p = byId(g.classic || g.build) || {}, s = p.spec || {}, k = s.beds || s.baths ? `${s.beds || "?"}-${s.baths || "?"}` : "other"; const ck = st.room || (group ? (() => { const s2 = (byId(group.classic || group.build) || {}).spec || {}; return s2.beds || s2.baths ? `${s2.beds || "?"}-${s2.baths || "?"}` : "other"; })() : k); return k === ck; }).map(g => {
        const on = group && g.id === group.id, cur = byId(g[style]) || byId(g.classic || g.build), other = byId(g[cur.style === "build" ? "classic" : "build"]);
        const items = cur.cats.reduce((a, c) => a + c.items.length, 0), sp = cur.spec || {};
        return { name: g.label, spec: this.lib.specText(sp, true), meta: `${[items + " items", this.lib.versionWord(data.packages, cur)].filter(Boolean).join(" · ")}${this._multiB && g.building ? " · " + title(g.building) : ""}`, hasPlan: !!sp.plan, plan: sp.plan || "", openPlan: e => { e.stopPropagation(); this.setState({ plan: { img: sp.plan, name: g.label, spec: this.lib.specText(sp) } }); }, price: rm0(cur.price), styleNote: other ? `${other.style === "build" ? "Build in" : "Classic"} ${rm0(other.price)}` : "", border: on ? "#111111" : "#E7E7E2", ring: on ? "inset 0 0 0 1px #111111" : "none", bg: on ? "#FFEBD9" : "#FFFFFF", radio: on ? "2px solid #111111" : "1.5px solid #D2D2CB", dot: on ? "#111111" : "transparent", pick: () => { if (!on) this.load(cur.id); } };
      }) : [],
      styleSub: "Pick the look to show the client. Furniture and price follow the room type.",
      docSrc: step === 5 && pkg ? this.docHtml(false).replace("</head>", `<style>@media screen{html{background:#F2F2EF;color-scheme:light}body{width:210mm!important;min-height:297mm;box-sizing:border-box;padding:14mm!important;margin:24px auto!important;background:#fff;box-shadow:0 2px 12px rgba(30,43,39,.14)}}</style></head>`) : "",
      docRef: this._docRef || (this._docRef = el => { if (el && !el._fit) { el._fit = true; el.addEventListener("load", () => this._fitDoc({ currentTarget: el })); } }),
      _fitDocSet: (this._fitDoc = e => { try { const f = e.currentTarget, de = f.contentDocument.documentElement; de.style.zoom = 1; const h = de.scrollHeight; const s = Math.min(1, f.clientWidth / (de.scrollWidth + 8)); de.style.zoom = s; f.style.height = Math.ceil(h * s + 4) + "px"; } catch (x) {} }),
      ...this.styleStep(group, byId, style),
      styleOpts: group ? [["classic", "Classic"], ["build", "Build in"]].filter(([k]) => group[k]).map(([k, label]) => {
        const p = byId(group[k]), on = style === k;
        return { label, price: rm0(p.price), items: bedItems(p), border: on ? "#111111" : "#E7E7E2", ring: on ? "inset 0 0 0 1px #111111" : "none", bg: on ? "#FFEBD9" : "#FFFFFF", ink: on ? "#111111" : "#1F1F1C", pick: () => { if (!on) { this.load(group[k], data, true); this.flash(`${label} bedrooms · other changes kept`); } } };
      }) : [],
      pkgName: pkg ? (pkg.groupLabel ? [pkg.groupLabel, this.lib.versionWord(data?.packages, pkg)].filter(Boolean).join(" · ") : title(pkg.name)) : "", pkgPriceText: pkg ? rm(pkg.price) : "",
      catViews, catGroups, catGroupsShown, czTabs,
      discount: st.discount, onDiscount: e => this.setState({ discount: e.target.value.replace(/[^\d.]/g, "") }),
      totalText: rm(total), totalBare: money(total), changesText: signed(changeSell), changeCount: nChanges === 0 ? "no changes" : `${nChanges} change${nChanges === 1 ? "" : "s"}`,
      hasChanges: nChanges > 0,
      changeList: changes.map(x => { const im = this.imgFor(x.l); return { img: im, cursor: im ? "zoom-in" : "default", tip: im ? "View picture" : "", view: () => { if (!im) return; const zl = changes.map(y => { const i2 = this.imgFor(y.l); return i2 ? { img: i2, name: title(y.l.name), code: y.l.code || "", delta: signed(y.d), item: null } : null; }).filter(Boolean); this.openZoom(zl, zl.findIndex(z => z.img === im)); }, title: title(x.l.name), note: x.tag + (x.l.code ? ` · ${x.l.code}` : "") + (x.l.qty > 0 ? ` · qty ${x.l.qty}` : ""), delta: signed(x.d), ink: x.d > 0 ? "#1F1F1C" : "#2F6B47" }; }),
      primary,
      draftsOpen: !!st.draftsOpen, toggleDrafts: () => this.setState(s => ({ draftsOpen: !s.draftsOpen, armDraft: null })), saveDraft: () => this.saveDraft(),
      draftBadge: st.draftId ? "Draft · saved " + new Date(st.draftAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
      ...(() => { const ds = this.drafts(); return { draftCount: ds.length || false, noDrafts: !ds.length,
        newQuote: this._newQuote = () => { this.setState({ draftId: null, draftAt: null, draftsOpen: false, step: 1, cust: { att: "", bill: "", building: "", unit: "", date: todayIso(), by: st.cust.by }, crm: {}, crmId: null, extra: {}, sigs: {}, discount: "", withMood: false, selOpen: null }); const g = st.data && st.data.groups[0]; if (g) this.load(g.classic || g.build);  },
        homeList: (st.homeAll ? ds : ds.slice(0, 4)).map(d => ({ name: d.name, total: rm0(d.total || 0), meta: [d.room, "Step " + (d.s.step || 1) + "/5", new Date(d.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })].filter(Boolean).join(" · "), open: () => this.openDraft(d), delIcon: st.armDraft === d.id ? "Delete?" : "✕", remove: () => { if (st.armDraft !== d.id) { this.setState({ armDraft: d.id }); return; } irqStorage.setItem(this.draftKey(), JSON.stringify(this.drafts().filter(x => x.id !== d.id))); this.setState({ armDraft: null }); } })), homeMore: ds.length > 4 ? { label: st.homeAll ? "Show less" : "See all " + ds.length, toggle: () => this.setState(z => ({ homeAll: !z.homeAll })) } : false, homeDraftN: ds.length + (ds.length === 1 ? " draft" : " drafts"), homeHello: "Hi, " + ((this.wsMod && this.wsMod.currentUser().name) || "there"), draftList: ds.map(d => ({ ini: String(d.name || "?").split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase(), room: d.room || "", when: new Date(d.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), bars: [1, 2, 3, 4, 5].map(k => ({ bg: k <= (d.s.step || 1) ? "#F5871F" : "#E7E7E2" })), delIcon: st.armDraft === d.id ? "Delete?" : "✕", name: d.name, total: rm0(d.total || 0), sub: [d.room, "Step " + (d.s.step || 1), new Date(d.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · "), bg: d.id === st.draftId ? "#FFEBD9" : "transparent",
          open: () => this.openDraft(d), delLabel: st.armDraft === d.id ? "Delete?" : "Delete",
          remove: () => { if (st.armDraft !== d.id) { this.setState({ armDraft: d.id }); return; } irqStorage.setItem(this.draftKey(), JSON.stringify(this.drafts().filter(x => x.id !== d.id))); this.setState(s => ({ armDraft: null, ...(s.draftId === d.id ? { draftId: null, draftAt: null } : {}) })); } })) }; })(),
      exportsDesk: [
        { label: "Save draft", sub: "", d: ICON.doc, run: () => this.saveDraft() },
        { label: "Download PDF", sub: "A4 · company letterhead", d: ICON.doc, run: () => this.exportPdf() },
        { label: "Excel", sub: "", d: ICON.download, run: () => this.exportExcel() },
        { label: "Share", sub: "WhatsApp or email summary", d: ICON.chat, run: () => this.share() },
        { label: "Copy text", sub: "", d: ICON.copy, run: () => this.copy() }
      ],
      doPdf: () => this.exportPdf(), doExcel: () => this.exportExcel(), doShare: () => this.share(),
      co: co || { name: "", reg: "", addr: [], phone: "", email: "", terms: [] },
      docFacts: pkg ? this.facts(pkg) : [], docCats, docSums, showPrices: show,
      docCols: show ? "28px minmax(120px,2fr) minmax(70px,1fr) minmax(70px,1fr) 36px 80px 90px" : "28px minmax(140px,2.4fr) minmax(80px,1fr) minmax(80px,1fr) 40px",
      sheetOpen: !!st.sheet && !!pkg, ...((() => { const o = !!st.sheet && !!pkg; setTimeout(() => { this._sheetWasOpen = o; }, 400); return {}; })()), closeSheet: () => this.setState({ sheet: null }), sheet, options: hideOpts ? [] : options, noOptions: !!st.sheet && !hideOpts && options.length === 0,
      sheetAlign: desk ? "flex-end" : "stretch", sheetTop: desk ? "60px" : "0", sheetDim: desk ? "transparent" : "rgba(20,20,18,0.18)", sheetPass: desk ? "none" : "auto",
      sheetW: desk ? "400px" : "auto", sheetH: desk ? "100%" : "auto", sheetMax: desk ? "none" : "86%", sheetRadius: desk ? "0" : "28px 28px 0 0",
      sheetAnim: desk ? (this._sheetWasOpen ? "none" : "rvPanelIn .34s cubic-bezier(.2,.8,.2,1)") : "rvSheetUp .32s cubic-bezier(.2,.8,.2,1)",
      staleText: (() => { const t = st.catalog?.syncedAt; if (!st.catalog) return ""; const d = t ? Math.floor((Date.now() - t) / 86400000) : null; return d == null ? "⚠ Prices may be outdated" : d >= 7 ? `⚠ Checked ${d}d ago` : ""; })(),
      isPreview: !!this.preview, closePreview: () => { try { window.close(); } catch (e) {} this.props.onClosePreview && this.props.onClosePreview(); },
      q: st.q, onQuery: e => this.setState({ q: e.target.value }),
      ...(() => { if (!st.sheet || !st.catalog || !pkg) return { sheetTabs: [], colListOn: false, colList: [], colBack: false, hasCols: false, colSel: false, colChips: [], hasClrs: false, clrChips: [], colAll: false };
        let ks; if (st.sheet.mode === "swap") { const l = st.lines.find(x => x.id === st.sheet.id); ks = l ? [l.kind] : []; } else { const c = pkg.cats[st.sheet.ci]; ks = c ? c.items.map(i => i.kind) : []; }
        const cs = [...new Set(st.catalog.items.filter(it => ks.includes(it.kind) && it.collection && it.cost != null && !it.noPrice && !it.paused && !(kinds[it.kind] || {}).paused).map(it => it.collection))].sort();
        const chip = (v, label) => { const on = (st.col || "") === v; return { label, bg: on ? "#1F1F1C" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C", border: on ? "#1F1F1C" : "#DEDED8", pick: () => this.setState({ col: v }) }; };
        const pool = st.catalog.items.filter(it => ks.includes(it.kind) && it.cost != null && !it.noPrice && !it.paused && !(kinds[it.kind] || {}).paused && (!(st.sheetView === "col" && st.col) || it.collection === st.col));
        const clrs = [...new Set(pool.flatMap(it => String(it.color || "").split(/\s*,\s*/).filter(Boolean)))].sort();
        const cchip = (v, label) => { const on = (st.clr || "") === v; return { label, bg: on ? "#1F1F1C" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C", border: on ? "#1F1F1C" : "#DEDED8", pick: () => this.setState({ clr: v }) }; };
        const plan = st.col ? this.collectionPlan(st.col) : [];
        const base = st.catalog.items.filter(it => ks.includes(it.kind) && it.collection && it.cost != null && !it.noPrice && !it.paused && !(kinds[it.kind] || {}).paused), cnt = {}; base.forEach(it => { cnt[it.collection] = (cnt[it.collection] || 0) + 1; });
        const curL = st.sheet.mode === "swap" ? st.lines.find(x => x.id === st.sheet.id) : null, curIt = curL && st.catalog.items.find(c => (c.code && c.code === curL.code) || c.name === curL.name), curCol = curIt && curIt.collection;
        const short = c => c.replace(/^.* · /, "");
        const colSel = { value: st.col || "", on: !!st.col, border: st.col ? "#1F1F1C" : "#DEDED8", bg: st.col ? "#F2F2EF" : "#FFFFFF",
          opts: [{ v: "", l: `All collections (${cs.length})` }, ...cs.map(c => ({ v: c, l: `${short(c)} · ${cnt[c]} item${cnt[c] === 1 ? "" : "s"}` }))],
          onChange: e => this.setState({ col: e.target.value, clr: "" }), clear: () => this.setState({ col: "", clr: "" }),
          same: curCol && st.col !== curCol && cs.includes(curCol) ? { label: "Same as current · " + short(curCol), pick: () => this.setState({ col: curCol, clr: "" }) } : false };
        const colView = st.sheetView === "col", ecol = colView ? st.col || "" : "";
        const kl = st.sheet.mode === "swap" ? ((kinds[ks[0]] || {}).label || "items") : "items", plural = /s$/i.test(kl) ? kl : kl + "s";
        const lc = s => /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
        const tab = (k, label) => { const on = (st.sheetView || "cat") === k; return { label, bg: on ? "#FFFFFF" : "transparent", ink: on ? "#111111" : "#6B6B66", shadow: on ? "0 1px 3px rgba(20,20,18,.14)" : "none", pick: () => this.setState({ sheetView: k, col: "", clr: "", q: "" }) }; };
        const mins = {}, imgs = {}; base.forEach(it => { const c = it.collection; if (mins[c] == null || it.cost < mins[c]) mins[c] = it.cost; if (!imgs[c] && it.img) imgs[c] = it.img; });
        const colOrder = [...cs].sort((a, b) => (b === curCol) - (a === curCol) || a.localeCompare(b));
        const extra = { sheetTabs: [tab("cat", "All " + lc(plural)), tab("col", "By collection")],
          colListOn: colView && !st.col, colList: colOrder.map(c => ({ name: short(c), img: imgs[c] || "", cur: c === curCol, sub: `${cnt[c]} ${cnt[c] === 1 ? lc(kl) : lc(plural)} · from ${rm0(mins[c] * m)}`, pick: () => this.setState({ col: c, clr: "" }) })),
          colBack: colView && st.col ? { name: short(st.col), count: cnt[st.col] ? `${cnt[st.col]} item${cnt[st.col] === 1 ? "" : "s"}` : "", run: () => this.setState({ col: "", clr: "" }) } : false };
        return { ...extra, hasCols: cs.length > 0, colSel, colChips: [chip("", "All"), ...cs.map(c => chip(c, short(c)))], hasClrs: clrs.length > 0 && !(st.sheetView === "col" && !st.col), clrChips: [cchip("", "All"), ...clrs.map(c => cchip(c, c))],
          colAll: plan.length && st.sheetView === "col" ? { label: `Use ${st.col.replace(/^.* · /, "")} for the whole home`, sub: `Switches ${plan.length} matching item${plan.length === 1 ? "" : "s"} to this collection · price updates`, run: () => this.applyCollection(st.col) } : false }; })(),
      custom: cu,
      onCustomCode: e => { const v = e.target.value; this.setState(s => ({ custom: { ...s.custom, code: v } })); },
      onCustomName: e => { const v = e.target.value; this.setState(s => ({ custom: { ...s.custom, name: v } })); },
      onCustomCost: e => { const v = e.target.value.replace(/[^\d.]/g, ""); this.setState(s => ({ custom: { ...s.custom, cost: v } })); },
      customOpacity: cuOk ? 1 : 0.4,
      customHint: "",
      useCustom: () => { if (cuOk) this.apply({ name: cu.name.trim().toUpperCase(), code: cu.code.trim(), cost: +cu.cost, kind: kindForCustom }); },
      zoom: (() => { const zl = st.zoomList || [], z = zl[st.zoomIdx]; if (!z) return null; const n = zl.length;
        return { ...z, canPick: !!z.item, multi: n > 1, counter: `${st.zoomIdx + 1} / ${n}`, prev: e => { e.stopPropagation(); this.stepZoom(-1); }, next: e => { e.stopPropagation(); this.stepZoom(1); }, stop: e => e.stopPropagation(),
          pick: e => { e.stopPropagation(); const it = z.item; this.setState({ zoomList: null }); this.apply(it); } }; })(),
      plan: st.plan || null, closePlan: () => this.setState({ plan: null }),
      closeZoom: e => { if (e) e.stopPropagation(); this.setState({ zoomList: null }); },
      toast: st.toast, toastBottom: phone ? "96px" : "28px"
    };
  }
}
