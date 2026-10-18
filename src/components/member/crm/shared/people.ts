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

/** The TL at or above someone — the team is the TL's. */
export function teamOf(id: string | null | undefined, people: CrmPerson[]): CrmPerson | undefined {
  let p = personOf(id, people);
  for (let i = 0; p && i < 12; i++) {
    if (p.role === "tl") return p;
    p = personOf(p.uplineId, people);
  }
  return undefined;
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
