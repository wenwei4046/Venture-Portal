import { describe, expect, it } from "vitest";
import { bandFor, calculateQuote, cents, customerQuote } from "./calculator";
import { demoBands, demoProducts } from "./demo";
import type { MemberProduct, QuoteInput } from "./types";
import {
  addCartLines,
  categoryKey,
  categoryLabel,
  isAccessoryProduct,
  isCompatibleGift,
  productImageUrl,
  pruneIncompatibleGifts,
  quoteLineKey,
} from "./catalog";

const fairBands = demoBands.filter((band) => band.brand === "Akemi");
const baseProduct = demoProducts.find((product) => product.id === "cloud-q")!;

function singleProduct(cost: number | null | undefined): MemberProduct[] {
  return [{ ...baseProduct, cost }];
}

function quote(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return {
    schemeId: "fair-scheme",
    lines: [{ productId: "cloud-q", quantity: 1, gift: false }],
    price: "100",
    delivery: "0",
    ...overrides,
  };
}

function bundle(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return quote({
    price: "3999",
    lines: [
      { productId: "cloud-q", quantity: 1, gift: false },
      { productId: "pillow", quantity: 2, gift: true },
      { productId: "protector-q", quantity: 1, gift: true },
      { productId: "gift-frame-q", quantity: 1, gift: true },
    ],
    ...overrides,
  });
}

describe("member quote money parsing", () => {
  it.each([
    ["0", 0],
    ["0.01", 1],
    ["35", 3500],
    ["35.5", 3550],
    [" 3999.00 ", 399900],
    ["999999999.00", 99999999900],
  ])("parses %s as integer cents", (raw, expected) => {
    expect(cents(raw)).toBe(expected);
  });

  it.each([
    "",
    " ",
    "-1",
    "+1",
    "NaN",
    "Infinity",
    "1e3",
    "3,999",
    "1.001",
    "1.",
    ".50",
    "999999999.01",
    "9007199254740991",
  ])("rejects ambiguous or out-of-range money %s", (raw) => {
    expect(cents(raw)).toBeNull();
  });
});

describe("member quote Margin bands", () => {
  it.each([
    [32.99, "Low range"],
    [33, "Standard range"],
    [33.01, "Standard range"],
    [35.99, "Standard range"],
    [36, "Tier 1 threshold"],
    [36.01, "Tier 1 threshold"],
    [42.99, "Tier 1 threshold"],
    [43, "Tier 2 threshold"],
    [43.01, "Tier 2 threshold"],
  ])("classifies an actual %s%% margin as %s", (margin, label) => {
    const result = calculateQuote(
      quote(),
      singleProduct(100 - margin),
      demoBands,
    );
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(margin, 8);
    expect(result.label).toBe(label);
    expect(result.multiplier).toBe(1);
  });

  it.each([
    [28, 1],
    [27.01, 1],
    [27, 0.5],
    [26.99, 0.5],
    [25.01, 0.5],
    [25, 0.25],
    [24.99, 0.25],
    [24.01, 0.25],
    [24, 0],
    [23.99, 0],
  ])(
    "applies the most severe matching penalty at %s%%",
    (margin, multiplier) => {
      const result = calculateQuote(
        quote(),
        singleProduct(100 - margin),
        demoBands,
      );
      expect(result.valid).toBe(true);
      expect(result.multiplier).toBe(multiplier);
      expect(result.tone).toBe(multiplier < 1 ? "danger" : "warning");
    },
  );

  it("does not turn a missing Margin into an earned tier", () => {
    expect(bandFor(null, fairBands)).toMatchObject({
      label: "Cost pending",
      tone: "neutral",
      multiplier: 1,
    });
  });

  it.each([
    [12800.99, "36.00", "Standard range", 36],
    [11400.99, "43.00", "Tier 1 threshold", 43],
  ])(
    "does not award a tier merely because the display rounds up to %s",
    (cost, displayed, label, threshold) => {
      const result = calculateQuote(
        quote({ price: "20000" }),
        singleProduct(cost),
        demoBands,
      );
      expect(result.valid).toBe(true);
      expect(result.margin!.toFixed(2)).toBe(displayed);
      expect(result.margin).toBeLessThan(threshold);
      expect(result.label).toBe(label);
      expect(result.boundary).toContain(`${threshold}%`);
      expect(result.nextPrice).toBeGreaterThan(result.price);
    },
  );
});

