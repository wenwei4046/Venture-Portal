import { describe, expect, it } from "vitest";
import { mergeExcel, parsePriceList, pickSheet, sourceOn, srcOf, type Catalog, type CatItem } from "./price-list";

// The top of The_Conts_Price_List_Master's PRICELIST sheet, as SheetJS reads it (header: 1), 2026-11-24.
const SHEET: unknown[][] = [
  ["", "THE CONTS SDN BHD"],
  ["", "COSTING PRICE LIST 内部成本价目表"],
  ["预设加价 Default Markup %", "", 0.3, "← 改这里，本页全部售价自动更新"],
  ["Code 编号", "Item Description", "中文说明", "Spec / Remark 规格", "", "Unit 单位", "人工", "ITEM", "Unit Cost 成本", "Markup 加价%", "Selling Price 售价", "Notes 备注"],
  ["A. WALL & PAINTING 墙身 & 油漆"],
  ["PW-01", "Paint - Jotun/Nippon Paint", "墙身油漆 (Jotun)", "Wall Only ", "", "sqft", "", "", 3.8, 0.3, 4.9400000000000004, "ADD ON 1 COLOUR +RM200"],
  ["PW-03A", "Wainscoting", "墙裙线条", "Incl. paint finish", "", "BASIC", 100, 100, 200, 0.3, 260, "4 PCS"],
  ["PW-03A", "Wainscoting", "墙裙线条", "Incl. paint finish", "", "A", 113, 140, 253, 0.3, 328.9, "CHARGE RM 500 IF ONLY 1 WALL"],
  ["C. LIGHTING, FAN & ELECTRICAL POINT 灯饰 / 风扇 / 电源点"],
  ["LT-04", "Fan with Light 56\"", "风扇灯 56寸", "Living / Dining", "", "1 PCS", 150, 200, 350, 0.3, 455, "include install"],
  ["", "PARTITION DOOR", "", "", "", "", "", "", 600],
  ["E. LIVING AREA 客厅家具"],
  ["LV-01", "Sofa - 2.5 Seater", "沙发 - 2.5座", "Fabric / PU", "", "1 PCS", "", "", 1300, 0.3, 1690, "NOT INCUDE INSTALL"],
  ["— 以下空白列可自行新增项目（填 Code、名称、单位、成本即可） —"],
  ["", "LINENS SET 1 BEDROOM", "", "", "", "", "", "", 461.5, 0.3, 599.95000000000005, "1 MORE MATTRESS 1 MORE SET"],
  ["", "", "", "", "", "", "", "", "", 0.3],
];

describe("the Excel price list", () => {
  it("reads each section as a category and each priced row as an item at its selling price", () => {
    const list = parsePriceList(SHEET)!;
    expect(list.cats.map(c => c.label)).toEqual(["WALL & PAINTING 墙身 & 油漆", "LIGHTING, FAN & ELECTRICAL POINT 灯饰 / 风扇 / 电源点", "LIVING AREA 客厅家具", "Others 其他"]);
    expect(list.items).toHaveLength(6); // PARTITION DOOR has a cost and no selling price
    const paint = list.items[0];
    expect(paint).toMatchObject({ code: "PW-01", name: "Paint - Jotun/Nippon Paint", nameCn: "墙身油漆 (Jotun)", unit: "sqft", cost: 4.94, unitCost: 3.8, cat: "xl-wall-painting" });
    expect(list.items.map(i => i.cost)).toEqual([4.94, 260, 328.9, 455, 1690, 599.95]);
    expect(list.items[5]).toMatchObject({ code: "", name: "LINENS SET 1 BEDROOM", cat: "xl-others" });
  });

  it("finds the sheet that is a price list", () => {
    const got = pickSheet([{ name: "SAMPLE", rows: [["NO", "ITEM"]] }, { name: "PRICELIST", rows: SHEET }]);
    expect(got?.name).toBe("PRICELIST");
    expect(pickSheet([{ name: "SAMPLE", rows: [["hello"]] }])).toBeNull();
  });

  it("replaces only the Excel items, keeping b2b's, a paused item and a photo of its own", () => {
    let n = 0;
    const id = (p: string) => p + ++n;
    const cat: Catalog & { items: CatItem[]; kinds: NonNullable<Catalog["kinds"]> } = { kinds: { sofa: { label: "Sofa", url: "https://b2b" } }, items: [{ id: "c1", kind: "sofa", code: "232114", name: "HIACE SOFA", cost: 1290, url: "https://b2b/p" }] };
    const list = parsePriceList(SHEET)!;
    const r1 = mergeExcel(cat, list, "a.xlsx", 1000, id);
    expect(r1).toMatchObject({ added: 6, removed: 0, total: 6 });
    expect(cat.items).toHaveLength(7);
    expect(cat.items[0].id).toBe("c1");
    const paint = cat.items.find(x => x.code === "PW-01")!;
    expect(paint).toMatchObject({ src: "excel", kind: "xl-wall-painting", kindLocked: true, cost: 4.94 });
    expect(cat.kinds["xl-wall-painting"]).toMatchObject({ label: "WALL & PAINTING 墙身 & 油漆", src: "excel" });
    expect(cat.sources?.excel).toMatchObject({ file: "a.xlsx", at: 1000, n: 6 });

    paint.paused = true; paint.img = "data:x"; paint.imgOwn = true;
    // the second upload: the paint costs more, the sofa is gone and with it its category
    const next = parsePriceList(SHEET.filter(r => r[0] !== "LV-01" && r[0] !== "E. LIVING AREA 客厅家具").map(r => (r[0] === "PW-01" ? [...r.slice(0, 10), 5.5, ...r.slice(11)] : r)))!;
    const r2 = mergeExcel(cat, next, "b.xlsx", 2000, id);
    expect(r2).toMatchObject({ added: 0, removed: 1, total: 5, changed: 1 });
    const paint2 = cat.items.find(x => x.code === "PW-01");
    expect(paint2).toMatchObject({ id: paint.id, paused: true, img: "data:x", cost: 5.5, prevCost: 4.94 });
    expect(cat.items.find(x => x.id === "c1")).toBeTruthy();
    expect(cat.kinds["xl-living-area"]).toBeUndefined();
    expect(cat.kinds.sofa).toBeTruthy();
  });

  it("keeps an Excel category a room type still uses", () => {
    const cat: Catalog & { items: CatItem[]; kinds: NonNullable<Catalog["kinds"]> } = { kinds: {}, items: [] };
    mergeExcel(cat, parsePriceList(SHEET)!, "a.xlsx", 1, p => p + Math.random());
    mergeExcel(cat, { cats: [], items: [] }, "b.xlsx", 2, p => p, new Set(["xl-living-area"]));
    expect(Object.keys(cat.kinds)).toEqual(["xl-living-area"]);
  });

  it("each source has its own switch, on until switched off", () => {
    expect(srcOf({})).toBe("b2b");
    expect(srcOf({ src: "excel" })).toBe("excel");
    expect(sourceOn({}, { src: "excel" })).toBe(true);
    expect(sourceOn({ sources: { excel: { off: true } } }, { src: "excel" })).toBe(false);
    expect(sourceOn({ sources: { excel: { off: true } } }, {})).toBe(true);
  });
});
