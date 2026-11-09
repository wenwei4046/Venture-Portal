import { describe, expect, it, vi } from "vitest";
import { budgetShown, budgetStored, budgetWithRm, propertyType } from "./QuoteLogic";

// IR Quote v10 (2026-11-09): step 1's Budget reads without its "RM" and keeps one; Property type is Landed or Condo.
describe("step 1's Budget", () => {
  it("shows a CRM budget without its RM", () => {
    expect(budgetShown("RM 40k – 50k")).toBe("40k – 50k");
    expect(budgetShown("rm50000")).toBe("50000");
    expect(budgetShown("")).toBe("");
  });

  it("keeps what is typed as \"RM …\", figures only", () => {
    expect(budgetStored("45,000")).toBe("RM 45,000");
    expect(budgetStored("40k – 50k")).toBe("RM 40k – 50k");
    expect(budgetStored("RM 30k")).toBe("RM 30k");
    expect(budgetStored("40k ")).toBe("RM 40k "); // a space being typed stays
    expect(budgetStored("abc")).toBe("");
    expect(budgetStored("")).toBe("");
  });

  it("gives a budget from the CRM exactly one RM", () => {
    expect(budgetWithRm("40k – 50k")).toBe("RM 40k – 50k");
    expect(budgetWithRm("RM 40k")).toBe("RM 40k");
    expect(budgetWithRm("RM40k")).toBe("RM 40k");
    expect(budgetWithRm("")).toBe("");
  });
});

describe("step 1's Property type", () => {
  it("matches the CRM's word whatever its case, and nothing else", () => {
    expect(propertyType("condo")).toBe("Condo");
    expect(propertyType(" LANDED ")).toBe("Landed");
    expect(propertyType("Condo")).toBe("Condo");
    expect(propertyType("Apartment")).toBe("");
    expect(propertyType(null)).toBe("");
  });
});

// The user, 2026-11-09, on a computer: "点下载会导入到print, 但没有下载成功" — Download PDF opened the print screen and saved
// nothing. Every device now downloads the PDF the app makes; a computer saves it the moment it is ready.
describe("Download PDF", async () => {
  const { QuoteLogic } = await import("./QuoteLogic");
  const fake = (touch: boolean) => {
    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    const self = {
      saved: [] as string[], states: [] as Record<string, unknown>[],
      checkReq: () => true, pdfReady: () => null, touch: () => touch, fileBase: () => "Quotation 1R",
      pdfFor: () => Promise.resolve(blob), flash: () => {},
      saveFile(_b: Blob, name: string) { self.saved.push(name); },
      setState(s: Record<string, unknown>) { self.states.push(s); },
      pdfWhenReady(label: string) { self.states.push({ waitsFor: label }); },
    };
    return self;
  };
  const exportPdf = (QuoteLogic.prototype as unknown as { exportPdf(this: unknown): Promise<void> }).exportPdf;

  it("saves the file on a computer, never the print screen", async () => {
    const self = fake(false);
    const print = vi.fn(); window.print = print;
    await exportPdf.call(self); await Promise.resolve(); await Promise.resolve();
    expect(self.saved).toEqual(["Quotation 1R.pdf"]);
    expect(self.states.at(-1)).toEqual({ confirm: null });
    expect(print).not.toHaveBeenCalled();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("asks a phone for a press of its own once the PDF is made", async () => {
    const self = fake(true);
    await exportPdf.call(self);
    expect(self.saved).toEqual([]);
    expect(self.states).toEqual([{ waitsFor: "Download PDF" }]);
  });
});
