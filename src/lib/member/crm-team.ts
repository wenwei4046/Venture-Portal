/**
 * The CRM's team layer: the reporting line, who may see and do what, how a
 * new enquiry is handed to someone, and each person's numbers.
 *
 * The line, agreed with the Boss 2026-10-02:
 *   Boss → HOD → Senior TL (vacant for now) → TL → TA → RS
 * Everyone has at most 3 direct downlines (an RS has none).
 *
 *   - The Boss (the Principal account) watches the numbers and decides which
 *     teams take each ad; reads chats, never replies, takes no enquiries.
 *   - The HOD sells too (2026-10-03): takes enquiries given to them and
 *     replies to those; reads every team's chats; sets the same assignment.
 *   - A team is a TL and everyone below them. TL, TA and RS all take
 *     enquiries and reply to customers.
 *   - Everyone sees themselves and their whole downline, nobody else: a TL
 *     never sees another TL's team. An upline who takes enquiries (Senior TL,
 *     TL, TA) may step into a downline's chat and reply.
 *
 * Assignment:
 *   1. Which team (revised 2026-10-03). An ad the Boss or HOD handed to
 *      teams rotates evenly among them; an ad they split by % follows the %.
 *      Any other ad, and an enquiry from no ad, goes evenly across every team
 *      until the Boss or HOD moves it.
 *   2. Who in the team (revised by the user 2026-10-03).
 *      Monday–Thursday: the TL ticks which days go by the %s they set
 *      (everyone with a %, full time or not); an unticked day waits in the
 *      TL's "To assign" list for them to hand out.
 *      Friday–Sunday: a switch. On — full-time RS only, evenly in turn.
 *      Off — the same %s as the ticked days.
 *      The TL may reassign any lead in their team at any time.
 */
import type { CrmAppointment, CrmLead } from "./crm";

export type CrmRole = "boss" | "hod" | "stl" | "tl" | "ta" | "rs";

export const ROLE_LABELS: Record<CrmRole, string> = {
  boss: "Boss", hod: "HOD", stl: "Senior TL", tl: "TL", ta: "TA", rs: "RS",
};

/** The most direct downlines anyone may have. */
export const MAX_DOWNLINES = 3;

export interface CrmMember {
  id: string;
  name: string;
  role: CrmRole;
  /** Who they report to (People › Hierarchy, `reports_to`). The Boss has none. */
  uplineId?: string;
  /** RS only: full-time RS take the Friday–Sunday enquiries. */
  fullTime?: boolean;
  /** A TL: their team's name. */
  teamName?: string;
}

/* ── The line ───────────────────────────────────────────────────────────── */

export const directDownlines = (memberId: string, members: CrmMember[]) => members.filter(m => m.uplineId === memberId);

/** Everyone below a person, at any depth. */
export function allDownlines(memberId: string, members: CrmMember[]): CrmMember[] {
  const out: CrmMember[] = [];
  const walk = (id: string) => { for (const d of directDownlines(id, members)) { out.push(d); walk(d.id); } };
  walk(memberId);
  return out;
}

/** People over the limit of direct downlines — the hierarchy should not allow it. */
export const overLimit = (members: CrmMember[]) => members.filter(m => directDownlines(m.id, members).length > MAX_DOWNLINES);

/** The TL whose team a person is in (a TL is in their own). Above TL: none. */
export function teamOf(memberId: string, members: CrmMember[]): string | undefined {
  let m = members.find(x => x.id === memberId);
  for (let guard = 0; m && guard < 10; guard++) {
    if (m.role === "tl") return m.id;
    if (m.role !== "ta" && m.role !== "rs") return undefined;
    m = members.find(x => x.id === m!.uplineId);
  }
  return undefined;
}

/** Every TL — one team each. */
export const allTeams = (members: CrmMember[]) => members.filter(m => m.role === "tl");

/** The people in a TL's team who take enquiries: the TL, their TAs and RS. */
export const teamHandlers = (tlId: string, members: CrmMember[]) =>
  [members.find(m => m.id === tlId), ...allDownlines(tlId, members)].filter((m): m is CrmMember => !!m && takesEnquiries(m));

