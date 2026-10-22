/**
 * The reporting line, as the CRM reads it (People › Hierarchy, reports_to):
 * who is below whom, a person's direct superior, their team (the TL at or
 * above them), and the titles the design shows. The database asks the same
 * questions (crm_downline, crm_team_of); this is the screen's twin.
 */
import type { CrmRole } from "@/lib/member/crm-team";
import type { CrmPerson } from "@/lib/member/crm-data";

export const ROLE_TITLE: Record<CrmRole, string> = {
  boss: "Principal", hod: "Revenue Director", stl: "Senior Team Leader", tl: "Team Leader", ta: "Team Assistant", rs: "Revenue Specialist",
};
export const ROLE_SHORT: Record<CrmRole, string> = { boss: "Principal", hod: "Revenue Director", stl: "Senior TL", tl: "TL", ta: "TA", rs: "RS" };
/** Order inside a team: Senior TL, TL, TA, RS (full time before part time). */
export const ROLE_ORDER: Record<CrmRole, number> = { boss: -2, hod: -1, stl: 0, tl: 1, ta: 3, rs: 5 };

/** Everyone below a person (not themselves), however deep. */
export function downlineOf(id: string, people: CrmPerson[]): string[] {
  const out: string[] = [], seen = new Set<string>([id]);
  let layer = [id];
  while (layer.length) {
    const next = people.filter(p => p.uplineId && layer.includes(p.uplineId) && !seen.has(p.id)).map(p => p.id);
    next.forEach(n => seen.add(n));
    out.push(...next);
    layer = next;
  }
  return out;
}

export const personOf = (id: string | null | undefined, people: CrmPerson[]) => (id ? people.find(p => p.id === id) : undefined);

/**
 * A team's top (2026-10-22, mig 20261022170000 crm_is_team_top; the owner: "只要是 report to peter (revenue director)，就是一个
 * team"): a TL, or a TA / RS who reports straight to the Revenue Director or the Boss (or to nobody in the CRM).
 */
export function isTeamTop(p: CrmPerson, people: CrmPerson[]): boolean {
  if (p.role === "tl") return true;
  if (p.role !== "ta" && p.role !== "rs") return false;
  const up = personOf(p.uplineId, people);
  return !up || up.role === "hod" || up.role === "boss";
}

/** The team's top at or above someone — the team is theirs. */
export function teamOf(id: string | null | undefined, people: CrmPerson[]): CrmPerson | undefined {
  let p = personOf(id, people);
  for (let i = 0; p && i < 12; i++) {
    if (isTeamTop(p, people)) return p;
    p = personOf(p.uplineId, people);
  }
  return undefined;
}

/**
 * Whom a TL / STL / TA may give a customer to (crm_assign_member asks the same, mig 20261023120000): a customer of a team at
 * or below them, or with them or somebody below; to their downline in the customer's team, never whoever has it now — none
 * for anybody else. Mine's chat and the Team side's ask this one rule (2026-10-23; the owner: "ta can assign as well").
 */
export function teamAssignees(leader: CrmPerson, people: CrmPerson[], c: { teamId: string | null; assignedTo: string | null }): CrmPerson[] {
  if (!c.teamId || !["tl", "stl", "ta"].includes(leader.role)) return [];
  const below = downlineOf(leader.id, people), line = new Set([leader.id, ...below]);
  if (!line.has(c.teamId) && !(c.assignedTo && line.has(c.assignedTo))) return [];
  return below.map(id => personOf(id, people)!)
    .filter(p => p && p.id !== c.assignedTo && ["stl", "tl", "ta", "rs"].includes(p.role) && teamOf(p.id, people)?.id === c.teamId);
}

/** The team's name, as the design shows it: "Team Aina". */
export const teamName = (tl: CrmPerson | undefined) => (tl ? `Team ${tl.name.trim().split(/\s+/)[0]}` : "");

/** Their title as People holds it (user 2026-10-09: 顯示 People 裡的原職稱); the role's name only when People gives none. */
export const jobTitle = (p: CrmPerson) => p.title?.trim() || ROLE_TITLE[p.role];
/** "Senior Revenue Specialist · Full time": the title, and full / part time for the RS the CRM keeps it for. */
export const titleOf = (p: CrmPerson) => jobTitle(p) + (p.role === "rs" ? ` · ${p.fullTime ? "Full time" : "Part time"}` : "");
/** The short form a crowded row shows: "Senior Revenue Specialist" → "SRS", "Team Leader" → "TL". */
export const titleShort = (p: CrmPerson) => { const w = jobTitle(p).split(/\s+/).filter(Boolean); return w.length > 1 ? w.map(x => x[0]!.toUpperCase()).join("") : jobTitle(p); };

/**
 * People in team order (user 2026-10-09): the Director(s), then each team — its TL, TAs, then RS,
 * full time before part time — teams by their TL's name, then anyone in no team.
 */
export function byTeam(list: CrmPerson[], people: CrmPerson[]): CrmPerson[] {
  const tlName = (p: CrmPerson) => teamOf(p.id, people)?.name ?? "\uffff";
  const rank = (p: CrmPerson) => (p.role === "boss" ? 0 : p.role === "hod" ? 1 : teamOf(p.id, people) ? 2 : 3);
  return [...list].sort((a, b) =>
    rank(a) - rank(b) || tlName(a).localeCompare(tlName(b)) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role]
    || Number(b.fullTime) - Number(a.fullTime) || a.name.localeCompare(b.name));
}
