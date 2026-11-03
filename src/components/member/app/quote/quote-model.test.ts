import { describe, expect, it } from "vitest";
import type { BedframeBuild, MemberProduct } from "@/lib/member/types";
import {
  EMPTY_MEMORY, NO_SOFA_BUILD, accOnlyTitle, accOrder, accVariants, addLines, bump, cartMeta, catalogFromProducts, customerLines, defaultSize, frameMeta, itemsText, layoutFits, liveSets,
  modelMatches, moduleCushions, moduleInfo, remember, setMeta, sheetLines, sizeKeyOf, sofaBuildOf, sofaBuildToSend, sofaCartCharge, sofaPick, sofaSeats, sofaText,
  type CartLine, type QCatalog, type QModule, type SheetState,
} from "./quote-model";

const product = (p: Partial<MemberProduct> & Pick<MemberProduct, "id" | "name">): MemberProduct => ({
  code: p.id.toUpperCase(), brand: null, category: "Accessory", size: "", color: "", available: true, gift: false, version: "1", ...p,
});

const PRODUCTS: MemberProduct[] = [
  product({ id: "apex-q", name: "APEX", brand: "AKEMI", kind: "MATTRESS", category: "Mattress", size: "Queen", modelId: "m-apex" }),
  product({ id: "apex-k", name: "APEX", brand: "AKEMI", kind: "MATTRESS", category: "Mattress", size: "King", modelId: "m-apex" }),
  product({ id: "aristoi-s", name: "ARISTOI", brand: "AKEMI", kind: "MATTRESS", category: "Mattress", size: "Single", modelId: "m-aristoi" }),
  product({ id: "amira-q", name: "AMIRA", brand: "DUNLOP", kind: "MATTRESS", category: "Mattress", size: "Queen", modelId: "m-amira" }),
  product({ id: "2376-2s", name: "2376", brand: "ZANOTTI", kind: "SOFA", category: "Sofa", size: "2S", moduleCode: "2S", modelId: "m-2376",
    options: [{ height: "60cm", tier: "PRICE_1" }, { height: "60cm", tier: "PRICE_2" }, { height: "75cm", tier: "PRICE_1" }] }),
  product({ id: "2376-l", name: "2376", brand: "ZANOTTI", kind: "SOFA", category: "Sofa", size: "L(LHF)", moduleCode: "L(LHF)", modelId: "m-2376",
    options: [{ height: "60cm", tier: "PRICE_1" }, { height: "60cm", tier: "PRICE_2" }] }),
  product({ id: "2376-c", name: "2376", brand: "ZANOTTI", kind: "SOFA", category: "Sofa", size: "Console", moduleCode: "Console", modelId: "m-2376",
    options: [{ height: "75cm", tier: "PRICE_3" }] }),
  product({ id: "pebble-q", name: "PEBBLE GREY", kind: "BEDFRAME", category: "Bed frame", size: "Queen", modelId: "m-pebble" }),
  product({ id: "cody-k", name: "CODY", kind: "BEDFRAME", category: "Bed frame", size: "King", modelId: "m-cody" }),
  product({ id: "mp-q", name: "AERO-MP", kind: "ACCESSORY", category: "Protector", size: "Queen", modelId: "x1" }),
  product({ id: "mp-k", name: "AERO-MP", kind: "ACCESSORY", category: "Protector", size: "King", modelId: "x2" }),
  product({ id: "pil", name: "AK- LTX CLS PIL", kind: "ACCESSORY", category: "Pillow", modelId: "x3" }),
  product({ id: "dl-only", name: "DL PILLOW", brand: "DUNLOP", kind: "ACCESSORY", category: "Pillow", modelId: "x4" }),
  product({ id: "gone", name: "GONE", brand: "AKEMI", kind: "MATTRESS", category: "Mattress", size: "Queen", available: false }),
  // SKU Master's Sofa Accessory: the ERP's FABRIC_ACCESSORY.
  product({ id: "bc01", name: "BACK CUSHION 01", kind: "FABRIC_ACCESSORY", category: "Accessory", modelId: "x5" }),
  product({ id: "sq", name: "SQUARE PILLOW", kind: "FABRIC_ACCESSORY", category: "Accessory", modelId: "x6" }),
];

const akemi = () => catalogFromProducts(PRODUCTS, "AKEMI", "Akemi");
const zanotti = () => catalogFromProducts(PRODUCTS, "ZANOTTI", "Zanotti");

describe("moduleInfo — the ERP's module vocabulary", () => {
  it.each([
    ["1A(LHF)", "1-seat · left arm", 1],
    ["2A(RHF)", "2-seat · right arm", 2],
    ["1B(LHF)", "1-seat · wide left arm", 1],
    ["1NA", "1-seat · armless", 1],
    ["2NA", "2-seat · armless", 2],
    ["1S", "1-seater · both arms", 1],
    ["3S", "3-seater · both arms", 3],
    ["L(RHF)", "Chaise · right", 1],
    ["CNR", "Corner", 0],
    ["Console", "Wood console", 0],
    ["STOOL", "Ottoman / stool", 0],
    ["1A(R)(LHF)", "1-seat · left arm · recliner", 1],
    ["1A(P)(RHF)", "1-seat · right arm · power", 1],
    ["1S(R)", "1-seater · both arms · recliner", 1],
    ["1NA(L)", "1-seat · armless · power leg", 1],
  ])("%s reads %s, %i seat(s)", (code, desc, seats) => {
    expect(moduleInfo(code)).toMatchObject({ desc, seats });
  });

  it("a chaise is wider in the strip", () => {
    expect(moduleInfo("L(LHF)").chaise).toBe(true);
    expect(moduleInfo("2S").chaise).toBe(false);
  });

  // 2026-10-27, the user, shown VERANO 1A(LHF) + 1NA + CNR + 1A(RHF) read "4 seats" while its counted
  // special's first + filled 3: "use 3 … 一个 seat 有一个 back cushion，然后 corner 是没有 back cushion 的".
  it("counts a seat per back cushion — a corner has none", () => {
    const codes = ["1A(LHF)", "1NA", "CNR", "1A(RHF)"];
    const modules: QModule[] = codes.map(code => {
      const info = moduleInfo(code);
      return { code, desc: info.desc, seats: info.seats, chaise: info.chaise, productId: code, options: [] };
    });
    const mods = Object.fromEntries(codes.map(code => [code, 1]));
    expect(sofaSeats(modules, mods)).toBe(3);
    expect(sofaSeats(modules, mods)).toBe(codes.reduce((a, code) => a + moduleCushions(code), 0));
  });
});

