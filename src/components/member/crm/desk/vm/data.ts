/**
 * The CRM's data as the desktop's screens list it (CRM Desktop rev 1): the prototype's CHATS / VISITS / TEAMS /
 * AD_MEMBERS, built from CrmData instead of written out — same fields, same labels, same colours — with the phone's
 * own rules for what a status, an urgency, a "last chat" is (sales/vm/common.ts), so the two never disagree.
 */
import type { CrmCustomer, CrmPerson, CrmVisit } from "@/lib/member/crm-data";
import { STATUS_LABEL, isCold, lastChat, lastReal, urgencyOf } from "../../sales/vm/common";
import { DIRECTOR_TEAM, teamColours } from "./tokens";
import type { DeskCtx } from "./ctx";
import { mediaWord } from "../../shared/chat-media";

export const initials = (name: string) => name.trim().split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
export const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** One chat as the desktop lists it (the prototype's CHATS row). */
export interface ChatRow {
  id: string; c: CrmCustomer; ini: string; name: string; time: string; ad: string; msg: string;
  /** "Kelvin Lee", "Team Priya · to assign", "Organic · to assign". */
  owner: string; ownerId: string | null; teamId: string | null; team: string | null;
  /** "New", "Follow up", "Appointment", "Won", "Lost", or the reply urgency ("Overdue · 15 h"). */
  status: string;
  /** The status the chip's colour is picked by. */
  key: "New" | "Follow up" | "Appointment" | "Overdue" | "Urgent" | "Reply soon" | "Won" | "Lost" | "Cold";
  last: number;
}

/** The team a person sits in on the panel: a TL's team, a HOD's "Revenue Director" row, or none. */
export function teamNameOf(ctx: DeskCtx, staffId: string | null | undefined): string | null {
  if (!staffId) return null;
  if (ctx.directors.some(d => d.id === staffId)) return DIRECTOR_TEAM;
  return ctx.teams.find(t => t.id === staffId || t.people.some(p => p.id === staffId))?.name ?? null;
}

export function chatRows(ctx: DeskCtx): ChatRow[] {
  const { data, now, nameOf } = ctx;
  return data.customers.map(c => {
    const u = urgencyOf(c, now), last = lastReal(c);
    const teamId = c.assignedTo ? null : c.teamId;
    const team = c.assignedTo ? teamNameOf(ctx, c.assignedTo) : teamId ? ctx.teams.find(t => t.id === teamId)?.name ?? null : null;
    const owner = c.assignedTo ? nameOf(c.assignedTo) : team ? `${team} · to assign` : "Organic · to assign";
    const cold = c.status !== "won" && c.status !== "lost" && isCold(c, now);
    // A closed window is Cold first, whatever the wait (2026-10-18): only a template can reach them.
    const key: ChatRow["key"] = cold ? "Cold" : u.level === "overdue" ? "Overdue" : u.level === "urgent" ? "Urgent" : u.level === "soon" ? "Reply soon"
      : cold ? "Cold" : (STATUS_LABEL[c.status] as ChatRow["key"]);
    return {
      id: c.id, c, ini: initials(c.name), name: c.name, time: last ? lastChat(last.at, now) : lastChat(c.createdAt, now), ad: c.ad,
      msg: last ? (last.from === "me" ? "You: " : "") + (last.text || mediaWord(last)) : "",
      owner, ownerId: c.assignedTo, teamId: c.teamId, team,
      status: cold ? "Cold" : u.level !== "none" ? u.label : STATUS_LABEL[c.status], key,
      last: new Date(last?.at ?? c.createdAt).getTime(),
    };
  }).sort((a, b) => b.last - a.last);
}

/** One visit (the prototype's VISITS row), with the customer, salesperson and showroom it names. */
export interface VisitRow {
  v: CrmVisit; id: string; at: Date; name: string; customerId: string; rep: string; repId: string | null; room: string;
  team: string | null; status: "Booked" | "Showed up" | "No show" | "To mark" | "Won" | "Follow up" | "Lost";
}
export function visitRows(ctx: DeskCtx): VisitRow[] {
  const { data, now, nameOf } = ctx;
  return data.visits.filter(v => v.state !== "cancelled").map(v => {
    const c = data.customers.find(x => x.id === v.customerId), at = new Date(v.start), repId = c?.assignedTo ?? null;
    const status: VisitRow["status"] = v.state === "attended"
      ? (v.outcome === "won" ? "Won" : v.outcome === "lost" ? "Lost" : v.outcome === "follow_up" ? "Follow up" : "Showed up")
      : v.state === "no_show" ? "No show" : at <= now ? "To mark" : "Booked";
    return { v, id: v.id, at, name: c?.name ?? "Customer", customerId: v.customerId, rep: repId ? nameOf(repId) : "—", repId,
      room: data.rooms.find(r => r.id === v.showroomId)?.name ?? "Showroom", team: teamNameOf(ctx, repId), status };
  }).sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The teams in the panel's order with their colours, and each one's people (the prototype's TEAMS / AD_MEMBERS). */
export interface TeamRow { id: string; name: string; lead: string; ink: string; tint: string; people: CrmPerson[] }
export function teamRows(ctx: DeskCtx): TeamRow[] {
  return ctx.teams.map((t, k) => { const [ink, tint] = teamColours(k); return { id: t.id, name: t.name, lead: t.who, ink, tint, people: t.people }; });
}

/** "Kelvin", or "Daniel T." when two in the list share a first name (the prototype's shortName). */
export function shortName(full: string, names: string[]): string {
  const f = first(full), dup = names.filter(n => first(n) === f).length > 1;
  return dup ? `${f} ${(full.split(/\s+/)[1] ?? "")[0] ?? ""}.` : f;
}
