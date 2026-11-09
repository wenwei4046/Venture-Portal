import { describe, expect, it } from "vitest";
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
