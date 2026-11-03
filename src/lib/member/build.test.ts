import { describe, expect, it } from "vitest";
import {
  buildChoicesFor,
  buildError,
  buildKey,
  buildLines,
  frameBuildError,
  frameBuildText,
  frameCharge,
  frameChoicesOf,
  kindOf,
  pruneBuild,
  specialQtyOf,
} from "./build";
import type { MemberCatalogueModel, MemberProduct } from "./types";

const product = (id: string, kind: string, modelId: string | null, category = "Sofa"): MemberProduct => ({
  id,
  code: id,
  name: id,
  brand: null,
  category,
  size: "",
  color: "",
  available: true,
  gift: false,
  modelId,
  kind,
  version: "v1",
});

const models: MemberCatalogueModel[] = [
  { id: "soffio", kind: "SOFA", options: { leg_heights: ["Default", '4"', '6"'], specials: ["Nylon Fabric", "Pillow Back"] } },
  { id: "roma", kind: "SOFA", options: { leg_heights: ['6"', "Default"], specials: ["Nylon Fabric"] } },
  { id: "y04", kind: "BEDFRAME", options: { divan_heights: ['8"', '10"'], leg_heights: ["No Leg", '4"'], total_heights: ['24"'], gaps: ['12"'], specials: ["Left Drawer"] } },
];

describe("which build a line takes", () => {
  it("reads the ERP category first, the calculator section otherwise", () => {
    expect(kindOf({ kind: "SOFA", category: "Accessory" })).toBe("SOFA");
    expect(kindOf({ kind: "BEDFRAME", category: "Other" })).toBe("BEDFRAME");
    expect(kindOf({ kind: "MATTRESS", category: "Sofa" })).toBe("OTHER");
    expect(kindOf({ kind: null, category: "Bed frame" })).toBe("BEDFRAME");
    expect(kindOf({ kind: undefined, category: "沙发" })).toBe("SOFA");
    expect(kindOf({ kind: null, category: "Pillow" })).toBe("OTHER");
  });
});

describe("what the cart's builds may take", () => {
  it("offers only what every model of that kind in the cart was ticked for, in the first model's order", () => {
    const choices = buildChoicesFor(
      [product("a", "SOFA", "soffio"), product("b", "SOFA", "roma")],
      models,
    );
    expect(choices.sofa).toEqual({ legs: ["Default", '6"'], specials: ["Nylon Fabric"], upgrades: [] });
    expect(choices.bedframe).toBeNull();
  });

  it("counts a SKU once however many cart lines carry it", () => {
    const one = product("a", "SOFA", "soffio");
    expect(buildChoicesFor([one, one], models).sofa?.legs).toEqual(["Default", '4"', '6"']);
  });

  it("offers nothing when a line of that kind has no model", () => {
    const choices = buildChoicesFor([product("a", "SOFA", "soffio"), product("b", "SOFA", null)], models);
    expect(choices.sofa).toEqual({ legs: [], specials: [], upgrades: [] });
  });

  it("gives a bed frame its own build", () => {
    const choices = buildChoicesFor([product("f", "BEDFRAME", "y04", "Bed frame")], models);
    expect(choices.bedframe).toEqual({
      divans: ['8"', '10"'],
      legs: ["No Leg", '4"'],
      totals: ['24"'],
      gaps: ['12"'],
      specials: ["Left Drawer"],
      upgrades: [],
    });
    expect(choices.sofa).toBeNull();
  });

  it("folds curly inch marks and case when intersecting", () => {
    const curly: MemberCatalogueModel[] = [
      { id: "a", kind: "SOFA", options: { leg_heights: ['4"'] } },
      { id: "b", kind: "SOFA", options: { leg_heights: ["4”"] } },
    ];
    expect(buildChoicesFor([product("x", "SOFA", "a"), product("y", "SOFA", "b")], curly).sofa?.legs).toEqual(['4"']);
  });
});

describe("refusing a build the cart does not offer", () => {
  const sofaCart = buildChoicesFor([product("a", "SOFA", "soffio")], models);
  const frameCart = buildChoicesFor([product("f", "BEDFRAME", "y04", "Bed frame")], models);

  it("accepts what was ticked, and nothing chosen at all", () => {
    expect(buildError({ leg: '4"', specials: ["Nylon Fabric"] }, sofaCart)).toBeNull();
    expect(buildError(undefined, sofaCart)).toBeNull();
    expect(buildError({ height: "30", tier: "PRICE_2" }, sofaCart)).toBeNull();
  });

  it("refuses a leg height or special the model was not ticked for", () => {
    expect(buildError({ leg: '8"' }, sofaCart)).toMatch(/leg height/);
    expect(buildError({ specials: ["Hydraulic"] }, sofaCart)).toMatch(/special/);
  });

  it("refuses sofa options when the cart has no sofa, and bed frame options without a bed frame", () => {
    expect(buildError({ leg: '4"' }, frameCart)).toMatch(/sofa options/);
    expect(buildError({ bedframe: { divan: '8"' } }, sofaCart)).toMatch(/bed frame options/);
  });

  it("checks every bed frame option", () => {
    expect(buildError({ bedframe: { divan: '10"', leg: '4"', total: '24"', gap: '12"', specials: ["Left Drawer"] } }, frameCart)).toBeNull();
    expect(buildError({ bedframe: { divan: '16"' } }, frameCart)).toMatch(/divan/);
    expect(buildError({ bedframe: { total: '30"' } }, frameCart)).toMatch(/total/);
    expect(buildError({ bedframe: { gap: '4"' } }, frameCart)).toMatch(/gap/);
    expect(buildError({ bedframe: { specials: ["Hydraulic"] } }, frameCart)).toMatch(/special/);
  });
});