// 2026-10-27, the user: "每一个 compartment 只会有一个 back cushion（1A 是一个 back cushion，2A 就是两个 back cushion）";
// a whole sofa "都当 1 个"; a corner "cnr , put = 0". The ERP's SOFA_MODULES `cushions` but the corner —
// catalogue_apply_sofa_charges counts the same.
describe("moduleCushions — a module's back cushions, its compartments", () => {
  it.each([
    ["1A(LHF)", 1], ["2A(RHF)", 2], ["1B(LHF)", 1], ["2B(LHF)", 2], ["1NA", 1], ["2NA", 2], ["1S", 1], ["2S", 2], ["3S", 3],
    ["1A(P)(RHF)", 1], ["1NA(L)", 1], ["1S(R)", 1], ["L(RHF)", 1], ["CNR", 0], ["Console", 0], ["STOOL", 0], ["6FT", 1], ["", 1],
  ])("%s has %i", (code, cushions) => {
    expect(moduleCushions(code)).toBe(cushions);
  });
});

describe("catalogFromProducts", () => {
  it("groups a brand's SKUs into models, A–Z, one SKU per size", () => {
    const c = akemi();
    expect(c.models.map(m => m.name)).toEqual(["APEX", "ARISTOI"]);
    expect(c.models[0].sizes).toEqual({ Q: "apex-q", K: "apex-k" });
    expect(c.sofa).toBe(false);
  });

  it("leaves out other brands, unavailable SKUs, and riders of another brand", () => {
    const c = akemi();
    expect(c.models.some(m => m.name === "AMIRA" || m.name === "GONE")).toBe(false);
    expect(c.accs.map(a => a.name)).toEqual(["AERO-MP", "AK- LTX CLS PIL"]);
    expect(catalogFromProducts(PRODUCTS, "DUNLOP", "Dunlopillo").accs.map(a => a.name)).toContain("DL PILLOW");
  });

  it("a bed frame or accessory carrying the brand is still a bed frame or accessory, never a model", () => {
    const own = [...PRODUCTS, product({ id: "ak-frame", name: "AK FRAME", brand: "AKEMI", kind: "BEDFRAME", category: "Bed frame", size: "Queen", modelId: "m-akf" })];
    const c = catalogFromProducts(own, "AKEMI", "Akemi");
    expect(c.models.map(m => m.name)).toEqual(["APEX", "ARISTOI"]);
    expect(c.frames.map(f => f.name)).toContain("AK FRAME");
    expect(catalogFromProducts(own, "DUNLOP", "Dunlopillo").frames.map(f => f.name)).not.toContain("AK FRAME");
  });

  it("keeps every bed frame and accessory as a rider in any brand's quote", () => {
    const c = catalogFromProducts(PRODUCTS, "DUNLOP", "Dunlopillo");
    expect(c.frames.map(f => f.name)).toEqual(["CODY", "PEBBLE GREY"]);
    expect(c.accs.find(a => a.name === "AERO-MP")?.sizes).toEqual({ Q: "mp-q", K: "mp-k" });
    expect(c.accs.find(a => a.name === "AK- LTX CLS PIL")?.any).toBe("pil");
  });

  // 2026-10-26, the user: a sofa needs its own accessories — "沙发 accessory only" — SKU Master's Sofa Accessory; the two lists kept apart.
  it("sells a sofa brand its sofa accessories alone, and a mattress brand every other accessory", () => {
    const sofa = zanotti();
    expect(sofa.accs.map(a => [a.name, a.any])).toEqual([["BACK CUSHION 01", "bc01"], ["SQUARE PILLOW", "sq"]]);
    expect(sofa.accSummary).toBe("2 items");
    expect(akemi().accs.map(a => a.name)).toEqual(["AERO-MP", "AK- LTX CLS PIL"]);
    expect(accOnlyTitle(sofa)).toBe("Sofa accessories only");
    expect(accOnlyTitle(akemi())).toBe("Accessories only");
  });

  it("orders a sofa's modules left pieces first, then the middle, then accessories", () => {
    const c = zanotti();
    expect(c.sofa).toBe(true);
    expect(c.models[0].modules.map(x => x.code)).toEqual(["L(LHF)", "2S", "Console"]);
  });

  // 2026-10-20, the user: "quote show aaaa enought, not need the code" — member_catalogue names a named sofa by its name alone.
  it("shows a named sofa by its name, keeps two sofas named alike apart, and still finds one by its code", () => {
    const sofa = (id: string, name: string, baseModel: string, modelId: string) =>
      product({ id, name, baseModel, modelId, brand: "ZANOTTI", kind: "SOFA", category: "Sofa", size: "1S", moduleCode: "1S" });
    const c = catalogFromProducts([
      sofa("5071-1s", "AAAA", "5071", "m-5071"), sofa("5066-1s", "5066", "5066", "m-5066"),
      sofa("8030-1s", "SOFFIO", "8030", "m-8030"), sofa("9999-1s", "SOFFIO", "9999", "m-9999"),
    ], "ZANOTTI", "Zanotti");
    expect(c.models.map(m => [m.name, m.desc])).toEqual([["5066", "5066"], ["AAAA", "5071"], ["SOFFIO", "8030"], ["SOFFIO", "9999"]]);
    const find = (q: string) => c.models.filter(m => modelMatches(m, q)).map(m => m.name);
    expect(find("5071")).toEqual(["AAAA"]);
    expect(find("aaaa")).toEqual(["AAAA"]);
    expect(find("soffio")).toEqual(["SOFFIO", "SOFFIO"]);
    expect(find("9999")).toEqual(["SOFFIO"]);
    expect(find("")).toHaveLength(4);
  });

  it("reads the size words the Product List writes", () => {
    expect(sizeKeyOf("Super Single")).toBe("SS");
    expect(sizeKeyOf("super  king")).toBe("SK");
    expect(sizeKeyOf("")).toBeNull();
    expect(defaultSize({ K: "x", S: "y" })).toBe("K");
  });
});

