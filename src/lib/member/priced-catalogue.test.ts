import { describe, expect, it } from "vitest";
import { catalogueModelsOf, catalogueProductOf, pricedCatalogueOf } from "./priced-catalogue";

const row = {
  id: "10000000-0000-4000-8000-000000000101",
  code: "8030-1A(LHF)",
  name: "8030 SOFFIO",
  brand: "ZANOTTI",
  category: "Sofa",
  size: "1A(LHF)",
  color: "",
  available: true,
  gift: false,
  modelId: "10000000-0000-4000-8000-000000000100",
  kind: "SOFA",
  baseModel: "8030",
  moduleCode: "1A(LHF)",
  options: [{ height: "30", tier: "PRICE_2" }],
  price: "1200.50",
  grid: [
    { height: "30", tier: "PRICE_2", price: 1000 },
    { height: "30", tier: "PRICE_3", price: "-5" },
    { height: "", tier: "PRICE_1", price: 900 },
  ],
  version: "2026-09-24T00:00:00Z:",
};

describe("reading the calculator's catalogue", () => {
  it("keeps the money only in the priced read", () => {
    const priced = catalogueProductOf(row, true)!;
    expect(priced.cost).toBe(1200.5);
    // A negative or height-less cell is no price at all, never zero.
    expect(priced.costGrid).toEqual([{ height: "30", tier: "PRICE_2", cost: 1000 }]);
    const open = catalogueProductOf(row, false)!;
    expect(open).not.toHaveProperty("cost");
    expect(open).not.toHaveProperty("costGrid");
    expect(open).toMatchObject({ modelId: row.modelId, kind: "SOFA", baseModel: "8030", moduleCode: "1A(LHF)" });
    expect(open.options).toEqual([{ height: "30", tier: "PRICE_2" }]);
  });

  it("reads a missing or malformed price as no price", () => {
    expect(catalogueProductOf({ ...row, price: null, grid: null }, true)).toMatchObject({ cost: null, costGrid: [] });
    expect(catalogueProductOf({ ...row, price: "abc" }, true)?.cost).toBeNull();
    expect(catalogueProductOf({ ...row, price: -1 }, true)?.cost).toBeNull();
  });

  it("drops a row with no id, code or version", () => {
    expect(catalogueProductOf({ ...row, id: undefined }, true)).toBeNull();
    expect(catalogueProductOf({ ...row, code: 7 }, true)).toBeNull();
    expect(catalogueProductOf({ ...row, version: null }, true)).toBeNull();
    expect(catalogueProductOf("nope", true)).toBeNull();
  });

  it("keeps only sofa and bed frame dropdowns, and only their known lists", () => {
    expect(
      catalogueModelsOf([
        { id: "m1", kind: "sofa", options: { leg_heights: ['4"', 3, ""], specials: [], colours: ["red"] } },
        { id: "m2", kind: "MATTRESS", options: { sizes: ["K"] } },
        { kind: "BEDFRAME", options: {} },
        "junk",
      ]),
    ).toEqual([{ id: "m1", kind: "SOFA", options: { leg_heights: ['4"'] } }]);
  });

  // 2026-10-06: every Maintenance price is the customer's — a sofa's leg height and specials,
  // a bed frame's specials too. Dropping them here hid the sofa's Leg height row and every
  // special on the Quote (the snapshot and the quote read models through this one reader).
  it("keeps what each kind is charged for, and only a charge above zero", () => {
    expect(
      catalogueModelsOf([
        { id: "s1", kind: "SOFA", options: { leg_heights: ['4"'], specials: ["Wooden Arm"] },
          charges: { leg_heights: [{ value: '4"', charge: 80 }], specials: [{ value: "Wooden Arm", charge: "120" }], divan_heights: [{ value: '8"', charge: 50 }] } },
        { id: "f1", kind: "BEDFRAME", options: { specials: ["Hydraulic", "HB Straight"] },
          charges: { leg_heights: [{ value: '6"', charge: 100 }], specials: [{ value: "Hydraulic", charge: 300 }, { value: "HB Straight", charge: 0 }, { value: "", charge: 5 }] } },
      ]),
    ).toEqual([
      { id: "s1", kind: "SOFA", options: { leg_heights: ['4"'], specials: ["Wooden Arm"] },
        charges: { leg_heights: [{ value: '4"', charge: 80 }], specials: [{ value: "Wooden Arm", charge: 120 }] } },
      { id: "f1", kind: "BEDFRAME", options: { specials: ["Hydraulic", "HB Straight"] },
        charges: { leg_heights: [{ value: '6"', charge: 100 }], specials: [{ value: "Hydraulic", charge: 300 }] } },
    ]);
    expect(catalogueModelsOf(null)).toEqual([]);
  });

  // 2026-10-26: a sofa special Maintenance charges by quantity says so — and only `true` says it.
  it("keeps a special charged by quantity", () => {
    expect(
      catalogueModelsOf([{ id: "s1", kind: "SOFA", options: {}, charges: { specials: [
        { value: "Change 8030 Backcushion", charge: 200, byQuantity: true },
        { value: "Seat Base Fully Cover", charge: 300, byQuantity: "yes" },
        { value: "Wooden Arm", charge: 120 },
      ] } }])[0].charges?.specials,
    ).toEqual([
      { value: "Change 8030 Backcushion", charge: 200, byQuantity: true },
      { value: "Seat Base Fully Cover", charge: 300 },
      { value: "Wooden Arm", charge: 120 },
    ]);
  });

  it("reads surcharges (negative allowed) and priced combos", () => {
    const { products, pricing } = pricedCatalogueOf({
      products: [row, { bad: true }],
      models: [{ id: "m1", kind: "SOFA", options: { specials: ["Nylon Fabric"] } }],
      optionPrices: [
        { pool: "sofa_specials", value: "Nylon Fabric", price: "50" },
        { pool: "bedframe_specials", value: "No Side Panel", price: -40 },
        { pool: "x", value: "y", price: "free" },
      ],
      combos: [
        { erpId: "c1", baseModel: "8030", modules: [["1A(LHF)"], ["2NA"]], tier: null, label: "L", effectiveFrom: "2026-01-01", createdAt: null, priceByHeight: { "30": "2000", "24": 0 } },
        { erpId: "c2", baseModel: "8030", modules: [["1A(LHF)"]], tier: "PRICE_1", label: null, effectiveFrom: "2026-01-01", createdAt: null, priceByHeight: {} },
        { erpId: "c3", baseModel: "8030", modules: "nope", priceByHeight: { "30": 1 } },
      ],
    });
    expect(products).toHaveLength(1);
    expect(pricing.options).toEqual([
      { pool: "sofa_specials", value: "Nylon Fabric", price: 50 },
      { pool: "bedframe_specials", value: "No Side Panel", price: -40 },
    ]);
    // A combo with no usable price is not a combo; a zero price is not a price.
    expect(pricing.combos).toEqual([
      { erpId: "c1", baseModel: "8030", modules: [["1A(LHF)"], ["2NA"]], tier: null, label: "L", effectiveFrom: "2026-01-01", createdAt: null, priceByHeight: { "30": 2000 } },
    ]);
    expect(pricing.models).toEqual([{ id: "m1", kind: "SOFA", options: { specials: ["Nylon Fabric"] } }]);
  });

  it("answers an empty catalogue for a malformed response", () => {
    expect(pricedCatalogueOf(null)).toEqual({ products: [], pricing: { options: [], combos: [], models: [] } });
  });

  // 2026-10-29: each sofa and bed frame is handed its category's fabric upgrades (member_catalogue).
  it("keeps each model's fabric upgrades, and prices them for the calculator once per category and name", () => {
    const models = [
      { id: "s1", kind: "SOFA", options: {}, charges: { fabric_upgrades: [{ value: "Upgrade fabric", charge: 200 }, { value: "Free", charge: 0 }] } },
      { id: "s2", kind: "SOFA", options: {}, charges: { fabric_upgrades: [{ value: "upgrade fabric", charge: 200 }] } },
      { id: "b1", kind: "BEDFRAME", options: {}, charges: { fabric_upgrades: [{ value: "Upgrade fabric", charge: 150 }] } },
    ];
    expect(catalogueModelsOf(models).map(m => m.charges?.fabric_upgrades)).toEqual([
      [{ value: "Upgrade fabric", charge: 200 }], [{ value: "upgrade fabric", charge: 200 }], [{ value: "Upgrade fabric", charge: 150 }],
    ]);
    expect(pricedCatalogueOf({ products: [], optionPrices: [{ pool: "sofa_leg_heights", value: '6"', price: 100 }], combos: [], models }).pricing.options)
      .toEqual([
        { pool: "sofa_leg_heights", value: '6"', price: 100 },
        { pool: "sofa_fabric_upgrades", value: "Upgrade fabric", price: 200 },
        { pool: "bedframe_fabric_upgrades", value: "Upgrade fabric", price: 150 },
      ]);
  });
});
