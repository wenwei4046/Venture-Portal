import { describe, expect, it } from "vitest";
import type { MemberIncome, MemberMemo, MemberRequest } from "@/lib/member/types";
import { notifGroups, notifications } from "./notify-model";
import { shareRequestFromRow } from "@/lib/member/share-requests";

const request = (id: string, kind: MemberRequest["kind"], status: string): MemberRequest => ({
  id, kind, title: `${kind} ${id}`, status, createdAt: "2026-10-05T04:00:00Z", requestNo: `RQ-2610-00${id}`, staffId: "jia", detail: {},
});
const memo: MemberMemo = {
  id: "m1", title: "New fair rules", body: "Read this. Then sign.", sender: "People & Culture", publishedAt: "2026-10-04T04:00:00Z",
  effectiveAt: "2026-10-04", version: 1, requiresAck: true, acknowledgedAt: null, readAt: null, departments: [],
};

const base = {
  now: new Date("2026-10-05T08:00:00Z"), memos: [memo], salary: null, readAll: false,
  requestCode: (r: MemberRequest) => r.requestNo ?? r.id,
};

describe("the bell shows only what the app may open (2026-10-11)", () => {
  it("everything, when nothing is closed — a returned request and a memo to sign both count", () => {
    const { items, count } = notifications({ ...base, requests: [request("1", "claim", "needs_info"), request("2", "waiting", "waiting")] });
    expect(items.map(n => n.id)).toEqual(["rq-1", "rq-2", "memo-m1"]);
    expect(count).toBe(2);
    expect(items[1].go).toEqual({ to: "requests", requestId: "2", kind: "waiting" });
  });

  it("news about a page their ticks close is left out, and not counted", () => {
    const { items, count } = notifications({
      ...base, requests: [request("1", "claim", "needs_info"), request("2", "waiting", "waiting")],
      opens: go => !(go.to === "requests" && go.kind === "claim"),
    });
    expect(items.map(n => n.id)).toEqual(["rq-2", "memo-m1"]);
    expect(count).toBe(1);
  });
});

describe("what the database told them (2026-10-11, mig 20261011180000)", () => {
  const notices = [
    { id: "n1", kind: "rooms" as const, title: "Grace Lim booked a room for you", body: "Interview · Meeting Room 1 · Tue 14 Oct · 10:00–11:00", refKind: "booking" as const, refId: "b1", at: "2026-10-05T07:30:00Z", read: false },
    { id: "n2", kind: "hiring" as const, title: "HR acknowledged your request HR-205", body: "Fair Promoter", refKind: "hiring_request" as const, refId: "HR-205", at: "2026-10-04T07:00:00Z", read: true },
  ];

  it("comes under UPDATES, a meeting opening Book a room and a request's step opening nothing; none of it is waiting for you", () => {
    const { items, count } = notifications({ ...base, requests: [], memos: [], notices });
    expect(items.map(n => [n.id, n.kind, n.tab, n.unread, n.time, n.go])).toEqual([
      ["nt-n1", "room", "updates", true, "30 min", { to: "rooms" }],
      ["nt-n2", "hire", "updates", false, items[1].time, { to: "none" }],
    ]);
    expect(items[1].time).toMatch(/Oct/); // a day ago and more: the day, as the bell writes it
    expect(count).toBe(0);
    expect(notifGroups(items, "all", null).map(g => [g.title, g.items.length])).toEqual([["UPDATES", 2]]);
    expect(notifGroups(items, "requests", null)).toEqual([]);
  });

  it("a meeting is left out when Book a room is closed to them", () => {
    const { items } = notifications({ ...base, requests: [], memos: [], notices, opens: go => go.to !== "rooms" });
    expect(items.map(n => n.id)).toEqual(["nt-n2"]);
  });
});

