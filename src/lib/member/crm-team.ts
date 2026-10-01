/**
 * The CRM's team layer: who may see whom, how a new enquiry is handed to a
 * salesperson, and each salesperson's numbers.
 *
 * Roles follow the reporting line (People › Hierarchy, `reports_to`):
 *   - the Boss sees every team, and may narrow to one;
 *   - a Team leader sees only the salespeople who report to them — never
 *     another leader's team;
 *   - a Salesperson sees only themselves.
 * Leaders and the Boss may open a downline's chat and reply in it.
 *
 * Assignment, decided 2026-10-01:
 *   Mode 1 — an ad handed to chosen salespeople (one or several); its
 *            enquiries rotate evenly among them.
 *   Mode 2 — by ratio set in advance: the Boss splits between teams
 *            (A 10 : B 5 : C 15), each leader splits their team's share
 *            between their salespeople.
 *   Mode 1 wins when an ad has a rule.
 */
import type { CrmAppointment, CrmLead } from "./crm";

export type CrmRole = "boss" | "leader" | "sales";

export interface CrmMember {
  id: string;
  name: string;
  role: CrmRole;
  /** The team a leader runs or a salesperson works in; the Boss has none. */
  teamId?: string;
}

export interface CrmTeam {
  id: string;
  name: string;
  leaderId: string;
}

/** Everyone the viewer may see, themselves included. */
export function visibleMembers(viewer: CrmMember, members: CrmMember[]): CrmMember[] {
  if (viewer.role === "boss") return members;
  if (viewer.role === "leader") return members.filter(m => m.id === viewer.id || (m.teamId === viewer.teamId && m.role === "sales"));
  return members.filter(m => m.id === viewer.id);
}

/** The teams the viewer may see: every one for the Boss, their own for a leader, none for a salesperson. */
export function visibleTeams(viewer: CrmMember, teams: CrmTeam[]): CrmTeam[] {
  if (viewer.role === "boss") return teams;
  if (viewer.role === "leader") return teams.filter(t => t.id === viewer.teamId);
  return [];
}

/** Leads the viewer may open: those assigned to anyone they can see. */
export function visibleLeads<L extends { assignedTo?: string }>(viewer: CrmMember, members: CrmMember[], leads: L[]): L[] {
  const ids = new Set(visibleMembers(viewer, members).map(m => m.id));
  return leads.filter(l => l.assignedTo !== undefined && ids.has(l.assignedTo));
}

export const canManage = (viewer: CrmMember) => viewer.role !== "sales";

/* ── Assignment ─────────────────────────────────────────────────────────── */

/** Mode 1: an ad's enquiries go to these salespeople, in turn. */
export interface CrmAdRule {
  adName: string;
  memberIds: string[];
}

/** Mode 2: shares set in advance. A share of 0 (or none) takes no enquiries. */
export interface CrmRatios {
  teams: Record<string, number>;
  /** teamId → salesperson → share, set by that team's leader. */
  members: Record<string, Record<string, number>>;
}

/** How many enquiries each has already been given — what the next pick balances against. */
export interface CrmAssignCounts {
  team: Record<string, number>;
  member: Record<string, number>;
}

export const emptyCounts = (): CrmAssignCounts => ({ team: {}, member: {} });

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

export interface CrmAssignment {
  memberId: string;
  teamId?: string;
  mode: 1 | 2;
}

/**
 * Who gets a new enquiry from this ad, and the counts after it. Mode 1 when
 * the ad has a rule (even rotation among its salespeople); otherwise Mode 2,
 * team by the Boss's ratio, then salesperson by that leader's ratio. Null when
 * nobody can take it (no rule, no shares) — it waits for the Boss.
 */
export function assignEnquiry(adName: string, rules: CrmAdRule[], ratios: CrmRatios, counts: CrmAssignCounts, members: CrmMember[]):
  { assignment: CrmAssignment | null; counts: CrmAssignCounts } {
  const teamOf = (id: string) => members.find(m => m.id === id)?.teamId;
  const give = (memberId: string, teamId: string | undefined): CrmAssignCounts => ({
    team: teamId ? { ...counts.team, [teamId]: (counts.team[teamId] ?? 0) + 1 } : counts.team,
    member: { ...counts.member, [memberId]: (counts.member[memberId] ?? 0) + 1 },
  });

  const rule = rules.find(r => r.adName === adName && r.memberIds.length > 0);
  if (rule) {
    const even = Object.fromEntries(rule.memberIds.map(id => [id, 1]));
    const memberId = pickByShare(even, counts.member)!;
    return { assignment: { memberId, teamId: teamOf(memberId), mode: 1 }, counts: give(memberId, teamOf(memberId)) };
  }

  // A team whose leader has given nobody a share cannot take enquiries.
  const takingTeams = Object.fromEntries(Object.entries(ratios.teams).filter(([teamId]) =>
    Object.values(ratios.members[teamId] ?? {}).some(share => share > 0)));
  const teamId = pickByShare(takingTeams, counts.team);
  if (!teamId) return { assignment: null, counts };
  const memberId = pickByShare(ratios.members[teamId] ?? {}, counts.member)!;
  return { assignment: { memberId, teamId, mode: 2 }, counts: give(memberId, teamId) };
}

/** The next n enquiries for an ad, without changing anything — the settings' preview. */
export function previewAssignments(adName: string, n: number, rules: CrmAdRule[], ratios: CrmRatios, counts: CrmAssignCounts, members: CrmMember[]): (CrmAssignment | null)[] {
  const out: (CrmAssignment | null)[] = [];
  let c = counts;
  for (let i = 0; i < n; i++) {
    const r = assignEnquiry(adName, rules, ratios, c, members);
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