describe("sheetLines — what a sheet adds", () => {
  it("a mattress set: the mattress, its bed frames and accessories, times the sets", () => {
    const sh: SheetState = {
      mode: "model", key: "m-apex", size: "Q", qty: 2, accAll: false, fx: null,
      acc: { "AERO-MP": 1, "AK- LTX CLS PIL": 2 },
      bfs: [{ size: "Q", frame: "m-pebble", kpi: [], qty: 1 }],
    };
    const lines = sheetLines(sh, akemi());
    expect(lines.map(l => [l.id, l.productId, l.qty])).toEqual([
      ["m-m-apex-Q", "apex-q", 2],
      ["f-m-pebble-Q", "pebble-q", 2],
      ["a-AERO-MP-Q", "mp-q", 2],
      ["a-AK- LTX CLS PIL-", "pil", 4],
    ]);
  });

  it("a fitted accessory that does not match the mattress size is left out", () => {
    const sh: SheetState = {
      mode: "model", key: "m-aristoi", size: "S", qty: 1, bfs: [], fx: null, accAll: false,
      acc: { "AERO-MP": 1, "AK- LTX CLS PIL": 1 },
    };
    expect(sheetLines(sh, akemi()).map(l => l.productId)).toEqual(["aristoi-s", "pil"]);
  });

  it("buys standalone accessories in several sizes together, with each SKU's own quantity", () => {
    const sh: SheetState = { mode: "acc", accAll: false, acc: { "mp-q": 2, "mp-k": 3, pil: 4, "not-in-catalogue": 1 } };
    const lines = sheetLines(sh, akemi());
    expect(lines.map(l => [l.id, l.productId, l.size, l.qty])).toEqual([
      ["a-AERO-MP-Q", "mp-q", "Queen", 2],
      ["a-AERO-MP-K", "mp-k", "King", 3],
      ["a-AK- LTX CLS PIL-", "pil", "", 4],
    ]);
    const mattress: SheetState = {
      mode: "model", key: "m-apex", size: "Q", qty: 1, bfs: [], fx: null, accAll: false, acc: { "AERO-MP": 1 },
    };
    expect(addLines(sheetLines(mattress, akemi()), lines).filter(l => l.kind === "acc").map(l => [l.productId, l.qty]))
      .toEqual([["mp-q", 3], ["mp-k", 3], ["pil", 4]]);
  });

  it("lists every standalone SKU, one-size first and fitted sizes smallest first", () => {
    expect(accVariants({ key: "protector", name: "Protector", any: "any", sizes: { SK: "sk", K: "k", Q: "q", SS: "ss", S: "s" } }))
      .toEqual([
        { productId: "any", size: null }, { productId: "s", size: "S" }, { productId: "ss", size: "SS" },
        { productId: "q", size: "Q" }, { productId: "k", size: "K" }, { productId: "sk", size: "SK" },
      ]);
  });

  it("a sofa: each module times its count times the sets", () => {
    const sh: SheetState = { mode: "sofa", key: "m-2376", layout: "C", mods: { "L(LHF)": 1, "2S": 2 }, qty: 2, kpi: [], height: null, tier: null, leg: null, specials: [], acc: {}, accAll: false };
    const lines = sheetLines(sh, zanotti());
    expect(lines.map(l => [l.name, l.size, l.qty])).toEqual([["2376 L(LHF)", "Chaise · left", 2], ["2376 2S", "2-seater · both arms", 4]]);
  });

  it("a sofa's accessories ride it, times the sets — and with no module there is nothing to add", () => {
    const sh: Extract<SheetState, { mode: "sofa" }> = {
      mode: "sofa", key: "m-2376", layout: "C", mods: { "2S": 1 }, qty: 2, kpi: [], height: null, tier: null, leg: null, specials: [],
      acc: { sq: 2, bc01: 1, "not-in-catalogue": 1 }, accAll: false,
    };
    expect(sheetLines(sh, zanotti()).map(l => [l.kind, l.productId, l.qty])).toEqual([
      ["sofa", "2376-2s", 2], ["acc", "bc01", 2], ["acc", "sq", 4],
    ]);
    expect(sheetLines({ ...sh, mods: {} }, zanotti())).toEqual([]);
  });

  it("sofa accessories on their own, each SKU at its own quantity", () => {
    const sh: SheetState = { mode: "acc", accAll: false, acc: { sq: 3, "mp-q": 1 } };
    expect(sheetLines(sh, zanotti()).map(l => [l.id, l.productId, l.qty])).toEqual([["a-SQUARE PILLOW-", "sq", 3]]);
  });

  it("a bed frame on its own", () => {
    const sh: SheetState = { mode: "frame", size: "K", frame: "m-cody", kpi: [], qty: 3, drop: false };
    expect(sheetLines(sh, akemi()).map(l => [l.kind, l.productId, l.qty])).toEqual([["frame", "cody-k", 3]]);
  });
});