/* ── Who may see and do what ────────────────────────────────────────────── */

/** HOD, TL, TA and RS take enquiries and reply to customers; the Boss and a Senior TL do not take them. */
export const takesEnquiries = (m: CrmMember) => m.role === "hod" || m.role === "tl" || m.role === "ta" || m.role === "rs";

/**
 * Everyone the viewer may see: themselves and their whole downline. The Boss
 * and HOD see everyone (the HOD everyone but the Boss), whatever the chart
 * says — `crm_people()` hands them every person already, and in Revenue a TL
 * cannot report to the department head, so a HOD's line has no TL below it
 * (user 2026-10-05: the CRM adapts, the company's chart stays as it is).
 */
export const visibleMembers = (viewer: CrmMember, members: CrmMember[]) => assignsAds(viewer)
  ? [viewer, ...members.filter(m => m.id !== viewer.id && (viewer.role === "boss" || m.role !== "boss"))]
  : [viewer, ...allDownlines(viewer.id, members)];

/** Anyone who leads people in the CRM — gets the Team tab: the Boss and HOD always, everyone else with a downline. */
export const leadsPeople = (viewer: CrmMember, members: CrmMember[]) => assignsAds(viewer) || hasDownlines(viewer, members);

/**
 * TAs and RS with no TL above them in the chart: in no team, so no team's
 * rules ever deal them an enquiry. The Boss and HOD see who they are.
 */
export const withoutTeam = (members: CrmMember[]) =>
  members.filter(m => (m.role === "ta" || m.role === "rs") && !teamOf(m.id, members));

/** The teams (TLs) the viewer may see — every one for the Boss and HOD, else their own if they are inside one. */
export function visibleTeams(viewer: CrmMember, members: CrmMember[]): CrmMember[] {
  if (assignsAds(viewer)) return allTeams(members);
  const own = teamOf(viewer.id, members);
  if (own) return members.filter(m => m.id === own);
  return visibleMembers(viewer, members).filter(m => m.role === "tl");
}

/**
 * Leads the viewer may open: those assigned to anyone they can see; for the
 * TL and anyone above, their teams' enquiries still waiting to be assigned.
 * The Boss and HOD see EVERY lead — whether or not each person's reporting
 * line reaches them — exactly as the database's crm_contacts policy does.
 */
export function visibleLeads<L extends Pick<CrmLead, "assignedTo" | "teamId">>(viewer: CrmMember, members: CrmMember[], leads: L[]): L[] {
  if (assignsAds(viewer)) return leads;
  const ids = new Set(visibleMembers(viewer, members).map(m => m.id));
  return leads.filter(l => (l.assignedTo ? ids.has(l.assignedTo) : l.teamId ? ids.has(l.teamId) : assignsAds(viewer)));
}

/** An enquiry no team has taken: no ad rule and no team % claimed it, or the Boss or HOD took it back. */
export const isUnassigned = (lead: Pick<CrmLead, "assignedTo" | "teamId">) => !lead.assignedTo && !lead.teamId;

/** A leader of anyone: gets the Team tab and the team's performance. */
export const hasDownlines = (viewer: CrmMember, members: CrmMember[]) => directDownlines(viewer.id, members).length > 0;

/** Boss and HOD hand ads to TLs, set each team's %, and send any enquiry to a team by hand. */
export function assignsAds(viewer: CrmMember) { return viewer.role === "boss" || viewer.role === "hod"; }

/**
 * Whether the viewer may reply in this lead's chat: its own person, or an
 * upline who takes enquiries or is a Senior TL. The HOD only in their own
 * customers' chats; the Boss never.
 */
export function canReply(viewer: CrmMember, lead: Pick<CrmLead, "assignedTo" | "teamId">, members: CrmMember[]): boolean {
  if (viewer.role === "boss") return false;
  if (viewer.role === "hod") return !!lead.assignedTo && lead.assignedTo === viewer.id;
  const owner = lead.assignedTo ?? lead.teamId;
  return !!owner && (owner === viewer.id || allDownlines(viewer.id, members).some(m => m.id === owner));
}

