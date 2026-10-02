/**
 * The CRM's team layer: the reporting line, who may see and do what, how a
 * new enquiry is handed to someone, and each person's numbers.
 *
 * The line, agreed with the Boss 2026-10-02:
 *   Boss → HOD → Senior TL (vacant for now) → TL → TA → RS
 * Everyone has at most 3 direct downlines (an RS has none).
 *
 *   - Boss and HOD hand ads to TLs and watch performance. They read chats
 *     but never reply in them.
 *   - A team is a TL and everyone below them. TL, TA and RS all take
 *     enquiries and reply to customers.
 *   - Everyone sees themselves and their whole downline, nobody else: a TL
 *     never sees another TL's team. An upline who takes enquiries (Senior TL,
 *     TL, TA) may step into a downline's chat and reply.
 *
 * Assignment:
 *   1. Which team. An ad the Boss or HOD handed to TLs rotates evenly among
 *      them (Mode 1). Any other ad is split by each team's % (Mode 2).
 *   2. Who in the team.
 *      Friday–Sunday: only full-time RS, evenly in turn.
 *      Monday–Thursday: as the TL chooses — automatically by the % the TL sets,
 *      or by hand (the enquiry waits in the TL's "To assign" list).
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

/** TL, TA and RS take enquiries and reply to customers; Boss, HOD and Senior TL do not take them. */
export const takesEnquiries = (m: CrmMember) => m.role === "tl" || m.role === "ta" || m.role === "rs";

/** Everyone the viewer may see: themselves and their whole downline. */
export const visibleMembers = (viewer: CrmMember, members: CrmMember[]) => [viewer, ...allDownlines(viewer.id, members)];

/** The teams (TLs) the viewer may see — their own if they are inside one. */
export function visibleTeams(viewer: CrmMember, members: CrmMember[]): CrmMember[] {
  const own = teamOf(viewer.id, members);
  if (own) return members.filter(m => m.id === own);
  return visibleMembers(viewer, members).filter(m => m.role === "tl");
}

/**
 * Leads the viewer may open: those assigned to anyone they can see; for the
 * TL and anyone above, their teams' enquiries still waiting to be assigned;
 * and for the Boss and HOD, enquiries no team has taken yet.
 */
export function visibleLeads<L extends Pick<CrmLead, "assignedTo" | "teamId">>(viewer: CrmMember, members: CrmMember[], leads: L[]): L[] {
  const ids = new Set(visibleMembers(viewer, members).map(m => m.id));
  return leads.filter(l => (l.assignedTo ? ids.has(l.assignedTo) : l.teamId ? ids.has(l.teamId) : assignsAds(viewer)));
}

/** An enquiry no team has taken: no ad rule and no team % claimed it, or the Boss or HOD took it back. */
export const isUnassigned = (lead: Pick<CrmLead, "assignedTo" | "teamId">) => !lead.assignedTo && !lead.teamId;

/** A leader of anyone: gets the Team tab and the team's performance. */
export const hasDownlines = (viewer: CrmMember, members: CrmMember[]) => directDownlines(viewer.id, members).length > 0;

/** Boss and HOD hand ads to TLs, set each team's %, and send any enquiry to a team by hand. */
export function assignsAds(viewer: CrmMember) { return viewer.role === "boss" || viewer.role === "hod"; }

