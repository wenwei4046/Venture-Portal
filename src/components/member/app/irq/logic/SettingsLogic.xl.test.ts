import { describe, expect, it } from "vitest";
import { SettingsLogic } from "./SettingsLogic";

// Room types › Import from Excel (2026-11-06, the user, on "1R 1R Build in.xlsx": "为什么我上传后的分类不见了"): the
// template's CATEGORY stands left of ITEM, and only the columns from ITEM rightwards were read, so all 43 items fell
// under one "Items".
const HEAD = ["CATEGORY", "ITEM", "DESCRIPTION", "CODE/COLOUR", "QTY", "PRICE"];

async function read(rows: unknown[][], items: { code: string; kind: string }[] = []) {
  let xl: { cats: { name: string; label: string; items: { name: string; desc: string; code: string; qty: number; cost: number }[] }[]; err: string } | null = null;
  const self = {
    state: { cfg: { catalog: { kinds: {}, items } } },
    setState: (s: { xl: typeof xl }) => { xl = s.xl; },
    guessKind: () => "sofa",
    loadXlsx: async () => ({ read: () => ({ SheetNames: ["a"], Sheets: { a: {} } }), utils: { sheet_to_json: () => rows } }),
  };
  const file = { name: "room.xlsx", arrayBuffer: async () => new ArrayBuffer(0) };
  await (SettingsLogic.prototype as unknown as { readXl: (f: unknown, p: string) => Promise<void> }).readXl.call(self, file, "p1");
  return xl!;
}

describe("Import from Excel", () => {
  it("goes by a row's code, never its name: the name is what the customer reads", async () => {
    const x = await read([HEAD,
      ["LIVING", "ANY NAME AT ALL", "", 336103, 1, 519],
      ["PAINTING", "LIVING SOFA", "", "", 1, 500],
      ["OTHERS", "LIVING SOFA", "", "NOT-IN-CATALOGUE", 1, 500],
      ["BEDROOM SET", "BEDFRAME JAGER", "", "PC151-01", 2, 455],
    ], [{ code: "336103", kind: "media" }, { code: "PC151-01", kind: "sofa" }, { code: "PC151-01", kind: "bed" }]);
    const kinds = x.cats.map(c => (c.items[0] as unknown as { kind: string | null }).kind);
    expect(kinds).toEqual(["media", null, null, null]);
  });

  it("takes a category's side from an optional TYPE column", async () => {
    const x = await read([[...HEAD, "TYPE"],
      ["MASTER BEDROOM", "WARDROBE", "", "", 1, 650, "Furniture"],
      ["PAINTING", "WALL", "", "", 1, 500, "Services"],
      ["OTHERS", "BELL", "", "", 1, 130, ""],
    ]);
    expect(x.cats.map(c => (c as unknown as { section?: string }).section)).toEqual(["furn", "serv", undefined]);
  });

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