/** Whether the viewer may hand this lead to someone else in its team: its TL (or a Senior TL above). */
export function canReassign(viewer: CrmMember, lead: Pick<CrmLead, "assignedTo" | "teamId">, members: CrmMember[]): boolean {
  if (viewer.role !== "tl" && viewer.role !== "stl") return false;
  const team = lead.teamId ?? (lead.assignedTo ? teamOf(lead.assignedTo, members) : undefined);
  return !!team && (team === viewer.id || allDownlines(viewer.id, members).some(m => m.id === team));
}

/* ── Assignment ─────────────────────────────────────────────────────────── */

/**
 * Which teams take an ad's enquiries, set by the Boss or HOD: handed to these
 * TLs' teams (evenly among them) or, with shares, split by each team's %.
 * An ad with no rule goes evenly across every team.
 */
export interface CrmAdRule {
  /** The Meta ad id (what the database keys the rule by). */
  adId?: string;
  adName: string;
  tlIds: string[];
  /** TL → % (adding up to 100) when the ad is split by %. */
  shares?: Record<string, number>;
}

/** The rule for an ad, found by its Meta id or its name. */
export const ruleForAd = (config: Pick<CrmAssignConfig, "rules">, ad: string) =>
  config.rules.find(r => (r.adId && r.adId === ad) || r.adName === ad);

/** Monday–Thursday as JavaScript numbers them (Date.getDay): the days a TL may tick for %. */
export const WEEKDAYS = [1, 2, 3, 4] as const;

/** How a TL deals enquiries inside their team. */
export interface CrmTeamSettings {
  /** The Mon–Thu days (1–4) dealt by %; an unticked one waits for the TL to assign. */
  percentDays: number[];
  /** Fri–Sun: on = full-time RS only, in turn; off = by % like a ticked day. */
  weekendFullTime: boolean;
  /**
   * Each handler's % (kept at 100 in all). 0 (or none) takes none.
   * Set by the TL; the Boss and HOD may change it too, over the TL's head.
   */
  ratios: Record<string, number>;
  /** Who last changed the days, the switch or the %s, and when — so a TL sees when the Boss or HOD did. */
  editedBy?: { memberId: string; at: string };
}

/** A team nobody has set up: every weekday by hand, Fri–Sun to full-time RS (the rule before the TL decides). */
export const DEFAULT_TEAM_SETTINGS: CrmTeamSettings = { percentDays: [], weekendFullTime: true, ratios: {} };

/** Whether an RS is full time (takes Friday–Sunday enquiries): the HOD's call (2026-10-02), and the Boss's (2026-10-03). */
export const setsFullTime = (viewer: CrmMember) => viewer.role === "hod" || viewer.role === "boss";

/** Who may change a team's Mon–Thu mode and %s: its TL, and the Boss and HOD. */
export const canEditTeamRules = (viewer: CrmMember, tlId: string) => viewer.id === tlId || assignsAds(viewer);

export interface CrmAssignConfig {
  rules: CrmAdRule[];
  /** TL → their team's settings, set by that TL. */
  teams: Record<string, CrmTeamSettings>;
}

/** How many enquiries each team and person has already been given — what the next pick balances against. */
export interface CrmAssignCounts {
  team: Record<string, number>;
  member: Record<string, number>;
}

export const emptyCounts = (): CrmAssignCounts => ({ team: {}, member: {} });

/** Friday, Saturday and Sunday (local time): full-time RS only. */
export const isWeekendEnquiry = (at: Date) => [5, 6, 0].includes(at.getDay());

/**
 * The next pick by share: whoever is furthest below their share gets it.
 * 10 : 5 : 15 deals A B C in proportion, spread out — never ten A's in a row.
 * Ties go to the earlier name in the list.
 */
export function pickByShare(shares: Record<string, number>, given: Record<string, number>): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const [id, share] of Object.entries(shares)) {
    if (!(share > 0)) continue;
    const score = ((given[id] ?? 0) + 1) / share;
    if (score < bestScore) { best = id; bestScore = score; }
  }
  return best;
}