/** Whether the viewer may reply in this lead's chat: its own person, or an upline who takes enquiries or is a Senior TL. */
export function canReply(viewer: CrmMember, lead: Pick<CrmLead, "assignedTo" | "teamId">, members: CrmMember[]): boolean {
  if (viewer.role === "boss" || viewer.role === "hod") return false;
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

/** Mode 1: the Boss or HOD hands an ad to these TLs; its enquiries rotate evenly among their teams. */
export interface CrmAdRule {
  adName: string;
  tlIds: string[];
}

/** How a TL deals Monday–Thursday enquiries inside their team. */
export interface CrmTeamSettings {
  weekday: "auto" | "manual";
  /**
   * Each handler's % for "auto" (kept at 100 in all). 0 (or none) takes none.
   * Set by the TL; the Boss and HOD may change it too, over the TL's head.
   */
  ratios: Record<string, number>;
  /** Who last changed the Mon–Thu mode or the %s, and when — so a TL sees when the Boss or HOD did. */
  editedBy?: { memberId: string; at: string };
}

/** Whether an RS is full time (takes Friday–Sunday enquiries) is the HOD's call, decided 2026-10-02. */
export const setsFullTime = (viewer: CrmMember) => viewer.role === "hod";

/** Who may change a team's Mon–Thu mode and %s: its TL, and the Boss and HOD. */
export const canEditTeamRules = (viewer: CrmMember, tlId: string) => viewer.id === tlId || assignsAds(viewer);

export interface CrmAssignConfig {
  rules: CrmAdRule[];
  /** Mode 2: TL → % of the enquiries no ad rule claims, set by the Boss or HOD (100 in all). */
  teamRatios: Record<string, number>;
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
  /** Why that team: an ad rule (1) or the split between teams (2). */
  teamBy?: 1 | 2;
  /** Why that person. */
  memberBy?: "weekend" | "ratio" | "manual" | "no_full_time" | "no_shares";
}

/** Who gets a new enquiry from this ad arriving at `at`, and the counts after it. */
export function assignEnquiry(adName: string, at: Date, config: CrmAssignConfig, counts: CrmAssignCounts, members: CrmMember[]):
  { assignment: CrmAssignment; counts: CrmAssignCounts } {
  const tls = new Set(allTeams(members).map(t => t.id));

  // 1. Which team.
  const rule = config.rules.find(r => r.adName === adName && r.tlIds.some(id => tls.has(id)));
  const teamId = rule
    ? pickByShare(even(rule.tlIds.filter(id => tls.has(id))), counts.team)
    : pickByShare(Object.fromEntries(Object.entries(config.teamRatios).filter(([id]) => tls.has(id))), counts.team);
  if (!teamId) return { assignment: { teamId: null, memberId: null }, counts };
  const teamBy = rule ? 1 : 2;
  const withTeam = { ...counts, team: { ...counts.team, [teamId]: (counts.team[teamId] ?? 0) + 1 } };

  // 2. Who in the team.
  const { memberId, memberBy } = pickInTeam(teamId, at, config, counts.member, members);
  const after = memberId ? { ...withTeam, member: { ...withTeam.member, [memberId]: (withTeam.member[memberId] ?? 0) + 1 } } : withTeam;
  return { assignment: { teamId, memberId, teamBy, memberBy }, counts: after };
}

/**
 * Who in a team gets an enquiry arriving at `at` — by the team's own rules:
 * Friday–Sunday a full-time RS in turn; Monday–Thursday the TL's % or the
 * TL's "To assign" list. Also used when the Boss or HOD sends one to a team by hand.
 */
export function pickInTeam(teamId: string, at: Date, config: CrmAssignConfig, given: Record<string, number>, members: CrmMember[]):
  Pick<CrmAssignment, "memberId" | "memberBy"> {
  const handlers = teamHandlers(teamId, members);
  const settings = config.teams[teamId] ?? { weekday: "manual", ratios: {} };
  if (isWeekendEnquiry(at)) {
    const memberId = pickByShare(even(handlers.filter(m => m.role === "rs" && m.fullTime).map(m => m.id)), given);
    return { memberId, memberBy: memberId ? "weekend" : "no_full_time" };
  }
  if (settings.weekday === "auto") {
    const memberId = pickByShare(Object.fromEntries(handlers.map(m => [m.id, settings.ratios[m.id] ?? 0])), given);
    return { memberId, memberBy: memberId ? "ratio" : "no_shares" };
  }
  return { memberId: null, memberBy: "manual" };
}

/** How many leads each person holds — what a pick made outside the normal flow balances against. */
export function leadsHeld(leads: Pick<CrmLead, "assignedTo">[]): Record<string, number> {
  const given: Record<string, number> = {};
  for (const l of leads) if (l.assignedTo) given[l.assignedTo] = (given[l.assignedTo] ?? 0) + 1;
  return given;
}

/** The next n enquiries for an ad arriving at `at`, without changing anything — the settings' preview. */
export function previewAssignments(adName: string, at: Date, n: number, config: CrmAssignConfig, counts: CrmAssignCounts, members: CrmMember[]): CrmAssignment[] {
  const out: CrmAssignment[] = [];
  let c = counts;
  for (let i = 0; i < n; i++) {
    const r = assignEnquiry(adName, at, config, c, members);
    out.push(r.assignment);
    c = r.counts;
  }
  return out;
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

/** "8 min", "2 h 5 min", "1 d 3 h". */
export function durationLabel(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const h = Math.floor(m / 60);
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ""}`;
}
