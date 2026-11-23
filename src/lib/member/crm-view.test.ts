import { describe, expect, it } from "vitest";
import { crmBrandsOfView, inView, peopleInView, personInView, pickedSource, sourcePickInView, teamsInView } from "./crm-view";
import { inBrand } from "@/components/member/crm/desk/vm/insight";
import type { CrmData, CrmPerson } from "./crm-data";

// The owner, 2026-11-23, over the Fair view's Insight and Assignment showing The Conts and Dream Crafter together: "IR 的 view
// 就只可以看到 IR，DC 就只可以看到 DC，同等的 fair 也只能看到 fair。现在全部绑在一起，我不要这样"; "assign 广告的时候也是跟着 view 走的".
describe("the brands a Revenue app view holds the CRM to", () => {
  it("is IR's The Conts, DC's Dream Crafter, Fair's none", () => {
    expect(crmBrandsOfView("IR")).toEqual(["conts"]);
    expect(crmBrandsOfView("DC")).toEqual(["dc"]);
    expect(crmBrandsOfView(" dc ")).toEqual(["dc"]);
    expect(crmBrandsOfView("FAIR")).toEqual([]);
  });

  it("is every brand one holds with no view", () => {
    expect(crmBrandsOfView(null)).toBeNull();
    expect(crmBrandsOfView(undefined)).toBeNull();
    expect(crmBrandsOfView("")).toBeNull();
  });
});

const CONTS = "1438056256053876", CONTS_PAGE = "102351059576534", DC = "1422533724269131", DC_PAGE = "478652958664343", SOFA_PAGE = "946946021838962";
const person = (id: string, brands: ("conts" | "dc")[] | null, extra: Partial<CrmPerson> = {}): CrmPerson =>
  ({ id, name: id.toUpperCase(), role: "rs", uplineId: null, fullTime: true, ...(brands ? { brands } : {}), ...extra });
const cust = (id: string, adId: string | null, accountId: string) => ({ id, adId, accountId, channel: "whatsapp" }) as unknown as CrmData["customers"][number];
const data = {
  viewerId: "boss",
  people: [person("boss", ["conts", "dc"], { role: "boss" }), person("peter", ["conts"], { role: "hod" }), person("hector", ["conts", "dc"]),
    person("stanley", ["conts"], { role: "tl" }), person("yauwei", ["conts", "dc"], { uplineId: "stanley" }), person("nologin", null)],
  customers: [cust("c1", "a1", CONTS), cust("c2", "d1", DC), cust("c3", null, DC)],
  visits: [{ customerId: "c1" }, { customerId: "c2" }], events: [{ customerId: "c1" }, { customerId: "c3" }],
  shares: [{ customerId: "c2", staffId: "hector" }], invites: [{ customerId: "c1" }], notes: [{ customerId: "c2" }],
  adRules: [{ adId: "a1" }, { adId: "d1" }, { adId: "d2" }, { adId: "sofa" }, { adId: "x" }],
  adNames: { a1: { name: "IR ad" }, d1: { name: "DC ad" }, d2: { name: "DC new", pageId: DC_PAGE }, c0: { name: "IR new", pageId: CONTS_PAGE },
    sofa: { name: "[产品USP] 全场沙发统一价格", pageId: SOFA_PAGE }, x: { name: "no page, no lead" } },
  leaves: [{ staffId: "peter" }, { staffId: "hector" }], lockedStaff: ["peter", "yauwei"], upNextStaff: ["stanley"],
  upNextEvents: [{ ad: "a1", staff: "peter" }, { ad: "d1", staff: "hector" }, { ad: null, staff: "peter" }],
} as unknown as CrmData;

