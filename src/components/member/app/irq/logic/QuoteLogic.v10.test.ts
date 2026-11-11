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

// The user, 2026-11-11, with "Unit size 800 sqft" circled on step 1: "默认 sqft（像 budget 一样呈现，但靠右）".
describe("step 1's Unit size", async () => {
  const { sizeIsArea, sizeShown, sizeStored } = await import("./QuoteLogic");
  it("keeps a figure as \"N sqft\" and shows the figure alone", () => {
    expect(sizeStored("800")).toBe("800 sqft");
    expect(sizeStored("1,250 sqft")).toBe("1,250 sqft");
    expect(sizeStored("900 sq ft")).toBe("900 sqft");
    expect(sizeStored("")).toBe("");
    expect(sizeStored("  ")).toBe("");
    expect(sizeShown("800 sqft")).toBe("800");
    expect(sizeShown("800")).toBe("800");
    expect(sizeIsArea("")).toBe(true);
  });

  it("leaves the CRM's room count as it is, with no sqft", () => {
    expect(sizeIsArea("3R 2R")).toBe(false);
    expect(sizeShown("3R 2R")).toBe("3R 2R");
    expect(sizeStored("3R 2R")).toBe("3R 2R");
    expect(sizeStored("3R ")).toBe("3R "); // a space being typed stays
  });
});

// The user, 2026-11-11, on the quotation's "Package saving -1.00" over Discount 500.00 and TOTAL 25,707.00: "package saving 如何计算的？
// 应该显示 724 才对对吗？". b2b sells some items at half a ringgit (COFFEE TABLE 322.5); the quotation printed each line at the
// whole ringgit (323) while the package summed the half — the gap printed as a "saving". A line is the whole ringgit now, everywhere.
describe("the quotation adds up", async () => {
  const { QuoteLogic } = await import("./QuoteLogic");
  const { load, lineSum, unitPrice } = await import("../lib/quote-doc");
  const P = QuoteLogic.prototype as unknown as { calc(this: unknown): { pkg: { price: number }; changeSell: number; total: number }; docRows(this: unknown, pkg: unknown, m: number): { rows: { sum: number }[] }[] };

  it("rounds a line once, to the ringgit", () => {
    expect(unitPrice(322.5)).toBe(323);
    expect(unitPrice("741.5")).toBe(742);
    expect(lineSum(178.5, 2)).toBe(358);
    expect(lineSum(null, 3)).toBe(0);
  });

  it("prices a package as the sum of its printed lines", () => {
    localStorage.clear();
    const cfg = load({ packages: [{ id: "p1", name: "1R 1R", cats: [{ name: "Living", items: [{ name: "COFFEE TABLE", cost: 322.5, qty: 1, fixed: true }, { name: "WARDROBE", cost: 741.5, qty: 1, fixed: true }, { name: "SIDE TABLE", cost: 178.5, qty: 2, fixed: true }] }] }] }, { items: [] }, "irq.test.sum");
    expect(cfg.packages[0].price).toBe(323 + 742 + 358);
  });

  it("leaves no gap between the lines and the package with its changes", () => {
    const orig = { name: "COFFEE TABLE", cost: 322.5, qty: 1, code: "132055" };
    const lines = [
      { id: 1, ci: 0, name: "HIRADO COFFEE TABLE", cost: 385.5, qty: 1, code: "134100", orig },
      { id: 2, ci: 0, name: "WARDROBE", cost: 741.5, qty: 1, code: "354035", orig: { name: "WARDROBE", cost: 741.5, qty: 1, code: "354035" } },
      { id: 3, ci: 0, name: "SIDE TABLE", cost: 178.5, qty: 2, code: "131144", orig: { name: "SIDE TABLE", cost: 178.5, qty: 2, code: "131144" } },
    ];
    const pkg = { id: "p1", price: 323 + 742 + 358, cats: [{ name: "Living", items: [] }] };
    const self = { state: { data: { packages: [pkg] }, lines, discount: "500", pid: "p1", catalog: { items: [] }, cust: {} }, cfg: null,
      colorFor: () => "", imgFor: () => "", calc() { return P.calc.call(self); } };
    const { changeSell, total } = P.calc.call(self);
    expect(changeSell).toBe(386 - 323);
    const printed = P.docRows.call(self, pkg, 1).reduce((a, c) => a + c.rows.reduce((x, r) => x + r.sum, 0), 0);
    expect(printed).toBe(pkg.price + changeSell); // so "Package saving" = printed − (total + discount) = 0, and is not printed
    expect(total).toBe(printed - 500);
  });
});