describe("the cart", () => {
  const line = (id: string, qty: number): CartLine => ({ id, kind: "acc", key: id, name: id, size: "", qty, productId: id });

  it("adds to a line already there and caps it at 100", () => {
    expect(addLines([line("a", 99)], [line("a", 5), line("b", 1)]).map(l => [l.id, l.qty])).toEqual([["a", 100], ["b", 1]]);
  });

  it("drops a line taken down to 0", () => {
    expect(bump([line("a", 1), line("b", 2)], "a", -1).map(l => l.id)).toEqual(["b"]);
  });

  it("counts items", () => {
    expect(itemsText([line("a", 1), line("b", 3)], "Akemi")).toBe("4 items · Akemi");
    expect(itemsText([], "Akemi")).toBe("Your cart is empty");
  });
});

describe("last used", () => {
  it("remembers a mattress set and a sofa layout, newest first, three at most", () => {
    let m = EMPTY_MEMORY;
    for (const size of ["S", "SS", "Q", "K"] as const) {
      m = remember(m, { mode: "model", key: "m-apex", size, qty: 1, acc: {}, bfs: [], fx: null, accAll: false }, akemi());
    }
    expect(m.sets.AKEMI.map(r => (r.kind === "mattress" ? r.size : ""))).toEqual(["K", "Q", "SS"]);
    m = remember(m, { mode: "sofa", key: "m-2376", layout: "C", mods: { "2S": 1, "L(LHF)": 1 }, qty: 1, kpi: [], height: null, tier: null, leg: null, specials: [], acc: {}, accAll: false }, zanotti());
    m = remember(m, { mode: "sofa", key: "m-2376", layout: "C", mods: { "L(LHF)": 1, "2S": 1 }, qty: 1, kpi: [], height: null, tier: null, leg: null, specials: [], acc: {}, accAll: false }, zanotti());
    expect(m.layouts.ZANOTTI).toHaveLength(1);
    expect(m.sets.ZANOTTI).toHaveLength(1);
  });

  it("remembers the sofa accessories a sofa was added with", () => {
    const m = remember(EMPTY_MEMORY, {
      mode: "sofa", key: "m-2376", layout: "C", mods: { "2S": 1 }, qty: 1, kpi: [], height: null, tier: null, leg: null, specials: [], acc: { sq: 1, bc01: 0 }, accAll: false,
    }, zanotti());
    expect(m.accs.ZANOTTI).toEqual(["SQUARE PILLOW"]);
    expect(accOrder(zanotti(), m, {}).map(a => a.name)).toEqual(["SQUARE PILLOW", "BACK CUSHION 01"]);
  });

  it("forgets a set the catalogue no longer sells", () => {
    const m = { ...EMPTY_MEMORY, sets: { AKEMI: [{ kind: "mattress" as const, key: "m-apex", size: "S" as const, bfs: [] }, { kind: "mattress" as const, key: "m-apex", size: "K" as const, bfs: [] }] } };
    expect(liveSets(m, akemi()).map(r => (r.kind === "mattress" ? r.size : ""))).toEqual(["K"]);
  });

  it("reads a set the prototype's way", () => {
    const c = akemi();
    expect(setMeta({ kind: "mattress", key: "m-apex", size: "Q", bfs: [{ size: "Q", frame: "m-pebble", kpi: [], qty: 1 }] }, c)).toBe("Queen · PEBBLE GREY");
    expect(setMeta({ kind: "mattress", key: "m-apex", size: "K", bfs: [] }, c)).toBe("King · No bed frame");
    expect(frameMeta({ size: "K", frame: "m-cody", kpi: [] }, c)).toBe("King · CODY");
    const z = zanotti();
    expect(setMeta({ kind: "sofa", key: "m-2376", mods: { "2S": 1, "L(LHF)": 1 }, kpi: [] }, z)).toBe("3 seats · L(LHF) + 2S");
  });

  it("lists picked accessories first, then remembered ones, then the catalogue's order", () => {
    const c = akemi();
    expect(accOrder(c, EMPTY_MEMORY, {}).map(a => a.name)).toEqual(["AERO-MP", "AK- LTX CLS PIL"]);
    expect(accOrder(c, { ...EMPTY_MEMORY, accs: { AKEMI: ["AK- LTX CLS PIL"] } }, {}).map(a => a.name)).toEqual(["AK- LTX CLS PIL", "AERO-MP"]);
  });

  it("remembers standalone SKU selections once per accessory name, preserving previous recents", () => {
    const c = akemi();
    const memory = { ...EMPTY_MEMORY, accs: { AKEMI: ["AK- LTX CLS PIL", "AERO-MP"], ZANOTTI: ["other"] } };
    const next = remember(memory, { mode: "acc", accAll: false, acc: { "mp-q": 1, "mp-k": 2, pil: 0, missing: 1 } }, c);
    expect(next.accs).toEqual({ AKEMI: ["AERO-MP", "AK- LTX CLS PIL"], ZANOTTI: ["other"] });
    expect(memory.accs.AKEMI).toEqual(["AK- LTX CLS PIL", "AERO-MP"]);
    expect(accOrder(c, next, {}).map(acc => acc.name)).toEqual(["AERO-MP", "AK- LTX CLS PIL"]);
  });
});

