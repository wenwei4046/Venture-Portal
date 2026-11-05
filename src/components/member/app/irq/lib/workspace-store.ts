/* eslint-disable */
// @ts-nocheck — ported from the prototype; kept as it is so the documents and prices come out the same.
// Design workspace storage. Boards: "q:<quoteKey>" per quote, "lib:<id>" personal library.
// IR Quote in the app (2026-11-05): the prototype kept each account's boards in IndexedDB on the device; here they are
// the signed-in salesperson's own rows (ir_drive_boards, through ../env), read once when the screen opens and kept in
// memory, and a board's pictures go to the app's files before it is saved. The prototype's account switcher is the
// login itself — one account, never another's Drive.
import { irqEnv, uploadPictures } from "../env";
export function users() { return [currentUser()]; }
export function currentUser() { return { id: irqEnv.user.id, name: irqEnv.user.name }; }
export function setUser(_id) {}
export function addUser(_name) { return null; }
const boards = new Map();
const clone = b => JSON.parse(JSON.stringify(b));
export function preloadBoards(list) { boards.clear(); (list || []).forEach(b => { if (b && b.id) boards.set(b.id, b); }); }
export const newId = p => p + Math.random().toString(36).slice(2, 9);
export const all = async () => [...boards.values()].map(clone);
export const get = async id => (boards.has(id) ? clone(boards.get(id)) : undefined);
export const put = async b => {
  const plain = clone(b);
  boards.set(plain.id, plain);
  const kept = await uploadPictures(plain, "drive");
  boards.set(kept.id, kept);
  await irqEnv.saveBoard(kept.id, kept);
  return kept.id;
};
export const remove = async id => { boards.delete(id); await irqEnv.saveBoard(id, null); };

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
