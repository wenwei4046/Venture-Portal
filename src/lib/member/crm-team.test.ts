import { describe, expect, it } from "vitest";
import type { CrmAppointment, CrmLead, CrmMessage } from "./crm";
import {
  allDownlines, assignEnquiry, canEditTeamRules, canReassign, canReply, durationLabel, emptyCounts, firstReplyMinutes, isUnassigned, isWeekendEnquiry, leadsHeld, pickInTeam,
  memberStats, overLimit, pickByShare, previewAssignments, setsFullTime, teamHandlers, teamOf, visibleLeads, visibleMembers, visibleTeams,
  type CrmAssignConfig, type CrmMember,
} from "./crm-team";

// Boss → HOD → (Senior TL vacant) → TL A / TL B → TA → RS
const members: CrmMember[] = [
  { id: "boss", name: "Boss", role: "boss" },
  { id: "hod", name: "Peter", role: "hod", uplineId: "boss" },
  { id: "tla", name: "TL A", role: "tl", uplineId: "hod" },
  { id: "taa", name: "TA A", role: "ta", uplineId: "tla" },
  { id: "a1", name: "Ann", role: "rs", uplineId: "taa", fullTime: true },
  { id: "a2", name: "Amir", role: "rs", uplineId: "taa" },
  { id: "a3", name: "Aida", role: "rs", uplineId: "taa", fullTime: true },
  { id: "tlb", name: "TL B", role: "tl", uplineId: "hod" },
  { id: "tab", name: "TA B", role: "ta", uplineId: "tlb" },
  { id: "b1", name: "Ben", role: "rs", uplineId: "tab" },
];
const who = (id: string) => members.find(m => m.id === id)!;
const ids = (list: { id: string }[]) => list.map(m => m.id);
const friday = new Date(2026, 9, 2, 11); // Fri 2 Oct 2026
const tuesday = new Date(2026, 9, 6, 11);

describe("the line", () => {
  it("finds every downline and each person's team", () => {
    expect(ids(allDownlines("tla", members))).toEqual(["taa", "a1", "a2", "a3"]);
    expect([teamOf("a2", members), teamOf("taa", members), teamOf("tla", members), teamOf("hod", members)]).toEqual(["tla", "tla", "tla", undefined]);
    expect(ids(teamHandlers("tla", members))).toEqual(["tla", "taa", "a1", "a2", "a3"]);
  });

  it("flags anyone with more than 3 direct downlines", () => {
    expect(overLimit(members)).toEqual([]);
    const crowded = [...members, { id: "a4", name: "Extra", role: "rs" as const, uplineId: "taa" }];
    expect(ids(overLimit(crowded))).toEqual(["taa"]);
  });
});

describe("who sees and does what", () => {
  it("shows everyone their whole downline and nobody else — a TL never sees another TL's team", () => {
    expect(visibleMembers(who("boss"), members)).toHaveLength(members.length);
    expect(ids(visibleMembers(who("tla"), members))).toEqual(["tla", "taa", "a1", "a2", "a3"]);
    expect(ids(visibleMembers(who("taa"), members))).toEqual(["taa", "a1", "a2", "a3"]);
    expect(ids(visibleMembers(who("a1"), members))).toEqual(["a1"]);
    expect(ids(visibleTeams(who("hod"), members))).toEqual(["tla", "tlb"]);
    expect(ids(visibleTeams(who("taa"), members))).toEqual(["tla"]);
  });

  it("opens assigned leads of people the viewer sees, and unassigned ones to their TL and above", () => {
    const leads = [{ id: "x", assignedTo: "a1" }, { id: "y", assignedTo: "b1" }, { id: "w", teamId: "tla" }];
    expect(ids(visibleLeads(who("tla"), members, leads))).toEqual(["x", "w"]);
    expect(ids(visibleLeads(who("taa"), members, leads))).toEqual(["x"]); // the TL assigns, not the TA
    expect(ids(visibleLeads(who("boss"), members, leads))).toEqual(["x", "y", "w"]);
  });

  it("shows the Boss and HOD every lead, even one whose line does not reach them (as the database does)", () => {
    const orphan = [{ id: "o", assignedTo: "nobody-above" }];
    expect(ids(visibleLeads(who("hod"), members, orphan))).toEqual(["o"]);
    expect(ids(visibleLeads(who("tla"), members, orphan))).toEqual([]);
  });

  it("shows enquiries no team has taken to the Boss and HOD only", () => {
    const leads = [{ id: "u" }, { id: "x", assignedTo: "a1" }];
    expect(ids(visibleLeads(who("hod"), members, leads))).toEqual(["u", "x"]);
    expect(ids(visibleLeads(who("boss"), members, leads))).toEqual(["u", "x"]);
    expect(ids(visibleLeads(who("tla"), members, leads))).toEqual(["x"]);
    expect([isUnassigned(leads[0]), isUnassigned(leads[1]), isUnassigned({ teamId: "tla" })]).toEqual([true, false, false]);
  });

  it("lets uplines who take enquiries reply, never the Boss or HOD", () => {
    const lead = { assignedTo: "a2" };
    expect([canReply(who("a2"), lead, members), canReply(who("taa"), lead, members), canReply(who("tla"), lead, members)]).toEqual([true, true, true]);
    expect([canReply(who("boss"), lead, members), canReply(who("hod"), lead, members), canReply(who("a1"), lead, members), canReply(who("tlb"), lead, members)])
      .toEqual([false, false, false, false]);
  });

  it("lets a team's TL, the Boss and the HOD change its rules — not another TL or the TA", () => {
    expect([canEditTeamRules(who("tla"), "tla"), canEditTeamRules(who("boss"), "tla"), canEditTeamRules(who("hod"), "tla")]).toEqual([true, true, true]);
    expect([canEditTeamRules(who("tlb"), "tla"), canEditTeamRules(who("taa"), "tla")]).toEqual([false, false]);
  });

  it("lets only the HOD set who is full time", () => {
    expect(["boss", "hod", "tla", "taa", "a1"].map(id => setsFullTime(who(id)))).toEqual([false, true, false, false, false]);
  });

  it("lets only the team's TL reassign", () => {
    expect([canReassign(who("tla"), { assignedTo: "a2" }, members), canReassign(who("tla"), { teamId: "tla" }, members)]).toEqual([true, true]);
    expect([canReassign(who("taa"), { assignedTo: "a2" }, members), canReassign(who("tlb"), { assignedTo: "a2" }, members), canReassign(who("boss"), { assignedTo: "a2" }, members)])
      .toEqual([false, false, false]);
  });
});