describe("the sofa build", () => {
  const z = zanotti();
  const model = z.models[0];
  const sofa = (mods: Record<string, number>, height: string | null = null): Extract<SheetState, { mode: "sofa" }> =>
    ({ mode: "sofa", key: "m-2376", layout: "C", mods, qty: 1, kpi: [], height, tier: null, leg: null, specials: [], acc: {}, accAll: false });

  it("offers only the seat heights and tiers every chosen module is costed in", () => {
    const pick = sofaPick(sofa({ "2S": 1, "L(LHF)": 1 }), z, [], { height: null, tier: null, leg: null, specials: [] });
    expect(pick).toMatchObject({ graded: true, heights: ["60cm"], height: "60cm", tiers: ["PRICE_1", "PRICE_2"], tier: "PRICE_1", clash: false });
  });

  it("keeps the cart's own choice when it still fits", () => {
    expect(sofaPick(sofa({ "2S": 1 }), z, [], { height: "75cm", tier: "PRICE_1", leg: null, specials: [] })).toMatchObject({ height: "75cm", tier: "PRICE_1", leg: null, specials: [] });
  });

  it("says so when no seat height costs every module", () => {
    expect(sofaPick(sofa({ "L(LHF)": 1, Console: 1 }), z, [], { height: null, tier: null, leg: null, specials: [] }).clash).toBe(true);
  });

  it("counts the sofa modules already in the cart too", () => {
    const inCart: CartLine[] = [{ id: "s-l", kind: "sofa", key: "m-2376", name: "2376 L(LHF)", size: "", qty: 1, productId: "2376-l" }];
    expect(sofaPick(sofa({ "2S": 1 }), z, inCart, { height: "75cm", tier: null, leg: null, specials: [] }).height).toBe("60cm");
  });

  it("reads a layout", () => {
    expect(sofaText(model.modules, { "2S": 2, "L(LHF)": 1 })).toBe("L(LHF) + 2× 2S");
    expect(sofaSeats(model.modules, { "2S": 2, "L(LHF)": 1 })).toBe(5);
    expect(layoutFits(model, { "2S": 1, CNR: 1 })).toBe(false);
  });
});

describe("a catalogue with nothing for a brand", () => {
  it("has no models", () => {
    const c: QCatalog = catalogFromProducts([], "AKEMI", "Akemi");
    expect(c.models).toEqual([]);
    expect(c.accSummary).toBe("0 items");
  });
});

// 2026-10-05: a bed frame's divan, leg and gap are FOC or charged on top; each frame built on its own.
describe("a bed frame's own build", () => {
  const MODELS = [
    { id: "m-cody", kind: "BEDFRAME" as const, options: { specials: ["HB Straight"] },
      charges: { leg_heights: [{ value: '6"', charge: 100 }], gaps: [{ value: '12"', charge: 20 }] } },
  ];
  const withCharges = () => catalogFromProducts(PRODUCTS, "AKEMI", "Akemi", [], MODELS);
  const frameSheet = (build?: BedframeBuild): SheetState =>
    ({ mode: "frame", size: "K", frame: "m-cody", kpi: [], qty: 1, drop: false, ...(build ? { build } : {}) });

  it("reads each frame's charges from the catalogue's models; a frame with none is all FOC", () => {
    const c = withCharges();
    expect(c.frames.find(f => f.key === "m-cody")?.choices).toEqual({
      divans: [], legs: [{ value: '6"', charge: 100 }], gaps: [{ value: '12"', charge: 20 }], totals: [], specials: [], upgrades: [],
    });
    expect(c.frames.find(f => f.key === "m-pebble")?.choices).toEqual({ divans: [], legs: [], gaps: [], totals: [], specials: [], upgrades: [] });
  });

  // 2026-10-06 (user): "if there is no price written in Maintenance, then just don't show it".
  it("offers a special only when Maintenance charges it — turned ON with no price, it is not shown and drops out", () => {
    // CODY has HB Straight turned ON on Modular and no price for it.
    expect(withCharges().frames.find(f => f.key === "m-cody")?.choices.specials).toEqual([]);
    const [line] = sheetLines(frameSheet({ leg: '6"', specials: ["HB Straight"] }), withCharges());
    expect(line).toMatchObject({ bedframe: { leg: '6"' }, charge: 100 });
    expect(line.bedframe?.specials).toBeUndefined();
  });

  // 2026-10-06: a bed frame's special is charged on top too, when Maintenance prices it.
  it("charges a special Maintenance prices, per frame, and says so", () => {
    const priced = catalogFromProducts(PRODUCTS, "AKEMI", "Akemi", [], [
      { ...MODELS[0], charges: { ...MODELS[0].charges, specials: [{ value: "HB Straight", charge: 50 }] } },
    ]);
    const [line] = sheetLines(frameSheet({ leg: '6"', specials: ["HB Straight"] }), priced);
    expect(line).toMatchObject({ bedframe: { leg: '6"', specials: ["HB Straight"] }, charge: 150 });
    expect(cartMeta(line, "Akemi")).toBe('King · Follows Akemi margin · leg 6" · HB Straight · +RM 150 each');
    expect(frameMeta({ size: "K", frame: "m-cody", kpi: [], build: { specials: ["HB Straight"] } }, priced)).toBe("King · CODY · HB Straight +RM 50");
  });

  it("adds a built frame as its own line, with what it is charged — FOC is no build at all", () => {
    const c = withCharges();
    const [foc] = sheetLines(frameSheet(), c);
    expect(foc).toMatchObject({ id: "f-m-cody-K", productId: "cody-k" });
    expect(foc.bedframe).toBeUndefined();
    expect(foc.charge).toBeUndefined();
    const [built] = sheetLines(frameSheet({ leg: '6"', gap: '12"' }), c);
    expect(built.id).not.toBe(foc.id);
    expect(built).toMatchObject({ productId: "cody-k", bedframe: { leg: '6"', gap: '12"' }, charge: 120 });
    const cart = addLines(addLines([], [foc]), [built]);
    expect(cart).toHaveLength(2);
  });

  it("drops a choice the frame no longer offers", () => {
    const [line] = sheetLines(frameSheet({ leg: '9"', divan: '12"' }), withCharges());
    expect(line.bedframe).toBeUndefined();
  });

  it("says the build and its charge on the cart sheet, and in a last-used frame", () => {
    const c = withCharges();
    const [line] = sheetLines(frameSheet({ leg: '6"' }), c);
    expect(cartMeta(line, "Akemi")).toBe('King · Follows Akemi margin · leg 6" · +RM 100 each');
    expect(frameMeta({ size: "K", frame: "m-cody", kpi: [], build: { leg: '6"' } }, c)).toBe('King · CODY · leg 6" +RM 100');
  });
});

