import { fileSize } from "@/lib/it-requests/model";

/**
 * A claim's invoice as the member picked it, before it is sent (2026-11-08 — the user: "when upload file invoice in the
 * claim stage, i want it can be view. so that eazy to double confirm before submit"): a photo is shown as itself, a PDF
 * by its pages (pdf.js, drawn on the phone), anything else only by its name.
 */
export type InvoiceKind = "image" | "pdf" | "other";

export function invoiceKind(name: string, type: string): InvoiceKind {
  const mime = type.toLowerCase();
  if (mime === "application/pdf" || (!mime && /\.pdf$/i.test(name))) return "pdf";
  if (mime.startsWith("image/") || (!mime && /\.(jpe?g|png)$/i.test(name))) return "image";
  return "other";
}

/** The line under its name: "PDF · 2 pages · 245 KB", "Photo · 1.2 MB", "File · 3 KB". */
export function invoiceMeta(kind: InvoiceKind, bytes: number, pages: number | null = null): string {
  const what = kind === "pdf" ? "PDF" : kind === "image" ? "Photo" : "File";
  const count = kind === "pdf" && pages !== null && pages > 0 ? `${pages} page${pages === 1 ? "" : "s"}` : null;
  return [what, count, fileSize(bytes)].filter(Boolean).join(" · ");
}

/** The viewer's line while a PDF is read: "PDF · page 2 of 3 · 245 KB". */
export function invoicePageMeta(at: number, pages: number, bytes: number): string {
  return ["PDF", `page ${Math.min(Math.max(1, at), pages)} of ${pages}`, fileSize(bytes)].filter(Boolean).join(" · ");
}

/** Whether this browser can draw (a PDF's pages are drawn on a canvas) — not every one can. */
export function canDraw(): boolean {
  try {
    return typeof document !== "undefined" && !!document.createElement("canvas").getContext("2d");
  } catch {
    return false;
  }
}