describe("assignment", () => {
  const config: CrmAssignConfig = {
    rules: [{ adName: "Sofa", tlIds: ["tla", "tlb"] }],
    teamRatios: { tla: 2, tlb: 1 },
    teams: {
      tla: { weekday: "auto", ratios: { a1: 1, a2: 1 } },
      tlb: { weekday: "manual", ratios: {} },
    },
  };

  it("spreads by share, not in runs", () => {
    const given: Record<string, number> = {};
    const order: string[] = [];
    for (let i = 0; i < 30; i++) { const id = pickByShare({ A: 10, B: 5 }, given)!; order.push(id); given[id] = (given[id] ?? 0) + 1; }
    expect([given.A, given.B]).toEqual([20, 10]);
    let longestRun = 1, run = 1;
    for (let i = 1; i < order.length; i++) { run = order[i] === order[i - 1] ? run + 1 : 1; longestRun = Math.max(longestRun, run); }
    expect(longestRun).toBeLessThanOrEqual(2);
  });

  it("knows Friday to Sunday", () => {
    expect([1, 2, 3, 4, 5].map(d => isWeekendEnquiry(new Date(2026, 9, d, 12)))).toEqual([false, true, true, true, false]); // Thu 1 → Mon 5
    expect(isWeekendEnquiry(friday)).toBe(true);
  });

  it("Mode 1: an ad handed to TLs rotates evenly among their teams", () => {
    const picks = previewAssignments("Sofa", tuesday, 4, config, emptyCounts(), members);
    expect(picks.map(p => [p.teamId, p.teamBy])).toEqual([["tla", 1], ["tlb", 1], ["tla", 1], ["tlb", 1]]);
  });

  it("Mode 2: any other ad goes by the ratio between teams", () => {
    const picks = previewAssignments("Akemi", tuesday, 9, config, emptyCounts(), members);
    expect(picks.filter(p => p.teamId === "tla")).toHaveLength(6);
    expect(picks.every(p => p.teamBy === 2)).toBe(true);
  });

  it("Friday to Sunday: only full-time RS, evenly in turn", () => {
    const picks = previewAssignments("Akemi", friday, 6, { ...config, teamRatios: { tla: 1 } }, emptyCounts(), members);
    expect(picks.map(p => p.memberId)).toEqual(["a1", "a3", "a1", "a3", "a1", "a3"]);
    expect(picks.every(p => p.memberBy === "weekend")).toBe(true);
  });

  it("Friday to Sunday with no full-time RS: waits for the TL", () => {
    const r = assignEnquiry("Akemi", friday, { ...config, teamRatios: { tlb: 1 } }, emptyCounts(), members);
    expect(r.assignment).toMatchObject({ teamId: "tlb", memberId: null, memberBy: "no_full_time" });
  });

  it("Monday to Thursday: the TL's ratio when automatic, the TL's list when by hand", () => {
    const auto = previewAssignments("Akemi", tuesday, 4, { ...config, teamRatios: { tla: 1 } }, emptyCounts(), members);
    expect(auto.map(p => p.memberId)).toEqual(["a1", "a2", "a1", "a2"]);
    const manual = assignEnquiry("Akemi", tuesday, { ...config, teamRatios: { tlb: 1 } }, emptyCounts(), members);
    expect(manual.assignment).toMatchObject({ teamId: "tlb", memberId: null, memberBy: "manual" });
  });

  it("sending to a team by hand follows that team's own rules", () => {
    const held = leadsHeld([{ assignedTo: "a1" }, { assignedTo: "a1" }, {}]);
    expect(held).toEqual({ a1: 2 });
    expect(pickInTeam("tla", friday, config, held, members)).toEqual({ memberId: "a3", memberBy: "weekend" }); // the full-time RS with fewer leads
    expect(pickInTeam("tla", tuesday, config, held, members)).toEqual({ memberId: "a2", memberBy: "ratio" });
    expect(pickInTeam("tlb", tuesday, config, held, members)).toEqual({ memberId: null, memberBy: "manual" });
  });

  it("waits for the Boss or HOD when no team can take it", () => {
    expect(assignEnquiry("x", tuesday, { rules: [], teamRatios: {}, teams: {} }, emptyCounts(), members).assignment).toEqual({ teamId: null, memberId: null });
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
