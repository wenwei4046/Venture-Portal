// Design workspace storage (IndexedDB). Boards: "q:<quoteKey>" per quote, "lib:<id>" personal library.
const ST = "boards";
// Prototype accounts: each account has its own workspace database on this device.
const UKEY = "irq.user", LKEY = "irq.users";
const DEFAULT_USERS = [{ id: "william", name: "William" }, { id: "jasmine", name: "Jasmine" }, { id: "kelvin", name: "Kelvin" }];
export function users() { try { const a = JSON.parse(localStorage.getItem(LKEY)); if (Array.isArray(a) && a.length) return a; } catch (_) {} return DEFAULT_USERS.map(x => ({ ...x })); }
export function currentUser() { const id = localStorage.getItem(UKEY), us = users(); return us.find(u => u.id === id) || us[0]; }
export function setUser(id) { if (currentUser().id === id) return; localStorage.setItem(UKEY, id); if (dbp) dbp.then(d => d.close()).catch(() => {}); dbp = null; window.dispatchEvent(new CustomEvent("irq-user", { detail: id })); }
export function addUser(name) { const n = String(name || "").trim(); if (!n) return null; const us = users(); const id = n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 5); us.push({ id, name: n }); localStorage.setItem(LKEY, JSON.stringify(us)); setUser(id); return id; }
const dbName = () => { const u = currentUser(); return u.id === "william" ? "irq-workspace" : "irq-workspace:" + u.id; };
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(dbName(), 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(ST, mode); const s = t.objectStore(ST); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
export const newId = p => p + Math.random().toString(36).slice(2, 9);
export const all = () => tx("readonly", s => s.getAll());
export const get = id => tx("readonly", s => s.get(id));
export const put = b => tx("readwrite", s => s.put(JSON.parse(JSON.stringify(b))));
export const remove = id => tx("readwrite", s => s.delete(id));

export const QUOTE_SECTIONS = ["Living & dining", "Master bedroom", "Bedrooms", "Kitchen & others"];
export function blankBoard(kind, key, name, styles) {
  const secs = (kind === "quote" ? QUOTE_SECTIONS : ["Images"]).map(n => ({ id: newId("s"), name: n }));
  return { id: kind === "quote" ? "q:" + key : "lib:" + (key || newId("")), kind, name, styles: styles || [], sections: secs, images: [], created: Date.now(), updated: Date.now() };
}
export const DEFAULT_FOLDERS = [["classic", "Classic", ["classic"]], ["buildin", "Build in", ["build in"]], ["inspo", "Inspiration", []]];
export async function usage() { try { const e = await navigator.storage.estimate(); return e.usage || 0; } catch (_) { return 0; } }
export async function persist() { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (_) { return false; } }
export async function backup() { const boards = await all(); return new Blob([JSON.stringify({ app: "irq-workspace", v: 1, at: new Date().toISOString(), boards })], { type: "application/json" }); }
export async function restore(file) { const j = JSON.parse(await file.text()); if (!j || !Array.isArray(j.boards)) throw new Error("Not a workspace backup"); for (const b of j.boards) await put(b); return j.boards.length; }
export async function countFor(key) { const b = await get("q:" + key); return b ? b.images.length : 0; }

export function fileToImage(file, max = 1800) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const w = Math.round(im.width * k), h = Math.round(im.height * k);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
        res({ src: c.toDataURL("image/jpeg", 0.86), w, h });
      };
      im.onerror = rej; im.src = fr.result;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}

const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function marksSvg(marks, w, h) {
  if (!marks || !marks.length) return "";
  const p = marks.map(m => `<polyline points="${m.pts.map(q => (q[0] * w).toFixed(1) + "," + (q[1] * h).toFixed(1)).join(" ")}" fill="none" stroke="${m.c}" stroke-width="${Math.max(w, h) * 0.006}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0;width:100%;height:100%">${p}</svg>`;
}

// Drive folders linked to a package (room type + style): { [pkgId]: images[] }
export async function byStyle() { return byField("style"); }
export async function byPackage() { return byField("pkg"); }
async function byField(f) {
  const out = {};
  (await all()).filter(b => b.kind === "library" && b[f]).sort((a, c) => (a.order ?? a.created ?? 0) - (c.order ?? c.created ?? 0)).forEach(b => {
    const known = new Set(b.sections.map(s => s.id));
    const imgs = [...b.sections.flatMap(s => b.images.filter(i => i.section === s.id)), ...b.images.filter(i => !known.has(i.section))];
    out[b[f]] = [...(out[b[f]] || []), ...imgs.map(i => ({ ...i, folder: b.name, sectionName: (b.sections.find(s => s.id === i.section) || {}).name || "" }))];
  });
  return out;
}
export async function pdfHtml(styleId, styleName) {
  const imgs = ((await byStyle())[styleId] || []).filter(i => i.inPdf !== false);
  if (!imgs.length) return "";
  const sec = (id, i) => i.sectionName || "";
  const blocks = imgs.map(i => {
    const wmm = Math.min(180, 150 * i.w / i.h);
    return `<div style="page-break-inside:avoid;break-inside:avoid;margin:0 0 9mm">
      <div style="font:600 8pt Helvetica,Arial,sans-serif;letter-spacing:.12em;color:#777;text-transform:uppercase">${esc(sec(i.section, i))}</div>
      <div style="font:600 12pt Helvetica,Arial,sans-serif;margin:1mm 0 2.5mm">${esc(i.title || "")}</div>
      <div style="position:relative;width:${wmm.toFixed(1)}mm;max-width:100%"><img src="${i.src}" style="display:block;width:100%;height:auto">${marksSvg(i.marks, i.w, i.h)}</div>
      ${i.note ? `<div style="font:10pt/1.45 Helvetica,Arial,sans-serif;color:#333;margin-top:2.5mm;white-space:pre-wrap">${esc(i.note)}</div>` : ""}
      ${(i.items || []).length ? `<div style="font:9pt Helvetica,Arial,sans-serif;color:#555;margin-top:1.5mm">Furniture: ${i.items.map(x => esc(x.name)).join(", ")}</div>` : ""}
    </div>`;
  }).join("");
  return `<div style="page-break-before:always;break-before:page;padding:0"><div style="font:700 14pt Helvetica,Arial,sans-serif;letter-spacing:.18em;text-align:center;margin:0 0 8mm">DESIGN PROPOSAL${styleName ? " · " + esc(String(styleName).toUpperCase()) : ""}</div>${blocks}</div>`;
}
