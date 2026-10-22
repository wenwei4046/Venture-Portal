import { describe, expect, it } from "vitest";
import type { MemberMemo, MemberMembership, MemberOrgMap, MemberRequest } from "@/lib/member/types";
import type { ArenaPerson, MemberArenaSnapshot } from "@/lib/member/arena";
import {
  claimWeeks, memoCat, memoVM, profileMainVM, replaceable, requestCode, requestDetailVM, requestRowsVM, requestStatus, teamVM, trackedCount, trackVM, vaGroupsVM, waitingChoices,
  type RequestEvent,
} from "./profile-model";

const request = (over: Partial<MemberRequest> = {}): MemberRequest => ({
  id: "11111111-2222-4333-8444-555555555555", kind: "claim", title: "legacy", status: "submitted",
  createdAt: "2026-10-04T17:46:32Z", submittedAt: "2026-10-04T17:46:32Z", requestNo: "RQ-2610-001", staffId: "s1",
  detail: { claimType: "outstation", location: "Mid Valley Megamall", regionName: "Penang", spots: 4, amount: 200 },
  ...over,
});
const nameOf = (id: string) => ({ s2: "DARREN ONG" } as Record<string, string>)[id] ?? null;

describe("requests", () => {
  // The HR revamp's words (2026-10-10): the number first, then the day; gold while HR has it.
  it("lists a request by what it is for, its number and its day in Kuala Lumpur", () => {
    const [row] = requestRowsVM([request()], nameOf);
    expect(row).toMatchObject({ title: "Outstation claim · Mid Valley Megamall", sub: "RQ-2610-001 · 5 Oct", status: "Pending review", tone: "pending" });
  });

  it("names a replacement by the member it replaces, and leaves drafts out", () => {
    const rows = requestRowsVM([
      request({ id: "a", kind: "replacement", detail: { originalStaffId: "s2", replacementSource: "new" } }),
      request({ id: "b", status: "draft" }),
    ], nameOf);
    expect(rows.map(r => r.title)).toEqual(["DARREN ONG · Replacement"]);
  });

  it("falls back to the id's head before the number existed", () => {
    expect(requestCode(request({ requestNo: null }))).toBe("RQ-11111111");
  });

  it("tells the history in the member's words, the last step coloured", () => {
    const events: RequestEvent[] = [
      { at: "2026-10-04T17:46:32Z", status: "submitted", from: "draft", actor: "you", actorName: null, note: null },
      { at: "2026-10-05T01:15:00Z", status: "needs_info", from: "submitted", actor: "hr", actorName: "Nadia", note: "Add the invoice number." },
    ];
    const vm = requestDetailVM(request({ status: "needs_info" }), events, { nameOf, readOnly: false });
    expect(vm.log).toEqual([
      { what: "Submitted", who: "You", when: "5 Oct, 01:46", note: "Penang · 4 spots · RM 200.00", dot: "past" },
      { what: "Returned · needs info", who: "Nadia (HR)", when: "5 Oct, 09:15", note: "Add the invoice number.", dot: "bad" },
    ]);
    expect(vm.canCancel).toBe(true);
    expect(vm.canUpdate).toBe(true);
    expect(vm.facts).toContainEqual({ l: "Claim amount", v: "RM 200.00" });
  });

  it("offers neither Cancel nor Update once HR has acted, or to a Principal viewing", () => {
    expect(requestDetailVM(request({ status: "approved" }), null, { nameOf, readOnly: false })).toMatchObject({ canCancel: false, canUpdate: false });
    expect(requestDetailVM(request(), null, { nameOf, readOnly: true })).toMatchObject({ canCancel: false, canUpdate: false });
  });

  // HR decides a claim once, in Member services (2026-10-08), and says where the money comes from.
  it("tells the member where an approved claim's money comes from", () => {
    const payroll = requestDetailVM(request({ status: "approved", payout: { route: "payroll", payrollMonth: "2026-10-01", voucherNo: null, voucherStatus: null } }), null, { nameOf, readOnly: false });
    expect(payroll.facts).toContainEqual({ l: "Payment", v: "Comes with your Oct 2026 salary" });
    const payment = requestDetailVM(request({ status: "approved", payout: { route: "payment", payrollMonth: null, voucherNo: null, voucherStatus: null } }), null, { nameOf, readOnly: false });
    expect(payment.facts).toContainEqual({ l: "Payment", v: "Finance is arranging the payment" });
    expect(requestDetailVM(request(), null, { nameOf, readOnly: false }).facts.some(f => f.l === "Payment")).toBe(false);
  });
});

