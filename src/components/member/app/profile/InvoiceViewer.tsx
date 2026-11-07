"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { drawPage, pdfjs } from "@/components/member/crm/shared/pdf";
import { canDraw, invoiceMeta, invoicePageMeta, type InvoiceKind } from "@/lib/member/invoice-file";
import { Svg } from "../icons";
import { useBackStep } from "../useBackStep";
import v from "./invoice-viewer.module.css";

const CLOSE = "M6 6l12 12M18 6 6 18";
/** Its history step's key (useBackStep): the phone's Back closes the viewer, never the form under it. */
export const INVOICE_VIEW_STEP = "rvInvoiceView";

/**
 * The invoice a member picked, full screen, before the claim is sent (2026-11-08 — the user: "when upload file invoice in
 * the claim stage, i want it can be view. so that eazy to double confirm before submit"): × and its name with what it is
 * (*PDF · page 1 of 2 · 245 KB*, *Photo · 1.2 MB*), then the file itself as white pages on sand — a photo as it is, a PDF
 * drawn page by page by pdf.js (as Me's viewer and the CRM's, so a phone shows every page, upright). Nothing is sent: it
 * reads the phone's own copy. Portalled over the request sheet (whose panel moves by transform); the phone's Back closes
 * it, never the form (the side note the user forwarded the same day: Back left the page, and the claim typed in with
 * it — ../useBackStep.ts), as × and Escape do.
 */
export default function InvoiceViewer({ file, kind, imageUrl, onClose }: {
  file: File;
  kind: InvoiceKind;
  /** The photo's own address on the phone (the field's), or null. */
  imageUrl: string | null;
  onClose: () => void;
}) {
  useBackStep(INVOICE_VIEW_STEP, onClose);
  const closeRef = useRef<HTMLButtonElement>(null);
  const latest = useRef(onClose);
  const box = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [heights, setHeights] = useState<number[]>([]);
  const [width, setWidth] = useState(0);
  const [at, setAt] = useState(1);
  const [failed, setFailed] = useState(false);
  useEffect(() => { latest.current = onClose; }, [onClose]);

  // Opened: × takes the focus; Escape (a computer's) closes, before anything under it hears the key.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      latest.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (kind !== "pdf") return;
    let on = true;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        if (!canDraw()) throw new Error("no canvas");
        const m = await pdfjs();
        const data = new Uint8Array(await file.arrayBuffer());
        if (!on) return;
        task = m.getDocument({ data });
        const doc = await task.promise;
        if (!on) return;
        const w = Math.min(900, (box.current?.clientWidth ?? 360) - 28);
        // Each page's height at that width, so the list is its full length before a page is drawn.
        const hs: number[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
          hs.push((vp.height / vp.width) * w);
        }
        if (on) { setWidth(w); setHeights(hs); setPdf(doc); }
      } catch {
        if (on) setFailed(true);
      }
    })();
    return () => { on = false; void task?.destroy(); };
  }, [file, kind]);

  const onScroll = () => {
    const el = box.current;
    if (!el || !heights.length) return;
    let y = el.scrollTop + el.clientHeight / 3;
    let n = 1;
    for (const h of heights) { y -= h + 14; if (y < 0) break; n++; }
    setAt(Math.min(n, heights.length));
  };

  const sub = kind === "pdf" && heights.length ? invoicePageMeta(at, heights.length, file.size) : invoiceMeta(kind, file.size);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={v.overlay} data-revenue-app="" data-invoice-viewer="" role="dialog" aria-modal="true" aria-label={`Invoice · ${file.name}`}>
      <div className={v.head}>
        <button ref={closeRef} type="button" className={v.close} onClick={onClose} aria-label="Close"><Svg d={CLOSE} size={20} sw={2} /></button>
        <div className={v.titles}>
          <span className={v.title}>{file.name || "Invoice"}</span>
          <span className={v.sub}>{sub}</span>
        </div>
      </div>
      <div ref={box} className={v.body} onScroll={onScroll}>
        {kind === "image" ? (
          imageUrl && !failed ? (
            <div className={v.sheet}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the phone's own copy, never a page asset */}
              <img className={v.photo} src={imageUrl} alt={file.name} onError={() => setFailed(true)} />
            </div>
          ) : <p className={v.note}>This photo can&apos;t be shown here. Check the file, or choose it again.</p>
        ) : kind !== "pdf" ? <p className={v.note}>This file can&apos;t be shown here.</p>
          : failed ? <p className={v.note}>This PDF can&apos;t be shown here. Check the file, or choose it again.</p>
          : !pdf ? <p className={v.note}>Opening…</p>
          : heights.map((h, i) => <PdfPage key={i} doc={pdf} n={i + 1} width={width} height={h} root={box} />)}
      </div>
    </div>,
    document.body,
  );
}

/** One page, drawn as it scrolls near (800px ahead). */
function PdfPage({ doc, n, width, height, root }: { doc: PDFDocumentProxy; n: number; width: number; height: number; root: RefObject<HTMLDivElement | null> }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (drawn || !holder.current) return;
    const draw = () => { if (canvas.current) void drawPage(doc, n, canvas.current, width).then(() => setDrawn(true)).catch(() => {}); };
    if (typeof IntersectionObserver === "undefined") { draw(); return; }
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return;
      io.disconnect();
      draw();
    }, { root: root.current, rootMargin: "800px 0px" });
    io.observe(holder.current);
    return () => io.disconnect();
  }, [doc, n, width, drawn, root]);
  return (
    <div ref={holder} className={`${v.sheet} ${v.page}`} style={{ width, height: Math.round(height) }} aria-label={`Page ${n}`}>
      <canvas ref={canvas} />
    </div>
  );
}
