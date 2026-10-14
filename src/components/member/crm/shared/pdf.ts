/**
 * PDFs drawn by the CRM itself with pdf.js (the owner, 2026-10-14: a 25-page PDF opened on the iPhone as one page, and
 * turned sideways — an iPhone shows only a PDF's first page inside a page, as a picture; and "pdf 在聊天室有預覽的圖" as
 * WhatsApp's). pdf.js is loaded only when a PDF is shown. A chat's PDF card keeps its first page as a small picture with
 * its page count and size, so the next time the chat opens it shows at once without reading the file again.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");
let lib: Promise<PdfJs> | null = null;
export function pdfjs(): Promise<PdfJs> {
  if (!lib) {
    lib = import("pdfjs-dist").then(m => {
      m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return m;
    });
    lib.catch(() => { lib = null; });
  }
  return lib;
}

export async function openPdf(url: string): Promise<PDFDocumentProxy> {
  const m = await pdfjs();
  // Same-origin cookies go anyway; none to the storage address it redirects to (its CORS answers "*").
  return m.getDocument({ url, withCredentials: false }).promise;
}

/** Draws one page `width` CSS pixels wide (sharp on the phone's screen); its height follows the page. */
export async function drawPage(doc: PDFDocumentProxy, n: number, canvas: HTMLCanvasElement, width: number) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const vp = page.getViewport({ scale: (width / base.width) * dpr });
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  canvas.style.width = `${width}px`; canvas.style.height = `${Math.round(vp.height / dpr)}px`;
  const g = canvas.getContext("2d");
  if (!g) return;
  await page.render({ canvasContext: g, viewport: vp, canvas }).promise;
}

export type PdfFacts = { img: string; pages: number; bytes: number };
const KEY = "crm-pdf-card:";
const pending = new Map<string, Promise<PdfFacts | null>>();

export function cachedFacts(url: string): PdfFacts | null {
  try { const v = localStorage.getItem(KEY + url); return v ? (JSON.parse(v) as PdfFacts) : null; } catch { return null; }
}
function keep(url: string, f: PdfFacts) {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(KEY));
    if (keys.length >= 40) keys.slice(0, keys.length - 39).forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY + url, JSON.stringify(f));
  } catch { /* shown, just not kept */ }
}

/** The PDF's first page as a small JPEG, its page count and its size — read once, then kept on the phone. */
export function pdfFacts(url: string): Promise<PdfFacts | null> {
  const hit = cachedFacts(url);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(url);
  if (!p) {
    p = (async () => {
      const doc = await openPdf(url);
      const canvas = document.createElement("canvas");
      await drawPage(doc, 1, canvas, 260);
      const info = await doc.getDownloadInfo().catch(() => ({ length: 0 }));
      const facts = { img: canvas.toDataURL("image/jpeg", 0.72), pages: doc.numPages, bytes: info.length };
      void doc.loadingTask.destroy();
      keep(url, facts);
      return facts;
    })().catch(() => null);
    pending.set(url, p);
    void p.finally(() => pending.delete(url));
  }
  return p;
}

export const sizeLabel = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 0 ? `${Math.max(1, Math.round(n / 1024))} KB` : "");