describe("memos", () => {
  const memo = (over: Partial<MemberMemo> = {}): MemberMemo => ({
    id: "m1", title: "October brand weeks are open", body: "Please save your weeks.\n\nChanges after 5 Oct need HR approval.",
    sender: "HR · Revenue", publishedAt: "2026-10-02T01:00:00Z", effectiveAt: "2026-10-02", version: 1, requiresAck: true,
    readAt: null, acknowledgedAt: null, departments: ["Fair"], ...over,
  });
  const none = { read: new Set<string>(), acked: new Map<string, string>() };

  it("splits the body into paragraphs and dates it in Kuala Lumpur", () => {
    expect(memoVM(memo(), none)).toMatchObject({
      cat: "hr", when: "2 Oct", whenFull: "2 Oct 2026, 9:00 am", read: false, needsAck: true, acked: false,
      paras: ["Please save your weeks.", "Changes after 5 Oct need HR approval."],
    });
  });

  it("counts a memo read or acknowledged here before the server answers", () => {
    expect(memoVM(memo(), { read: new Set(["m1"]), acked: new Map() }).read).toBe(true);
    const acked = memoVM(memo(), { read: new Set(), acked: new Map([["m1", "2026-10-05T02:00:00Z"]]) });
    expect(acked).toMatchObject({ read: true, acked: true, ackedText: "You acknowledged this memo · just now" });
  });

  it("picks the icon from who sent it", () => {
    expect([memoCat("HR · Revenue"), memoCat("Management"), memoCat("Revenue team"), memoCat("Fair operations")]).toEqual(["hr", "mgmt", "arena", "ops"]);
  });
});

describe("profileMainVM", () => {
  it("badges the requests with HR and the memos still to read", () => {
    const vm = profileMainVM({ name: "Jia Hui Tan", title: "Senior Executive", rank: "Rank B", subName: "Fair",
      requests: [request(), request({ id: "x", status: "approved" })],
      memos: [{ id: "a", cat: "hr", from: "", when: "", whenFull: "", title: "", paras: [], read: false, needsAck: true, acked: false, ackedText: "" }] });
    expect(vm).toMatchObject({ ini: "JT", sub: "HOUZS Venture · Revenue · Fair", badges: { requests: "1 pending", memos: "1 new" } });
  });
  it("a director with no rung on this sub-department's ladder has no rank there", () => {
    expect(profileMainVM({ name: "PETER", title: "Revenue Director", rank: "", subName: "IR", requests: [], memos: [] }).rank).toBe("—");
  });
});

describe("vaGroupsVM", () => {
  const fair: MemberMembership = {
    id: "fair", schemeId: "s", name: "Fair", code: "FAIR", title: "Principal", rank: "All access", rate: 0, calculator: true,
    effective: "2026-01-01", capacity: null, occupied: 3,
    people: [
      { id: "c", name: "CHLOE", title: "Executive", rank: "Rank C", parentId: "b" },
      { id: "a", name: "ADRIAN", title: "Team Leader", rank: "Rank A", parentId: null },
      { id: "b", name: "BEN", title: "Senior Executive", rank: "Rank B", parentId: "a" },
    ],
  };
  it("puts the top of the tree first and searches name and title", () => {
    const [g] = vaGroupsVM([fair], "", "b");
    expect(g.title).toBe("FAIR · 3");
    expect(g.people.map(p => [p.name, p.level, p.viewing])).toEqual([["ADRIAN", 1, false], ["BEN", 2, true], ["CHLOE", 3, false]]);
    expect(vaGroupsVM([fair], "senior", "")[0].people.map(p => p.name)).toEqual(["BEN"]);
    expect(vaGroupsVM([fair], "nobody", "")).toEqual([]);
  });

  // 2026-10-23 — the user: "找不到我的 revenue director 了". A director holds no seat; the snapshot lists them `director`.
  it("puts the sub-department's Revenue Directors above the top of the tree, as the prototype draws them", () => {
    const withDirectors: MemberMembership = { ...fair, people: [...fair.people,
      { id: "p", name: "PETER", title: "Revenue Director", rank: "Rank SS", parentId: null, director: true },
      { id: "k", name: "KRIS", title: "Revenue Director", rank: "", parentId: null, director: true }] };
    const [g] = vaGroupsVM([withDirectors], "", "p");
    expect(g.title).toBe("FAIR · 5");
    expect(g.people.map(p => [p.name, p.sub, p.level, p.viewing])).toEqual([
      ["KRIS", "Revenue Director · Leads Fair", 0, false], ["PETER", "Revenue Director · Leads Fair", 0, true],
      ["ADRIAN", "Team Leader · Rank A", 1, false], ["BEN", "Senior Executive · Rank B", 2, false], ["CHLOE", "Executive · Rank C", 3, false],
    ]);
    expect(vaGroupsVM([withDirectors], "director", "")[0].people.map(p => p.name)).toEqual(["KRIS", "PETER"]);
  });
});