describe("member quote composition", () => {
  it("charges every gift unit to cost even though gifts have no selling price", () => {
    const result = calculateQuote(bundle(), demoProducts, demoBands);
    // RM 2,000 + (2 × RM 35) + RM 50 + RM 280 = RM 2,400.
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(39.98499624906227, 10);
    expect(result.label).toBe("Tier 1 threshold");
    expect(result.nextThreshold).toBe(43);
    expect(result.nextPrice).toBe(4210.53);
  });

  it("counts quantity on paid lines as well as gifts", () => {
    const result = calculateQuote(
      quote({
        price: "10000",
        lines: [
          { productId: "cloud-q", quantity: 2, gift: false },
          { productId: "pillow", quantity: 3, gift: true },
        ],
      }),
      demoProducts,
      demoBands,
    );
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(58.95, 8);
  });

  it("keeps additional charges outside both revenue and cost for Margin", () => {
    const withoutTransport = calculateQuote(bundle(), demoProducts, demoBands);
    const withTransport = calculateQuote(
      bundle({ delivery: "150.50" }),
      demoProducts,
      demoBands,
    );
    expect(withTransport.valid).toBe(true);
    expect(withTransport.delivery).toBe(150.5);
    expect(withTransport.price).toBe(3999);
    expect(withTransport.margin).toBe(withoutTransport.margin);
    expect(withTransport.label).toBe(withoutTransport.label);
    expect(withTransport.nextPrice).toBe(withoutTransport.nextPrice);
  });

  it("rounds the next-tier selling price upward to a cent and confirms that price", () => {
    const below = calculateQuote(
      bundle({ price: "4210.52" }),
      demoProducts,
      demoBands,
    );
    const at = calculateQuote(
      bundle({ price: "4210.53" }),
      demoProducts,
      demoBands,
    );
    expect(below.valid).toBe(true);
    expect(below.margin).toBeLessThan(43);
    expect(below.label).toBe("Tier 1 threshold");
    expect(below.nextPrice).toBe(4210.53);
    expect(at.valid).toBe(true);
    expect(at.margin).toBeGreaterThanOrEqual(43);
    expect(at.label).toBe("Tier 2 threshold");
    expect(at.nextPrice).toBeNull();
  });

  it("allows an explicitly configured zero cost, distinct from a missing cost", () => {
    const result = calculateQuote(quote(), singleProduct(0), demoBands);
    expect(result).toMatchObject({
      valid: true,
      margin: 100,
      label: "Tier 2 threshold",
      nextPrice: null,
    });
  });

  it("recalculates its gift suggestion using the extra gift cost", () => {
    const result = calculateQuote(bundle(), demoProducts, demoBands);
    const suggestion = result.suggestions.find(
      (item) => item.productId === "pillow",
    );
    expect(suggestion).toBeDefined();
    expect(suggestion!.margin).toBeCloseTo(39.10977744436109, 10);
    const adopted = bundle();
    adopted.lines = adopted.lines.map((line) =>
      line.productId === "pillow"
        ? { ...line, quantity: line.quantity + 1 }
        : line,
    );
    expect(calculateQuote(adopted, demoProducts, demoBands).margin).toBeCloseTo(
      suggestion!.margin,
      10,
    );
  });

  it("does not suggest a gift that would lose the current incentive tier", () => {
    const input = bundle({ price: "3750" }); // Exactly 36%; no remaining cost allowance.
    const result = calculateQuote(input, demoProducts, demoBands);
    expect(result.label).toBe("Tier 1 threshold");
    expect(result.suggestions).toEqual([]);
  });

  it.each([
    [3, true],
    [4, false],
  ])(
    "only suggests another pillow when quantity %s remains below the cap",
    (quantity, canSuggest) => {
      const input = bundle();
      input.lines = input.lines.map((line) =>
        line.productId === "pillow" ? { ...line, quantity } : line,
      );
      const result = calculateQuote(input, demoProducts, demoBands);
      expect(result.valid).toBe(true);
      expect(
        result.suggestions.some((item) => item.productId === "pillow"),
      ).toBe(canSuggest);
    },
  );
});

describe("member quote validation", () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -0.01])(
    "cannot confirm missing or invalid product cost %s",
    (cost) => {
      const result = calculateQuote(quote(), singleProduct(cost), demoBands);
      expect(result.valid).toBe(false);
      expect(result.margin).toBeNull();
      expect(result.error).toContain("cost");
      expect(result.suggestions).toEqual([]);
    },
  );

  it.each(["", "0", "0.00", "-100", "NaN", "Infinity", "1.234", "1e3"])(
    "cannot confirm invalid or nonpositive price %s",
    (price) => {
      const result = calculateQuote(bundle({ price }), demoProducts, demoBands);
      expect(result.valid).toBe(false);
      expect(result.margin).toBeNull();
      expect(result.error).toContain("selling price");
    },
  );

  it.each(["-1", "NaN", "1.001"])(
    "rejects invalid additional charges %s with the current fee label",
    (delivery) => {
      expect(
        calculateQuote(bundle({ delivery }), demoProducts, demoBands),
      ).toMatchObject({
        valid: false,
        margin: null,
        error:
          "Enter non-negative additional charges, with up to two decimal places.",
      });
    },
  );

  it.each([0, -1, 1.5, 101, Number.NaN])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(
        calculateQuote(
          quote({ lines: [{ productId: "cloud-q", quantity, gift: false }] }),
          demoProducts,
          demoBands,
        ).valid,
      ).toBe(false);
    },
  );

  it.each(["sold-out", "unknown-product"])(
    "rejects unavailable product %s",
    (productId) => {
      expect(
        calculateQuote(
          quote({ lines: [{ productId, quantity: 1, gift: false }] }),
          demoProducts,
          demoBands,
        ).valid,
      ).toBe(false);
    },
  );

  it("rejects cross-brand gifts instead of mixing their cost into another brand", () => {
    const products = [
      ...demoProducts,
      {
        ...demoProducts.find((product) => product.id === "pillow")!,
        id: "other-pillow",
        brand: "Zanotti",
      },
    ];
    const result = calculateQuote(
      quote({
        lines: [
          { productId: "cloud-q", quantity: 1, gift: false },
          { productId: "other-pillow", quantity: 1, gift: true },
        ],
      }),
      products,
      demoBands,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("same brand");
  });

  it("requires configured bands for the selected brand", () => {
    const result = calculateQuote(
      bundle(),
      demoProducts,
      demoBands.filter((band) => band.brand === "Zanotti"),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("threshold");
  });

  it("rejects duplicate gift lines so a split quantity cannot bypass the suggestion cap", () => {
    const input = bundle();
    input.lines.push({ productId: "pillow", quantity: 2, gift: true });
    const result = calculateQuote(input, demoProducts, demoBands);
    expect(result).toMatchObject({
      valid: false,
      margin: null,
      suggestions: [],
    });
    expect(result.error).toContain("Duplicate product lines");
  });

  it("rejects an unapproved gift even when that SKU is already a paid product", () => {
    const input = bundle();
    input.lines.push({ productId: "cloud-q", quantity: 1, gift: true });
    const result = calculateQuote(input, demoProducts, demoBands);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("free gift category has changed");
  });

  it.each([
    { lines: [] },
    { lines: [{ productId: "pillow", quantity: 1, gift: true }] },
  ])(
    "requires a paid product, not an empty or gifts-only quote",
    ({ lines }) => {
      expect(
        calculateQuote(quote({ lines }), demoProducts, demoBands).valid,
      ).toBe(false);
    },
  );
});

