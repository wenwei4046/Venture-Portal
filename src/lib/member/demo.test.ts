import { describe, expect, it } from "vitest";
import { calculateQuote } from "./calculator";
import { buildChoicesFor } from "./build";
import { demoBands, demoPricing, demoProducts, memberDemo } from "./demo";
import type { QuoteInput } from "./types";

// The preview is where the member calculator is seen before a deploy, so its
// demo has to exercise what the live one does: Modular ticks narrowing the
// dropdowns, option surcharges, and a sofa combo replacing its modules' prices.

const quote = (lines: [string, number][], build: QuoteInput["build"], price = "3000"): QuoteInput => ({
  schemeId: "fair-scheme",
  price,
  delivery: "0",
  lines: lines.map(([productId, quantity]) => ({ productId, quantity, gift: false })),
  build,
});
const byId = (id: string) => demoProducts.find((p) => p.id === id)!;

describe("member preview demo catalogue", () => {
  it("sends the models and prices the preview's calculator reads", () => {
    const data = memberDemo();
    expect(data.catalogueModels?.map((m) => m.id)).toContain("demo-model-arc");
    expect(data.demoPricing).toBe(demoPricing);
  });

  it("offers only the leg heights every sofa in the cart was ticked for", () => {
    const choices = buildChoicesFor([byId("arc-2na"), byId("zan-sofa-3")], demoPricing.models);
    expect(choices.sofa).toEqual({ legs: ['4"', '6"'], specials: ["Nylon Fabric"] });
    expect(choices.bedframe).toBeNull();
  });

  it("costs an L-shape at the combo, not at its modules' own prices", () => {
    const r = calculateQuote(
      quote([["arc-1a-lhf", 1], ["arc-l-rhf", 1]], { height: "70cm", tier: "PRICE_1" }),
      demoProducts, demoBands, undefined, demoPricing,
    );
    expect(r.valid).toBe(true);
    // 1,500 combo, not 620 + 980 = 1,600.
    expect(r.margin).toBeCloseTo(50, 2);
  });

  it("adds the build's option surcharges to every sofa line it prices", () => {
    const r = calculateQuote(
      quote([["arc-2na", 1], ["arc-l-lhf", 1]], {
        height: "70cm", tier: "PRICE_1", leg: '6"', specials: ["Nylon Fabric"],
      }),
      demoProducts, demoBands, undefined, demoPricing,
    );
    expect(r.valid).toBe(true);
    // (900 + 40 + 80) + (980 + 40 + 80) = 2,120 against 3,000.
    expect(r.margin).toBeCloseTo(29.33, 2);
  });

  it("refuses a choice one of the cart's sofas was not ticked for", () => {
    const r = calculateQuote(
      quote([["arc-2na", 1], ["zan-sofa-3", 1]], { height: "70cm", tier: "PRICE_1", leg: "No Leg" }),
      demoProducts, demoBands, undefined, demoPricing,
    );
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/leg height is not offered for every sofa/);
  });
});
