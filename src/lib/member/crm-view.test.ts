import { describe, expect, it } from "vitest";
import { crmBrandsOfView, inView, newRoomDraftKey, peopleInView, personInView, pickedSource, sourcePickInView, teamsInView, templatesOfSub } from "./crm-view";
import { inBrand } from "@/components/member/crm/desk/vm/insight";
import { DEFAULT_CRM_SETTINGS, subSettingsFrom, type CrmData, type CrmPerson, type CrmRoom } from "./crm-data";

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

// The owner, 2026-11-23: "Management 这边也不是统一的，IR 是 IR，DC 是 DC，包括 setting 等等都要分开"; "每个 segment 分开就对了".
describe("a view's Management", () => {
  const IR = "sub-ir", DCS = "sub-dc", FAIR = "sub-fair";
  const room = (id: string, sub: string | null, extra: Partial<CrmRoom> = {}): CrmRoom =>
    ({ id, name: id.toUpperCase(), active: true, address: "", slots: [], cap: 2, weekly: [], blocks: [], ...(sub ? { sub } : {}), ...extra });
  const managed = {
    ...data,
    scope: IR,
    visits: [{ id: "v1", customerId: "c1", showroomId: "kl" }, { id: "v2", customerId: "c2", showroomId: "kl" }, { id: "v3", customerId: "c3", showroomId: "visit:v3" }],
    rooms: [room("kl", IR), room("astrum", null), room("dc-room", DCS), room("old-dc", DCS, { active: false, deleted: true }), room("visit:v3", null, { virtual: true, active: false })],
    forms: [{ id: "f-ir", name: "Customer info", sections: [], sub: IR }, { id: "f-dc", name: "Customer info", sections: [], sub: DCS }, { id: "f-fair", name: "Customer info", sections: [], sub: FAIR }],
    bookingForms: [{ id: "b-ir", name: "Booking", sections: [] }, { id: "b-dc", name: "Booking", sections: [], sub: DCS }],
    templates: [{ id: "t-ir", name: "Hello", ch: "whatsapp", st: "approved", body: "", on: true, metaName: "hello", language: "en", reason: null, sub: IR },
      { id: "t-dc", name: "Hello", ch: "whatsapp", st: "approved", body: "", on: false, metaName: "hello", language: "en", reason: null, sub: DCS }],
    partnerLinks: [{ id: "the_conts", name: "The Conts", code: "pc-1", on: true, sub: IR }],
    partnerBookings: [{ id: "pb1", partner: "the_conts", showroomId: "astrum" }],
    roomDrafts: { new: { draft: { n: "IR's" }, by: null, at: "" }, [`new:${DCS}`]: { draft: { n: "DC's" }, by: null, at: "" }, kl: { draft: {}, by: null, at: "" }, "dc-room": { draft: {}, by: null, at: "" } },
    settings: { ...DEFAULT_CRM_SETTINGS },
    settingsBySub: { [IR]: { ...DEFAULT_CRM_SETTINGS }, [DCS]: { ...DEFAULT_CRM_SETTINGS, replySoonH: 2, autoAssign: false } },
    apptTypes: [{ id: "online", label: "Online", on: true, base: "online", fields: [] }],
    apptTypesBySub: { [DCS]: [{ id: "phone", label: "Phone", on: true, base: "place", fields: [] }] },
  } as unknown as CrmData;

  it("is DC's own showrooms — another's a visit of the view was at keeps its name, in no list", () => {
    const dc = inView(managed, ["dc"], DCS);
    expect(dc.view?.sub).toBe(DCS);
    // c3's online visit (DC's) keeps its own room too.
    expect(dc.rooms.map(r => r.id)).toEqual(["kl", "dc-room", "old-dc", "visit:v3"]);
    const kl = dc.rooms.find(r => r.id === "kl")!;
    expect(kl.name).toBe("KL");
    expect(kl.active).toBe(false);
    expect(kl.virtual).toBe(true);
    expect(dc.rooms.filter(r => r.active).map(r => r.id)).toEqual(["dc-room"]);
  });

  it("is IR's own showrooms (one read with no sub-department is the CRM's own), and its visits' virtual rooms", () => {
    const ir = inView(managed, ["conts"], IR);
    expect(ir.rooms.map(r => r.id)).toEqual(["kl", "astrum"]);
    expect(ir.rooms.every(r => r.active)).toBe(true);
    expect(inView(managed, ["dc"], DCS).rooms.some(r => r.id === "visit:v3")).toBe(true);
  });

  it("is its own forms, templates, booking link and the bookings at its showrooms", () => {
    const dc = inView(managed, ["dc"], DCS), ir = inView(managed, ["conts"], IR), fair = inView(managed, [], FAIR);
    expect(dc.forms?.map(f => f.id)).toEqual(["f-dc"]);
    expect(fair.forms?.map(f => f.id)).toEqual(["f-fair"]);
    expect(ir.bookingForms?.map(f => f.id)).toEqual(["b-ir"]);
    expect(dc.bookingForms?.map(f => f.id)).toEqual(["b-dc"]);
    expect(dc.templates?.map(t => [t.id, t.on])).toEqual([["t-dc", false]]);
    expect(ir.templates?.map(t => [t.id, t.on])).toEqual([["t-ir", true]]);
    expect(ir.partnerLinks?.map(l => l.id)).toEqual(["the_conts"]);
    expect(dc.partnerLinks).toEqual([]);
    expect(ir.partnerBookings?.map(b => b.id)).toEqual(["pb1"]);
    expect(dc.partnerBookings).toEqual([]);
  });

  it("is its own Settings › General and appointment types — a sub-department with none of its own reads the CRM's own", () => {
    const dc = inView(managed, ["dc"], DCS), fair = inView(managed, [], FAIR);
    expect(dc.settings?.replySoonH).toBe(2);
    expect(dc.settings?.autoAssign).toBe(false);
    expect(dc.apptTypes?.map(t => t.id)).toEqual(["phone"]);
    expect(fair.settings).toBe(managed.settings);
    expect(fair.apptTypes).toBe(managed.apptTypes);
  });

  it("keeps a new showroom's draft as its own: IR's 'new', DC's 'new:<DC>' — each read as 'new' in its view", () => {
    expect(newRoomDraftKey(managed, IR)).toBe("new");
    expect(newRoomDraftKey(managed, DCS)).toBe(`new:${DCS}`);
    expect(newRoomDraftKey({}, DCS)).toBe("new");
    const dc = inView(managed, ["dc"], DCS), ir = inView(managed, ["conts"], IR);
    expect(Object.keys(dc.roomDrafts ?? {}).sort()).toEqual(["dc-room", "new"]);
    expect(dc.roomDrafts?.new.draft).toEqual({ n: "DC's" });
    expect(Object.keys(ir.roomDrafts ?? {}).sort()).toEqual(["kl", "new"]);
    expect(ir.roomDrafts?.new.draft).toEqual({ n: "IR's" });
  });

  it("is everybody's Management while the database names no sub-department (no scope), or with no sub-department given", () => {
    const before = { ...managed, scope: undefined } as CrmData;
    expect(inView(before, ["dc"], DCS).rooms).toBe(before.rooms);
    expect(inView(before, ["dc"], DCS).view?.sub).toBeUndefined();
    expect(inView(managed, ["dc"]).forms).toBe(managed.forms);
  });
});