describe("customer-facing quote", () => {
  it("includes exact quantities, gift labels, variant details and customer totals only", () => {
    const input = bundle({ delivery: "120.50" });
    const products = demoProducts.map((product) => ({
      ...product,
      version: "INTERNAL-COST-VERSION-42",
    }));
    const result = calculateQuote(input, products, demoBands);
    const output = customerQuote(input, products, result);
    expect(output).toContain("Product · Akemi Cloud Support / Queen × 1");
    expect(output).toContain("Free gift · Akemi Comfort Pillow / Standard × 2");
    expect(output).toContain(
      "Free gift · Akemi Essential Frame / Queen / Walnut × 1",
    );
    expect(output).toContain("Selling price: RM 3999.00");
    expect(output).toContain("Additional charges: RM 120.50");
    expect(output).not.toContain("Delivery: RM");
    expect(output).toContain("Total: RM 4119.50");
    expect(output).not.toMatch(
      /margin|tier|commission|成本|佣金|建议|INTERNAL-COST-VERSION|2400\.00|39\.98/i,
    );
    expect(result.inputKey).not.toContain("INTERNAL-COST-VERSION");
    expect(output).not.toContain(result.inputKey);
  });

  it.each([
    {
      field: "price",
      modify: (input: QuoteInput) => ({ ...input, price: "4500" }),
    },
    {
      field: "delivery",
      modify: (input: QuoteInput) => ({ ...input, delivery: "120" }),
    },
    {
      field: "department",
      modify: (input: QuoteInput) => ({ ...input, schemeId: "ir-scheme" }),
    },
    {
      field: "quantity",
      modify: (input: QuoteInput) => ({
        ...input,
        lines: input.lines.map((line) => ({
          ...line,
          quantity: line.quantity + 1,
        })),
      }),
    },
    {
      field: "gift status",
      modify: (input: QuoteInput) => ({
        ...input,
        lines: input.lines.map((line) => ({ ...line, gift: !line.gift })),
      }),
    },
    {
      field: "SKU",
      modify: (input: QuoteInput) => ({
        ...input,
        lines: input.lines.map((line) =>
          line.productId === "cloud-q"
            ? { ...line, productId: "cloud-k" }
            : line,
        ),
      }),
    },
  ])("rejects stale results after changing $field", ({ modify }) => {
    const input = bundle();
    const result = calculateQuote(input, demoProducts, demoBands);
    expect(() => customerQuote(modify(input), demoProducts, result)).toThrow(
      "The quote has changed",
    );
  });

  it("normalizes equivalent money and reordered lines without changing the input identity", () => {
    const original = bundle();
    const equivalent = {
      ...original,
      price: "3999.00",
      delivery: "0.00",
      lines: [...original.lines].reverse(),
    };
    const result = calculateQuote(original, demoProducts, demoBands);
    expect(calculateQuote(equivalent, demoProducts, demoBands).inputKey).toBe(
      result.inputKey,
    );
    expect(() => customerQuote(equivalent, demoProducts, result)).not.toThrow();
    expect(original.lines[0].productId).toBe("cloud-q");
  });

  it("does not export result totals that differ from the confirmed input", () => {
    const input = bundle();
    const result = calculateQuote(input, demoProducts, demoBands);
    expect(() =>
      customerQuote(input, demoProducts, { ...result, price: 1 }),
    ).toThrow("The quote has changed");
    expect(() =>
      customerQuote(input, demoProducts, { ...result, delivery: 100 }),
    ).toThrow("The quote has changed");
  });

  it("requires a fresh calculation when a selected product version changes", () => {
    const input = bundle();
    const result = calculateQuote(input, demoProducts, demoBands);
    const products = demoProducts.map((product) =>
      product.id === "pillow"
        ? { ...product, cost: 40, version: "new-cost-version" }
        : product,
    );
    expect(() => customerQuote(input, products, result)).toThrow(
      "Product details have changed",
    );
    const refreshed = calculateQuote(input, products, demoBands);
    expect(refreshed.inputKey).toBe(result.inputKey);
    expect(refreshed.version).not.toBe(result.version);
    expect(() => customerQuote(input, products, refreshed)).not.toThrow();
  });

  it("does not invalidate a quote when an unrelated product is updated", () => {
    const input = bundle();
    const result = calculateQuote(input, demoProducts, demoBands);
    const products = demoProducts.map((product) =>
      product.id === "sofa-2-o" ? { ...product, version: "updated" } : product,
    );
    expect(() => customerQuote(input, products, result)).not.toThrow();
  });

  it("blocks a selected product that becomes unavailable before export", () => {
    const input = bundle();
    const result = calculateQuote(input, demoProducts, demoBands);
    const products = demoProducts.map((product) =>
      product.id === "cloud-q" ? { ...product, available: false } : product,
    );
    expect(() => customerQuote(input, products, result)).toThrow(
      "A product is no longer available",
    );
  });

  it("does not export an invalid quote", () => {
    const input = bundle({ price: "0" });
    expect(() =>
      customerQuote(
        input,
        demoProducts,
        calculateQuote(input, demoProducts, demoBands),
      ),
    ).toThrow("The quote has not been confirmed");
  });

  it("fails instead of silently omitting a product removed before export", () => {
    const input = bundle();
    const result = calculateQuote(input, demoProducts, demoBands);
    expect(() =>
      customerQuote(
        input,
        demoProducts.filter((product) => product.id !== "pillow"),
        result,
      ),
    ).toThrow("A product is no longer available");
  });
});

