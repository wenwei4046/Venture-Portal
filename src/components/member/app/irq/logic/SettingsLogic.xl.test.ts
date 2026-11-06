import { describe, expect, it } from "vitest";
import { SettingsLogic } from "./SettingsLogic";

// Room types › Import from Excel (2026-11-06, the user, on "1R 1R Build in.xlsx": "为什么我上传后的分类不见了"): the
// template's CATEGORY stands left of ITEM, and only the columns from ITEM rightwards were read, so all 43 items fell
// under one "Items".
const HEAD = ["CATEGORY", "ITEM", "DESCRIPTION", "CODE/COLOUR", "QTY", "PRICE"];

async function read(rows: unknown[][]) {
  let xl: { cats: { name: string; label: string; items: { name: string; desc: string; code: string; qty: number; cost: number }[] }[]; err: string } | null = null;
  const self = {
    state: { cfg: { catalog: { kinds: {} } } },
    setState: (s: { xl: typeof xl }) => { xl = s.xl; },
    guessKind: () => null,
    loadXlsx: async () => ({ read: () => ({ SheetNames: ["a"], Sheets: { a: {} } }), utils: { sheet_to_json: () => rows } }),
  };
  const file = { name: "room.xlsx", arrayBuffer: async () => new ArrayBuffer(0) };
  await (SettingsLogic.prototype as unknown as { readXl: (f: unknown, p: string) => Promise<void> }).readXl.call(self, file, "p1");
  return xl!;
}

describe("Import from Excel", () => {
  it("reads the template's CATEGORY, left of ITEM", async () => {
    const x = await read([HEAD,
      ["LIVING", "TV CABINET", "", "336103", 1, 519],
      ["LIVING", "COFFEE TABLE", "", "132055", 1, 320],
      ["", "", "", "", "", ""],
      ["BEDROOM SET", "BEDFRAME JAGER", "QUEEN", "PC151-01", 2, 455],
      ["2ND BEDROOM", "WARDROBE", "", 352025, 1, 390],
    ]);
    expect(x.cats.map(c => [c.name, c.label, c.items.length])).toEqual([["LIVING", "Living", 2], ["BEDROOM SET", "Bedroom Set", 1], ["2ND BEDROOM", "2nd Bedroom", 1]]);
    expect(x.cats[1].items[0]).toMatchObject({ name: "BEDFRAME JAGER", desc: "QUEEN", code: "PC151-01", qty: 2, cost: 455 });
  });

  it("keeps a category's rows together, wherever in the sheet they stand", async () => {
    const x = await read([HEAD,
      ["SERVICES", "DELIVERY", "", "", 1, 1300],
      ["FEATURE WALL", "", "", "", "", ""],
      ["FEATURE WALL", "LIVING SOFA", "3PCS", "", 1, 500],
      ["SERVICES", "POST RENO", "", "", 1, 520],
    ]);
    expect(x.cats.map(c => [c.name, c.items.length])).toEqual([["SERVICES", 2], ["FEATURE WALL", 1]]);
  });

  it("takes a category written once, on its first row (a merged cell)", async () => {
    const x = await read([HEAD, ["LIVING", "TV CABINET", "", "336103", 1, 519], ["", "SOFA", "", "", 1, 455], ["DINING", "TABLE", "", "", 1, 336]]);
    expect(x.cats.map(c => [c.name, c.items.length])).toEqual([["LIVING", 2], ["DINING", 1]]);
  });

  it("still reads a sheet with no CATEGORY column, a row with a name alone as its heading", async () => {
    const x = await read([["NO", "ITEM", "QTY", "PRICE"], ["", "LIVING", "", ""], [1, "TV CABINET", 1, 519], ["", "DINING", "", ""], [2, "TABLE", 1, 336]]);
    expect(x.cats.map(c => [c.name, c.items.length])).toEqual([["LIVING", 1], ["DINING", 1]]);
  });
});