describe("the templates a customer is sent", () => {
  const rows = [{ meta_name: "hello", sub_department_id: "ir" }, { meta_name: "hello", sub_department_id: "dc" }, { meta_name: "promo", sub_department_id: "dc" }, { meta_name: null }];
  it("are the customer's sub-department's, one a Meta name", () => {
    expect(templatesOfSub(rows, "dc")).toEqual([rows[1], rows[2], rows[3]]);
    expect(templatesOfSub(rows, "ir")).toEqual([rows[0], rows[3]]);
  });
  it("are the first of each name with no sub-department known", () => {
    expect(templatesOfSub(rows, null)).toEqual([rows[0], rows[2], rows[3]]);
  });
});

describe("every sub-department's settings, as crm_settings_read gives them", () => {
  it("are each one's Settings › General and appointment types by its id, and the CRM's own id", () => {
    const got = subSettingsFrom({ replySoonH: 3, scope: "ir", bySub: {
      ir: { replySoonH: 3, replyUrgentH: 6, replyOverdueH: 9, autoAssign: true, apptTypes: [{ id: "online", label: "Online", on: true, base: "online", fields: [] }] },
      dc: { replySoonH: 2, replyUrgentH: 4, replyOverdueH: 8, autoAssign: false, apptTypes: null },
    } });
    expect(got.scope).toBe("ir");
    expect(got.settingsBySub?.dc).toMatchObject({ replySoonH: 2, replyUrgentH: 4, replyOverdueH: 8, autoAssign: false });
    expect(got.apptTypesBySub?.ir?.map(t => t.id)).toEqual(["online"]);
    expect(got.apptTypesBySub?.dc).toBeUndefined();
  });
  it("are nothing before the migration", () => {
    expect(subSettingsFrom({ replySoonH: 3 })).toEqual({});
    expect(subSettingsFrom(null)).toEqual({});
  });
});

// KRIS is DC's Revenue Director until DC's hierarchy names one (the owner, 2026-11-24: "目前现在DC CRM 上让Kris as a revenue
// director 进来"; "手机& 电脑 都要调整"; mig 20261124230000 makes him 'hod'). The desktop (CrmApp's directors) and the phone
// (panel/vm/assign.ts, assign-1011.ts) both pick the Director row as role 'hod' in the view: DC's shows KRIS beside PETER,
// IR's PETER alone.
describe("the Revenue Director row in a view", () => {
  const withKris = { ...data, people: [...data.people.map(p => (p.id === "peter" ? { ...p, brands: ["conts", "dc"] } : p)),
    person("kris", ["dc"], { role: "hod" })] } as CrmData;
  const directors = (d: CrmData) => d.people.filter(p => p.role === "hod" && personInView(d, p.id)).map(p => p.id).sort();
  it("DC's view lists KRIS and PETER", () => expect(directors(inView(withKris, ["dc"]))).toEqual(["kris", "peter"]));
  it("IR's view lists PETER alone", () => expect(directors(inView(withKris, ["conts"]))).toEqual(["peter"]));
  it("no view lists both", () => expect(directors(withKris)).toEqual(["kris", "peter"]));
});