describe("dropping what the cart no longer offers", () => {
  it("keeps what is still offered and drops the rest, leaving the seat height and tier alone", () => {
    const choices = buildChoicesFor([product("b", "SOFA", "roma")], models);
    expect(pruneBuild({ height: "30", tier: "PRICE_1", leg: '4"', specials: ["Nylon Fabric", "Pillow Back"] }, choices)).toEqual({
      height: "30",
      tier: "PRICE_1",
      specials: ["Nylon Fabric"],
    });
  });

  it("drops the whole bed frame build once no bed frame is left", () => {
    const choices = buildChoicesFor([product("a", "SOFA", "soffio")], models);
    expect(pruneBuild({ leg: "Default", bedframe: { divan: '8"' } }, choices)).toEqual({ leg: "Default" });
  });

  it("is a no-op on a build that already fits", () => {
    const choices = buildChoicesFor([product("f", "BEDFRAME", "y04", "Bed frame")], models);
    const build = { bedframe: { divan: '10"', gap: '12"' } };
    expect(buildKey(pruneBuild(build, choices))).toEqual(buildKey(build));
  });
});

describe("the build's identity and wording", () => {
  it("ignores the order specials were ticked in", () => {
    expect(buildKey({ specials: ["b", "a"] })).toEqual(buildKey({ specials: ["a", "b"] }));
    expect(buildKey({ leg: '4"' })).not.toEqual(buildKey({ leg: '6"' }));
    expect(buildKey({ bedframe: { gap: '12"' } })).not.toEqual(buildKey({}));
  });

  it("states a sofa build and a bed frame build for the customer", () => {
    expect(
      buildLines(
        { height: "30", tier: "PRICE_2", leg: '4"', specials: ["Nylon Fabric"], bedframe: { divan: '10"', leg: "No Leg", gap: '12"', total: '24"', specials: ["Left Drawer"] } },
        { sofaGrid: true, sofa: true, bedframe: true },
      ),
    ).toEqual([
      'Sofa build: seat height 30 · Tier 2 fabric · leg 4" · Nylon Fabric',
      'Bed frame build: divan 10" · leg No Leg · gap 12" · total height 24" · Left Drawer',
    ]);
  });

  it("says nothing about a build the cart does not have or that chose nothing", () => {
    expect(buildLines({ height: "30", tier: "PRICE_2" }, { sofaGrid: false, sofa: false, bedframe: false })).toEqual([]);
    expect(buildLines({}, { sofaGrid: false, sofa: true, bedframe: true })).toEqual([]);
  });
});

// 2026-10-26: a sofa special charged by quantity carries how many.
describe("a special's quantity", () => {
  it("reads it by the special's spelling, 1 when it has none", () => {
    expect(specialQtyOf({ specialQty: { "Change 8030 Backcushion": 3 } }, "change  8030 backcushion")).toBe(3);
    expect(specialQtyOf({ specialQty: { Back: 0 } }, "Back")).toBe(1);
    expect(specialQtyOf(undefined, "Back")).toBe(1);
  });

  it("is part of the build's identity — a build with none keys as it always has", () => {
    expect(buildKey({ specials: ["Back"], specialQty: { Back: 3 } })).not.toEqual(buildKey({ specials: ["Back"], specialQty: { Back: 2 } }));
    expect(buildKey({ specials: ["Back"], specialQty: {} })).toEqual(buildKey({ specials: ["Back"] }));
    expect(buildKey({ specials: ["Back"] })).toHaveLength(9);
  });

  it("is said on the customer's quote, and goes with its special", () => {
    expect(buildLines({ specials: ["Change 8030 Backcushion", "Nylon Fabric"], specialQty: { "Change 8030 Backcushion": 3 } },
      { sofaGrid: false, sofa: true, bedframe: false })).toEqual(["Sofa build: Change 8030 Backcushion ×3, Nylon Fabric"]);
    const choices = buildChoicesFor([product("b", "SOFA", "roma")], models);
    expect(pruneBuild({ specials: ["Nylon Fabric", "Pillow Back"], specialQty: { "Pillow Back": 2, "Nylon Fabric": 4 } }, choices))
      .toEqual({ specials: ["Nylon Fabric"], specialQty: { "Nylon Fabric": 4 } });
    expect(buildError({ specials: ["Nylon Fabric"], specialQty: { "Pillow Back": 2 } }, choices)).toMatch(/quantity no longer matches/);
  });
});

