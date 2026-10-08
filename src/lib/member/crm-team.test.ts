import { describe, expect, it } from "vitest";
import type { CrmAppointment, CrmLead, CrmMessage } from "./crm";
import {
  allDownlines, assignEnquiry, canEditTeamRules, leadsBetween, leadsPeople, periodRange, withoutTeam, canReassign, canReply, durationLabel, emptyCounts, firstReplyMinutes, isUnassigned, isWeekendEnquiry, leadsHeld, pickInTeam,
  memberStats, overLimit, pickByShare, pickTeam, setsFullTime, teamHandlers, teamOf, visibleLeads, visibleMembers, visibleTeams,
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

  it("lets uplines who take enquiries reply, never the Boss; the HOD only to their own", () => {
    const lead = { assignedTo: "a2" };
    expect([canReply(who("a2"), lead, members), canReply(who("taa"), lead, members), canReply(who("tla"), lead, members)]).toEqual([true, true, true]);
    expect([canReply(who("boss"), lead, members), canReply(who("hod"), lead, members), canReply(who("a1"), lead, members), canReply(who("tlb"), lead, members)])
      .toEqual([false, false, false, false]);
    // The HOD sells too (2026-10-03): a customer given to them is theirs to answer; the Principal still never replies.
    expect([canReply(who("hod"), { assignedTo: "hod" }, members), canReply(who("boss"), { assignedTo: "hod" }, members)]).toEqual([true, false]);
  });

  it("lets a team's TL, the Boss and the HOD change its rules — not another TL or the TA", () => {
    expect([canEditTeamRules(who("tla"), "tla"), canEditTeamRules(who("boss"), "tla"), canEditTeamRules(who("hod"), "tla")]).toEqual([true, true, true]);
    expect([canEditTeamRules(who("tlb"), "tla"), canEditTeamRules(who("taa"), "tla")]).toEqual([false, false]);
  });

  it("lets the HOD and the Principal set who is full time", () => {
    expect(["boss", "hod", "tla", "taa", "a1"].map(id => setsFullTime(who(id)))).toEqual([true, true, false, false, false]);
  });

  it("lets only the team's TL reassign", () => {
    expect([canReassign(who("tla"), { assignedTo: "a2" }, members), canReassign(who("tla"), { teamId: "tla" }, members)]).toEqual([true, true]);
    expect([canReassign(who("taa"), { assignedTo: "a2" }, members), canReassign(who("tlb"), { assignedTo: "a2" }, members), canReassign(who("boss"), { assignedTo: "a2" }, members)])
      .toEqual([false, false, false]);
  });
});

