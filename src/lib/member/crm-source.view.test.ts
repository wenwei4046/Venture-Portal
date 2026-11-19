import { describe, expect, it } from "vitest";
import { crmBrandOfView } from "./crm-source";
import { inBrand } from "@/components/member/crm/desk/vm/insight";
import type { CrmData } from "./crm-data";

// The owner, 2026-11-17: "Dream Crafter view 默认打开 dream crafter 的数据，聊天室等"; 2026-11-19: "IR 只能看到 IR 的数据，包含广告，calendar 等".
describe("the brand a Revenue app view opens the CRM on", () => {
  it("is Dream Crafter in the Dream Crafter sub-department's view", () => {
    expect(crmBrandOfView("DC")).toBe("dc");
    expect(crmBrandOfView(" dc ")).toBe("dc");
  });

  it("is The Conts in the IR view for whoever can switch to the DC view", () => {
    expect(crmBrandOfView("IR", ["FAIR", "IR", "DC"])).toBe("conts");
  });

  it("is every brand in the IR view for somebody with no DC view, and in every other view", () => {
    expect(crmBrandOfView("IR", ["FAIR", "IR"])).toBeNull();
    expect(crmBrandOfView("IR")).toBeNull();
    expect(crmBrandOfView("FAIR", ["FAIR", "IR", "DC"])).toBeNull();
    expect(crmBrandOfView(null)).toBeNull();
    expect(crmBrandOfView(undefined)).toBeNull();
  });
});

describe("a brand's CRM keeps its own ads", () => {
  const CONTS = "1438056256053876", DC = "1422533724269131", DC_PAGE = "478652958664343";
  const cust = (id: string, adId: string | null, accountId: string) => ({ id, adId, accountId, channel: "whatsapp" }) as unknown as CrmData["customers"][number];
  const d = {
    customers: [cust("c1", "a1", CONTS), cust("c2", "d1", DC)],
    visits: [{ customerId: "c1" }, { customerId: "c2" }], events: [],
    adRules: [{ adId: "a1" }, { adId: "d1" }, { adId: "d2" }, { adId: "x" }],
    adNames: { a1: { name: "IR ad" }, d1: { name: "DC ad" }, d2: { name: "DC new", pageId: DC_PAGE }, x: { name: "unknown" } },
  } as unknown as CrmData;

  it("IR keeps The Conts' ads and those of no known brand; DC its own", () => {
    const ir = inBrand(d, "conts"), dc = inBrand(d, "dc");
    expect(ir.customers.map(c => c.id)).toEqual(["c1"]);
    expect(ir.visits.length).toBe(1);
    expect(ir.adRules.map(r => r.adId)).toEqual(["a1", "x"]);
    expect(Object.keys(ir.adNames ?? {})).toEqual(["a1", "x"]);
    expect(dc.adRules.map(r => r.adId)).toEqual(["d1", "d2"]);
    expect(Object.keys(dc.adNames ?? {})).toEqual(["d1", "d2"]);
  });
});