// 2026-10-29: a fabric upgrade (Maintenance › Fabrics) — the Quote picks one by its name.
describe("a fabric upgrade", () => {
  const UP = { value: "Upgrade fabric", charge: 200 };
  const LEATHER = { value: "Leather", charge: 500 };
  const upgraded: MemberCatalogueModel[] = [
    { id: "soffio", kind: "SOFA", options: {}, charges: { fabric_upgrades: [UP, LEATHER] } },
    { id: "roma", kind: "SOFA", options: {}, charges: { fabric_upgrades: [UP] } },
    { id: "y04", kind: "BEDFRAME", options: {}, charges: { fabric_upgrades: [{ value: "Upgrade fabric", charge: 150 }] } },
  ];

  it("is offered what every model in the cart is offered, its category's", () => {
    expect(buildChoicesFor([product("a", "SOFA", "soffio")], upgraded).sofa?.upgrades).toEqual(["Upgrade fabric", "Leather"]);
    expect(buildChoicesFor([product("a", "SOFA", "soffio"), product("b", "SOFA", "roma")], upgraded).sofa?.upgrades).toEqual(["Upgrade fabric"]);
    expect(buildChoicesFor([product("f", "BEDFRAME", "y04", "Bed frame")], upgraded).bedframe?.upgrades).toEqual(["Upgrade fabric"]);
  });

  it("refuses one the cart is not offered, and drops it when the cart changes", () => {
    const both = buildChoicesFor([product("a", "SOFA", "soffio"), product("b", "SOFA", "roma")], upgraded);
    expect(buildError({ fabricUpgrade: "upgrade  FABRIC" }, both)).toBeNull();
    expect(buildError({ fabricUpgrade: "Leather" }, both)).toMatch(/no longer offered for the sofa/);
    expect(buildError({ fabricUpgrade: "Leather" }, { sofa: null, bedframe: null })).toMatch(/no longer match the cart/);
    expect(pruneBuild({ fabricUpgrade: "Leather", leg: "Default" }, both)).toEqual({});
    expect(pruneBuild({ fabricUpgrade: "Upgrade fabric" }, both)).toEqual({ fabricUpgrade: "Upgrade fabric" });
    const frames = buildChoicesFor([product("f", "BEDFRAME", "y04", "Bed frame")], upgraded);
    expect(buildError({ bedframe: { fabricUpgrade: "Leather" } }, frames)).toMatch(/no longer offered for the bed frame/);
  });

  it("keys a build only when it has one, and is said on the customer's quote", () => {
    expect(buildKey({ leg: '6"' })).toEqual(buildKey({ leg: '6"', fabricUpgrade: undefined }));
    expect(buildKey({ leg: '6"', fabricUpgrade: "Upgrade fabric" })).not.toEqual(buildKey({ leg: '6"' }));
    expect(buildLines({ leg: '6"', fabricUpgrade: "Upgrade fabric", bedframe: { divan: '12"', fabricUpgrade: "Upgrade fabric" } },
      { sofaGrid: false, sofa: true, bedframe: true }))
      .toEqual(['Sofa build: leg 6" · Upgrade fabric', 'Bed frame build: divan 12" · Upgrade fabric']);
  });
});

describe("one bed frame's fabric upgrade", () => {
  const frame: MemberCatalogueModel = {
    id: "y04", kind: "BEDFRAME", options: {},
    charges: { leg_heights: [{ value: '6"', charge: 100 }], fabric_upgrades: [{ value: "Upgrade fabric", charge: 150 }] },
  };
  const bed = product("f", "BEDFRAME", "y04", "Bed frame");

  it("is charged per frame beside its options, and said with them", () => {
    const c = frameChoicesOf(frame);
    expect(c.upgrades).toEqual([{ value: "Upgrade fabric", charge: 150 }]);
    expect(frameCharge(c, { leg: '6"', fabricUpgrade: "upgrade fabric" })).toBe(250);
    expect(frameCharge(c, { leg: '6"' })).toBe(100);
    expect(frameBuildText({ leg: '6"', fabricUpgrade: "Upgrade fabric" })).toBe('leg 6" · Upgrade fabric');
  });

  it("refuses one the frame is not offered", () => {
    expect(frameBuildError({ fabricUpgrade: "Upgrade fabric" }, bed, [frame])).toBeNull();
    expect(frameBuildError({ fabricUpgrade: "Leather" }, bed, [frame])).toMatch(/not offered for this bed frame/);
    expect(frameBuildError({ fabricUpgrade: "Upgrade fabric" }, bed, [{ ...frame, charges: {} }])).toMatch(/not offered/);
  });
});