describe("Hero card cart", () => {
  it("merges repeated adds into one SKU and accounts for the full quantity", () => {
    const current = bundle().lines;
    const original = structuredClone(current);
    const lines = addCartLines(
      current,
      [
        { productId: "cloud-q", quantity: 1, gift: false },
        { productId: "pillow", quantity: 1, gift: true },
      ],
      demoProducts,
    );
    expect(current).toEqual(original);
    expect(lines).toHaveLength(4);
    expect(lines.find((line) => line.productId === "cloud-q")?.quantity).toBe(
      2,
    );
    expect(lines.find((line) => line.productId === "pillow")?.quantity).toBe(3);
    const result = calculateQuote(
      quote({ lines, price: "10000" }),
      demoProducts,
      demoBands,
    );
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(55.65, 8); // RM 4,435 total cost.
  });

  it("calculates a mixed mattress and sofa cart without imposing one size on every product", () => {
    const lines = addCartLines(
      bundle().lines,
      [{ productId: "sofa-2-o", quantity: 1, gift: false }],
      demoProducts,
    );
    const result = calculateQuote(
      quote({ lines, price: "8000" }),
      demoProducts,
      demoBands,
    );
    expect(result.valid).toBe(true);
    expect(result.margin).toBe(42.5);
  });

  it("allows two mattress sizes with their matching fitted gifts", () => {
    const lines = addCartLines(
      bundle().lines,
      [
        { productId: "cloud-s", quantity: 1, gift: false },
        { productId: "protector-s", quantity: 1, gift: true },
      ],
      demoProducts,
    );
    const result = calculateQuote(
      quote({ lines, price: "7000" }),
      demoProducts,
      demoBands,
    );
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(((7000 - 3735) / 7000) * 100, 8);
  });

  it.each(["Queen", "King", "Super Single", "Single"])(
    "provides synthetic %s variants and matching accessories",
    (size) => {
      const bed = demoProducts.find(
        (product) => product.name === "Cloud Support" && product.size === size,
      )!;
      const comfort = demoProducts.find(
        (product) => product.name === "Cloud Comfort" && product.size === size,
      )!;
      const fitted = demoProducts.filter(
        (product) => product.gift && product.size === size && product.brand === bed.brand,
      );
      expect(bed?.available).toBe(true);
      expect(comfort?.available).toBe(true);
      expect(
        fitted.some((product) => categoryKey(product.category) === "protector"),
      ).toBe(true);
      expect(
        fitted.some((product) => categoryKey(product.category) === "bed_frame"),
      ).toBe(true);
      expect(fitted.every((product) => isCompatibleGift(product, [bed]))).toBe(
        true,
      );
      const otherBrandGift = demoProducts.find(
        (product) => product.gift && product.size === size && product.brand !== bed.brand,
      )!;
      expect(otherBrandGift).toBeDefined();
      expect(isCompatibleGift(otherBrandGift, [bed])).toBe(false);
    },
  );

  it("prunes only gifts that lose their matching paid product", () => {
    const lines = addCartLines(
      bundle().lines,
      [
        { productId: "cloud-s", quantity: 1, gift: false },
        { productId: "protector-s", quantity: 1, gift: true },
      ],
      demoProducts,
    ).filter((line) => line.productId !== "cloud-q");
    const remaining = pruneIncompatibleGifts(lines, demoProducts);
    expect(remaining.map((line) => line.productId)).toEqual([
      "pillow",
      "cloud-s",
      "protector-s",
    ]);
    expect(
      pruneIncompatibleGifts(
        remaining.filter((line) => line.gift),
        demoProducts,
      ),
    ).toEqual([]);
    expect(lines.map((line) => line.productId)).toContain("protector-q");
  });

  it("rejects an orphaned fitted gift in the calculator even when the client skips pruning", () => {
    const result = calculateQuote(
      quote({
        lines: [
          { productId: "cloud-s", quantity: 1, gift: false },
          { productId: "protector-q", quantity: 1, gift: true },
        ],
      }),
      demoProducts,
      demoBands,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("free gift size");
  });

  it("validates free gift eligibility in both cart and calculator", () => {
    const lines = [
      { productId: "cloud-q", quantity: 1, gift: false },
      { productId: "cloud-s", quantity: 1, gift: true },
    ];
    expect(() => addCartLines([], lines, demoProducts)).toThrow(
      "category has changed",
    );
    expect(
      calculateQuote(quote({ lines }), demoProducts, demoBands),
    ).toMatchObject({ valid: false, margin: null });
  });

  it("rejects an aggregate quantity above 100 instead of truncating the cart", () => {
    const line = { productId: "cloud-q", quantity: 100, gift: false };
    expect(() =>
      addCartLines([line], [{ ...line, quantity: 1 }], demoProducts),
    ).toThrow("100 units");
    expect(line.quantity).toBe(100);
  });

  it("rejects an aggregate cart above 30 distinct products", () => {
    const products = Array.from({ length: 31 }, (_, index) => ({
      ...baseProduct,
      id: `product-${index}`,
    }));
    const lines = products.map((product) => ({
      productId: product.id,
      quantity: 1,
      gift: false,
    }));
    expect(() =>
      addCartLines(lines.slice(0, 30), lines.slice(30), products),
    ).toThrow("30 product lines");
  });

  it("keeps other brands out of the current cart", () => {
    const other = { ...baseProduct, id: "other-brand", brand: "Zanotti" };
    expect(() =>
      addCartLines(
        bundle().lines,
        [{ productId: other.id, quantity: 1, gift: false }],
        [...demoProducts, other],
      ),
    ).toThrow("same brand");
  });

  it.each(["sold-out", "missing"])(
    "rejects %s products before checkout",
    (productId) => {
      expect(() =>
        addCartLines(
          [],
          [{ productId, quantity: 1, gift: false }],
          demoProducts,
        ),
      ).toThrow("unavailable");
    },
  );
});

describe("purchased products and eligible free gifts", () => {
  it.each([
    ["pillow", "Accessory"],
    ["gift-frame-q", "Bed frame"],
    ["sofa-2-o", "Sofa"],
  ])("allows gift-eligible %s to be bought on its own in %s", (productId) => {
    const product = { ...demoProducts.find((item) => item.id === productId)!, gift: true };
    const lines = addCartLines([], [{ productId, quantity: 2, gift: false }], [product]);
    const input = quote({ lines, price: "10000" });
    const result = calculateQuote(input, [product], demoBands);
    expect(lines).toEqual([{ productId, quantity: 2, gift: false }]);
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo((10000 - product.cost! * 2) / 100, 8);
    expect(customerQuote(input, [product], result)).toContain(`Product · ${product.brand} ${product.name}`);
    expect(customerQuote(input, [product], result)).not.toContain("Free gift ·");
  });

  it("retains separate paid and gift quantities for one SKU and charges the costs of both", () => {
    const lines = addCartLines(
      [{ productId: "pillow", quantity: 2, gift: false }],
      [
        { productId: "pillow", quantity: 1, gift: true },
        { productId: "pillow", quantity: 2, gift: true },
        { productId: "pillow", quantity: 1, gift: false },
      ],
      demoProducts,
    );
    expect(lines).toEqual([
      { productId: "pillow", quantity: 3, gift: false },
      { productId: "pillow", quantity: 3, gift: true },
    ]);
    expect(new Set(lines.map(quoteLineKey)).size).toBe(2);
    const input = quote({ lines, price: "500" });
    const result = calculateQuote(input, demoProducts, demoBands);
    const pillow = demoProducts.find((item) => item.id === "pillow")!;
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(((500 - pillow.cost! * 6) / 500) * 100, 8);
    const output = customerQuote(input, demoProducts, result);
    expect(output).toContain("Product · Akemi Comfort Pillow / Standard × 3");
    expect(output).toContain("Free gift · Akemi Comfort Pillow / Standard × 3");
  });

  it("binds dual-role result identities to roles and quantities while permitting reordered lines", () => {
    const input = quote({
      price: "500",
      lines: [
        { productId: "pillow", quantity: 2, gift: false },
        { productId: "pillow", quantity: 3, gift: true },
      ],
    });
    const result = calculateQuote(input, demoProducts, demoBands);
    const reordered = { ...input, lines: [...input.lines].reverse() };
    expect(calculateQuote(reordered, demoProducts, demoBands).inputKey).toBe(result.inputKey);
    expect(() => customerQuote(reordered, demoProducts, result)).not.toThrow();
    const changedRoles = { ...input, lines: input.lines.map((line) => ({ ...line, gift: !line.gift })) };
    expect(calculateQuote(changedRoles, demoProducts, demoBands).inputKey).not.toBe(result.inputKey);
    expect(() => customerQuote(changedRoles, demoProducts, result)).toThrow("quote has changed");
  });

  it.each([false, true])("rejects a duplicate same-role line (gift=%s) while allowing the other role", (gift) => {
    const input = quote({
      price: "500",
      lines: [
        { productId: "pillow", quantity: 1, gift: false },
        { productId: "pillow", quantity: 1, gift: true },
      ],
    });
    expect(calculateQuote(input, demoProducts, demoBands).valid).toBe(true);
    input.lines.push({ productId: "pillow", quantity: 1, gift });
    expect(calculateQuote(input, demoProducts, demoBands).error).toContain("Duplicate product lines");
  });

  it("enforces the 100-unit SKU limit across both paid and free quantities", () => {
    const paid = { productId: "pillow", quantity: 97, gift: false };
    const gift = { productId: "pillow", quantity: 4, gift: true };
    expect(() => addCartLines([paid], [gift], demoProducts)).toThrow("100 units");
    expect(calculateQuote(quote({ lines: [paid, gift], price: "10000" }), demoProducts, demoBands).error).toContain("100 units");
    const atLimit = addCartLines([{ ...paid, quantity: 96 }], [gift], demoProducts);
    expect(calculateQuote(quote({ lines: atLimit, price: "10000" }), demoProducts, demoBands).valid).toBe(true);
  });

  it("counts paid and free roles separately towards the 30-line quote limit", () => {
    const products = Array.from({ length: 16 }, (_, index) => ({
      ...baseProduct, id: `role-product-${index}`, gift: true,
    }));
    const lines = products.slice(0, 15).flatMap((product) => [
      { productId: product.id, quantity: 1, gift: false },
      { productId: product.id, quantity: 1, gift: true },
    ]);
    expect(addCartLines([], lines, products)).toHaveLength(30);
    expect(calculateQuote(quote({ lines, price: "100000" }), products, demoBands).valid).toBe(true);
    const extra = { productId: products[15].id, quantity: 1, gift: false };
    expect(() => addCartLines(lines, [extra], products)).toThrow("30 product lines");
    expect(calculateQuote(quote({ lines: [...lines, extra] }), products, demoBands).error).toContain("30 product lines");
  });

  it("preserves a purchased fitted accessory after its mattress is removed, pruning only an unmatched gift", () => {
    const lines = [
      { productId: "protector-q", quantity: 1, gift: false },
      { productId: "protector-s", quantity: 1, gift: true },
    ];
    const retained = pruneIncompatibleGifts(lines, demoProducts);
    expect(retained).toEqual([lines[0]]);
    expect(calculateQuote(quote({ lines: retained, price: "500" }), demoProducts, demoBands).valid).toBe(true);
  });

  it("prunes gifts whose eligibility was withdrawn while preserving their purchased role", () => {
    const products = demoProducts.map((product) => product.id === "pillow" ? { ...product, gift: false } : product);
    const lines = [
      { productId: "pillow", quantity: 1, gift: false },
      { productId: "pillow", quantity: 1, gift: true },
    ];
    expect(pruneIncompatibleGifts(lines, products)).toEqual([lines[0]]);
    expect(isCompatibleGift(products.find((item) => item.id === "pillow")!, [baseProduct])).toBe(false);
  });

  it.each([
    [4, 0, true],
    [95, 3, true],
    [96, 4, false],
    [97, 3, false],
    [100, 0, false],
  ])("suggests pillows using gift quantity and SKU total: %s paid + %s gift", (paid, gifts, expected) => {
    const lines = [{ productId: "pillow", quantity: paid, gift: false }];
    if (gifts) lines.push({ productId: "pillow", quantity: gifts, gift: true });
    const result = calculateQuote(quote({ lines, price: "10000" }), demoProducts, demoBands);
    expect(result.valid).toBe(true);
    expect(result.suggestions.some((suggestion) => suggestion.productId === "pillow")).toBe(expected);
  });

  it("does not suggest creating a free-gift role that would exceed 30 lines", () => {
    const products = [
      demoProducts.find((product) => product.id === "pillow")!,
      ...Array.from({ length: 29 }, (_, index) => ({ ...baseProduct, id: `full-cart-${index}` })),
    ];
    const lines = products.map((product) => ({ productId: product.id, quantity: 1, gift: false }));
    const result = calculateQuote(quote({ lines, price: "200000" }), products, demoBands);
    expect(result.valid).toBe(true);
    expect(result.suggestions).toEqual([]);
  });
});

describe("catalogue display compatibility", () => {
  it.each([
    ["Pillow", true],
    ["枕头", true],
    ["Mattress protector", true],
    ["保护套", true],
    ["Accessories", true],
    ["配件", true],
    ["Other", true],
    ["Unconfigured accessory category", true],
    ["Mattress", false],
    ["床垫", false],
    ["Bed frame", false],
    ["bed_frame", false],
    ["gift frame", false],
    ["赠品床架", false],
    ["Sofa", false],
    ["沙发", false],
  ])(
    "classifies %s by category instead of its gift flag",
    (category, expected) => {
      for (const gift of [true, false]) {
        const product = { ...baseProduct, category, gift };
        expect(isAccessoryProduct(product)).toBe(expected);
      }
    },
  );

  it("keeps configured gift bed frames out of accessories and suggestions while preserving their cart costs", () => {
    const frame = demoProducts.find(
      (product) => product.id === "gift-frame-q",
    )!;
    expect(frame.gift).toBe(true);
    expect(categoryKey(frame.category)).toBe("bed_frame");
    expect(isAccessoryProduct(frame)).toBe(false);

    const result = calculateQuote(bundle(), demoProducts, demoBands);
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(((3999 - 2400) / 3999) * 100, 8);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(
      result.suggestions.every((suggestion) =>
        isAccessoryProduct(
          demoProducts.find((product) => product.id === suggestion.productId)!,
        ),
      ),
    ).toBe(true);
    expect(
      result.suggestions.some(
        (suggestion) => suggestion.productId === frame.id,
      ),
    ).toBe(false);
  });

  it.each([
    ["床垫", "mattress", "Mattress"],
    ["Mattresses", "mattress", "Mattress"],
    ["赠品床架", "bed_frame", "Bed frame"],
    ["Bed frame", "bed_frame", "Bed frame"],
    ["枕头", "pillow", "Pillow"],
    ["Pillow", "pillow", "Pillow"],
    ["沙发", "sofa", "Sofa"],
    ["Accessories", "accessory", "Accessory"],
  ])("normalizes %s without rewriting live metadata", (raw, key, label) => {
    expect(categoryKey(raw)).toBe(key);
    expect(categoryLabel(raw)).toBe(label);
  });

  it.each(["枕头", "Pillow", "pillows"])(
    "offers compatible pillow suggestions from %s metadata",
    (category) => {
      const products = demoProducts.map((product) =>
        product.id === "pillow" ? { ...product, category } : product,
      );
      expect(
        calculateQuote(bundle(), products, demoBands).suggestions.some(
          (item) => item.productId === "pillow",
        ),
      ).toBe(true);
    },
  );

  it("normalizes legacy size spelling for gift compatibility", () => {
    const gift = {
      ...demoProducts.find((product) => product.id === "protector-q")!,
      size: "Queen Size",
    };
    expect(isCompatibleGift(gift, [baseProduct])).toBe(true);
    expect(isCompatibleGift({ ...gift, brand: "Zanotti" }, [baseProduct])).toBe(
      false,
    );
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "//example.com/photo.jpg",
    "https://user:secret@example.com/image.png",
    "/\\example.com/photo.jpg",
    null,
  ])("does not expose an unsafe or missing photo URL: %s", (url) => {
    expect(productImageUrl(url)).toBeNull();
  });

  it.each(["https://example.com/product.png", "/images/product.png"])(
    "accepts a Principal-managed photo URL: %s",
    (url) => {
      expect(productImageUrl(url)).toBe(url);
    },
  );
});

// ─── 2026-09-12 rules: riders, the Revenue Team cost basis, sofa grids ──────

const frame = demoProducts.find((product) => product.id === "frame-q-w")!;
/** A bed frame with no brand — the rider shape the seed writes. */
const riderFrame: MemberProduct = { ...frame, id: "rider-frame-q", brand: null, cost: 700 };
const riderPillow: MemberProduct = {
  ...demoProducts.find((product) => product.id === "pillow")!,
  id: "rider-pillow",
  brand: null,
  cost: 35,
};
const zanottiSofaModule = (id: string, size: string, grid: MemberProduct["costGrid"]): MemberProduct => ({
  ...demoProducts.find((product) => product.id === "sofa-2-o")!,
  id,
  name: "9028",
  brand: "Zanotti",
  size,
  color: "",
  cost: null,
  costGrid: grid,
  options: (grid ?? []).map(({ height, tier }) => ({ height, tier })),
});
const oneSeater = zanottiSofaModule("9028-1s", "1S", [
  { height: "24", tier: "PRICE_1", cost: 805 },
  { height: "24", tier: "PRICE_2", cost: 851 },
  { height: "26", tier: "PRICE_1", cost: 874 },
  { height: "26", tier: "PRICE_2", cost: 920 },
]);
const corner = zanottiSofaModule("9028-cnr", "CNR", [
  { height: "24", tier: "PRICE_1", cost: 900 },
  { height: "26", tier: "PRICE_1", cost: 950 },
]);
const zanottiBands = demoBands.filter((band) => band.brand === "Zanotti");

describe("riders — bed frames and accessories carry no brand", () => {
  it("lets a rider join an Akemi cart and counts its cost in the one margin", () => {
    const result = calculateQuote(
      quote({
        price: "4000",
        lines: [
          { productId: "cloud-q", quantity: 1, gift: false },
          { productId: "rider-frame-q", quantity: 1, gift: false },
        ],
      }),
      [...demoProducts, riderFrame],
      demoBands,
    );
    // (4,000 − 2,000 − 700) ÷ 4,000 — judged by Akemi's ladder.
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(32.5, 10);
    expect(result.label).toBe("Low range");
  });

  it("still refuses two brands in one cart", () => {
    const products = [
      ...demoProducts,
      { ...baseProduct, id: "zanotti-bed", brand: "Zanotti" },
    ];
    const result = calculateQuote(
      quote({
        lines: [
          { productId: "cloud-q", quantity: 1, gift: false },
          { productId: "zanotti-bed", quantity: 1, gift: false },
        ],
      }),
      products,
      demoBands,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("same brand");
    expect(() =>
      addCartLines(
        [{ productId: "cloud-q", quantity: 1, gift: false }],
        [{ productId: "zanotti-bed", quantity: 1, gift: false }],
        products,
      ),
    ).toThrow("same brand");
  });

  it("adds a rider through the cart without tripping the brand rule", () => {
    const lines = addCartLines(
      [{ productId: "cloud-q", quantity: 1, gift: false }],
      [{ productId: "rider-frame-q", quantity: 1, gift: false }],
      [...demoProducts, riderFrame],
    );
    expect(lines).toHaveLength(2);
  });

  it("shows a margin with no ladder for a rider-only cart", () => {
    const result = calculateQuote(
      quote({ price: "1000", lines: [{ productId: "rider-frame-q", quantity: 1, gift: false }] }),
      [...demoProducts, riderFrame],
      demoBands,
    );
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(30, 10);
    expect(result.label).toBe("No brand rules");
    expect(result.tone).toBe("neutral");
    expect(result.nextPrice).toBeNull();
  });

  it("lets a brand-less pillow ride any brand as a gift and suggests it", () => {
    expect(isCompatibleGift(riderPillow, [baseProduct])).toBe(true);
    const result = calculateQuote(
      quote({
        price: "3999",
        lines: [
          { productId: "cloud-q", quantity: 1, gift: false },
          { productId: "rider-pillow", quantity: 1, gift: true },
        ],
      }),
      [...demoProducts, riderPillow],
      demoBands,
    );
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(((3999 - 2035) / 3999) * 100, 10);
    expect(result.suggestions.some((item) => item.productId === "rider-pillow")).toBe(true);
  });
});

describe("the Revenue Team cost basis (cost ÷ divisor)", () => {
  it("judges margin on cost ÷ 0.7, so RM2,000 is read as RM2,857.14", () => {
    const result = calculateQuote(
      quote({ price: "5000" }),
      singleProduct(2000),
      demoBands,
      { costDivisor: 0.7 },
    );
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(((5000 - 2857.14) / 5000) * 100, 6);
    // Without the rule the same cart is a 60% margin.
    expect(calculateQuote(quote({ price: "5000" }), singleProduct(2000), demoBands).margin).toBe(60);
  });

  it("prices the next tier as team cost ÷ (1 − threshold), never cost × (1 + threshold)", () => {
    const result = calculateQuote(
      quote({ price: "3000" }),
      singleProduct(1400),
      demoBands,
      { costDivisor: 0.7 },
    );
    // Team cost 2,000. Tier 1 is 36%: 2,000 ÷ 0.64 = 3,125.
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(33.33333333, 6);
    expect(result.nextThreshold).toBe(36);
    expect(result.nextPrice).toBe(3125);
  });

  it("refuses a divisor that is zero, negative or not a number", () => {
    for (const costDivisor of [0, -0.7, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = calculateQuote(quote(), singleProduct(50), demoBands, { costDivisor });
      expect(result.valid).toBe(false);
      // A member reads this message: it says nothing about how the cost is made up.
      expect(result.error).toBe("The margin rules for this department are not configured.");
    }
  });
});

describe("sofa grids — per module, per seat height and fabric tier, the ERP way", () => {
  const products = [...demoProducts, oneSeater, corner];
  const sofaCart = (build?: QuoteInput["build"], price = "5000"): QuoteInput =>
    quote({
      price,
      build,
      lines: [
        { productId: "9028-1s", quantity: 2, gift: false },
        { productId: "9028-cnr", quantity: 1, gift: false },
      ],
    });

  it("asks for the build before costing a sofa module", () => {
    const result = calculateQuote(sofaCart(), products, zanottiBands);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("seat height");
  });

  it("sums every module at the chosen height and tier", () => {
    const result = calculateQuote(sofaCart({ height: "24", tier: "PRICE_1" }), products, zanottiBands);
    // 2 × 805 + 900 = 2,510 → (5,000 − 2,510) ÷ 5,000
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(49.8, 10);
    const tier2 = calculateQuote(sofaCart({ height: "24", tier: "PRICE_2" }), products, zanottiBands);
    // The corner has no PRICE_2 cell at 24 → PRICE_2 fallback is itself absent → any cell at that height (900).
    expect(tier2.margin).toBeCloseTo(((5000 - (2 * 851 + 900)) / 5000) * 100, 10);
  });

  it("refuses a seat height a module in the cart does not come in", () => {
    const tall = zanottiSofaModule("9028-tall", "3S", [{ height: "30", tier: "PRICE_1", cost: 1200 }]);
    const result = calculateQuote(
      quote({
        price: "5000",
        build: { height: "24", tier: "PRICE_1" },
        lines: [
          { productId: "9028-1s", quantity: 1, gift: false },
          { productId: "9028-tall", quantity: 1, gift: false },
        ],
      }),
      [...products, tall],
      zanottiBands,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain("seat height");
  });

  it("binds the confirmed quote to the build and prints it for the customer", () => {
    const input = sofaCart({ height: "26", tier: "PRICE_2" });
    const result = calculateQuote(input, products, zanottiBands);
    expect(result.valid).toBe(true);
    const text = customerQuote(input, products, result);
    expect(text).toContain("Sofa build: seat height 26 · Tier 2 fabric");
    expect(text).toContain("Zanotti 9028 / 1S × 2");
    expect(() =>
      customerQuote({ ...input, build: { height: "24", tier: "PRICE_2" } }, products, result),
    ).toThrow("changed");
  });

  it("applies the divisor to grid cells too", () => {
    const result = calculateQuote(
      sofaCart({ height: "24", tier: "PRICE_1" }),
      products,
      zanottiBands,
      { costDivisor: 0.5 },
    );
    // 2,510 ÷ 0.5 = 5,020 > 5,000 → a negative margin, which the most severe
    // penalty rung catches first.
    expect(result.valid).toBe(true);
    expect(result.margin).toBeCloseTo(-0.4, 10);
    expect(result.tone).toBe("danger");
    expect(result.multiplier).toBe(0);
  });
});
