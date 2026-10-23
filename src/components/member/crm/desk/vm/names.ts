/**
 * Names on the desktop CRM in Title Case (2026-10-23, redesign v2 › note 03: "Names of people and teams use Title Case:
 * 'Anthony Lee', 'Team Anthony', 'Harm Hao Hong Hector'. Data often comes in as ALL CAPS"). Display only: the people,
 * the teams and nameOf are turned at the desktop's door (DeskScreens), never what is saved; Chinese stays as written.
 */
import type { CrmData, CrmPerson } from "@/lib/member/crm-data";
import type { Team } from "../../panel/vm/common";

export const titleName = (name: string) => name.toLowerCase().replace(/(^|[^\p{L}\p{M}'’])(\p{L})/gu, (_, a: string, c: string) => a + c.toUpperCase());

const person = <P extends CrmPerson>(p: P): P => ({ ...p, name: titleName(p.name) });
export const titleData = (d: CrmData): CrmData => ({ ...d, people: d.people.map(person) });
export const titleTeams = (ts: Team[]): Team[] => ts.map(t => ({ ...t, name: titleName(t.name), who: titleName(t.who).replace(/\bTl\b/g, "TL"), tl: person(t.tl), people: t.people.map(person) }));
