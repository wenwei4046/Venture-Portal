import { describe, expect, it } from "vitest";
import type { CrmAppointment, CrmLead, CrmMessage } from "./crm";
import {
  assignEnquiry, durationLabel, emptyCounts, firstReplyMinutes, memberStats, pickByShare, previewAssignments,
  visibleLeads, visibleMembers, visibleTeams,
  type CrmAdRule, type CrmMember, type CrmRatios, type CrmTeam,
} from "./crm-team";

const members: CrmMember[] = [
  { id: "boss", name: "Boss", role: "boss" },
  { id: "la", name: "Leader A", role: "leader", teamId: "A" },
  { id: "a1", name: "Ann", role: "sales", teamId: "A" },
  { id: "a2", name: "Amir", role: "sales", teamId: "A" },
  { id: "lb", name: "Leader B", role: "leader", teamId: "B" },
  { id: "b1", name: "Ben", role: "sales", teamId: "B" },
];
const teams: CrmTeam[] = [{ id: "A", name: "A Team", leaderId: "la" }, { id: "B", name: "B Team", leaderId: "lb" }];
const who = (id: string) => members.find(m => m.id === id)!;

describe("who sees whom", () => {
  it("lets the Boss see everyone and every team", () => {
    expect(visibleMembers(who("boss"), members)).toHaveLength(6);
    expect(visibleTeams(who("boss"), teams).map(t => t.id)).toEqual(["A", "B"]);
  });

  it("keeps a leader to their own team — never another leader's", () => {
    expect(visibleMembers(who("la"), members).map(m => m.id)).toEqual(["la", "a1", "a2"]);
    expect(visibleTeams(who("la"), teams).map(t => t.id)).toEqual(["A"]);
    expect(visibleMembers(who("la"), members).some(m => m.id === "lb" || m.id === "b1")).toBe(false);
  });

  it("shows a salesperson only themselves", () => {
    expect(visibleMembers(who("a1"), members).map(m => m.id)).toEqual(["a1"]);
    expect(visibleTeams(who("a1"), teams)).toEqual([]);
  });

  it("opens only the leads of people the viewer can see", () => {
    const leads = [{ id: "x", assignedTo: "a1" }, { id: "y", assignedTo: "b1" }, { id: "z" }];
    expect(visibleLeads(who("la"), members, leads).map(l => l.id)).toEqual(["x"]);
    expect(visibleLeads(who("boss"), members, leads).map(l => l.id)).toEqual(["x", "y"]);
  });
});

describe("assignment", () => {
  const ratios: CrmRatios = { teams: { A: 10, B: 5 }, members: { A: { a1: 3, a2: 1 }, B: { b1: 1 } } };

  it("spreads by share, not in runs", () => {
    const given: Record<string, number> = {};
    const order: string[] = [];
    for (let i = 0; i < 30; i++) { const id = pickByShare({ A: 10, B: 5 }, given)!; order.push(id); given[id] = (given[id] ?? 0) + 1; }
    expect([given.A, given.B]).toEqual([20, 10]); // exactly 2 : 1
    let longestRun = 1, run = 1;
    for (let i = 1; i < order.length; i++) { run = order[i] === order[i - 1] ? run + 1 : 1; longestRun = Math.max(longestRun, run); }
    expect(longestRun).toBeLessThanOrEqual(2); // never more than two in a row for a 2 : 1 split
  });

  it("Mode 1: an ad with a rule rotates evenly among its salespeople", () => {
    const rules: CrmAdRule[] = [{ adName: "Sofa Clearance", memberIds: ["a2", "b1"] }];
    const picks = previewAssignments("Sofa Clearance", 4, rules, ratios, emptyCounts(), members);
    expect(picks.map(p => p?.memberId)).toEqual(["a2", "b1", "a2", "b1"]);
    expect(picks.every(p => p?.mode === 1)).toBe(true);
  });

  it("Mode 2: team by the Boss's ratio, then salesperson by the leader's", () => {
    const picks = previewAssignments("Akemi Mattress", 15, [], ratios, emptyCounts(), members);
    const byTeam = (t: string) => picks.filter(p => p?.teamId === t).length;
    expect([byTeam("A"), byTeam("B")]).toEqual([10, 5]);
    const inA = picks.filter(p => p?.teamId === "A").map(p => p!.memberId);
    expect(inA.filter(m => m === "a1").length).toBeGreaterThan(inA.filter(m => m === "a2").length); // 3 : 1
    expect(picks.every(p => p?.mode === 2)).toBe(true);
  });

  it("Mode 1 wins over Mode 2", () => {
    const rules: CrmAdRule[] = [{ adName: "Akemi Mattress", memberIds: ["b1"] }];
    expect(assignEnquiry("Akemi Mattress", rules, ratios, emptyCounts(), members).assignment).toEqual({ memberId: "b1", teamId: "B", mode: 1 });
  });

  it("skips a team whose leader has given nobody a share, and waits for the Boss when nobody can take it", () => {
    const noB: CrmRatios = { teams: { A: 1, B: 5 }, members: { A: { a1: 1 }, B: { b1: 0 } } };
    expect(assignEnquiry("x", [], noB, emptyCounts(), members).assignment?.teamId).toBe("A");
    expect(assignEnquiry("x", [], { teams: {}, members: {} }, emptyCounts(), members).assignment).toBeNull();
  });

  it("keeps counting across enquiries", () => {
    let counts = emptyCounts();
    const out: string[] = [];
    for (let i = 0; i < 3; i++) { const r = assignEnquiry("x", [], ratios, counts, members); out.push(r.assignment!.memberId); counts = r.counts; }
    expect(counts.team.A + (counts.team.B ?? 0)).toBe(3);
    expect(out).toHaveLength(3);
  });
});