// 2026-10-06 (user): a sofa's leg height and specials — the old builder's, left out by the
// revamp; then "我要那些价钱是不会算进 margin 的": a leg height is offered as a bed frame's
// is — FOC plus the ones Maintenance CHARGES — and a special only when Maintenance charges
// it ("if there is no price … just don't show it"). Only what Modular turned ON, only what
// EVERY sofa model in the cart takes (one build makes every sofa in it, the server's
// buildChoicesFor), charged once per sofa ("整组 sofa 只加一次").
describe("a sofa's leg height and specials", () => {
  const SOFAS: MemberProduct[] = [
    ...PRODUCTS,
    product({ id: "2376-2s-b", name: "2376", brand: "ZANOTTI", kind: "SOFA", category: "Sofa", size: "2NA", moduleCode: "2NA", modelId: "m-2376" }),
    product({ id: "810-2s", name: "810", brand: "ZANOTTI", kind: "SOFA", category: "Sofa", size: "2S", moduleCode: "2S", modelId: "m-810" }),
  ];
  const LEG4 = { value: '4"', charge: 80 };
  const LEG6 = { value: '6"', charge: 100 };
  const ARM = { value: "Wooden Arm", charge: 120 };
  const SEAT = { value: "Seat Add 1ft", charge: 150 };
  // Pillow Back is turned ON for 2376 with no price: never offered.
  const MODELS = [
    { id: "m-2376", kind: "SOFA" as const, options: { leg_heights: ["No Leg", '4"', '6"'], specials: ["Wooden Arm", "Seat Add 1ft", "Pillow Back"] },
      charges: { leg_heights: [LEG4, LEG6], specials: [ARM, SEAT] } },
    { id: "m-810", kind: "SOFA" as const, options: { leg_heights: ['6"'], specials: ["Wooden Arm"] },
      charges: { leg_heights: [LEG6], specials: [ARM] } },
  ];
  const z = () => catalogFromProducts(SOFAS, "ZANOTTI", "Zanotti", [], MODELS);
  const sheet = (key: string, leg: string | null = null, specials: string[] = []): Extract<SheetState, { mode: "sofa" }> =>
    ({ mode: "sofa", key, layout: "C", mods: { "2S": 1 }, qty: 1, kpi: [], height: null, tier: null, leg, specials, acc: {}, accAll: false });
  const inCart = (key: string, productId: string, qty = 1): CartLine => ({ id: `s-${productId}`, kind: "sofa", key, name: key, size: "", qty, productId });

  it("reads each sofa model's charged legs and charged specials; a model with none offers nothing", () => {
    expect(z().models.find(m => m.key === "m-2376")?.choices).toEqual({ legs: [LEG4, LEG6], specials: [ARM, SEAT], upgrades: [] });
    expect(zanotti().models.find(m => m.key === "m-2376")?.choices).toEqual({ legs: [], specials: [], upgrades: [] });
    expect(sofaPick(sheet("m-2376"), zanotti(), [], NO_SOFA_BUILD)).toMatchObject({ legs: [], specials: [], leg: null, picked: [] });
  });

  it("offers FOC plus the charged legs and only the charged specials, and keeps the sheet's choices", () => {
    expect(sofaPick(sheet("m-2376", '4"', ["Seat Add 1ft"]), z(), [], NO_SOFA_BUILD)).toMatchObject({
      legs: [LEG4, LEG6], specials: [ARM, SEAT], leg: '4"', picked: ["Seat Add 1ft"],
    });
    // Turned ON but charged nothing: a leg is FOC, not a choice of its own; a special is not offered at all.
    expect(sofaPick(sheet("m-2376", "No Leg"), z(), [], NO_SOFA_BUILD).leg).toBeNull();
    expect(sofaPick(sheet("m-2376", null, ["Pillow Back", "Wooden Arm"]), z(), [], NO_SOFA_BUILD).picked).toEqual(["Wooden Arm"]);
  });

  it("offers only what every sofa model in the cart takes, and drops a choice another model does not", () => {
    const pick = sofaPick(sheet("m-810", '4"', ["Seat Add 1ft", "Wooden Arm"]), z(), [inCart("m-2376", "2376-2s")], NO_SOFA_BUILD);
    expect(pick).toMatchObject({ legs: [LEG6], specials: [ARM], leg: null, picked: ["Wooden Arm"] });
  });

  it("matches a value however the ERP spells it, and answers in the list's spelling", () => {
    expect(sofaPick(sheet("m-2376", '6”', ["seat  add 1FT"]), z(), [], NO_SOFA_BUILD)).toMatchObject({ leg: '6"', picked: ["Seat Add 1ft"] });
  });

  it("asks the server only for what every sofa in the cart still takes", () => {
    const build = { height: "60cm", tier: "PRICE_1", leg: '4"', specials: ["Wooden Arm", "Seat Add 1ft"] };
    expect(sofaBuildToSend(build, z(), [inCart("m-2376", "2376-2s")])).toEqual({ ...build, specialQty: {}, fabricUpgrade: null });
    expect(sofaBuildToSend(build, z(), [inCart("m-2376", "2376-2s"), inCart("m-810", "810-2s")]))
      .toEqual({ height: "60cm", tier: "PRICE_1", leg: null, specials: ["Wooden Arm"], specialQty: {}, fabricUpgrade: null });
    // Turned OFF on Modular (or no longer charged) since: it drops out.
    expect(sofaBuildToSend(build, zanotti(), [inCart("m-2376", "2376-2s")]))
      .toEqual({ height: "60cm", tier: "PRICE_1", leg: null, specials: [], specialQty: {}, fabricUpgrade: null });
    expect(sofaBuildToSend({ ...build, specials: ["Pillow Back", "Seat Add 1ft"] }, z(), [inCart("m-2376", "2376-2s")]).specials).toEqual(["Seat Add 1ft"]);
  });

  it("charges the cart's sofas once a sofa until the server says: two pieces of one model are one sofa", () => {
    const build = { height: null, tier: null, leg: '6"', specials: ["Seat Add 1ft"] };
    expect(sofaCartCharge(z(), [inCart("m-2376", "2376-2s"), inCart("m-2376", "2376-2s-b")], build)).toBe(250);
    expect(sofaCartCharge(z(), [inCart("m-2376", "2376-2s", 2), inCart("m-2376", "2376-2s-b", 2)], build)).toBe(500);
    // Two models are two sofas — and the special 810 was not turned ON for is not offered on either.
    expect(sofaCartCharge(z(), [inCart("m-2376", "2376-2s"), inCart("m-810", "810-2s")], build)).toBe(200);
    expect(sofaCartCharge(z(), [inCart("m-2376", "2376-2s")], NO_SOFA_BUILD)).toBe(0);
    expect(sofaCartCharge(null, [inCart("m-2376", "2376-2s")], build)).toBe(0);
  });

  it("reads a build an older phone kept (seat height and tier only)", () => {
    expect(sofaBuildOf({ height: "60cm", tier: "PRICE_1" }))
      .toEqual({ height: "60cm", tier: "PRICE_1", leg: null, specials: [], specialQty: {}, fabricUpgrade: null });
    expect(sofaBuildOf(undefined)).toEqual(NO_SOFA_BUILD);
    expect(sofaBuildOf({ leg: '6"', specials: ["Wooden Arm", 3 as unknown as string] }))
      .toEqual({ height: null, tier: null, leg: '6"', specials: ["Wooden Arm"], specialQty: {}, fabricUpgrade: null });
    // Quantities (2026-10-26): whole numbers 1–100 only.
    expect(sofaBuildOf({ specials: ["Back"], specialQty: { Back: 3, Bad: 0, Worse: 1.5, Wrong: "2" as unknown as number } }).specialQty).toEqual({ Back: 3 });
  });

  // 2026-10-29 (user): "just like them choose, like upgrade fabric enough" — Maintenance › Fabrics' upgrades, by name.
  describe("a fabric upgrade", () => {
    const UP = { value: "Upgrade fabric", charge: 200 };
    const LEATHER = { value: "Leather", charge: 500 };
    const UPGRADED = [
      { ...MODELS[0], charges: { ...MODELS[0].charges, fabric_upgrades: [UP, LEATHER] } },
      { ...MODELS[1], charges: { ...MODELS[1].charges, fabric_upgrades: [UP] } },
    ];
    const u = () => catalogFromProducts(SOFAS, "ZANOTTI", "Zanotti", [], UPGRADED);

    it("is offered what every sofa model in the cart takes, Standard besides", () => {
      expect(u().models.find(m => m.key === "m-2376")?.choices.upgrades).toEqual([UP, LEATHER]);
      const alone = sofaPick({ ...sheet("m-2376"), fabricUpgrade: "leather" }, u(), [], NO_SOFA_BUILD);
      expect(alone).toMatchObject({ upgrades: [UP, LEATHER], fabricUpgrade: "Leather" });
      // 810 in the cart takes Upgrade fabric alone: Leather drops to Standard.
      expect(sofaPick({ ...sheet("m-2376"), fabricUpgrade: "Leather" }, u(), [inCart("m-810", "810-2s")], NO_SOFA_BUILD))
        .toMatchObject({ upgrades: [UP], fabricUpgrade: null });
    });

    it("is charged once per sofa until the server says, and sent only while the cart takes it", () => {
      const build = { ...NO_SOFA_BUILD, fabricUpgrade: "Upgrade fabric" };
      expect(sofaCartCharge(u(), [inCart("m-2376", "2376-2s"), inCart("m-2376", "2376-2s-b")], build)).toBe(200);
      expect(sofaCartCharge(u(), [inCart("m-2376", "2376-2s", 2), inCart("m-2376", "2376-2s-b", 2)], build)).toBe(400);
      expect(sofaCartCharge(u(), [inCart("m-2376", "2376-2s"), inCart("m-810", "810-2s")], build)).toBe(400);
      expect(sofaBuildToSend(build, u(), [inCart("m-2376", "2376-2s")]).fabricUpgrade).toBe("Upgrade fabric");
      expect(sofaBuildToSend({ ...build, fabricUpgrade: "Leather" }, u(), [inCart("m-2376", "2376-2s"), inCart("m-810", "810-2s")]).fabricUpgrade)
        .toBeNull();
      expect(sofaBuildOf({ fabricUpgrade: "Leather" }).fabricUpgrade).toBe("Leather");
    });
  });
});

