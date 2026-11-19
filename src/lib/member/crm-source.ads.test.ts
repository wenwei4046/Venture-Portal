import { describe, expect, it } from "vitest";
import { adBrandOf, brandSplit } from "./crm-source";

const CONTS_WA = "1438056256053876", DC_WA = "1422533724269131", DC_PAGE = "478652958664343";
const data = {
  customers: [
    { adId: "a1", channel: "whatsapp" as const, accountId: CONTS_WA },
    { adId: "a1", channel: "whatsapp" as const, accountId: CONTS_WA },
    { adId: "d1", channel: "whatsapp" as const, accountId: DC_WA },
    { adId: "x", channel: "whatsapp" as const, accountId: null },
  ],
  adNames: { d2: { pageId: DC_PAGE } },
};

describe("Assignment's ads split IR | DC (2026-11-19)", () => {
  it("an ad is its leads' brand, else its Page's", () => {
    expect(adBrandOf("a1", data)).toBe("conts");
    expect(adBrandOf("d1", data)).toBe("dc");
    expect(adBrandOf("d2", data)).toBe("dc");
    expect(adBrandOf("x", data)).toBeNull();
  });

  it("opens on IR, an unknown ad on IR's side; DC shows DC's alone", () => {
    const ids = ["a1", "d1", "d2", "x"], of = (id: string) => adBrandOf(id, data);
    const ir = brandSplit(ids, of, undefined);
    expect(ir.tabs.map(t => [t.label, t.n, t.on])).toEqual([["IR", 2, true], ["DC", 2, false]]);
    expect(ids.filter(ir.keep)).toEqual(["a1", "x"]);
    expect(ids.filter(brandSplit(ids, of, "dc").keep)).toEqual(["d1", "d2"]);
  });

  it("no tabs, and every ad, while all the ads are one brand's", () => {
    const s = brandSplit(["a1", "x"], id => adBrandOf(id, data), "dc");
    expect(s.tabs).toEqual([]);
    expect(["a1", "x"].filter(s.keep)).toEqual(["a1", "x"]);
  });
});