const even = (ids: string[]) => Object.fromEntries(ids.map(id => [id, 1]));

export interface CrmAssignment {
  /** The TL whose team takes it; null when no team can — it waits for the Boss or HOD. */
  teamId: string | null;
  /** Who in the team; null when it waits in the TL's "To assign" list. */
  memberId: string | null;
  /** Why that team: the ad handed to teams (1), the ad split by % (2), evenly across every team (3). */
  teamBy?: 1 | 2 | 3;
  /** Why that person. */
  memberBy?: "weekend" | "ratio" | "manual" | "no_full_time" | "no_shares";
}

/** Which team takes an enquiry from this ad (its Meta id or name; "" for none) — the twin of crm_pick_team. */
export function pickTeam(ad: string, config: CrmAssignConfig, given: Record<string, number>, members: CrmMember[]): Pick<CrmAssignment, "teamId" | "teamBy"> {
  const tls = allTeams(members).map(t => t.id);
  const rule = ad ? ruleForAd(config, ad) : undefined;
  const byPercent = Object.fromEntries(Object.entries(rule?.shares ?? {}).filter(([id, n]) => tls.includes(id) && n > 0));
  if (Object.keys(byPercent).length) return { teamId: pickByShare(byPercent, given), teamBy: 2 };
  const handed = (rule?.tlIds ?? []).filter(id => tls.includes(id));
  if (handed.length) return { teamId: pickByShare(even(handed), given), teamBy: 1 };
  const teamId = pickByShare(even(tls), given);
  return teamId ? { teamId, teamBy: 3 } : { teamId: null };
}

/** Who gets a new enquiry from this ad arriving at `at`, and the counts after it. */
export function assignEnquiry(adName: string, at: Date, config: CrmAssignConfig, counts: CrmAssignCounts, members: CrmMember[]):
  { assignment: CrmAssignment; counts: CrmAssignCounts } {
  // 1. Which team.
  const { teamId, teamBy } = pickTeam(adName, config, counts.team, members);
  if (!teamId) return { assignment: { teamId: null, memberId: null }, counts };
  const withTeam = { ...counts, team: { ...counts.team, [teamId]: (counts.team[teamId] ?? 0) + 1 } };

  // 2. Who in the team.
  const { memberId, memberBy } = pickInTeam(teamId, at, config, counts.member, members);
  const after = memberId ? { ...withTeam, member: { ...withTeam.member, [memberId]: (withTeam.member[memberId] ?? 0) + 1 } } : withTeam;
  return { assignment: { teamId, memberId, teamBy, memberBy }, counts: after };
}

/**
 * Who in a team gets an enquiry arriving at `at` — by the team's own rules:
 * Friday–Sunday full-time RS in turn while the switch is on, else the TL's %s;
 * Monday–Thursday the TL's %s on a ticked day, else the TL's "To assign" list.
 * Also used when the Boss or HOD sends one to a team by hand.
 */
export function pickInTeam(teamId: string, at: Date, config: CrmAssignConfig, given: Record<string, number>, members: CrmMember[]):
  Pick<CrmAssignment, "memberId" | "memberBy"> {
  const handlers = teamHandlers(teamId, members);
  const settings = config.teams[teamId] ?? DEFAULT_TEAM_SETTINGS;
  const byPercent = (): Pick<CrmAssignment, "memberId" | "memberBy"> => {
    const memberId = pickByShare(Object.fromEntries(handlers.map(m => [m.id, settings.ratios[m.id] ?? 0])), given);
    return { memberId, memberBy: memberId ? "ratio" : "no_shares" };
  };
  if (isWeekendEnquiry(at)) {
    if (!settings.weekendFullTime) return byPercent();
    const memberId = pickByShare(even(handlers.filter(m => m.role === "rs" && m.fullTime).map(m => m.id)), given);
    return { memberId, memberBy: memberId ? "weekend" : "no_full_time" };
  }
  if (settings.percentDays.includes(at.getDay())) return byPercent();
  return { memberId: null, memberBy: "manual" };
}

