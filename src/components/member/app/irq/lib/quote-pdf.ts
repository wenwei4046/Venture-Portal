"use client";
// IR Quote (2026-11-09 — the user, on an iPhone: "分享出去是文字，不是pdf; 下载成pdf 也是没有的"; asked how, "手机直接生成"):
// the phone makes the quotation's PDF itself. A phone's browser cannot print the hidden frame the computer prints, and a
// shared text is not the quotation. The page is laid out at A4, cut into pages between its rows (a row is never split;
// every page keeps the same column widths), each page drawn as a picture, and the pictures written into a PDF. b2b's
// photos come through this origin (`viaThisOrigin`), or the browser would refuse to draw them.
import { toJpeg } from "html-to-image";
import { viaThisOrigin } from "./b2b-photo";

/** A4 at 96 px per inch, its margins (14 mm, as the printed page has them) and the room inside them. */
export const A4 = { w: 794, h: 1123, margin: 53 };
const INNER_W = A4.w - 2 * A4.margin, INNER_H = A4.h - 2 * A4.margin;

/**
 * Groups rows of these heights into pages of `room`: a row that would cross the foot starts the next page; one taller
 * than a page stands alone. Pure — the arithmetic the PDF pages follow.
 */
export function paginate(heights: readonly number[], room: number): number[][] {
  const pages: number[][] = [];
  let cur: number[] = [], used = 0;
  heights.forEach((h, i) => {
    if (cur.length && used + h > room) { pages.push(cur); cur = []; used = 0; }
    cur.push(i); used += h;
  });
  if (cur.length) pages.push(cur);
  return pages;
}

/** JPEG pictures (one per page, A4 portrait) as a PDF file. Each page is its picture, edge to edge. */
export function jpegsToPdf(pages: readonly { bytes: Uint8Array; w: number; h: number }[]): Blob {
  const parts: BlobPart[] = [], offsets: number[] = [];
  let len = 0;
  const put = (p: string | Uint8Array) => { parts.push(p as BlobPart); len += p.length; }; // strings here are ASCII: one byte a character
  const obj = (n: number, ...body: (string | Uint8Array)[]) => { offsets[n] = len; put(`${n} 0 obj\n`); body.forEach(put); put("\nendobj\n"); };
  const W = 595.28, H = 841.89, n = pages.length;
  put("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(" ")}] >>`);
  pages.forEach((p, i) => {
    const page = 3 + 3 * i, content = page + 1, image = page + 2, draw = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    obj(content, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    obj(image, `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`, p.bytes, "\nendstream");
  });
  const xref = len, count = 3 + 3 * n;
  put(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) put(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

const dataUrlBytes = (url: string) => { const bin = atob(url.slice(url.indexOf(",") + 1)); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

/** The details' measure (quote-doc.ts › FIT_SCRIPT), here: one line each, smaller only as far as it must, down to 72%. */
function fitDetails(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-fit]").forEach(e => {
    let s = parseFloat(e.style.fontSize) || 12; const min = s * 0.72;
    e.style.whiteSpace = "nowrap";
    while (e.scrollWidth > e.clientWidth + 1 && s > min) { s = Math.max(min, s - 0.25); e.style.fontSize = s + "px"; }
    e.style.whiteSpace = "";
  });
}

const imagesReady = (root: HTMLElement) => Promise.all(Array.from(root.querySelectorAll("img")).map(img => img.complete && img.naturalWidth ? undefined : new Promise<void>(done => { img.onload = img.onerror = () => done(); setTimeout(done, 12_000); })));

/** The quotation's HTML (quote-doc.ts › renderDoc) as a PDF file, A4, one picture a page. */
export async function makeQuotePdf(html: string, scale = 2): Promise<Blob> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const src = doc.querySelector("body > table") as HTMLTableElement | null;
  if (!src) throw new Error("No quotation to make a PDF of.");
  src.querySelectorAll("img").forEach(img => img.setAttribute("src", viaThisOrigin(img.getAttribute("src") || "")));
  const stage = document.createElement("div");
  stage.style.cssText = `position:fixed;left:-20000px;top:0;width:${INNER_W}px;background:#ffffff;color:#1C1714;-webkit-text-size-adjust:100%;text-size-adjust:100%`;
  stage.appendChild(document.importNode(src, true));
  document.body.appendChild(stage);
  try {
    const table = stage.querySelector("table") as HTMLTableElement;
    await imagesReady(stage);
    fitDetails(stage);
    const rows = Array.from(table.rows);
    // Every page keeps the full table's column widths: read from the row with a cell per column (the item table's head).
    const widest = rows.reduce<HTMLTableRowElement | null>((a, r) => (Array.from(r.cells).every(c => c.colSpan === 1) && (!a || r.cells.length > a.cells.length) ? r : a), null);
    const cols = widest ? Array.from(widest.cells).map(c => c.getBoundingClientRect().width) : [];
    const pages = paginate(rows.map(r => r.getBoundingClientRect().height), INNER_H);
    const out: { bytes: Uint8Array; w: number; h: number }[] = [];
    for (const idx of pages) {
      const page = document.createElement("div");
      page.style.cssText = `position:fixed;left:-20000px;top:0;width:${A4.w}px;height:${A4.h}px;padding:${A4.margin}px;box-sizing:border-box;background:#ffffff;overflow:hidden`;
      const t = table.cloneNode(false) as HTMLTableElement;
      t.style.tableLayout = cols.length ? "fixed" : "";
      if (cols.length) { const cg = document.createElement("colgroup"); cols.forEach(w => { const c = document.createElement("col"); c.style.width = w + "px"; cg.appendChild(c); }); t.appendChild(cg); }
      const body = document.createElement("tbody");
      idx.forEach(i => body.appendChild(rows[i].cloneNode(true)));
      t.appendChild(body);
      page.appendChild(t);
      document.body.appendChild(page);
      try {
        // The page waits off screen; its picture is drawn from the origin (its own place would draw it outside the picture).
        const url = await toJpeg(page, { pixelRatio: scale, backgroundColor: "#ffffff", quality: 0.9, skipFonts: true, width: A4.w, height: A4.h, style: { position: "static", left: "0", top: "0" } });
        out.push({ bytes: dataUrlBytes(url), w: Math.round(A4.w * scale), h: Math.round(A4.h * scale) });
      } finally {
        page.remove();
      }
    }
    return jpegsToPdf(out);
  } finally {
    stage.remove();
  }
}
