/* eslint-disable */
// @ts-nocheck — ported from the prototype (.design/ir-quote/design_handoff_ir_quote/Workspace.dc.html), kept line for line so the screens behave as it does.
import { DcLogic } from "../dc";
import React from "react";
import * as wsStore from "../lib/workspace-store";
const tc = s => String(s || "").toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
const P = "#111111";
const mb = n => n > 1e9 ? (n / 1e9).toFixed(1) + " GB" : (n / 1e6).toFixed(1) + " MB";
export class WorkspaceLogic extends DcLogic {
  state = { boards: {}, boardId: null, mode: "grid", sel: null, pen: false, penC: "#8A2E1C", drag: null, over: null, present: null, pPen: false, pThumbs: true, picker: null, pickSel: [], linkOpen: false, arm: "", toast: "", narrow: false, rootH: 800, busy: 0, cv: null, pending: 0, savedAt: 0, usage: 0, tagDraft: "", fm: null, fdrag: null, fover: null, renaming: null, tool: "pen", linkQ: "", moreLinked: false, pItems: false };
  rootRef = React.createRef();
  u(src) { const s = String(src || ""); if (!s.startsWith("data:")) return s; this._blobs = this._blobs || new Map(); if (this._blobs.has(s)) return this._blobs.get(s);
    try { const [h, b64] = s.split(","), mime = (h.match(/data:([^;]+)/) || [])[1] || "image/jpeg", bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const url = URL.createObjectURL(new Blob([arr], { type: mime })); this._blobs.set(s, url); return url; } catch (e) { return ""; } }
  componentDidMount() {
    Promise.resolve(wsStore).then(ws => { this.ws = ws; this.loadAll(); }).catch(() => this.flash("Workspace storage unavailable"));
    this.ro = new ResizeObserver(([e]) => { const n = e.contentRect.width < 900, h = Math.round(e.contentRect.height); if (n !== this.state.narrow || Math.abs(h - this.state.rootH) > 4) this.setState({ narrow: n, rootH: h }); });
    if (this.rootRef.current) this.ro.observe(this.rootRef.current);
    this.onKey = e => {
      if (this.state.present != null) { if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); this.go(1); } else if (e.key === "ArrowLeft") this.go(-1); else if (e.key === "Escape") this.closePresent(); }
      else if (e.key === "Escape") this.setState({ sel: null, pen: false, picker: null, fm: null, renaming: null });
    };
    window.addEventListener("keydown", this.onKey);
    this.onUser = () => { this.setState({ sel: null, present: null, picker: null, fm: null, renaming: null }); this.loadAll(); };
    window.addEventListener("irq-user", this.onUser);
    this.onFs = () => { if (!document.fullscreenElement && this.state.present != null && this._fs) { this._fs = false; this.setState({ present: null }); } };
    document.addEventListener("fullscreenchange", this.onFs);
  }
  componentWillUnmount() { this.ro && this.ro.disconnect(); window.removeEventListener("keydown", this.onKey); window.removeEventListener("irq-user", this.onUser); document.removeEventListener("fullscreenchange", this.onFs); window.removeEventListener("pointermove", this.onCvMove); window.removeEventListener("pointerup", this.onCvUp); }
  componentDidUpdate() {}
  key() { return this.props.boardKey || "draft"; }
  pkgs() { return this.props.styles || []; }
  styleStr() { return String(this.props.pkgStyle || "").toLowerCase(); }
  styleWord() { return tc(String(this.props.pkgStyle || "").replace(/\b\d+\s*r\b/gi, "").replace(/\s+/g, " ").trim()); }
  matches(f) { return !!f.style && f.style === this.props.activeStyle; }
  async loadAll() {
    const ws = this.ws, list = await ws.all(), boards = {};
    list.forEach(b => { boards[b.id] = b; });
    // One folder per style (from Quote Settings) + "My collection". Older folders are merged in.
    const styles = this.pkgs();
    if (styles.length) {
      const libs = () => Object.values(boards).filter(b => b.kind === "library");
      const mergeInto = (f, o, prefix) => {
        const map = {};
        (o.sections || []).forEach(sc => { if (!o.images.some(im => im.section === sc.id)) return; const nm = /^images$/i.test(sc.name) && prefix ? prefix : sc.name; let t = f.sections.find(x => x.name === nm); if (!t) { t = { id: ws.newId("s"), name: nm }; f.sections.push(t); } map[sc.id] = t.id; });
        o.images.forEach(im => { let sid = map[im.section]; if (!sid) { let t = f.sections.find(x => x.name === (prefix || "Images")); if (!t) { t = { id: ws.newId("s"), name: prefix || "Images" }; f.sections.push(t); } sid = t.id; } f.images.push({ ...im, section: sid }); });
      };
      styles.forEach((s, i) => {
        const id = "lib:style-" + s.id; let f = boards[id];
        if (!f) { f = ws.blankBoard("library", "style-" + s.id, s.label, []); f.id = id; f.sections = []; f.created = Date.now(); }
        f.style = s.id; f.name = s.label; f.order = i; f.styleFolder = true;
        libs().filter(o => o.id !== id && o.style === s.id).forEach(o => { mergeInto(f, o); delete boards[o.id]; ws.remove(o.id); });
        if (!f.sections.length) f.sections = [{ id: ws.newId("s"), name: "Images" }];
        boards[id] = f; ws.put(f);
      });
      const mid = "lib:mine"; let m = boards[mid];
      if (!m) { m = ws.blankBoard("library", "mine", "My collection", []); m.id = mid; m.sections = []; m.created = Date.now(); }
      m.order = 999; delete m.style; m.mine = true;
      libs().filter(o => o.id !== mid && !(o.styleFolder && styles.some(s => s.id === o.style))).forEach(o => { if (o.images.length) mergeInto(m, o, o.name); delete boards[o.id]; ws.remove(o.id); });
      if (!m.sections.length) m.sections = [{ id: ws.newId("s"), name: "Images" }];
      boards[mid] = m; ws.put(m);
    } else if (!Object.values(boards).some(b => b.kind === "library")) {
      const f = ws.blankBoard("library", "mine", "My collection", []); f.id = "lib:mine"; boards[f.id] = f; ws.put(f);
    }
    Object.values(boards).forEach(b => { if (b.kind !== "library") return; const before = b.sections.length; b.sections = b.sections.filter(s => !(/^new (room|section)$/i.test(s.name) && !b.images.some(i => i.section === s.id))); if (!b.sections.length) b.sections = [{ id: ws.newId("s"), name: "Images" }]; if (b.sections.length !== before) ws.put(b); });
    const cur = this.state.boardId && boards[this.state.boardId];
    const lib = Object.values(boards).filter(b => b.kind === "library").sort((a, c) => (a.order ?? a.created ?? 0) - (c.order ?? c.created ?? 0));
    const pick = cur && cur.kind === "library" && cur.id !== "lib:mine" ? cur : lib.find(f => f.style && f.style === this.props.activeStyle) || lib.find(f => f.id !== "lib:mine") || lib[0];
    this.setState({ boards, boardId: pick ? pick.id : null, sel: null });
    this.refreshUsage();
  }
  refreshUsage() { this.ws && this.ws.usage().then(u => this.setState({ usage: u })); }
  board() { return this.state.boards[this.state.boardId]; }
  edit(fn, id = this.state.boardId) {
    this.setState(s => { if (!s.boards[id]) return null; const b = JSON.parse(JSON.stringify(s.boards[id])); fn(b); b.updated = Date.now(); this.queue(b); return { boards: { ...s.boards, [id]: b }, arm: "" }; });
  }
  queue(b) {
    this._t = this._t || {}; this._q = this._q || new Set();
    clearTimeout(this._t[b.id]); this._q.add(b.id); this.setState({ pending: this._q.size });
    this._t[b.id] = setTimeout(() => { this.ws.put(b).then(() => { this._q.delete(b.id); this.setState({ pending: this._q.size, savedAt: Date.now() }); clearTimeout(this._ut); this._ut = setTimeout(() => this.refreshUsage(), 800); }).catch(() => this.flash("Could not save · storage full?")); }, 300);
  }
  editImg(id, fn) { this.edit(b => { const im = b.images.find(x => x.id === id); if (im) fn(im, b); }); }
  flash(t) { this.setState({ toast: t }); clearTimeout(this._ft); this._ft = setTimeout(() => this.setState({ toast: "" }), 2400); }
  arm(k, fn) { if (this.state.arm === k) { this.setState({ arm: "" }); fn(); } else this.setState({ arm: k }); }
  async addFiles(files, secId) {
    const list = [...(files || [])].filter(f => /^image\//.test(f.type)); if (!list.length || !this.ws) return;
    this.setState(s => ({ busy: s.busy + list.length }));
    let ok = 0;
    for (const f of list) {
      try {
        const r = await this.ws.fileToImage(f), title = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
        this.edit(b => { const sid = secId && b.sections.some(x => x.id === secId) ? secId : (b.sections[0] || {}).id; b.images.push({ id: this.ws.newId("i"), ...r, title, note: "", section: sid, items: [], marks: [], inPdf: true }); });
        ok++;
      } catch (e) { this.flash("Could not read " + f.name); }
      this.setState(s => ({ busy: s.busy - 1 }));
    }
    if (ok) this.flash(ok + (ok === 1 ? " image added" : " images added"));
  }
  ordered(b) { if (!b) return []; const known = new Set(b.sections.map(s => s.id)); return [...b.sections.flatMap(s => b.images.filter(i => i.section === s.id)), ...b.images.filter(i => !known.has(i.section))]; }
  move(id, sec, before) {
    if (id === before) return;
    this.edit(b => {
      const i = b.images.findIndex(x => x.id === id); if (i < 0) return;
      const [im] = b.images.splice(i, 1); im.section = sec;
      let at = before ? b.images.findIndex(x => x.id === before) : -1;
      if (at < 0) { const last = b.images.map(x => x.section).lastIndexOf(sec); at = last < 0 ? b.images.length : last + 1; }
      b.images.splice(at, 0, im);
    });
  }
  copyTo(list, tgt) {
    if (!tgt || !list.length) return;
    this.edit(x => { list.forEach(im => { const cp = { ...JSON.parse(JSON.stringify(im)), id: this.ws.newId("i"), section: x.sections[0] && x.sections[0].id, inPdf: true }; delete cp.cx; delete cp.cy; delete cp.cw; x.images.push(cp); }); }, tgt.id);
  }
  penDown(imgId, e) {
    e.preventDefault(); e.stopPropagation();
    const el = e.currentTarget; try { el.setPointerCapture(e.pointerId); } catch (_) {}
    const r = el.getBoundingClientRect();
    if (this.state.tool === "erase") { this.cur = { erase: true, imgId, r }; this.eraseAt(imgId, e, r); return; }
    this.cur = { imgId, r, c: this.state.penC, pts: [this.pt(e, r)] }; this.forceUpdate();
  }
  eraseAt(imgId, e, r) {
    const [x, y] = this.pt(e, r), R = 16;
    const b = this.board(), im = b && b.images.find(z => z.id === imgId); if (!im || !(im.marks || []).length) return;
    const hit = m => m.pts.some(p => Math.hypot((p[0] - x) * r.width, (p[1] - y) * r.height) < R);
    if (im.marks.some(hit)) this.editImg(imgId, z => { z.marks = (z.marks || []).filter(m => !hit(m)); });
  }
  flush() {
    const ids = [...(this._q || [])]; ids.forEach(id => { clearTimeout(this._t[id]); const b = this.state.boards[id]; if (b) this.ws.put(b).then(() => { this._q.delete(id); this.setState({ pending: this._q.size, savedAt: Date.now() }); }); });
    if (!ids.length) this.setState({ savedAt: Date.now() });
    this.flash("Saved");
  }
  pt(e, r) { return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; }
  penMove = e => { if (!this.cur) return; if (this.cur.erase) { this.eraseAt(this.cur.imgId, e, this.cur.r); return; } this.cur.pts.push(this.pt(e, this.cur.r)); this.forceUpdate(); };
  penUp = e => { if (e) e.stopPropagation(); const c = this.cur; this.cur = null; if (c && c.erase) return; if (c && c.pts.length > 1) this.editImg(c.imgId, im => { im.marks = [...(im.marks || []), { c: c.c, pts: c.pts.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]) }]; }); else this.forceUpdate(); };
  marksEl(im) {
    const ms = [...(im.marks || []), ...(this.cur && !this.cur.erase && this.cur.imgId === im.id ? [this.cur] : [])];
    if (!ms.length) return null;
    const sw = Math.max(im.w, im.h) * 0.006;
    return React.createElement("svg", { viewBox: `0 0 ${im.w} ${im.h}`, preserveAspectRatio: "none", style: { position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" } },
      ms.map((m, k) => React.createElement("polyline", { key: k, points: m.pts.map(p => (p[0] * im.w).toFixed(1) + "," + (p[1] * im.h).toFixed(1)).join(" "), fill: "none", stroke: m.c, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" })));
  }
  pos(im, i) { return im.cx != null ? { cx: im.cx, cy: im.cy, cw: im.cw || 260 } : { cx: 32 + (i % 5) * 290, cy: 32 + Math.floor(i / 5) * 280, cw: 250 }; }
  cvDown(id, kind, e) {
    e.stopPropagation(); e.preventDefault();
    const b = this.board(), i = b.images.findIndex(x => x.id === id); if (i < 0) return;
    this.cvd = { id, kind, x0: e.clientX, y0: e.clientY, p: this.pos(b.images[i], i), moved: false };
    window.addEventListener("pointermove", this.onCvMove); window.addEventListener("pointerup", this.onCvUp);
  }
  onCvMove = e => {
    const d = this.cvd; if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0; if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true; if (!d.moved) return;
    const np = d.kind === "move" ? { ...d.p, cx: Math.max(0, d.p.cx + dx), cy: Math.max(0, d.p.cy + dy) } : { ...d.p, cw: Math.max(120, Math.min(900, d.p.cw + dx)) };
    this.setState({ cv: { id: d.id, ...np } });
  };
  onCvUp = () => {
    window.removeEventListener("pointermove", this.onCvMove); window.removeEventListener("pointerup", this.onCvUp);
    const d = this.cvd, cv = this.state.cv; this.cvd = null;
    if (d && d.moved && cv) this.editImg(d.id, im => { im.cx = cv.cx; im.cy = cv.cy; im.cw = cv.cw; im.z = Date.now(); });
    else if (d && d.kind === "move") this.setState({ sel: d.id, linkOpen: false });
    this.setState({ cv: null });
  };
  moveToBoard(imgId, tgtId) {
    const src = this.board(), tgt = this.state.boards[tgtId]; if (!src || !tgt || src.id === tgtId) return;
    const im = src.images.find(x => x.id === imgId); if (!im) return;
    this.copyTo([im], tgt); this.edit(x => { x.images = x.images.filter(z => z.id !== imgId); }, src.id);
    if (this.state.sel === imgId) this.setState({ sel: null });
    this.flash("Moved to " + (tgt.name || "folder"));
  }
  reorderFolders(ids) { ids.forEach((id, i) => { const f = this.state.boards[id]; if (f && f.order !== i) this.edit(x => { x.order = i; }, id); }); }
  deleteFolder(id) {
    const f = this.state.boards[id]; if (!f) return;
    this.ws.remove(id);
    this.setState(s => { const boards = { ...s.boards }; delete boards[id]; return { boards, fm: null, arm: "", boardId: s.boardId === id ? "q:" + this.key() : s.boardId, sel: s.boardId === id ? null : s.sel }; });
    this.flash("Deleted " + (f.name || "folder"));
  }
  dupFolder(id, ord) {
    const f = this.state.boards[id]; if (!f) return;
    const cp = JSON.parse(JSON.stringify(f)); cp.id = "lib:" + this.ws.newId(""); cp.name = (f.name || "Folder") + " copy"; cp.created = Date.now(); cp.order = ord + 0.5;
    cp.images.forEach(im => { im.id = this.ws.newId("i"); });
    this.setState(s => ({ boards: { ...s.boards, [cp.id]: cp }, fm: null })); this.ws.put(cp);
    setTimeout(() => this.reorderFolders(this.libs().map(x => x.id)), 0);
  }
  libs() { return Object.values(this.state.boards).filter(x => x.kind === "library" && x.id !== "lib:mine").sort((a, c) => (a.order ?? a.created ?? 0) - (c.order ?? c.created ?? 0) || (a.created || 0) - (c.created || 0)); }
  present(i) {
    const n = this.ordered(this.board()).length; if (!n) { this.flash("Add images first"); return; }
    this.setState({ present: Math.max(0, Math.min(n - 1, i || 0)), pPen: false, sel: null, pen: false });
    const el = this.rootRef.current;
    try { if (el && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().then(() => { this._fs = true; }).catch(() => {}); } catch (_) {}
  }
  closePresent() { this._fs = false; this.setState({ present: null, pPen: false }); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  go(d) { const n = this.ordered(this.board()).length; if (n) this.setState(s => ({ present: (s.present + d + n) % n })); }
  async share() {
    const b = this.board(), imgs = this.ordered(b); if (!imgs.length) { this.flash("Add images first"); return; }
    const text = [`${b.name} · Design board`, ...b.sections.map(s => { const n = imgs.filter(i => i.section === s.id); return n.length ? `• ${s.name}: ${n.map(i => i.title || "Image").join(", ")}` : ""; }).filter(Boolean)].join("\n");
    try {
      const files = await Promise.all(imgs.slice(0, 12).map(async (i, k) => new File([await (await fetch(i.src)).blob()], `${String(i.title || "design " + (k + 1)).replace(/[^\w\- ]+/g, "").slice(0, 40) || "design"}.jpg`, { type: "image/jpeg" })));
      if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, text, title: b.name }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
    this.flash("WhatsApp opened · attach the images from this board");
  }
  async doBackup() {
    if (!this.ws) return;
    const blob = await this.ws.backup(), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `IR-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.flash("Backup downloaded");
  }
  async doRestore(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f || !this.ws) return;
    try { const n = await this.ws.restore(f); await this.loadAll(); this.flash(`Restored ${n} board${n === 1 ? "" : "s"}`); } catch (err) { this.flash("That file is not a workspace backup"); }
  }
  renderVals() {
    const st = this.state, b = this.board(), narrow = st.narrow;
    const all = Object.values(st.boards), qb = st.boards["q:" + this.key()];
    const libs = this.libs();
    const nav = x => { const on = st.boardId === x.id; return { name: x.name || "Untitled", sub: String(x.images.length), bg: on ? "#FFFFFF" : "transparent", border: on ? "#DEDED8" : "transparent", ink: on ? P : "#34342F", weight: on ? 650 : 550, fill: on ? "#FFEBD9" : "none", match: x.kind === "library" && this.matches(x), pick: () => this.setState({ boardId: x.id, sel: null, picker: null, pen: false, tagDraft: "" }) }; };
    const newBoard = () => { if (!this.ws) return; const nb = this.ws.blankBoard("library", null, "New folder"); this.setState(s => ({ boards: { ...s.boards, [nb.id]: nb }, boardId: nb.id, sel: null })); this.ws.put(nb); };
    const saveText = st.pending ? "Saving…" : st.savedAt ? "All changes saved" : "Saved to your account"; // the prototype: "Saved on this device" — the app keeps the Drive on the server
    const base = {
      rootRef: this.rootRef, wide: !narrow, narrow, narrowBack: narrow && !!this.props.onClose, hasBack: !!this.props.onClose, back: () => this.props.onClose && this.props.onClose(), toast: st.toast, newBoard, stop: e => e.stopPropagation(),
      saveText, saveDot: st.pending ? "#F5871F" : "#2F6B47",
      usageText: "Kept in your account, on every device you sign in on. Back up to keep a copy of your own.", // the prototype counted its IndexedDB here
      doBackup: () => this.doBackup(), doRestore: e => this.doRestore(e),
      saveNow: () => this.flush(), saveBtn: st.pending ? "Save" : "Saved"
    };
    if (!b) return { ...base, loading: true, quoteNav: false, libNav: [], boardChips: [], secs: [], cvItems: [], modes: [], gridMode: false, canvasMode: false, empty: false, sel: false, pv: false, pk: false, isQuote: false, isFolder: false, suggest: false, folderTags: [], boardName: "", stats: "", kindLabel: "" };
    const imgs = this.ordered(b), isQuote = false, linkedPkg = this.pkgs().find(p => p.id === b.style);
    const inPdf = b.images.filter(i => i.inPdf !== false).length;
    const meta = im => [im.note ? "Note" : "", (im.marks || []).length ? "Marked" : ""].filter(Boolean).join(" · ");
    const card = im => ({
      id: im.id, src: this.u(im.src), ratio: `${im.w || 4} / ${im.h || 3}`, ratioNum: ((im.w || 4) / (im.h || 3)).toFixed(4), title: im.title || "Untitled", meta: meta(im), marks: this.marksEl(im), pdf: isQuote && im.inPdf !== false,
      ring: st.sel === im.id ? `0 0 0 2px ${P}` : st.over === im.id ? "0 0 0 2px #F5871F" : "0 1px 2px rgba(20,20,18,.05)", op: st.drag === im.id ? .4 : 1,
      open: () => this.setState({ sel: im.id, linkOpen: false, pen: false, moreLinked: false }), openEdit: e => { e.stopPropagation(); this.setState({ sel: im.id, linkOpen: false, pen: false, moreLinked: false }); },
      ...((armed) => ({ delTxt: armed ? "Delete?" : "", delPad: armed ? "10px" : "0", delBg: armed ? "#8A2E1C" : "rgba(255,255,255,.94)", delInk: armed ? "#FFFFFF" : "#8A2E1C",
        remove: e => { e.stopPropagation(); if (!armed) { this.setState({ arm: "q" + im.id }); return; } this.edit(x => { x.images = x.images.filter(z => z.id !== im.id); }); this.setState({ arm: null, sel: st.sel === im.id ? null : st.sel }); } }))(st.arm === "q" + im.id),
      dragStart: e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", im.id); this.setState({ drag: im.id }); },
      dragOver: e => { e.preventDefault(); e.stopPropagation(); if (st.drag && st.over !== im.id) this.setState({ over: im.id }); },
      drop: e => { e.preventDefault(); e.stopPropagation(); if (st.drag) this.move(st.drag, im.section, im.id); else if (e.dataTransfer.files.length) this.addFiles(e.dataTransfer.files, im.section); this.setState({ drag: null, over: null }); },
      dragEnd: () => this.setState({ drag: null, over: null }),
      presentHere: e => { if (e) e.stopPropagation(); this.present(imgs.findIndex(x => x.id === im.id)); }
    });
    const secs = b.sections.map((s, si) => {
      const list = b.images.filter(i => i.section === s.id);
      return {
        name: s.name, count: String(list.length), imgs: list.map(card), isEmpty: !list.length,
        bg: st.drag ? "#FFFFFF" : "rgba(255,255,255,.55)", border: st.drag ? "#FFC999" : "#E7E7E2",
        onName: e => { const v = e.target.value; this.edit(x => { x.sections[si].name = v; }); },
        onUpload: e => { const f = [...e.target.files]; e.target.value = ""; this.addFiles(f, s.id); },
        dragOver: e => { e.preventDefault(); e.stopPropagation(); },
        drop: e => { e.preventDefault(); e.stopPropagation(); if (st.drag) this.move(st.drag, s.id, null); else if (e.dataTransfer.files.length) this.addFiles(e.dataTransfer.files, s.id); this.setState({ drag: null, over: null }); },
        canDel: !list.length && b.sections.length > 1, del: () => this.edit(x => { x.sections.splice(si, 1); })
      };
    });
    const zs = [...b.images].sort((a, c) => (a.z || 0) - (c.z || 0)).map(x => x.id);
    let cvH = 900;
    const cvItems = b.images.map((im, i) => {
      const p = st.cv && st.cv.id === im.id ? st.cv : this.pos(im, i);
      cvH = Math.max(cvH, p.cy + p.cw * im.h / im.w + 260);
      return { ...card(im), x: p.cx + "px", y: p.cy + "px", w: p.cw + "px", z: String(st.cv && st.cv.id === im.id ? 9999 : zs.indexOf(im.id) + 1),
        shadow: st.sel === im.id ? `0 0 0 2px ${P}, 0 10px 28px rgba(20,20,18,.16)` : "0 6px 20px rgba(20,20,18,.12)",
        down: e => this.cvDown(im.id, "move", e), resize: e => this.cvDown(im.id, "size", e) };
    });
    const selIm = b.images.find(x => x.id === st.sel);
    let sel = false;
    if (selIm) {
      const on = selIm.inPdf !== false, items = this.props.furniture || this.props.items || [], linked = selIm.items || [];
      const seen = new Set();
      sel = {
        ...card(selIm), isQuote: !!linkedPkg, titleV: selIm.title || "", noteV: selIm.note || "", hasMarks: (selIm.marks || []).length > 0,
        onTitle: e => { const v = e.target.value; this.editImg(selIm.id, x => { x.title = v; }); },
        onNote: e => { const v = e.target.value; this.editImg(selIm.id, x => { x.note = v; }); },
        pen: st.pen, penLabel: st.pen ? "Drawing…" : "Draw", penBg: st.pen ? "#FFEBD9" : "#FFFFFF", penBorder: st.pen ? "#FFC999" : "#DEDED8", penInk: st.pen ? "#B35A00" : "#1F1F1C",
        togglePen: () => this.setState({ pen: !st.pen }),
        colors: ["#8A2E1C", "#F5871F", "#111111", "#FFFFFF"].map(c => ({ c, ring: st.penC === c ? "0 0 0 2px #FFFFFF, 0 0 0 4px #1F1F1C" : "inset 0 0 0 1px rgba(0,0,0,.18)", pick: () => this.setState({ penC: c, pen: true }) })),
        undo: () => this.editImg(selIm.id, x => { x.marks = (x.marks || []).slice(0, -1); }), clear: () => this.editImg(selIm.id, x => { x.marks = []; }),
        penDown: e => this.penDown(selIm.id, e), penMove: this.penMove, penUp: this.penUp,
        secChips: b.sections.map(s => { const o = selIm.section === s.id; return { name: s.name, bg: o ? P : "#FFFFFF", ink: o ? "#FFFFFF" : "#34342F", border: o ? P : "#DEDED8", pick: () => this.move(selIm.id, s.id, null) }; }),
        linked: linked.map(x => ({ name: tc(x.name), remove: () => this.editImg(selIm.id, y => { y.items = (y.items || []).filter(z => z.id !== x.id); }) })),
        hasLinked: linked.length > 0, noLinked: !linked.length && !st.linkOpen, linkOpen: st.linkOpen, linkBtn: st.linkOpen ? "Done" : linked.length ? "Edit" : "+ Link items", toggleLink: () => this.setState({ linkOpen: !st.linkOpen, linkQ: "" }),
        tools: [["pen", "Draw", "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"], ["erase", "Erase", "m7 21-4-4L14 6l6 6-9 9H7Zm0 0h13M9.5 10.5l6 6"]].map(([k, label, d]) => { const o = st.pen && st.tool === k; return { label, d, bg: o ? "#FFFFFF" : "transparent", ink: o ? (k === "erase" ? "#8A2E1C" : "#B35A00") : "#6B6B66", shadow: o ? "0 1px 3px rgba(20,20,18,.14)" : "none", pick: () => this.setState({ pen: !o, tool: k }) }; }),
        showColors: st.pen && st.tool === "pen", toolRing: st.tool === "erase" ? "#8A2E1C" : "#F5871F", cursor: st.tool === "erase" ? "cell" : "crosshair",
        linkCount: linked.length ? " · " + linked.length : "",
        linkQ: st.linkQ, onLinkQ: e => this.setState({ linkQ: e.target.value }),
        showLinked: linked.length > 0 && !st.linkOpen,
        linkedShown: (st.moreLinked ? linked : linked.slice(0, 5)).map((x, k, arr) => ({ name: tc(x.name), line: k < arr.length - 1 ? "1px solid #E7E7E2" : "0", remove: () => this.editImg(selIm.id, y => { y.items = (y.items || []).filter(z => z.id !== x.id); }) })),
        moreLinked: linked.length > 5, moreLabel: st.moreLinked ? "Show less" : `Show all ${linked.length}`, toggleMore: () => this.setState({ moreLinked: !st.moreLinked }),
        noItemsText: items.length ? "No match" : "Open Drive from IR Quote to tick furniture.",
        save: () => { this.flush(); this.setState({ sel: null, pen: false, linkOpen: false }); },
        noItems: !items.length || !items.some(it => it.name && it.name.toLowerCase().includes(st.linkQ.toLowerCase())),
        linkOpts: items.filter(it => it.name && !seen.has(it.name) && seen.add(it.name) && it.name.toLowerCase().includes(st.linkQ.toLowerCase())).map(it => { const o = linked.some(z => z.id === it.id); return { name: tc(it.name), box: o ? P : "#D2D2CB", fill: o ? P : "#FFFFFF", tick: o ? "m5 12 4 4L19 6" : "", pick: () => this.editImg(selIm.id, y => { y.items = o ? (y.items || []).filter(z => z.id !== it.id) : [...(y.items || []), { id: it.id, name: it.name }]; }) }; }),
        pdfTrack: on ? P : "#D2D2CB", pdfKnob: on ? "18px" : "2px", togglePdf: () => this.editImg(selIm.id, x => { x.inPdf = !on; }),
        copyLabel: "Duplicate",
        copy: () => { this.edit(x => { const k = x.images.findIndex(z => z.id === selIm.id); const cp = JSON.parse(JSON.stringify(selIm)); cp.id = this.ws.newId("i"); cp.title = (cp.title || "Image") + " copy"; delete cp.cx; delete cp.cy; x.images.splice(k + 1, 0, cp); }); this.flash("Duplicated"); },
        delLabel: st.arm === "del" + selIm.id ? "Tap again to delete" : "Delete", delBg: st.arm === "del" + selIm.id ? "#F6E1DA" : "transparent",
        del: () => this.arm("del" + selIm.id, () => { this.edit(x => { x.images = x.images.filter(z => z.id !== selIm.id); }); this.setState({ sel: null, pen: false }); }),
        close: () => this.setState({ sel: null, pen: false })
      };
    }
    let pv = false;
    if (st.present != null && imgs.length) {
      const i = Math.min(st.present, imgs.length - 1), im = imgs[i], sec = b.sections.find(s => s.id === im.section);
      const reserve = 76 + (st.pThumbs ? 96 : 0) + (im.note ? 150 : 100);
      const maxH = Math.max(200, st.rootH - reserve);
      pv = {
        board: (b.name || "").toUpperCase(), src: this.u(im.src), ratio: `${im.w || 4} / ${im.h || 3}`, w: `min(100%, ${Math.round(maxH * (im.w || 4) / (im.h || 3))}px)`, marks: this.marksEl(im),
        title: im.title || "", note: im.note || "", hasNote: !!im.note, section: (sec ? sec.name : "").toUpperCase(), counter: `${i + 1} / ${imgs.length}`,
        items: (im.items || []).map(x => ({ name: tc(x.name) })), hasItems: false,
        itemsLabel: "Furniture in this design", itemsCount: String((im.items || []).length), itemsOpen: false, toggleItems: e => { if (e) e.stopPropagation(); this.setState({ pItems: !st.pItems }); },
        toggleErase: () => this.setState({ tool: st.tool === "erase" ? "pen" : "erase" }), eraseBg: st.tool === "erase" ? "#FFFFFF" : "rgba(255,255,255,.1)", eraseInk: st.tool === "erase" ? "#8A2E1C" : "#FFFFFF", cursor: st.tool === "erase" ? "cell" : "crosshair",
        prev: e => { e.stopPropagation(); this.go(-1); }, next: e => { e.stopPropagation(); this.go(1); }, close: () => this.closePresent(),
        pen: st.pPen, togglePen: () => this.setState({ pPen: !st.pPen, tool: "pen", penC: st.penC === "#111111" ? "#F5871F" : st.penC }),
        penBg: st.pPen ? "#F5871F" : "rgba(255,255,255,.1)", penInk: st.pPen ? "#1F1F1C" : "#FFFFFF",
        canUndo: st.pPen && (im.marks || []).length > 0, undo: () => this.editImg(im.id, x => { x.marks = (x.marks || []).slice(0, -1); }),
        penDown: e => this.penDown(im.id, e), penMove: this.penMove, penUp: this.penUp,
        swDown: e => { if (!st.pPen) this.sw = e.clientX; }, swUp: e => { if (this.sw == null) return; const dx = e.clientX - this.sw; this.sw = null; if (dx > 60) this.go(-1); else if (dx < -60) this.go(1); },
        thumbs: st.pThumbs, toggleThumbs: () => this.setState({ pThumbs: !st.pThumbs }),
        thumbList: imgs.map((t, k) => ({ src: this.u(t.src), ring: k === i ? "0 0 0 2px #F5871F" : "none", op: k === i ? 1 : .5, pick: () => this.setState({ present: k }) })),
        chapters: b.sections.filter(s => imgs.some(t => t.section === s.id)).map(s => { const k = imgs.findIndex(t => t.section === s.id), o = im.section === s.id; return { name: s.name, ink: o ? "#FFFFFF" : "rgba(255,255,255,.55)", line: o ? "inset 0 -2px 0 #F5871F" : "none", pick: () => this.setState({ present: k }) }; })
      };
    }
    const fsub = f => `${f.images.length} image${f.images.length === 1 ? "" : "s"}${(f.styles || []).length ? " · " + f.styles.map(tc).join(", ") : ""}`;
    const sortedLibs = [...libs].sort((a, c) => (this.matches(c) ? 1 : 0) - (this.matches(a) ? 1 : 0));
    let pk = false;
    if (st.picker) {
      const f = st.picker.folder && st.boards[st.picker.folder], close = () => this.setState({ picker: null, pickSel: [] });
      const picked = new Set(st.pickSel), fImgs = f ? f.images : [];
      pk = {
        close, atRoot: !f, inFolder: !!f, folder: f ? f.name : "", rootInk: f ? "#6B6B66" : "#1F1F1C",
        root: () => this.setState({ picker: { folder: null }, pickSel: [] }),
        folders: sortedLibs.map(x => ({ name: x.name || "Untitled", sub: fsub(x), match: this.matches(x), border: this.matches(x) ? "#FFC999" : "#E7E7E2", c0: x.images[0] ? this.u(x.images[0].src) : "", c1: x.images[1] ? this.u(x.images[1].src) : "", c2: x.images[2] ? this.u(x.images[2].src) : "", open: () => this.setState({ picker: { folder: x.id }, pickSel: [] }) })),
        folderEmpty: !!f && !fImgs.length,
        imgs: fImgs.map(im => { const o = picked.has(im.id); return { src: this.u(im.src), title: im.title || "Untitled", ring: o ? `0 0 0 3px ${P}` : "inset 0 0 0 1px rgba(20,20,18,.06)", tickBg: o ? P : "rgba(0,0,0,.25)", tick: o ? "m5 12 4 4L19 6" : "", toggle: () => this.setState({ pickSel: o ? st.pickSel.filter(z => z !== im.id) : [...st.pickSel, im.id] }) }; }),
        selAllLabel: fImgs.length && picked.size === fImgs.length ? "Clear selection" : "Select all",
        selAll: () => this.setState({ pickSel: picked.size === fImgs.length ? [] : fImgs.map(x => x.id) }),
        none: !picked.size, addOp: picked.size ? 1 : .4, addLabel: picked.size ? `Add ${picked.size} to this quote` : "Select images",
        add: () => { if (!picked.size || !qb) return; this.copyTo(fImgs.filter(x => picked.has(x.id)), qb); this.flash(`${picked.size} added from ${f.name}`); close(); }
      };
    }
    const matched = libs.filter(l => this.matches(l) && l.images.length);
    const suggest = isQuote && matched.length ? {
      style: this.styleWord() || this.props.pkgStyle,
      folders: matched.map(f => ({ name: f.name, sub: fsub(f), cover: f.images[0] ? this.u(f.images[0].src) : "", browse: () => this.setState({ picker: { folder: f.id }, pickSel: [] }), addAll: () => { this.copyTo(f.images, qb); this.flash(`${f.images.length} added from ${f.name}`); } }))
    } : false;
    const isFolder = !isQuote;
    const addTag = v => { const t = String(v || "").trim().toLowerCase(); if (!t) return; this.edit(x => { x.styles = [...new Set([...(x.styles || []), t])]; }); this.setState({ tagDraft: "" }); };
    return {
      ...base, loading: false,
      quoteNav: false,
      libNav: libs.map((x, i) => {
        const n = nav(x), col = x.color || "#6B6B66", on = st.boardId === x.id, over = st.fover === x.id;
        return { ...n, stroke: col, fill: on ? col + "33" : col + "14", draggable: st.renaming === x.id ? "false" : "true",
          op: st.fdrag === x.id ? .45 : 1, ring: over ? (st.drag ? "0 0 0 2px #F5871F" : "inset 0 2px 0 #111111") : "none",
          bg: over && st.drag ? "#FFF5EC" : n.bg,
          renaming: st.renaming === x.id, notRenaming: st.renaming !== x.id, stop: e => e.stopPropagation(),
          renameDone: e => { const v = e.target.value.trim(); if (v) this.edit(y => { y.name = v; }, x.id); this.setState({ renaming: null }); },
          renameKey: e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") this.setState({ renaming: null }); },
          dragStart: e => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", "folder:" + x.id); this.setState({ fdrag: x.id }); },
          dragOver: e => { if (!st.fdrag && !st.drag) return; e.preventDefault(); e.stopPropagation(); if (st.fover !== x.id) this.setState({ fover: x.id }); },
          dragLeave: () => { if (st.fover === x.id) this.setState({ fover: null }); },
          drop: e => { e.preventDefault(); e.stopPropagation();
            if (st.fdrag && st.fdrag !== x.id) { const ids = libs.map(y => y.id).filter(y => y !== st.fdrag); ids.splice(ids.indexOf(x.id), 0, st.fdrag); this.reorderFolders(ids); }
            else if (st.drag) this.moveToBoard(st.drag, x.id);
            this.setState({ fdrag: null, fover: null, drag: null, over: null }); },
          dragEnd: () => this.setState({ fdrag: null, fover: null }),
          ctx: e => { e.preventDefault(); e.stopPropagation(); this.setState({ fm: { id: x.id, i, x: Math.min(e.clientX, window.innerWidth - 226), y: Math.min(e.clientY, window.innerHeight - 330) }, arm: "" }); }
        };
      }),
      fm: (() => {
        const m = st.fm, f = m && st.boards[m.id]; if (!f) return false;
        const close = () => this.setState({ fm: null, arm: "" }), go = fn => () => { close(); fn(); };
        const idx = libs.findIndex(y => y.id === f.id), mv = d => go(() => { const ids = libs.map(y => y.id); const [z] = ids.splice(idx, 1); ids.splice(idx + d, 0, z); this.reorderFolders(ids); });
        const armed = st.arm === "fdel" + f.id;
        const COLS = [["#6B6B66", "Default"], ["#111111", "Petrol"], ["#F5871F", "Mustard"], ["#8A2E1C", "Brick"], ["#2F6B47", "Green"], ["#4F6AA3", "Blue"], ["#A8577E", "Rose"]];
        return { x: m.x + "px", y: m.y + "px", name: (f.name || "Folder").toUpperCase(), close,
          top: [{ label: "Open", run: go(() => this.setState({ boardId: f.id, sel: null })) }, { label: "Rename", run: go(() => this.setState({ renaming: f.id })) }, { label: "Duplicate", run: () => this.dupFolder(f.id, idx) }],
          colors: COLS.map(([c, label]) => ({ c, label, ring: (f.color || "#6B6B66") === c ? "0 0 0 2px #FFFFFF, 0 0 0 4px #1F1F1C" : "none", pick: () => this.edit(y => { y.color = c; }, f.id) })),
          bottom: [
            { label: "Move up", run: mv(-1), off: idx <= 0, op: idx <= 0 ? .4 : 1, bg: "transparent", ink: "#1F1F1C" },
            { label: "Move down", run: mv(1), off: idx >= libs.length - 1, op: idx >= libs.length - 1 ? .4 : 1, bg: "transparent", ink: "#1F1F1C" },
            { label: armed ? `Delete ${f.images.length} image${f.images.length === 1 ? "" : "s"}? Click again` : "Delete folder", run: () => armed ? this.deleteFolder(f.id) : this.setState({ arm: "fdel" + f.id }), off: false, op: 1, bg: armed ? "#F6E1DA" : "transparent", ink: "#8A2E1C" }
          ] };
      })(),
      boardChips: [...libs].filter(Boolean).map(x => { const n = nav(x); const on = st.boardId === x.id; return { ...n, bg: on ? P : "#FFFFFF", ink: on ? "#FFFFFF" : "#34342F", border: on ? P : "#DEDED8" }; }),
      kindLabel: "DRIVE · FOLDER",
      pkgSel: b.style || "", pkgOpts: [{ id: "", label: "Not linked · my own folder" }, ...this.pkgs().map(p => ({ id: p.id, label: p.label }))],
      onPkg: e => { const v = e.target.value; this.edit(x => { x.style = v || undefined; }); },
      pkgChips: [{ id: "", label: "None" }, ...this.pkgs().map(p => ({ id: p.id, label: p.label }))].map(o => { const on = (b.style || "") === o.id; return { label: o.label, bg: on ? "#111111" : "#FFFFFF", ink: on ? "#FFFFFF" : "#1F1F1C", border: on ? "#111111" : "#DEDED8", pick: () => this.edit(x => { x.style = o.id || undefined; }) }; }),
      linkBorder: linkedPkg ? "#FFC999" : "#E7E7E2", linkBg: linkedPkg ? "#FFF5EC" : "#FFFFFF",
      linkHint: linkedPkg ? `These images show in step 3 when the client picks ${linkedPkg.label}, for every room type. Give each image a title and note so the client knows the room.` : this.pkgs().length ? "Pick a style so these images show in step 3 of the quote." : "Open Drive from IR Quote to link folders to styles.", boardName: b.name || "",
      onBoardName: e => { if (b.styleFolder) return; const v = e.target.value; this.edit(x => { x.name = v; x.renamed = true; }); },
      stats: `${imgs.length} image${imgs.length === 1 ? "" : "s"}${isQuote ? ` · ${inPdf} in PDF` : ""}${st.busy ? ` · adding ${st.busy}…` : ""}`,
      isQuote, isFolder: false, suggest: false,
      folderTags: isFolder ? (b.styles || []).map(t => ({ name: tc(t), remove: () => this.edit(x => { x.styles = (x.styles || []).filter(z => z !== t); }) })) : [],
      tagDraft: st.tagDraft, onTagDraft: e => this.setState({ tagDraft: e.target.value }),
      onTagKey: e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(st.tagDraft); } },
      modes: [["grid", "Board"], ["canvas", "Moodboard"]].map(([k, label]) => { const o = st.mode === k; return { label, bg: o ? "#FFFFFF" : "transparent", ink: o ? "#1F1F1C" : "#6B6B66", shadow: o ? "0 1px 3px rgba(20,20,18,.12)" : "none", pick: () => this.setState({ mode: k }) }; }),
      gridMode: true, canvasMode: false, empty: !imgs.length,
      emptyTitle: isQuote ? "Drop this client's design images here" : `Drop ${b.name || "folder"} images here`,
      onUpload: e => { const f = [...e.target.files]; e.target.value = ""; this.addFiles(f, null); },
      mainOver: e => e.preventDefault(),
      mainDrop: e => { e.preventDefault(); if (!st.drag && e.dataTransfer.files.length) this.addFiles(e.dataTransfer.files, null); this.setState({ drag: null, over: null }); },
      nz: st.narrow ? { secGap: "8px", secPad: "0", secBorder: "0 solid", secBg: "transparent", hPad: "4px 4px 4px 10px", hBg: "#EEEEEA", cardR: "12px", cardBg: "transparent", cardBorder: "0", capPad: "6px 2px 0", capFs: "12.5px", metaD: "none", btn: "28px" } : { secGap: "12px", secPad: "14px 16px 16px", secBorder: "1px solid", secBg: "#FFFFFF", hPad: "0", hBg: "transparent", cardR: "14px", cardBg: "#FFFFFF", cardBorder: "1px solid #E7E7E2", capPad: "9px 11px 10px", capFs: "13.5px", metaD: "block", btn: "34px" },
      galCols: st.narrow ? "1fr 1fr" : "repeat(auto-fill,minmax(min(100%,240px),1fr))", galGap: st.narrow ? "18px 10px" : "28px 18px", galAr: st.narrow ? "1 / 1" : "20 / 19", galHdrPad: st.narrow ? "12px 14px" : "18px 28px", galBodyPad: st.narrow ? "14px 14px 32px" : "24px 28px 40px", galTitle: st.narrow ? "20px" : "24px",
      gridPad: st.narrow ? "14px 14px 40px" : "18px 24px 48px", secs, addSection: () => this.setState({ roomPop: { name: "", files: [] } }),
      roomPop: st.roomPop ? { name: st.roomPop.name, count: st.roomPop.files.length ? st.roomPop.files.length + " photo" + (st.roomPop.files.length === 1 ? "" : "s") + " selected" : "", thumbs: st.roomPop.files.map(f => ({ src: f._url })), ok: !!st.roomPop.name.trim(), okBg: st.roomPop.name.trim() ? "#111111" : "#DEDED8",
        onName: e => { const v = e.target.value; this.setState(s => ({ roomPop: { ...s.roomPop, name: v } })); },
        onFiles: e => { const fs = [...(e.target.files || [])]; e.target.value = ""; fs.forEach(f => { try { f._url = URL.createObjectURL(f); } catch (x) {} }); this.setState(s => ({ roomPop: { ...s.roomPop, files: [...s.roomPop.files, ...fs] } })); },
        close: () => this.setState({ roomPop: null }), stop: e => e.stopPropagation(),
        create: () => { const rp = this.state.roomPop; if (!rp || !rp.name.trim()) return; const id = this.ws.newId("s"); this.edit(x => { x.sections.push({ id, name: rp.name.trim() }); }); this.setState({ roomPop: null }); if (rp.files.length) setTimeout(() => this.addFiles(rp.files, id), 50); } } : false,
      cvItems, cvH: cvH + "px", cvBlank: () => { if (st.sel) this.setState({ sel: null, pen: false }); },
      sel, pv, pk,
      openPicker: () => this.setState({ picker: { folder: null }, pickSel: [] }),
      hdr: st.narrow ? { gap: "6px", wrap: "nowrap", pad: "10px 12px" } : { gap: "10px", wrap: "wrap", pad: "16px 24px" }, shareD: st.narrow ? "none" : "grid",
      gridCols: st.narrow ? "repeat(2,minmax(0,1fr))" : "repeat(auto-fill,minmax(180px,1fr))", wideBlock: st.narrow ? "none" : "block",
      presentAll: () => this.setState({ gal: true, galIdx: {} }), share: () => this.share(),
      gal: st.gal && b ? (() => { const all = this.ordered(b), cards = b.sections.map(sc => ({ sc, ims: b.images.filter(i => i.section === sc.id) })).filter(x => x.ims.length);
        const loose = b.images.filter(i => !b.sections.some(s => s.id === i.section)); if (loose.length) cards.push({ sc: { id: "_", name: "Other" }, ims: loose });
        const total = all.length;
        return { name: b.name || "Drive", count: `${total} photo${total === 1 ? "" : "s"}`, close: () => this.setState({ gal: false }),
          cards: cards.map(({ sc, ims }) => { const n = ims.length, k = Math.min((st.galIdx || {})[sc.id] || 0, n - 1), im = ims[k], step = d => e => { e.stopPropagation(); this.setState(s => ({ galIdx: { ...(s.galIdx || {}), [sc.id]: (k + d + n) % n } })); };
            return { name: /^images$/i.test(sc.name) ? (b.name || "Images") : sc.name, count: `${n} photo${n === 1 ? "" : "s"}`, sub: im.title || "", img: this.u(im.src), multi: n > 1, prev: step(-1), next: step(1), dots: ims.map((_, j) => ({ op: j === k ? 1 : .5 })),
              open: () => { this.setState({ gal: false }); this.present(all.findIndex(x => x.id === im.id)); } }; }) }; })() : false
    };
  }
}
