"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { drawPage, openPdf } from "./pdf";

/**
 * A PDF read in the viewer, every page (the owner, 2026-10-14: "我發送的是 25 頁的 pdf 檔案，手機版打開只看到一頁，並且從
 * 直式的文件變為橫向的文件" — an iPhone shows a PDF inside a page as its first page only). Each page is drawn by pdf.js as
 * it scrolls near, at the screen's width; pinch zooms as on any page. A page counter sits at the bottom.
 */
export function PdfPages({ url }: { url: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [sizes, setSizes] = useState<number[]>([]);
  const [at, setAt] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const width = useRef(0);

  useEffect(() => {
    let on = true, opened: PDFDocumentProxy | null = null;
    setDoc(null); setFailed(false);
    openPdf(url).then(async d => {
      opened = d;
      if (!on) return;
      width.current = Math.min(900, (box.current?.clientWidth ?? 360) - 16);
      // Each page's height at that width, so the list is its full length before a page is drawn.
      const hs: number[] = [];
      for (let n = 1; n <= d.numPages; n++) { const v = (await d.getPage(n)).getViewport({ scale: 1 }); hs.push((v.height / v.width) * width.current); }
      if (on) { setSizes(hs); setDoc(d); }
    }).catch(() => { if (on) setFailed(true); });
    return () => { on = false; void opened?.loadingTask.destroy(); };
  }, [url]);

  const onScroll = () => {
    const el = box.current;
    if (!el || !sizes.length) return;
    let y = el.scrollTop + el.clientHeight / 3, n = 1;
    for (const h of sizes) { y -= h + 10; if (y < 0) break; n++; }
    setAt(Math.min(n, sizes.length));
  };

  return (
    <div ref={box} onScroll={onScroll} style={{ flex: "1", minHeight: 0, overflowY: "auto", background: "#525659", padding: "8px", position: "relative", touchAction: "pan-x pan-y pinch-zoom", WebkitOverflowScrolling: "touch" }}>
      {failed && <p style={{ color: "#fff", textAlign: "center", marginTop: "40px", fontSize: "15px" }}>This PDF could not be opened here. Use Download to open it.</p>}
      {!doc && !failed && <p style={{ color: "#fff", textAlign: "center", marginTop: "40px", fontSize: "15px", opacity: 0.8 }}>Opening…</p>}
      {doc && sizes.map((h, i) => <Page key={i} doc={doc} n={i + 1} width={width.current} height={h} root={box} />)}
      {doc && sizes.length > 1 && (
        <span style={{ position: "sticky", bottom: "calc(var(--safe-bottom, 0px) + 8px)", display: "block", width: "fit-content", margin: "0 auto", padding: "6px 12px", borderRadius: "14px", background: "rgba(0,0,0,.7)", color: "#fff", fontSize: "13px", fontWeight: 600 }}>{at} / {sizes.length}</span>
      )}
    </div>
  );
}

function Page({ doc, n, width, height, root }: { doc: PDFDocumentProxy; n: number; width: number; height: number; root: React.RefObject<HTMLDivElement | null> }) {
  const holder = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (drawn || !holder.current) return;
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting) || !canvas.current) return;
      io.disconnect();
      void drawPage(doc, n, canvas.current, width).then(() => setDrawn(true)).catch(() => {});
    }, { root: root.current, rootMargin: "800px 0px" });
    io.observe(holder.current);
    return () => io.disconnect();
  }, [doc, n, width, drawn, root]);
  return (
    <div ref={holder} style={{ width: `${width}px`, height: `${Math.round(height)}px`, margin: "0 auto 10px", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.4)" }}>
      <canvas ref={canvas} style={{ display: "block" }} />
    </div>
  );
}