describe("teamVM", () => {
  const map: MemberOrgMap = {
    asOf: "",
    departments: [{ id: "fair", schemeId: "s", name: "Fair", code: "FAIR", capacity: 27, mine: true, directors: [{ id: "d1", name: "PETER" }] }],
    people: [
      { id: "n-top", staffId: "top", departmentId: "fair", schemeId: "s", name: "MARCUS", code: null, title: "Team Leader", parentId: null, self: false, mine: true },
      { id: "n-me", staffId: "me", departmentId: "fair", schemeId: "s", name: "JIA HUI", code: null, title: "Senior Executive", parentId: "n-top", self: true, mine: true },
      { id: "n-k1", staffId: "k1", departmentId: "fair", schemeId: "s", name: "DARREN", code: null, title: "Executive", parentId: "n-me", self: false, mine: true },
      { id: "n-g1", staffId: "g1", departmentId: "fair", schemeId: "s", name: "KELVIN", code: null, title: "Executive", parentId: "n-k1", self: false, mine: true },
    ],
  };
  const person = (id: string, sales: number, blindOrders = 0): ArenaPerson => ({
    id, name: id, self: false, sales, held: 0, orders: 1, kpiQty: 0, marginRevenue: sales, marginCost: 0, blindOrders, brands: {},
  });
  it("draws the directors and the line above, the member, then two levels below", () => {
    const vm = teamVM({ map, departmentId: "fair", subName: "Fair", staffId: "me", people: [person("me", 1000), person("k1", 500, 1)],
      month: "2026-09", kpi: { enabled: false, threshold: null }, capacity: 27, occupied: 26, ranks: new Map([["me", "Rank B"]]) })!;
    expect(vm.ups.map(u => [u.level, u.nodes.map(n => n.name)])).toEqual([["DIRECTOR", ["PETER"]], ["UPLINE", ["MARCUS"]]]);
    expect(vm.me).toMatchObject({ name: "JIA HUI", title: "You · Rank B", dot: "good" });
    expect(vm.kids).toMatchObject([{ name: "DARREN", dot: "wait", kids: [{ name: "KELVIN" }] }]);
    expect(vm.count).toBe("2 above · 2 below");
    expect(vm.capacity).toMatchObject({ chip: "1 open place", full: false });
    expect(vm.legend).toEqual(["Selling", "Pending", "Upline"]);
    expect(vm.sheets["n-k1"]).toMatchObject({ reportsTo: "Reports to you", stats: [{ value: "RM 500" }, { value: "Cost pending" }, { value: "1 direct" }] });
    expect(vm.sheets["n-g1"].reportsTo).toBe("Reports to DARREN");
  });
  // Fair has two directors, KRIS and PETER. Neither reports to the other, so the
  // chart must not stack them as if one did (it drew KRIS above PETER above ANTHONY).
  const twoDirectors: MemberOrgMap = { ...map, departments: [{ ...map.departments[0], directors: [{ id: "d0", name: "KRIS" }, { id: "d1", name: "PETER" }] }] };
  const fairTeam = (staffId: string) => teamVM({ map: twoDirectors, departmentId: "fair", subName: "Fair", staffId, people: [], month: "2026-09",
    kpi: { enabled: false, threshold: null }, capacity: 27, occupied: 26, ranks: new Map() })!;
  it("puts every director of the sub-department on one level, side by side", () => {
    const top = fairTeam("top");
    expect(top.ups).toEqual([{ level: "DIRECTORS", nodes: [
      { id: "d:d0", name: "KRIS", title: "Revenue Director", ini: "KR", dot: "up" },
      { id: "d:d1", name: "PETER", title: "Revenue Director", ini: "PE", dot: "up" },
    ] }]);
    expect(top.count).toBe("2 above · 2 below");
    expect(top.sheets["n-top"].reportsTo).toBe("Reports to KRIS · PETER");
    expect(top.sheets["d:d0"]).toMatchObject({ role: "Revenue Director", reportsTo: "Leads Fair" });
  });
  it("keeps the line of uplines a chain below the directors' level", () => {
    const vm = fairTeam("k1");
    expect(vm.ups.map(u => [u.level, u.nodes.map(n => n.name)])).toEqual([["DIRECTORS", ["KRIS", "PETER"]], ["UPLINE", ["MARCUS"]], ["UPLINE", ["JIA HUI"]]]);
    expect(vm.count).toBe("4 above · 1 below");
  });
  it("is null for somebody not on the department's map", () => {
    expect(teamVM({ map, departmentId: "fair", subName: "Fair", staffId: "ghost", people: [], month: "2026-09",
      kpi: { enabled: true, threshold: 10 }, capacity: null, occupied: 0, ranks: new Map() })).toBeNull();
  });
  // A Revenue Director holds no seat (2026-10-14): they are the top of their own chart.
  it("draws a director at the top, every tree's top under them, the other director nowhere above", () => {
    const peter = fairTeam("d1");
    expect(peter.ups).toEqual([]);
    expect(peter.me).toEqual({ id: "d:d1", name: "PETER", title: "You · Revenue Director", ini: "PE", dot: "up" });
    expect(peter.kids).toMatchObject([{ name: "MARCUS", kids: [{ name: "JIA HUI" }] }]);
    expect(peter.count).toBe("0 above · 2 below");
    expect(peter.sheets["d:d1"]).toMatchObject({ name: "PETER", role: "Revenue Director", self: true, reportsTo: "Leads Fair" });
    expect(peter.sheets["n-top"].reportsTo).toBe("Reports to you");
    expect(peter.sheets["n-me"].reportsTo).toBe("Reports to MARCUS");
  });
  it("a seat whose upline holds none here is one of the director's tops too", () => {
    const stray = { ...twoDirectors, people: [...twoDirectors.people,
      { id: "n-s", staffId: "s", departmentId: "fair", schemeId: "s", name: "EVE", code: null, title: "Executive", parentId: "n-elsewhere", self: false, mine: true }] };
    const vm = teamVM({ map: stray, departmentId: "fair", subName: "Fair", staffId: "d0", people: [], month: "2026-09",
      kpi: { enabled: false, threshold: null }, capacity: null, occupied: 0, ranks: new Map() })!;
    expect(vm.kids.map(k => k.name)).toEqual(["EVE", "MARCUS"]);
  });
});