describe("assignment", () => {
  const config: CrmAssignConfig = {
    rules: [
      { adId: "AD-SOFA", adName: "Sofa", tlIds: ["tla", "tlb"] },
      { adId: "AD-AKEMI", adName: "Akemi", tlIds: ["tla", "tlb"], shares: { tla: 2, tlb: 1 } },
      { adName: "Only A", tlIds: ["tla"] },
      { adName: "Only B", tlIds: ["tlb"] },
    ],
    teams: {
      // TL A: every weekday by %, Fri–Sun full time only. TL B: nothing ticked yet.
      tla: { percentDays: [1, 2, 3, 4], weekendFullTime: true, ratios: { a1: 1, a2: 1 } },
      tlb: { percentDays: [], weekendFullTime: true, ratios: {} },
    },
  };
  /** The next n enquiries for an ad, without changing anything. */
  const deal = (ad: string, at: Date, n: number, cfg: CrmAssignConfig = config) => {
    const out = [];
    let counts = emptyCounts();
    for (let i = 0; i < n; i++) { const r = assignEnquiry(ad, at, cfg, counts, members); out.push(r.assignment); counts = r.counts; }
    return out;
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

  it("an ad handed to several teams rotates evenly among them — found by its Meta id or name", () => {
    expect(deal("AD-SOFA", tuesday, 4).map(p => [p.teamId, p.teamBy])).toEqual([["tla", 1], ["tlb", 1], ["tla", 1], ["tlb", 1]]);
    expect(deal("Sofa", tuesday, 2).map(p => p.teamId)).toEqual(["tla", "tlb"]);
  });

  it("an ad split by % follows the %", () => {
    const picks = deal("AD-AKEMI", tuesday, 9);
    expect(picks.filter(p => p.teamId === "tla")).toHaveLength(6);
    expect(picks.every(p => p.teamBy === 2)).toBe(true);
  });

  it("an ad nobody set, and an enquiry from no ad: evenly across every team (2026-10-03)", () => {
    expect(deal("A NEW AD", tuesday, 4).map(p => [p.teamId, p.teamBy])).toEqual([["tla", 3], ["tlb", 3], ["tla", 3], ["tlb", 3]]);
    expect(pickTeam("", config, { tla: 3 }, members)).toEqual({ teamId: "tlb", teamBy: 3 });
  });

  it("Friday to Sunday: only full-time RS, evenly in turn", () => {
    const picks = deal("Only A", friday, 6);
    expect(picks.map(p => p.memberId)).toEqual(["a1", "a3", "a1", "a3", "a1", "a3"]);
    expect(picks.every(p => p.memberBy === "weekend")).toBe(true);
  });

  it("Friday to Sunday with no full-time RS: waits for the TL", () => {
    expect(deal("Only B", friday, 1)[0]).toMatchObject({ teamId: "tlb", memberId: null, memberBy: "no_full_time" });
  });

  it("Monday to Thursday: a ticked day goes by the TL's %s, an unticked one to the TL's list", () => {
    expect(deal("Only A", tuesday, 4).map(p => p.memberId)).toEqual(["a1", "a2", "a1", "a2"]);
    expect(deal("Only B", tuesday, 1)[0]).toMatchObject({ teamId: "tlb", memberId: null, memberBy: "manual" });
    // TL A ticks Monday and Thursday only: Tuesday now waits for them.
    const mondayThursday = { ...config, teams: { ...config.teams, tla: { ...config.teams.tla, percentDays: [1, 4] } } };
    expect(pickInTeam("tla", tuesday, mondayThursday, {}, members)).toEqual({ memberId: null, memberBy: "manual" });
    expect(pickInTeam("tla", new Date(2026, 9, 8, 11), mondayThursday, {}, members).memberBy).toBe("ratio"); // Thu 8 Oct
  });

  it("the %s include people who are not full time", () => {
    // a2 (Amir) is part time: on a ticked weekday he takes his share.
    expect(deal("Only A", tuesday, 2).some(p => p.memberId === "a2")).toBe(true);
  });

  it("Friday to Sunday with the switch off: the same %s, part time included", () => {
    const off = { ...config, teams: { ...config.teams, tla: { ...config.teams.tla, weekendFullTime: false } } };
    const picks = deal("Only A", friday, 4, off);
    expect(picks.map(p => p.memberId)).toEqual(["a1", "a2", "a1", "a2"]);
    expect(picks.every(p => p.memberBy === "ratio")).toBe(true);
  });

  it("a team nobody has set up: every weekday by hand, Fri–Sun to full-time RS", () => {
    expect(pickInTeam("tla", tuesday, { rules: [], teams: {} }, {}, members)).toEqual({ memberId: null, memberBy: "manual" });
    expect(pickInTeam("tla", friday, { rules: [], teams: {} }, {}, members).memberBy).toBe("weekend");
  });

  it("sending to a team by hand follows that team's own rules", () => {
    const held = leadsHeld([{ assignedTo: "a1" }, { assignedTo: "a1" }, {}]);
    expect(held).toEqual({ a1: 2 });
    expect(pickInTeam("tla", friday, config, held, members)).toEqual({ memberId: "a3", memberBy: "weekend" }); // the full-time RS with fewer leads
    expect(pickInTeam("tla", tuesday, config, held, members)).toEqual({ memberId: "a2", memberBy: "ratio" });
    expect(pickInTeam("tlb", tuesday, config, held, members)).toEqual({ memberId: null, memberBy: "manual" });
  });

  it("waits for the Principal or HOD only when there is no team at all", () => {
    expect(assignEnquiry("x", tuesday, { rules: [], teams: {} }, emptyCounts(), members.filter(m => m.role !== "tl")).assignment).toEqual({ teamId: null, memberId: null });
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

describe("the Overview's week / month", () => {
  // Sunday 4 October 2026, mid-morning.
  const now = new Date(2026, 9, 4, 10, 30);

  it("starts the week on Monday and compares with the week before", () => {
    const r = periodRange("week", now);
    expect(r.start).toEqual(new Date(2026, 8, 28));
    expect(r.end).toEqual(new Date(2026, 9, 5));
    expect(r.prevStart).toEqual(new Date(2026, 8, 21));
    expect(r.label).toBe("this week");
  });

  it("keeps Sunday in the week that began the Monday before, and starts a new one on Monday", () => {
    expect(periodRange("week", new Date(2026, 9, 4, 23, 59)).start).toEqual(new Date(2026, 8, 28));
    expect(periodRange("week", new Date(2026, 9, 5, 0, 0)).start).toEqual(new Date(2026, 9, 5));
  });

  it("covers the calendar month and names it, and the one before", () => {
    const r = periodRange("month", now);
    expect(r.start).toEqual(new Date(2026, 9, 1));
    expect(r.end).toEqual(new Date(2026, 10, 1));
    expect(r.prevStart).toEqual(new Date(2026, 8, 1));
    expect(r.label).toBe("in October");
    expect(r.prevLabel).toBe("September");
  });

  it("rolls January back into December of the year before", () => {
    expect(periodRange("month", new Date(2027, 0, 15)).prevStart).toEqual(new Date(2026, 11, 1));
  });

  it("counts a lead in exactly one period: the end is not included", () => {
    const at = (d: Date) => ({ id: d.toISOString(), createdAt: d.toISOString() }) as CrmLead;
    const leads = [at(new Date(2026, 8, 30, 23, 59)), at(new Date(2026, 9, 1)), at(new Date(2026, 9, 31, 23))];
    const r = periodRange("month", now);
    expect(leadsBetween(leads, r.start, r.end)).toHaveLength(2);
    expect(leadsBetween(leads, r.prevStart, r.start)).toHaveLength(1);
  });
});

describe("the CRM adapts to the company chart, never the other way (user 2026-10-05)", () => {
  // As in Revenue today: a TL cannot report to the department head, so the TLs
  // report to nobody; one TA and one RS have no upline at all.
  const chart: CrmMember[] = [
    { id: "boss", name: "Boss", role: "boss" },
    { id: "hod", name: "Peter", role: "hod", uplineId: "boss" },
    { id: "tla", name: "TL A", role: "tl" },
    { id: "taa", name: "TA A", role: "ta", uplineId: "tla" },
    { id: "a1", name: "Ann", role: "rs", uplineId: "taa" },
    { id: "tlb", name: "TL B", role: "tl" },
    { id: "loneTa", name: "Lone TA", role: "ta" },
    { id: "loneRs", name: "Lone RS", role: "rs", uplineId: "loneTa" },
  ];
  const as = (id: string) => chart.find(m => m.id === id)!;
  const names = (ms: CrmMember[]) => ms.map(m => m.id);

  it("gives the HOD every team and the Team tab though no TL reports to them", () => {
    expect(names(visibleTeams(as("hod"), chart))).toEqual(["tla", "tlb"]);
    expect(leadsPeople(as("hod"), chart)).toBe(true);
  });

  it("lets the HOD see everyone but the Boss, and the Boss everyone", () => {
    expect(names(visibleMembers(as("hod"), chart))).not.toContain("boss");
    expect(visibleMembers(as("hod"), chart)).toHaveLength(chart.length - 1);
    expect(visibleMembers(as("boss"), chart)).toHaveLength(chart.length);
  });

  it("keeps a TL to their own team and an RS to themselves", () => {
    expect(names(visibleMembers(as("tla"), chart))).toEqual(["tla", "taa", "a1"]);
    expect(leadsPeople(as("a1"), chart)).toBe(false);
  });

  it("names the TAs and RS no TL leads, so the Boss and HOD can fix the chart", () => {
    expect(names(withoutTeam(chart))).toEqual(["loneTa", "loneRs"]);
  });
});
