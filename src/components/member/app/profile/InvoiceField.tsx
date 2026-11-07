"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { drawPage, pdfjs } from "@/components/member/crm/shared/pdf";
import { fileTag } from "@/lib/it-requests/model";
import { canDraw, invoiceKind, invoiceMeta } from "@/lib/member/invoice-file";
import { Svg } from "../icons";
import InvoiceViewer from "./InvoiceViewer";
import s from "./profile.module.css";

const CAMERA = "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z";
/** The thumbnail's width in CSS pixels (a PDF's first page is drawn this wide). */
const THUMB_W = 56;

/**
 * A claim's invoice — an air ticket's, an Airbnb stay's, an Other claim's. Nothing picked: *Take a photo or choose a
 * file*. Picked (2026-11-08 — the user: "when upload file invoice in the claim stage, i want it can be view. so that eazy
 * to double confirm before submit"): its photo, or its PDF's first page, beside its name and *PDF · 2 pages · 245 KB*,
 * then **View** — the whole file, full screen (InvoiceViewer) — and **Change**. The phone's own copy: nothing is sent
 * before the claim is.
 */
export default function InvoiceField({ file, fileRef, onFile }: {
  file: File | null;
  fileRef: RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  const kind = file ? invoiceKind(file.name, file.type) : null;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<{ of: File; n: number } | null>(null);
  const [drawn, setDrawn] = useState<File | null>(null);
  const [broken, setBroken] = useState<File | null>(null);
  const [viewing, setViewing] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewBtn = useRef<HTMLButtonElement>(null);

  // A photo: the phone's own address for it, given back when another is picked or the form closes.
  useEffect(() => {
    if (!file || kind !== "image" || typeof URL === "undefined" || !URL.createObjectURL) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => { URL.revokeObjectURL(url); setImageUrl(null); };
  }, [file, kind]);

  // A PDF: its page count, and its first page drawn as the thumbnail — read on the phone by pdf.js.
  useEffect(() => {
    if (!file || kind !== "pdf" || !canDraw()) return;
    let on = true;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const m = await pdfjs();
        const data = new Uint8Array(await file.arrayBuffer());
        if (!on) return;
        task = m.getDocument({ data });
        const doc = await task.promise;
        if (!on) return;
        setPages({ of: file, n: doc.numPages });
        if (canvas.current) {
          await drawPage(doc, 1, canvas.current, THUMB_W);
          if (on) setDrawn(file);
        }
      } catch {
        if (on) setBroken(file);
      } finally {
        void task?.destroy();
        task = null;
      }
    })();
    return () => { on = false; void task?.destroy(); };
  }, [file, kind]);

  const pick = () => fileRef.current?.click();
  const close = () => { setViewing(false); viewBtn.current?.focus(); };
  const input = (
    <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" hidden
      onChange={e => {
        // A picker closed without a file keeps the one already chosen; the same file chosen again is read again.
        const next = e.target.files?.[0];
        if (next) onFile(next);
        e.target.value = "";
      }} />
  );

  if (!file || !kind) {
    return (
      <div className={s.field}><span className={s.fieldLabel}>Invoice</span>
        <button type="button" className={s.upload} onClick={pick}>
          <Svg d={CAMERA} size={24} sw={1.8} stroke="var(--rv-accent)" />
          <span className={s.uploadTitle}>Take a photo or choose a file</span>
          <span className={s.uploadSub}>JPG, PNG or PDF, up to 100 MB</span>
        </button>
        {input}
      </div>
    );
  }

  const viewable = kind !== "other" && broken !== file;
  const pageCount = pages?.of === file ? pages.n : null;
  const showPhoto = kind === "image" && !!imageUrl && broken !== file;
  return (
    <div className={s.field}><span className={s.fieldLabel}>Invoice</span>
      <div className={s.invoicePicked} data-invoice-picked="">
        <button type="button" className={s.invoiceThumb} onClick={() => setViewing(true)} disabled={!viewable} tabIndex={-1} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- the phone's own copy, never a page asset */}
          {showPhoto && <img src={imageUrl} alt="" onError={() => setBroken(file)} />}
          {kind === "pdf" && <canvas ref={canvas} hidden={drawn !== file} />}
          {!showPhoto && drawn !== file && <span className={s.invoiceTag}>{fileTag(file.name, file.type)}</span>}
        </button>
        <span className={s.invoiceText}>
          <span className={s.invoiceName}>{file.name || "Invoice"}</span>
          <span className={s.invoiceMeta}>{invoiceMeta(kind, file.size, pageCount)}</span>
          <span className={s.invoiceBtns}>
            {viewable && <button ref={viewBtn} type="button" className={`${s.invoiceBtn} ${s.invoiceView}`} onClick={() => setViewing(true)} aria-label={`View ${file.name || "the invoice"}`}>View</button>}
            <button type="button" className={s.invoiceBtn} onClick={pick} aria-label="Change the invoice">Change</button>
          </span>
        </span>
      </div>
      {input}
      {viewing && viewable && <InvoiceViewer file={file} kind={kind} imageUrl={imageUrl} onClose={close} />}
    </div>
  );
}