describe("the request forms' choices", () => {
  const person = (id: string, orders: number, scoring: boolean) => ({ id, name: id, sales: 0, held: 0, orders, scoring });
  const booth = (fairId: string, brand: string, week: string, venue: string, people: ReturnType<typeof person>[]) => ({
    id: `${fairId}|${brand}`, fairId, brand, venue, organizer: venue === "HALL" ? "REX" : null, week, start: week, end: week.replace(/\d\d$/, d => String(Number(d) + 2).padStart(2, "0")),
    periodMonth: week.slice(0, 7), people,
  });
  const brandWeek = (week: string, source: "erp" | "auto", brand: string, venue: string, fairId: string | null) => ({
    staffId: "an", week, source, brand, fairId, venue, organizer: venue === "HALL" ? "REX" : null,
    start: week, end: week.replace(/\d\d$/, d => String(Number(d) + 2).padStart(2, "0")), booths: source === "erp" ? 1 : null,
  });
  // ANTHONY's September as the read hands it over (2026-10-12): the ERP lists him at Akemi · HALL on the 4th;
  // nowhere on the 11th, so auto-located at the Zanotti booth where he opened the most bills; at a Dunlopillo
  // booth in IPOH on the 18th that nobody has written a bill at yet (no fair in the portal); nothing on the 25th.
  const sep = {
    period: "2026-09", selfId: "an", brandWeeks: null,
    history: {
      events: [booth("f2", "AKEMI", "2026-09-11", "MID VALLEY", [person("an", 1, false)])],
      weeks: [
        brandWeek("2026-09-04", "erp", "AKEMI", "HALL", "f1"),
        brandWeek("2026-09-11", "auto", "ZANOTTI", "MID VALLEY", "f2"),
        brandWeek("2026-09-18", "erp", "DUNLOP", "IPOH", null),
      ],
    },
  } as unknown as MemberArenaSnapshot;
  const oct = { period: "2026-10", selfId: "an", brandWeeks: null,
    history: { events: [], weeks: [brandWeek("2026-10-02", "erp", "ERGOTEX", "SICC", "f5")] } } as unknown as MemberArenaSnapshot;

  it("offers each begun weekend at the booth of the member's own brand week — the ERP's, else auto-located (2026-10-12)", () => {
    const weeks = claimWeeks([sep, null, sep], "2026-09-30");
    expect(weeks.map(w => [w.key, w.month, w.n, w.brandWeek, w.brand, w.dates, w.venue, w.org, w.fairId, w.auto, w.claimable])).toEqual([
      ["2026-09-25", "SEP", "W4", "No brand week", null, "25–27 Sep", null, null, null, false, false],
      // The ERP's booth, but no fair in the portal yet: shown, not claimable.
      ["2026-09-18", "SEP", "W3", "Dunlopillo week", "DUNLOP", "18–20 Sep", "IPOH", null, null, false, false],
      // Not listed: auto-located — never the off-week Akemi booth.
      ["2026-09-11", "SEP", "W2", "Zanotti week", "ZANOTTI", "11–13 Sep", "MID VALLEY", null, "f2", true, true],
      ["2026-09-04", "SEP", "W1", "Akemi week", "AKEMI", "4–6 Sep", "HALL", "REX", "f1", false, true],
    ]);
    // The fair's own days, which an Airbnb stay must cover; none for a weekend with no brand week.
    expect(weeks.map(w => [w.start, w.end])).toEqual([[null, null], ["2026-09-18", "2026-09-20"], ["2026-09-11", "2026-09-13"], ["2026-09-04", "2026-09-06"]]);
  });

  it("reads a snapshot from before the brand weeks came with it by its scoring booths", () => {
    const old = { period: "2026-09", selfId: "an", brandWeeks: null, history: { events: [
      booth("f1", "AKEMI", "2026-09-04", "HALL", [person("an", 5, true)]),
      booth("f2", "AKEMI", "2026-09-11", "MID VALLEY", [person("an", 1, false)]),
    ] } } as unknown as MemberArenaSnapshot;
    expect(claimWeeks([old], "2026-09-12").map(w => [w.key, w.brand, w.fairId, w.auto, w.claimable])).toEqual([
      ["2026-09-11", null, null, false, false],
      ["2026-09-04", "AKEMI", "f1", true, true],
    ]);
  });

  it("starts at the newest weekend, the month on each so October's W1 is not September's", () => {
    const weeks = claimWeeks([sep, oct], "2026-10-06");
    expect(weeks.slice(0, 2).map(w => [w.key, w.month, w.n, w.brandWeek, w.claimable])).toEqual([
      ["2026-10-02", "OCT", "W1", "Ergotex week", true],
      ["2026-09-25", "SEP", "W4", "No brand week", false],
    ]);
  });

  it("leaves out a weekend that has not begun", () => {
    expect(claimWeeks([sep], "2026-09-12").map(w => w.key)).toEqual(["2026-09-11", "2026-09-04"]);
  });

  it("lets a member replace only somebody in their own team below them", () => {
    const membership: MemberMembership = {
      id: "fair", schemeId: "s", name: "Fair", code: "FAIR", title: "Senior Executive", rank: "Rank B", rate: 0.05, calculator: true,
      effective: "2026-01-01", capacity: null, occupied: 5,
      people: [
        { id: "top", name: "MARCUS", title: "Team Leader", rank: "Rank A", parentId: null },
        { id: "me", name: "JIA HUI", title: "Senior Executive", rank: "Rank B", parentId: "top", self: true },
        { id: "g1", name: "KELVIN", title: "Executive", rank: "Rank C", parentId: "k1" },
        { id: "k1", name: "DARREN", title: "Executive", rank: "Rank C", parentId: "me" },
        { id: "x", name: "ZED", title: "Executive", rank: "Rank C", parentId: "top" },
      ],
    };
    expect(replaceable(membership)).toEqual([{ id: "k1", name: "DARREN" }, { id: "g1", name: "KELVIN" }]);
    expect(replaceable(undefined)).toEqual([]);
  });

  it("lists the member's waiting-list requests, and only an approved one can fill a replacement", () => {
    const choices = waitingChoices([
      request({ id: "w1", kind: "waiting", status: "reserved", requestNo: "RQ-2610-002", detail: { newPerson: "Siti Aminah", start: "2026-11-01" } }),
      request({ id: "w2", kind: "waiting", status: "submitted", requestNo: "RQ-2610-003", detail: { newPerson: "Lee Wei" } }),
      request({ id: "w3", kind: "waiting", status: "rejected", detail: { newPerson: "Gone" } }),
      request({ id: "c1" }),
    ]);
    expect(choices).toEqual([
      { id: "w1", name: "Siti Aminah", sub: "RQ-2610-002 · start 1 Nov", status: "Approved", ok: true },
      { id: "w2", name: "Lee Wei", sub: "RQ-2610-003 · submitted 5 Oct", status: "Pending review", ok: false },
    ]);
  });
});