describe("the CRM's data in a view", () => {
  it("is the view's customers and all that hangs on them", () => {
    const dc = inView(data, ["dc"]);
    expect(dc.customers.map(c => c.id)).toEqual(["c2", "c3"]);
    expect(dc.visits.map(v => v.customerId)).toEqual(["c2"]);
    expect(dc.events.map(e => e.customerId)).toEqual(["c3"]);
    expect(dc.shares.map(s => s.customerId)).toEqual(["c2"]);
    expect(dc.invites).toEqual([]);
    expect(dc.notes?.map(n => n.customerId)).toEqual(["c2"]);
    const ir = inView(data, ["conts"]);
    expect(ir.customers.map(c => c.id)).toEqual(["c1"]);
    expect(ir.invites.map(i => i.customerId)).toEqual(["c1"]);
  });

  it("keeps an ad by its leads' brand, else its Page's — and one of neither (another Page's, the 2990's sofa ads) in no view", () => {
    const ir = inView(data, ["conts"]), dc = inView(data, ["dc"]);
    expect(ir.adRules.map(r => r.adId)).toEqual(["a1"]);
    expect(Object.keys(ir.adNames ?? {}).sort()).toEqual(["a1", "c0"]);
    expect(dc.adRules.map(r => r.adId)).toEqual(["d1", "d2"]);
    expect(Object.keys(dc.adNames ?? {}).sort()).toEqual(["d1", "d2"]);
  });

  it("is nothing in Fair's view: no customer, no ad", () => {
    const fair = inView(data, []);
    expect(fair.customers).toEqual([]);
    expect(fair.adRules).toEqual([]);
    expect(fair.adNames).toEqual({});
    expect(fair.view).toEqual({ brands: [], people: ["boss"] });
  });

  it("lists the people who hold its brand — oneself always, somebody with no login as IR's", () => {
    expect(inView(data, ["dc"]).view?.people).toEqual(["boss", "hector", "yauwei"]);
    expect(inView(data, ["conts"]).view?.people).toEqual(["boss", "peter", "hector", "stanley", "yauwei", "nologin"]);
    const dc = inView(data, ["dc"]);
    expect(peopleInView(dc).map(p => p.id)).toEqual(["boss", "hector", "yauwei"]);
    expect(personInView(dc, "peter")).toBe(false);
    // Names still come from everybody (a journey's actor of another view keeps its name).
    expect(dc.people.length).toBe(6);
  });

  it("keeps leave, locks and Up next's record to its people and ads", () => {
    const dc = inView(data, ["dc"]);
    expect(dc.leaves?.map(l => l.staffId)).toEqual(["hector"]);
    expect(dc.lockedStaff).toEqual(["yauwei"]);
    expect(dc.upNextStaff).toEqual([]);
    expect(dc.upNextEvents?.map(e => e.ad)).toEqual(["d1"]);
  });

  it("is the data as it is with no view", () => {
    expect(inView(data, null)).toBe(data);
    expect(personInView(data, "peter")).toBe(true);
  });
});

describe("a view's teams", () => {
  it("keep their people of the view; a team with none is not drawn", () => {
    const dc = inView(data, ["dc"]);
    const teams = [{ id: "stanley", people: [data.people[3], data.people[4]] }, { id: "peter", people: [data.people[1]] }];
    expect(teamsInView(dc, teams)).toEqual([{ id: "stanley", people: [data.people[4]] }]);
    expect(teamsInView(data, teams)).toBe(teams);
  });
});

describe("a brand to pick in a view", () => {
  it("is none: a pick kept from before is not read", () => {
    const ir = inView(data, ["conts"]);
    expect(pickedSource(ir, "dc")).toBeUndefined();
    expect(pickedSource(data, "dc")).toBe("dc");
    // Insight's and the desktop's own brand switch leave the view's data as it is.
    expect(inBrand(ir, "dc").customers.map(c => c.id)).toEqual(["c1"]);
  });

  it("offers All sources and the view's own brand's channels only", () => {
    const ir = inView(data, ["conts"]);
    expect(sourcePickInView(ir, "all")).toBe(true);
    expect(sourcePickInView(ir, "conts:whatsapp")).toBe(true);
    expect(sourcePickInView(ir, "conts")).toBe(false);
    expect(sourcePickInView(ir, "dc:messenger")).toBe(false);
    expect(sourcePickInView(data, "dc")).toBe(true);
  });
});