// 2026-10-26, the user: "一种是整 set 沙发的 … 另一种是 by quantity 的。比如 change 8030 back cushion，一个沙发可能有三个
// compartment（三个 seat），所以这个东西应该要乘三。所以它需要在 quotation 那边的 quantity 可以放 plus 和 minus".
describe("a sofa special charged by quantity", () => {
  const SOFAS: MemberProduct[] = [
    ...PRODUCTS,
    product({ id: "810-2s", name: "810", brand: "ZANOTTI", kind: "SOFA", category: "Sofa", size: "2S", moduleCode: "2S", modelId: "m-810" }),
  ];
  const BACK = { value: "Change 8030 Backcushion", charge: 200, byQuantity: true };
  const SEAT = { value: "Seat Base Fully Cover with no Leg", charge: 300 };
  const MODELS = [
    { id: "m-2376", kind: "SOFA" as const, options: { specials: [BACK.value, SEAT.value] }, charges: { specials: [BACK, SEAT] } },
    { id: "m-810", kind: "SOFA" as const, options: { specials: [BACK.value] }, charges: { specials: [BACK] } },
  ];
  const z = () => catalogFromProducts(SOFAS, "ZANOTTI", "Zanotti", [], MODELS);
  const inCart = (key: string, productId: string, qty = 1): CartLine => ({ id: `s-${productId}`, kind: "sofa", key, name: key, size: "", qty, productId });
  const sheet = (specials: string[], specialQty: Record<string, number> = {}): Extract<SheetState, { mode: "sofa" }> =>
    ({ mode: "sofa", key: "m-2376", layout: "C", mods: { "2S": 1 }, qty: 1, kpi: [], height: null, tier: null, leg: null, specials, specialQty, acc: {}, accAll: false });

  it("keeps what Maintenance says of each special, and how many of one charged by quantity", () => {
    expect(z().models.find(m => m.key === "m-2376")?.choices.specials).toEqual([BACK, SEAT]);
    expect(sofaPick(sheet([BACK.value, SEAT.value], { [BACK.value]: 3 }), z(), [], NO_SOFA_BUILD))
      .toMatchObject({ picked: [BACK.value, SEAT.value], qty: { [BACK.value]: 3 } });
    // Picked with no quantity yet counts 1; a quantity for a special not picked is not one.
    expect(sofaPick(sheet([BACK.value]), z(), [], NO_SOFA_BUILD).qty).toEqual({ [BACK.value]: 1 });
    expect(sofaPick(sheet([SEAT.value], { [BACK.value]: 4 }), z(), [], NO_SOFA_BUILD).qty).toEqual({});
  });

  it("knows the compartments a count starts at: the sofas in the cart and what the sheet adds (2026-10-27)", () => {
    expect(sofaPick(sheet([]), z(), [], NO_SOFA_BUILD).compartments).toBe(2);
    expect(sofaPick({ ...sheet([]), qty: 2 }, z(), [], NO_SOFA_BUILD).compartments).toBe(4);
    expect(sofaPick(sheet([]), z(), [inCart("m-810", "810-2s", 2)], NO_SOFA_BUILD).compartments).toBe(2 + 4);
    expect(sofaPick({ ...sheet([]), mods: {} }, z(), [], NO_SOFA_BUILD).compartments).toBe(0);
  });

  it("charges it each, times the quantity, once for the cart — the rest once per sofa", () => {
    const build = { height: null, tier: null, leg: null, specials: [BACK.value, SEAT.value], specialQty: { [BACK.value]: 3 } };
    expect(sofaCartCharge(z(), [inCart("m-2376", "2376-2s")], build)).toBe(3 * 200 + 300);
    // Two sofas (×2): the special charged once per sofa twice, the counted one as counted.
    expect(sofaCartCharge(z(), [inCart("m-2376", "2376-2s", 2)], build)).toBe(3 * 200 + 2 * 300);
    expect(sofaCartCharge(z(), [inCart("m-2376", "2376-2s")], { ...build, specials: [BACK.value], specialQty: {} })).toBe(200);
  });

  it("asks the server with the quantity of each counted special still offered", () => {
    const build = { height: null, tier: null, leg: null, specials: [BACK.value, SEAT.value], specialQty: { [BACK.value]: 3, [SEAT.value]: 9 } };
    expect(sofaBuildToSend(build, z(), [inCart("m-2376", "2376-2s")]))
      .toMatchObject({ specials: [BACK.value, SEAT.value], specialQty: { [BACK.value]: 3 } });
    // 810 takes the counted one only: the other drops out, its quantity with it.
    expect(sofaBuildToSend(build, z(), [inCart("m-2376", "2376-2s"), inCart("m-810", "810-2s")]))
      .toMatchObject({ specials: [BACK.value], specialQty: { [BACK.value]: 3 } });
  });
});

describe("the customer quote's lines", () => {
  it("names each line, a bed frame with its own build", () => {
    const frame: CartLine = { id: "f", kind: "frame", key: "m-pebble", name: "PEBBLE GREY", size: "Queen", qty: 1, productId: "pebble-q", bedframe: { specials: ["Hydraulic"] } };
    const sofa: CartLine = { id: "s", kind: "sofa", key: "m-2376", name: "2376 2S", size: "2-seater · both arms", qty: 2, productId: "2376-2s" };
    expect(customerLines([frame, sofa])).toEqual([
      { name: "PEBBLE GREY · Queen (Hydraulic)", qty: 1 },
      { name: "2376 2S · 2-seater · both arms", qty: 2 },
    ]);
  });
});
