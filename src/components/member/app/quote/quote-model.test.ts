import { describe, expect, it } from "vitest";
import type { BedframeBuild, MemberProduct } from "@/lib/member/types";
import {
  EMPTY_MEMORY, accOrder, addLines, bump, cartMeta, catalogFromProducts, defaultSize, frameMeta, itemsText, layoutFits, liveSets, moduleInfo,
  remember, setMeta, sheetLines, sizeKeyOf, sofaPick, sofaSeats, sofaText, type CartLine, type QCatalog, type SheetState,
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
    ["CNR", "Corner", 1],
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
    const c = zanotti();
    expect(c.frames.map(f => f.name)).toEqual(["CODY", "PEBBLE GREY"]);
    expect(c.accs.find(a => a.name === "AERO-MP")?.sizes).toEqual({ Q: "mp-q", K: "mp-k" });
    expect(c.accs.find(a => a.name === "AK- LTX CLS PIL")?.any).toBe("pil");
  });

  it("orders a sofa's modules left pieces first, then the middle, then accessories", () => {
    const c = zanotti();
    expect(c.sofa).toBe(true);
    expect(c.models[0].modules.map(x => x.code)).toEqual(["L(LHF)", "2S", "Console"]);
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

  it("a fitted accessory the size does not come in is left out", () => {
    const sh: SheetState = { mode: "acc", size: "S", accAll: false, acc: { "AERO-MP": 1, "AK- LTX CLS PIL": 1 } };
    expect(sheetLines(sh, akemi()).map(l => l.productId)).toEqual(["pil"]);
  });

  it("a sofa: each module times its count times the sets", () => {
    const sh: SheetState = { mode: "sofa", key: "m-2376", layout: "C", mods: { "L(LHF)": 1, "2S": 2 }, qty: 2, kpi: [], height: null, tier: null };
    const lines = sheetLines(sh, zanotti());
    expect(lines.map(l => [l.name, l.size, l.qty])).toEqual([["2376 L(LHF)", "Chaise · left", 2], ["2376 2S", "2-seater · both arms", 4]]);
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
      m = remember(m, { mode: "model", key: "m-apex", size, qty: 1, acc: {}, bfs: [], fx: null, accAll: false }, "AKEMI");
    }
    expect(m.sets.AKEMI.map(r => (r.kind === "mattress" ? r.size : ""))).toEqual(["K", "Q", "SS"]);
    m = remember(m, { mode: "sofa", key: "m-2376", layout: "C", mods: { "2S": 1, "L(LHF)": 1 }, qty: 1, kpi: [], height: null, tier: null }, "ZANOTTI");
    m = remember(m, { mode: "sofa", key: "m-2376", layout: "C", mods: { "L(LHF)": 1, "2S": 1 }, qty: 1, kpi: [], height: null, tier: null }, "ZANOTTI");
    expect(m.layouts.ZANOTTI).toHaveLength(1);
    expect(m.sets.ZANOTTI).toHaveLength(1);
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
});

describe("the sofa build", () => {
  const z = zanotti();
  const model = z.models[0];
  const sofa = (mods: Record<string, number>, height: string | null = null): Extract<SheetState, { mode: "sofa" }> =>
    ({ mode: "sofa", key: "m-2376", layout: "C", mods, qty: 1, kpi: [], height, tier: null });

  it("offers only the seat heights and tiers every chosen module is costed in", () => {
    const pick = sofaPick(sofa({ "2S": 1, "L(LHF)": 1 }), z, [], { height: null, tier: null });
    expect(pick).toMatchObject({ graded: true, heights: ["60cm"], height: "60cm", tiers: ["PRICE_1", "PRICE_2"], tier: "PRICE_1", clash: false });
  });

  it("keeps the cart's own choice when it still fits", () => {
    expect(sofaPick(sofa({ "2S": 1 }), z, [], { height: "75cm", tier: "PRICE_1" })).toMatchObject({ height: "75cm", tier: "PRICE_1" });
  });

  it("says so when no seat height costs every module", () => {
    expect(sofaPick(sofa({ "L(LHF)": 1, Console: 1 }), z, [], { height: null, tier: null }).clash).toBe(true);
  });

  it("counts the sofa modules already in the cart too", () => {
    const inCart: CartLine[] = [{ id: "s-l", kind: "sofa", key: "m-2376", name: "2376 L(LHF)", size: "", qty: 1, productId: "2376-l" }];
    expect(sofaPick(sofa({ "2S": 1 }), z, inCart, { height: "75cm", tier: null }).height).toBe("60cm");
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

  it("reads each frame's charges and specials from the catalogue's models; a frame with none is all FOC", () => {
    const c = withCharges();
    expect(c.frames.find(f => f.key === "m-cody")?.choices).toEqual({
      divans: [], legs: [{ value: '6"', charge: 100 }], gaps: [{ value: '12"', charge: 20 }], totals: [], specials: ["HB Straight"],
    });
    expect(c.frames.find(f => f.key === "m-pebble")?.choices).toEqual({ divans: [], legs: [], gaps: [], totals: [], specials: [] });
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