// HR revamp 7b (2026-10-10): Waiting list & replacements, and a request opened from it.
describe("waiting list & replacements", () => {
  const queues = [{ subDepartmentId: "fair", name: "Fair", rows: [
    { position: 1, name: "Daniel L.", mine: false, requestId: null },
    { position: 2, name: "Siti Aisyah", mine: true, requestId: "w1" },
  ] }];
  const accepted = request({ id: "w1", kind: "waiting", status: "waiting", requestNo: "RQ-2610-004",
    detail: { newPerson: "Siti Aisyah", contact: "019-880 3312", start: "2026-11-02", department: "Fair", subDepartmentId: "fair" } });
  const pending = request({ id: "w2", kind: "waiting", status: "submitted", requestNo: "RQ-2610-006", submittedAt: "2026-10-06T01:00:00Z",
    detail: { newPerson: "Amelia Tan", contact: "012-345 6789", start: "2026-11-03", department: "Fair", subDepartmentId: "fair" } });
  const scheduled = request({ id: "r1", kind: "replacement", status: "scheduled", requestNo: "RQ-2610-005",
    detail: { originalStaffId: "s2", destination: "member_exit", newPerson: "", allocatedName: "RYAN TAN", effective: "2026-10-25", effectiveOn: "2026-10-31", reason: "Leaving Fair" } });

  it("words a request the handoff's way: its place on the list, the day a replacement runs", () => {
    expect(requestStatus("waiting", { position: 2 })).toEqual(["Accepted · #2", "accepted"]);
    expect(requestStatus("scheduled", { date: "2026-10-31" })).toEqual(["Scheduled · 31 Oct", "pending"]);
    expect(requestStatus("needs_info")).toEqual(["More info needed", "pending"]);
    expect(requestStatus("failed")).toEqual(["Failed · removed", "bad"]);
    expect(requestStatus("allocated")).toEqual(["Joined", "good"]);
  });

  it("shows the sub-department's list — the member's own by name — and what they sent", () => {
    const vm = trackVM({ requests: [accepted, pending, scheduled], queues, subDepartmentId: "fair", nameOf });
    expect(vm.queue).toEqual({ title: "Fair waiting list", total: "2 in queue", rows: [
      { pos: "#1", name: "Daniel L.", mine: false }, { pos: "#2", name: "Siti Aisyah", mine: true },
    ] });
    expect(vm.waiting).toEqual([
      { id: "w2", title: "Amelia Tan · Waiting List", sub: "RQ-2610-006 · Fair", status: "Pending review", tone: "pending" },
      { id: "w1", title: "Siti Aisyah · Waiting List", sub: "RQ-2610-004 · Fair · 1 ahead", status: "Accepted · #2", tone: "accepted" },
    ]);
    expect(vm.replacements).toEqual([
      { id: "r1", title: "DARREN ONG → RYAN TAN", sub: "RQ-2610-005 · effective 31 Oct", status: "Scheduled · 31 Oct", tone: "pending" },
    ]);
    expect(trackVM({ requests: [], queues: [], subDepartmentId: "fair", nameOf }).queue).toBeNull();
  });

  it("counts what is still in flight on Profile's row", () => {
    expect(trackedCount([accepted, pending, scheduled, request({ id: "x", kind: "waiting", status: "rejected" })])).toBe(3);
    expect(profileMainVM({ name: "Jia En", title: "T", rank: "R", subName: "Fair", requests: [accepted], memos: [] }).badges.track).toBe("1");
  });

  it("opens a waiting list on its facts and place, editable while HR has not acted", () => {
    const vm = requestDetailVM(pending, null, { nameOf, readOnly: false, queues });
    expect(vm.title).toBe("Amelia Tan · Waiting List");
    expect(vm.facts).toEqual([
      { l: "Applicant", v: "Amelia Tan" }, { l: "Phone", v: "012-345 6789" }, { l: "Start date", v: "3 Nov" }, { l: "Sub-department", v: "Revenue · Fair" },
    ]);
    expect(vm.edit?.fields.map(f => f.label)).toEqual(["New member name", "Phone number", "Preferred start date"]);
    expect(vm.edit?.values).toEqual({ newPerson: "Amelia Tan", contact: "012-345 6789", start: "2026-11-03" });
    expect(vm.lockedNote).toBeNull();
    expect(vm.canCancel).toBe(true);
    expect(vm.canUpdate).toBe(false);
    // A Principal viewing it reads it, and changes nothing.
    expect(requestDetailVM(pending, null, { nameOf, readOnly: true, queues }).edit).toBeNull();
  });

  it("says Any time ready for an applicant ready whenever HR calls them (2026-10-14)", () => {
    const ready = { ...pending, detail: { ...pending.detail, start: "anytime" } };
    const vm = requestDetailVM(ready, null, { nameOf, readOnly: false, queues });
    expect(vm.facts).toContainEqual({ l: "Start date", v: "Any time ready" });
    expect(vm.edit?.values.start).toBe("anytime");
    expect(vm.edit?.fields.find(f => f.key === "start")?.anyTime).toBe(true);
    expect(waitingChoices([request({ id: "w1", kind: "waiting", status: "reserved", requestNo: "RQ-2610-002", detail: { newPerson: "Joan Quek", start: "anytime" } })])[0].sub)
      .toBe("RQ-2610-002 · any time ready");
    const sent: RequestEvent[] = [{ at: "2026-10-14T01:00:00Z", status: "submitted", from: "draft", actor: "you", actorName: null, note: null }];
    expect(requestDetailVM(ready, sent, { nameOf, readOnly: false, queues }).log[0].note).toBe("Amelia Tan · any time ready");
  });

  it("locks one HR accepted, and says where it stands", () => {
    const vm = requestDetailVM(accepted, null, { nameOf, readOnly: false, queues });
    expect(vm.facts).toContainEqual({ l: "Queue position", v: "#2 of 2" });
    expect(vm.status).toBe("Accepted · #2");
    expect(vm.edit).toBeNull();
    expect(vm.lockedNote).toBe("This request has been accepted, so it can no longer be edited. Ask HR if something needs to change.");
  });

  it("names a replacement by who leaves and who takes the seat, on HR's date", () => {
    const vm = requestDetailVM(scheduled, null, { nameOf, readOnly: false, queues });
    expect(vm.title).toBe("DARREN ONG → RYAN TAN");
    expect(vm.facts).toEqual([
      { l: "Original member", v: "DARREN ONG" }, { l: "Arrangement", v: "Leave this department only" }, { l: "Replacement", v: "RYAN TAN" },
      { l: "Effective date", v: "31 Oct" }, { l: "Reason", v: "Leaving Fair" },
    ]);
    expect(vm.lockedNote).toContain("has been approved");
  });

  it("tells an edit by what changed, and an update after HR asked for more", () => {
    const events: RequestEvent[] = [
      { at: "2026-10-06T01:00:00Z", status: "submitted", from: "draft", actor: "you", actorName: null, note: null },
      { at: "2026-10-06T02:00:00Z", status: "submitted", from: "draft", actor: "you", actorName: null, note: "Updated by the member · phone number, preferred start date" },
      { at: "2026-10-07T01:00:00Z", status: "needs_info", from: "submitted", actor: "hr", actorName: "Nadia", note: "Which IC?" },
      { at: "2026-10-07T02:00:00Z", status: "submitted", from: "draft", actor: "you", actorName: null, note: "Which IC?" },
    ];
    expect(requestDetailVM(pending, events, { nameOf, readOnly: false, queues }).log.map(e => [e.what, e.note])).toEqual([
      ["Submitted", "Amelia Tan · preferred start 3 Nov"],
      ["Updated by the member", "Changed: phone number, preferred start date"],
      ["Returned · needs info", "Which IC?"],
      ["Updated and sent again", ""],
    ]);
  });
});
