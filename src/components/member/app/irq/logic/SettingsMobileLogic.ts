/* eslint-disable */
// @ts-nocheck — ported from the prototype (.design/ir-quote/design_handoff_ir_quote/Quote Settings Mobile.dc.html), kept line for line so the screens behave as it does.
import { DcLogic } from "../dc";
import React from "react";
import * as quoteDocLib from "../lib/quote-doc";
import { irqStorage } from "../storage";
import seedPackages from "../data/packages.json";
import seedCatalog from "../data/catalog.json";
export class SettingsMobileLogic extends DcLogic {
  state = { cfg: null, saved: "", tab: "rooms", q: "", kind: "all", limit: 40, sheet: null, toast: "", arm: null };
  componentDidUpdate(pp, ps) { if (!this.props.readOnly && this.lib && this.state.cfg && ps.cfg && ps.cfg !== this.state.cfg) this.lib.savePreview(this.state.cfg); }
  componentDidMount() {
    Promise.all([Promise.resolve({ ...quoteDocLib, CRM_FIELDS: this.props.crmFields || quoteDocLib.CRM_FIELDS }), Promise.resolve(seedPackages), Promise.resolve(seedCatalog)])
      .then(([lib, pj, cj]) => { this.lib = lib; const cfg = lib.load(pj, cj, lib.PREVIEW); this.setState({ cfg, saved: JSON.stringify(irqStorage.getItem(lib.PREVIEW) ? lib.load(pj, cj, lib.STORE) : cfg) }); });
  }
  u(src) { const s = String(src || ""); if (!s.startsWith("data:")) return s; this._b = this._b || new Map(); if (this._b.has(s)) return this._b.get(s);
    try { const [h, b] = s.split(","), mime = (h.match(/data:([^;]+)/) || [])[1] || "image/jpeg", bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); const url = URL.createObjectURL(new Blob([a], { type: mime })); this._b.set(s, url); return url; } catch (e) { return ""; } }
  swipe(key, onDel) { const d = this.state.sw && this.state.sw.key === key ? this.state.sw.dx : 0;
    const end = () => { const dx = (this.state.sw || {}).dx || 0; if (dx < -90) { this.setState({ sw: null }); onDel(); } else this.setState({ sw: null }); };
    return { dx: d + "px", tr: this.state.sw && this.state.sw.key === key ? "none" : "transform .2s",
      tStart: e => { this._sx = e.touches[0].clientX; this.setState({ sw: { key, dx: 0 } }); }, tMove: e => { const dx = Math.min(0, e.touches[0].clientX - this._sx); this.setState({ sw: { key, dx } }); }, tEnd: end,
      pDown: e => { if (e.pointerType === "touch") return; this._sx = e.clientX; this.setState({ sw: { key, dx: 0 } }); const mv = ev => this.setState({ sw: { key, dx: Math.min(0, ev.clientX - this._sx) } }); const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); end(); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); } }; }
  upd(fn) { this.setState(s => { const c = JSON.parse(JSON.stringify(s.cfg)); fn(c); this.lib.syncPrices(c); return { cfg: c }; }); }
  flash(t) { this.setState({ toast: t }); clearTimeout(this._t); this._t = setTimeout(() => this.setState({ toast: "" }), 1800); }
  renderVals() {
    const st = this.state, cfg = st.cfg, rm = n => "RM " + Math.round(n).toLocaleString("en-MY");
    const tabDefs = [["rooms", "Room types", "M3 10 12 3l9 7v11H3z"], ["cat", "Catalogue", "M4 6h16M4 12h16M4 18h10"], ["styles", "Styles", "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5"]];
    const base = { back: e => { e && e.preventDefault && e.preventDefault(); this.props.onBack && this.props.onBack(); }, stop: e => e.stopPropagation(), tabs: tabDefs.map(([k, label, d]) => { const on = st.tab === k; return { label, d, bg: on ? "#F5871F" : "transparent", ink: on ? "#111111" : "#6B6B66", w: on ? 700 : 550, pick: () => this.setState({ tab: k, sheet: null }) }; }), toast: st.toast };
    if (!cfg) return { ...base, loading: true, tabQuote: false, hdrD: "flex", tabCat: false, tabRooms: false, tabStyles: false, sheet: false, dirtyText: "", dirtyInk: "#6B6B66", pubBg: "#D2D2CB", publish: () => {} };
    const dirty = JSON.stringify(cfg) !== st.saved, kinds = cfg.catalog.kinds || {};
    const all = cfg.catalog.items, q = st.q.trim().toLowerCase();
    const list = all.filter(it => (st.kind === "all" || it.kind === st.kind) && (!q || (it.name + " " + (it.code || "")).toLowerCase().includes(q)));
    const setItem = (id, fn) => this.upd(c => { const x = c.catalog.items.find(y => y.id === id); if (x) fn(x); });
    const sw = on => ({ track: on ? "#111111" : "#D2D2CB", knob: on ? "18px" : "2px" });
    // sheet
    let sheet = false;
    const close = () => this.setState({ sheet: null, arm: null });
    if (st.sheet && st.sheet.type === "item") { const it = all.find(x => x.id === st.sheet.id); if (it) { const on = !it.paused, s2 = sw(on);
      sheet = { h: "auto", title: it.name, close, item: { img: this.u(it.img), meta: [it.code, (kinds[it.kind] || {}).label].filter(Boolean).join(" · "), price: it.cost == null ? "" : String(it.cost), track: s2.track, knob: on ? "20px" : "2px",
        onPrice: e => { const v = e.target.value.replace(/[^\d.]/g, ""); setItem(it.id, x => { x.cost = v === "" ? null : +v; x.noPrice = v === ""; x.sample = false; }); },
        toggle: () => setItem(it.id, x => { x.paused = !x.paused; }) }, room: false, style: false }; } }
    const groups = {}; cfg.packages.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
    const gList = Object.values(groups).sort((a, b) => { const k = p => [parseInt(p.spec?.beds) || 0, parseInt(p.spec?.baths) || 0]; const [a1, a2] = k(a[0]), [b1, b2] = k(b[0]); return a1 - b1 || a2 - b2; });
    const priceText = ps => ps.map(p => (ps.length < 2 ? "" : p.style === "build" ? "Build in " : "Classic ") + rm(p.price || 0)).join(" · ");
    if (st.sheet && st.sheet.type === "room") { const ps = groups[st.sheet.id]; if (ps) { const photos = (ps[0].spec || {}).photos || [];
      const setPh = arr => this.upd(c => c.packages.filter(p => p.group === st.sheet.id).forEach(p => { p.spec = { ...(p.spec || {}), photos: arr }; }));
      const sp = ps[0].spec || {}, bN = parseInt(sp.beds) || 0, xN = parseInt((String(sp.beds || "").match(/\+\s*(\d+)/) || [])[1]) || 0, plus = xN > 0, bedsStr = (b, x) => b + (x ? "+" + x : ""), tN = parseInt(sp.baths) || 0, rtab = st.rtab || "specs";
      const key = (b, t) => b + "-" + t, taken = k => gList.some(g => g[0].group !== st.sheet.id && key(parseInt(g[0].spec?.beds) || 0, parseInt(g[0].spec?.baths) || 0) === k);
      const setSpec = (beds, baths) => { const b = parseInt(beds) || 0, t = parseInt(baths) || 0; if (b && t && taken(key(b, t))) { this.setState({ warn: b + "R " + t + "R already has a package." }); return; } this.setState({ warn: "" }); this.upd(c => c.packages.filter(p => p.group === st.sheet.id).forEach(p => { p.spec = { ...(p.spec || {}), beds, baths }; if (b && t) { const lab = [b + "R " + t + "R", String((p.spec || {}).note || "").trim()].filter(Boolean).join(" "); p.groupLabel = lab; p.layout = lab; p.name = lab + " " + (p.style === "build" ? "BUILD IN" : "CLASSIC"); } })); };
      const setS = (k, val) => this.upd(c => c.packages.filter(p => p.group === st.sheet.id).forEach(p => { p.spec = { ...(p.spec || {}), [k]: val }; }));
      const ver = ps.find(p => p.id === st.rver) || ps[0];
      sheet = { h: "82vh", title: ps[0].groupLabel || ps[0].name, close, item: false, style: false, pick: false, room: { prices: priceText(ps),
        tabs: [["specs", "Details"], ["items", "Furniture"], ["photos", "Photos"]].map(([k, label]) => { const on = rtab === k; return { label, bg: on ? "#FFFFFF" : "transparent", ink: on ? "#111111" : "#6B6B66", sh: on ? "0 1px 2px rgba(20,20,18,.14)" : "none", pick: () => this.setState({ rtab: k }) }; }),
        onSpecs: rtab === "specs", onItems: rtab === "items", onPhotos: rtab === "photos",
        beds: String(bN), baths: String(tN), sqft: sp.sqft || "", note: sp.note || "", warn: st.warn || "",
        extraN: String(xN), extraDn: () => setSpec(bedsStr(bN || 1, Math.max(0, xN - 1)), sp.baths), extraUp: () => setSpec(bedsStr(bN || 1, Math.min(5, xN + 1)), sp.baths),
        bedDn: () => setSpec(bedsStr(Math.max(1, bN - 1), xN), sp.baths), bedUp: () => setSpec(bedsStr(Math.min(9, bN + 1), xN), sp.baths),
        bathDn: () => setSpec(sp.beds, String(Math.max(1, tN - 1))), bathUp: () => setSpec(sp.beds, String(Math.min(9, tN + 1))),
        onSqft: e => setS("sqft", e.target.value.replace(/[^\d,]/g, "")), onNote: e => setS("note", e.target.value),
        vers: ps.map(p => { const on = p.id === ver.id; return { label: (ps.length < 2 ? "" : (p.style === "build" ? "Build in" : "Classic") + " · ") + rm(p.price || 0), bg: on ? "#FFFFFF" : "transparent", ink: on ? "#111111" : "#6B6B66", pick: () => this.setState({ rver: p.id }) }; }),
        cats: ver.cats.map((c, ci) => ({ c, ci })).filter(x => x.c.items.length || x.c.items.some(i => i.kind) || true).map(({ c, ci }) => ({ name: String(c.name).toUpperCase(), sum: rm(c.items.reduce((a, i) => a + (+i.cost || 0) * (+i.qty || 0), 0)),
          add: () => this.setState({ pick: { pid: ver.id, ci, q: "" } }),
          rows: c.items.map((i, ii) => ({ ...this.swipe(ver.id + ":" + ci + ":" + ii, () => { const removed = JSON.parse(JSON.stringify(i)); this.upd(z => { const p = z.packages.find(x => x.id === ver.id); p.cats[ci].items.splice(ii, 1); }); this.flash("Removed " + i.name); }), name: String(i.name).toLowerCase().replace(/\b\w/g, m => m.toUpperCase()), qty: (+i.qty || 0) > 1 ? "× " + i.qty : "", price: rm((+i.cost || 0) * (+i.qty || 0)) })) })),
        photos: photos.map((src, k) => ({ src: this.u(src), cover: k === 0, notCover: k > 0, remove: () => setPh(photos.filter((_, j) => j !== k)), pin: () => { const a = [...photos]; const [x] = a.splice(k, 1); a.unshift(x); setPh(a); } })),
        onFiles: e => { const fs = [...(e.target.files || [])]; e.target.value = ""; Promise.all(fs.map(f => this.lib.fileToDataUrl(f, 1000))).then(ds => setPh([...photos, ...ds])); } } }; } }
    if (st.sheet && st.sheet.type === "style") { const i = (cfg.styles || []).findIndex(x => x.id === st.sheet.id); if (i >= 0) { const x = cfg.styles[i], set = k => e => { const v = e.target.value; this.upd(c => { c.styles[i][k] = v; }); }, ak = "st" + x.id;
      const photos = x.photos && x.photos.length ? x.photos : (x.cover ? [x.cover] : []), setPh = arr => this.upd(c => { c.styles[i].photos = arr; c.styles[i].cover = arr[0] || ""; });
      sheet = { h: "82vh", title: x.name || "Style", close, item: false, room: false, pick: false, style: { name: x.name || "", desc: x.desc || "",
        photos: photos.map((src, k) => ({ src: this.u(src), cover: k === 0, notCover: k > 0, remove: () => setPh(photos.filter((_, j) => j !== k)), pin: () => { const a = [...photos]; const [y] = a.splice(k, 1); a.unshift(y); setPh(a); } })),
        onFiles: e => { const fs = [...(e.target.files || [])]; e.target.value = ""; Promise.all(fs.map(f => this.lib.fileToDataUrl(f, 1000))).then(ds => setPh([...photos, ...ds])); }, cover: this.u(x.cover), coverLabel: x.cover ? "Change cover" : "Add cover", onName: set("name"), onDesc: set("desc"),
        onCover: e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) this.lib.fileToDataUrl(f, 1000).then(d => this.upd(c => { c.styles[i].cover = d; })); },
        delLabel: st.arm === ak ? "Tap again to delete" : "Delete style", delBg: st.arm === ak ? "#F6E1DA" : "#F7F7F5",
        remove: () => { if (st.arm !== ak) { this.setState({ arm: ak }); return; } this.upd(c => { c.styles.splice(i, 1); }); close(); } } }; } }
    if (st.pick) { const p = cfg.packages.find(x => x.id === st.pick.pid), cat = p && p.cats[st.pick.ci]; if (cat) { const kindsIn = [...new Set(cat.items.map(i => i.kind).filter(Boolean))], q2 = st.pick.q.trim().toLowerCase();
      const pool = all.filter(it => !it.paused && it.cost != null && !it.noPrice && (!kindsIn.length || kindsIn.includes(it.kind)) && (!q2 || (it.name + " " + (it.code || "")).toLowerCase().includes(q2))).slice(0, 60);
      sheet = { h: "82vh", title: "Add to " + cat.name, close: () => this.setState({ pick: null }), item: false, room: false, style: false, pick: { q: st.pick.q, onQ: e => { const v = e.target.value; this.setState(s2 => ({ pick: { ...s2.pick, q: v } })); },
        list: pool.map(it => ({ name: it.name, img: this.u(it.img), price: rm(it.cost), add: () => { this.upd(z => { const pp = z.packages.find(x => x.id === st.pick.pid); pp.cats[st.pick.ci].items.push({ name: it.name, desc: "", code: it.code || "", cost: +it.cost, qty: 1, kind: it.kind }); }); this.setState({ pick: null }); this.flash("Added " + it.name); } })) } }; } }
    return { ...base, loading: false, sheet,
      dirtyText: dirty ? "● Unpublished changes" : "All changes published", dirtyInk: dirty ? "#D96E0B" : "#6B6B66", pubBg: dirty ? "#111111" : "#D2D2CB",
      publish: () => { if (!dirty) return; if (this.props.readOnly) { this.flash("Read-only while viewing as"); return; } this.lib.save(cfg); this.setState({ saved: JSON.stringify(cfg) }); this.flash("Published"); },
      tabCat: st.tab === "cat", tabRooms: st.tab === "rooms", tabStyles: st.tab === "styles", tabQuote: st.tab === "quote", hdrD: st.tab === "quote" ? "none" : "flex",
      q: st.q, onQ: e => this.setState({ q: e.target.value, limit: 40 }),
      kindChips: [["all", "All"], ...Object.entries(kinds).map(([k, v]) => [k, v.label])].map(([k, label]) => { const on = st.kind === k; return { label, bg: on ? "#111111" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C", border: on ? "#111111" : "#DEDED8", pick: () => this.setState({ kind: k, limit: 40 }) }; }),
      catCount: list.length + " items",
      items: list.slice(0, st.limit).map(it => { const on = !it.paused, s2 = sw(on); return { name: it.name, code: it.code || "", img: this.u(it.img), price: it.cost == null || it.noPrice ? "No price" : rm(it.cost), priceInk: it.cost == null || it.noPrice ? "#8A2E1C" : "#1F1F1C", op: on ? 1 : .5, track: s2.track, knob: s2.knob,
        edit: () => this.setState({ sheet: { type: "item", id: it.id } }), toggle: () => setItem(it.id, x => { x.paused = !x.paused; }) }; }),
      noItems: !list.length, more: list.length > st.limit ? { label: `Show more (${list.length - st.limit})`, run: () => this.setState({ limit: st.limit + 40 }) } : false,
      rooms: gList.map(ps => { const ph = (ps[0].spec || {}).photos || []; return { label: ps[0].groupLabel || ps[0].name, prices: priceText(ps), photos: ph.length ? ph.length + " photo" + (ph.length === 1 ? "" : "s") : "No photos yet", cover: this.u(ph[0]), noCover: !ph.length, open: () => this.setState({ sheet: { type: "room", id: ps[0].group }, rtab: "specs", rver: null, warn: "" }) }; }),
      styles: (cfg.styles || []).map(x => ({ name: x.name || "Style", desc: (x.photos && x.photos.length > 1 ? x.photos.length + " photos · " : "") + (x.desc || ""), cover: this.u(x.cover), open: () => this.setState({ sheet: { type: "style", id: x.id }, arm: null }) })),
      addStyle: () => { const id = this.lib.newId("st-"); this.upd(c => { c.styles = [...(c.styles || []), { id, name: "New style", desc: "" }]; }); this.setState({ sheet: { type: "style", id } }); }
    };
  }
}