// 2026-10-20: a Revenue fixed salary is paid out of the commission — the settled month's news says so.
describe("a settled month's commission", () => {
  const settled: MemberIncome = {
    schemeId: "s", period: "2026-09", status: "locked", personal: 16850.9, override: 0, kpi: 0, incentive: 0, group: 0,
    total: 16850.9, sales: 300000, groupSales: 0, deferred: 0, rank: "Rank B", rate: 0.06, kpis: [], brands: [],
  };
  it("pays the fixed salary from it, never beside it", () => {
    const pay = (salary: number | null) => notifications({ ...base, requests: [], memos: [], settled, salary }).items.find(n => n.kind === "pay");
    expect(pay(7000)).toMatchObject({ title: "September commission RM 16,850.90", sub: "Your fixed salary of RM 7,000.00 is paid from it." });
    expect(pay(0)?.sub).toBe("Goes to payroll.");
    expect(pay(null)?.sub).toBe("Goes to payroll.");
  });
});

// IT support (2026-10-20, mig 20261021020100): a status IT set or its note — or, for the desk, a new request or a reply.
describe("an IT request's news", () => {
  const fixed = {
    id: "n9", kind: "it" as const, title: "IT-0007 · Fixed", body: "The Quote freezes on step 2 — “Fixed in today's update.”",
    refKind: "it_request" as const, refId: "r1", at: "2026-10-05T07:00:00Z", read: false,
  };

  it("comes under UPDATES and opens the request in IT support — the bell's number, not a to-do", () => {
    const { items, count } = notifications({ ...base, requests: [], memos: [], notices: [fixed] });
    expect(items.map(n => [n.id, n.kind, n.tab, n.unread, n.title, n.sub, n.link, n.go])).toEqual([
      ["nt-n9", "it", "updates", true, "IT-0007 · Fixed", "The Quote freezes on step 2 — “Fixed in today's update.”", "Open IT support", { to: "it", requestId: "r1" }],
    ]);
    expect(count).toBe(0);
    expect(notifGroups(items, "all", null).map(g => [g.title, g.items.length])).toEqual([["UPDATES", 1]]);
  });
});

describe("share order (2026-10-21)", () => {
  const waiting = shareRequestFromRow({
    id: "s1", status: "partner", orderId: "o1", orderNo: "HC-SO-2610-004", periodMonth: "2026-10", subDepartmentId: "sub",
    owner: { id: "lucas", name: "LUCAS" }, note: "", createdAt: "2026-10-05T06:00:00Z", updatedAt: "2026-10-05T06:00:00Z",
    decidedAt: null, decidedByName: null, decisionNote: null, mine: "partner",
    bill: { date: "2026-10-04", customer: "", venue: "MITEC", total: 4300, ownerId: "lucas", counts: true, periodMonth: "2026-10" },
    parts: [{ id: "anthony", name: "ANTHONY", pct: 0.5, answer: "pending", answeredAt: null, note: null }], holders: [], events: [],
  })!;
  const sent = {
    id: "n7", kind: "share" as const, title: "Share request · HC-SO-2610-004", body: "LUCAS wants to share HC-SO-2610-004 with you: your part 50% of RM 4,300.00 · MITEC.",
    refKind: "share_request" as const, refId: "s1", at: "2026-10-05T06:00:00Z", read: false,
  };
  const approved = { ...sent, id: "n8", title: "HC-SO-2610-001 · shared", body: "HR approved: LUCAS 50% · ANTHONY 50%.", refId: "s0" };

  it("a bill shared with them needs them until they answer — once, not beside its own notice", () => {
    const { items, count } = notifications({ ...base, requests: [], memos: [], notices: [sent, approved], shares: [waiting], staffId: "anthony" });
    expect(items.map(n => [n.id, n.kind, n.open, n.title, n.sub, n.go])).toEqual([
      ["sh-s1", "share", true, "LUCAS shared HC-SO-2610-004 with you", "Your part 50% · MITEC", { to: "share", requestId: "s1" }],
      ["nt-n8", "share", false, "HC-SO-2610-001 · shared", "HR approved: LUCAS 50% · ANTHONY 50%.", { to: "share", requestId: "s0" }],
    ]);
    expect(count).toBe(1);
    expect(notifGroups(items, "all", null).map(g => [g.title, g.items.map(n => n.id)])).toEqual([["NEEDS YOU", ["sh-s1"]], ["UPDATES", ["nt-n8"]]]);
  });

  it("once answered, its notice is news like any other", () => {
    const { items } = notifications({ ...base, requests: [], memos: [], notices: [sent], shares: [], staffId: "anthony" });
    expect(items.map(n => [n.id, n.link])).toEqual([["nt-n7", "Open share request"]]);
  });
});
