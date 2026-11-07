import { describe, expect, it } from "vitest";
import { canDraw, invoiceKind, invoiceMeta, invoicePageMeta } from "./invoice-file";

// A claim's invoice, shown before it is sent (2026-11-08 — the user: "i want it can be view … double confirm before submit").

describe("invoiceKind", () => {
  it("knows a photo and a PDF by their type, else by their name when the phone gives no type", () => {
    expect(invoiceKind("receipt.jpg", "image/jpeg")).toBe("image");
    expect(invoiceKind("screenshot", "image/png")).toBe("image");
    expect(invoiceKind("ticket.PDF", "application/pdf")).toBe("pdf");
    expect(invoiceKind("ticket.pdf", "")).toBe("pdf");
    expect(invoiceKind("IMG_0042.JPEG", "")).toBe("image");
    expect(invoiceKind("receipt.heic", "")).toBe("other");
    expect(invoiceKind("notes.txt", "text/plain")).toBe("other");
    // A name says nothing once the phone has said what it is.
    expect(invoiceKind("ticket.pdf", "text/plain")).toBe("other");
  });
});

describe("invoiceMeta", () => {
  it("says what it is, its pages once counted, and its size", () => {
    expect(invoiceMeta("pdf", 250_880, 2)).toBe("PDF · 2 pages · 245 KB");
    expect(invoiceMeta("pdf", 250_880, 1)).toBe("PDF · 1 page · 245 KB");
    expect(invoiceMeta("pdf", 250_880)).toBe("PDF · 245 KB");
    expect(invoiceMeta("image", 1_258_291)).toBe("Photo · 1.2 MB");
    expect(invoiceMeta("other", 12)).toBe("File · 1 KB");
  });

  it("the viewer's line counts the page it is on", () => {
    expect(invoicePageMeta(2, 3, 250_880)).toBe("PDF · page 2 of 3 · 245 KB");
    expect(invoicePageMeta(9, 3, 250_880)).toBe("PDF · page 3 of 3 · 245 KB");
    expect(invoicePageMeta(0, 1, 250_880)).toBe("PDF · page 1 of 1 · 245 KB");
  });
});

describe("canDraw", () => {
  it("is false where there is no canvas to draw on (happy-dom has none)", () => {
    expect(canDraw()).toBe(false);
  });
});