describe("numbers", () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  const m = (from: CrmMessage["from"], at: string, extra: Partial<CrmMessage> = {}): CrmMessage => ({ id: from + at, from, text: "", at, ...extra });
  const lead = (id: string, messages: CrmMessage[], status: CrmLead["status"] = "follow_up"): CrmLead => ({
    id, name: id, phone: "", adName: "", campaign: "", status, createdAt: messages[0]?.at ?? now.toISOString(), unread: 0, messages,
  });

  it("measures the first human reply, ignoring auto-replies", () => {
    const l = lead("a", [m("lead", "2026-10-01T02:00:00.000Z"), m("me", "2026-10-01T02:00:05.000Z", { auto: true }), m("me", "2026-10-01T02:30:00.000Z")]);
    expect(firstReplyMinutes(l)).toBe(30);
  });

  it("counts reply rate within 24 hours, leaving out leads too new to judge", () => {
    const leads = [
      lead("fast", [m("lead", "2026-10-01T02:00:00.000Z"), m("me", "2026-10-01T03:00:00.000Z")]),
      lead("slow", [m("lead", "2026-10-01T02:00:00.000Z"), m("me", "2026-10-03T02:00:00.000Z")]),
      lead("never", [m("lead", "2026-10-02T02:00:00.000Z")]),
      lead("new", [m("lead", "2026-10-05T10:00:00.000Z")]),
    ];
    const s = memberStats(leads, [], now);
    expect([s.leads, s.repliedIn24h, s.replyRate]).toEqual([4, 1, 1 / 3]);
    expect(s.avgFirstReplyMinutes).toBe((60 + 48 * 60) / 2);
  });

  it("counts appointments, show-ups and wins for the person's own leads", () => {
    const leads = [lead("a", [m("lead", "2026-10-01T02:00:00.000Z")], "won"), lead("b", [m("lead", "2026-10-01T02:00:00.000Z")])];
    const appts: CrmAppointment[] = [
      { id: "1", leadId: "a", showroomId: "kl", start: "2026-10-02T04:00:00.000Z", minutes: 60, state: "attended" },
      { id: "2", leadId: "b", showroomId: "kl", start: "2026-10-03T04:00:00.000Z", minutes: 60, state: "booked" },
      { id: "3", leadId: "other", showroomId: "kl", start: "2026-10-03T04:00:00.000Z", minutes: 60, state: "attended" },
    ];
    const s = memberStats(leads, appts, now);
    expect([s.booked, s.apptRate, s.showedUp, s.due, s.showUpRate, s.won]).toEqual([2, 1, 1, 2, 0.5, 1]);
  });

  it("writes durations people read", () => {
    expect([durationLabel(8), durationLabel(125), durationLabel(27 * 60)]).toEqual(["8 min", "2 h 5 min", "1 d 3 h"]);
  });
});