/** How many leads each person holds — what a pick made outside the normal flow balances against. */
export function leadsHeld(leads: Pick<CrmLead, "assignedTo">[]): Record<string, number> {
  const given: Record<string, number> = {};
  for (const l of leads) if (l.assignedTo) given[l.assignedTo] = (given[l.assignedTo] ?? 0) + 1;
  return given;
}

/* ── Numbers ────────────────────────────────────────────────────────────── */

export interface CrmMemberStats {
  leads: number;
  /** Leads whose first customer message got a human reply within 24 real hours. */
  repliedIn24h: number;
  replyRate: number | null;
  /** Average minutes from a customer's first message to the first human reply. */
  avgFirstReplyMinutes: number | null;
  booked: number;
  apptRate: number | null;
  showedUp: number;
  due: number;
  showUpRate: number | null;
  won: number;
}

const DAY = 24 * 60 * 60_000;

/** The first human reply to a lead's first customer message, in minutes (auto-replies do not count). */
export function firstReplyMinutes(lead: CrmLead): number | null {
  const firstIn = lead.messages.find(m => m.from === "lead");
  if (!firstIn) return null;
  const t = new Date(firstIn.at).getTime();
  const reply = lead.messages.find(m => m.from === "me" && !m.auto && new Date(m.at).getTime() >= t);
  return reply ? (new Date(reply.at).getTime() - t) / 60_000 : null;
}

export function memberStats(leads: CrmLead[], appointments: CrmAppointment[], now: Date = new Date()): CrmMemberStats {
  const ids = new Set(leads.map(l => l.id));
  const times = leads.map(firstReplyMinutes).filter((m): m is number => m !== null);
  const repliedIn24h = times.filter(m => m * 60_000 <= DAY).length;
  // A lead asked too recently to have had 24 hours yet is left out of the rate, not counted as a miss.
  const askedLongEnough = leads.filter(l => {
    const first = l.messages.find(m => m.from === "lead");
    return first && (now.getTime() - new Date(first.at).getTime() >= DAY || firstReplyMinutes(l) !== null);
  }).length;
  const appts = appointments.filter(a => ids.has(a.leadId));
  const booked = new Set(appts.filter(a => a.state !== "cancelled").map(a => a.leadId)).size;
  const due = appts.filter(a => a.state === "attended" || (a.state === "booked" && new Date(a.start) <= now));
  const showedUp = due.filter(a => a.state === "attended").length;
  return {
    leads: leads.length,
    repliedIn24h,
    replyRate: askedLongEnough ? repliedIn24h / askedLongEnough : null,
    avgFirstReplyMinutes: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    booked,
    apptRate: leads.length ? booked / leads.length : null,
    showedUp,
    due: due.length,
    showUpRate: due.length ? showedUp / due.length : null,
    won: leads.filter(l => l.status === "won").length,
  };
}

/** The span the Overview's numbers cover (user 2026-10-04): this week or this month. */
export type CrmPeriod = "week" | "month";

/**
 * This week (from Monday) or this calendar month, in local time, and the one
 * before it to compare against. `end` is exclusive, so a lead counts in exactly
 * one period.
 */
export function periodRange(period: CrmPeriod, now: Date = new Date()): { start: Date; end: Date; prevStart: Date; label: string; prevLabel: string } {
  if (period === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
    return { start, end, prevStart, label: "this week", prevLabel: "last week" };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const month = (d: Date) => d.toLocaleDateString("en-MY", { month: "long" });
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { start, end: new Date(now.getFullYear(), now.getMonth() + 1, 1), prevStart, label: `in ${month(start)}`, prevLabel: month(prevStart) };
}

/** The leads that arrived in [from, to). */
export const leadsBetween = (leads: CrmLead[], from: Date, to: Date) =>
  leads.filter(l => { const t = new Date(l.createdAt).getTime(); return t >= from.getTime() && t < to.getTime(); });

/** "8 min", "2 h 5 min", "1 d 3 h". */
export function durationLabel(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const h = Math.floor(m / 60);
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ""}`;
}
