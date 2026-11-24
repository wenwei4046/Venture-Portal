import { describe, expect, it } from "vitest";
import { QuoteLogic } from "./QuoteLogic";

// The user, 2026-11-24: items come from b2b or the company's Excel price list; Change item / Add item pick the source
// first ("先选来源，再选品项"), and a source switched off in Quote settings offers nothing.
type Sources = { list: string[]; cur: string; home: string };
const P = QuoteLogic.prototype as unknown as { sheetSources: (this: object, st: object, pkg: object) => Sources };
const catalog = (sources = {}) => ({
  sources,
  kinds: { sofa: { label: "Sofa", url: "https://b2b" }, "xl-paint": { label: "WALL & PAINTING", src: "excel" } },
  items: [
    { id: "c1", kind: "sofa", code: "232114", name: "HIACE SOFA", cost: 1290 },
    { id: "x1", src: "excel", kind: "xl-paint", code: "PW-01", name: "Paint", cost: 4.94 },
    { id: "x2", src: "excel", kind: "xl-paint", code: "PW-02", name: "Fluted Panel", cost: 499.85, paused: true },
  ],
});
const pkg = { cats: [{ label: "Living", items: [{ kind: "sofa" }] }, { label: "Painting", items: [{ kind: "xl-paint" }] }] };
const at = (st: Record<string, unknown>) => P.sheetSources.call({}, { lines: [], sheetSrc: null, ...st }, pkg);

describe("the item sheet's source", () => {
  it("offers both sources and opens on the category's own", () => {
    expect(at({ catalog: catalog(), sheet: { mode: "add", ci: 0 } })).toEqual({ list: ["b2b", "excel"], cur: "b2b", home: "b2b" });
    expect(at({ catalog: catalog(), sheet: { mode: "add", ci: 1 } })).toMatchObject({ cur: "excel", home: "excel" });
  });

  it("opens Change item on the line's own source, and keeps what was picked", () => {
    const lines = [{ id: "L1", kind: "xl-paint" }];
    expect(at({ catalog: catalog(), lines, sheet: { mode: "swap", id: "L1" } })).toMatchObject({ cur: "excel" });
    expect(at({ catalog: catalog(), lines, sheet: { mode: "swap", id: "L1" }, sheetSrc: "b2b" })).toMatchObject({ cur: "b2b", home: "excel" });
  });

  it("leaves out a source switched off", () => {
    expect(at({ catalog: catalog({ excel: { off: true } }), sheet: { mode: "add", ci: 1 } })).toEqual({ list: ["b2b"], cur: "b2b", home: "excel" });
    expect(at({ catalog: catalog({ b2b: { off: true } }), sheet: { mode: "add", ci: 0 }, sheetSrc: "b2b" })).toMatchObject({ list: ["excel"], cur: "excel" });
  });
});
