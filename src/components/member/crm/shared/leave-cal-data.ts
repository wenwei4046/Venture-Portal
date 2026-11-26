/** What Calendar and Assignment › People read from the CRM: the people book, leave, appointments and who may change what. */
import { DEFAULT_APPT_TYPES, type ApptType, type CrmData, type CrmPerson, type CrmVisit } from "@/lib/member/crm-data";
import { officeTime } from "@/lib/office-time";
import type { PanelActions } from "../panel/actions";
import { visitStatus } from "../desk/vm/data";
import { downlineOf, teamOf } from "./people";
import { peopleBook } from "./people-book";
import type { CalAppt, CalDetail, LeaveCalIn } from "./leave-cal";

/** "2026-11-06T18:00", the office's. */
export const officeStamp = (at: Date | string) => officeTime(at).format("YYYY-MM-DDTHH:mm");

/**
 * An appointment's own answers, each under the label its type asks it by (Meeting link, Place, Remarks, a type's own
 * questions), the empty ones left out; a visit with no type known (a showroom visit, or one booked before the types)
 * gives its link, place and remarks. A link is a link only when it is a web address.
 */
export function visitDetails(v: CrmVisit, types: ApptType[]): CalDetail[] {
  const out: CalDetail[] = [];
  const add = (k: string, val: string | undefined, link = false) => {
    const s = (val ?? "").trim();
    if (s) out.push({ k, v: s, ...(link && /^https?:\/\//i.test(s) ? { href: s } : {}) });
  };
  const t = v.typeId ? types.find(x => x.id === v.typeId) : undefined;
  if (t) t.fields.forEach(f => add(f.label, v.answers?.[f.id], f.kind === "link"));
  else { add("Meeting link", v.link, true); add("Place", v.place); add("Remarks", v.remarks); }
  return out;
}

/**
 * Who may change a person's leave, days and Pause — the database's crm_up_next_may: CRM · Manage on anybody; a leader
 * CRM › Settings › Up next switched on, on the people under them, never themselves.
 */
export function mayEditPerson(d: CrmData, me: string) {
  if (d.can.manage) return () => true;
  if (!(d.upNextStaff ?? []).includes(me)) return () => false;
  const line = new Set(downlineOf(me, d.people));
  return (id: string) => id !== me && line.has(id);
}

export function leaveCalData(o: {
  data: CrmData; me: CrmPerson; now: Date; act: PanelActions; readOnly?: boolean;
  teams: { id: string; name: string; tl: CrmPerson; people: CrmPerson[] }[]; directors: CrmPerson[];
  openAppt?: (a: CalAppt) => void;
  bookAppt?: () => void;
}): Omit<LeaveCalIn, "mode" | "ui" | "set" | "flash"> {
  const { data: d } = o;
  const book = peopleBook(d, o.teams, o.directors);
  const may = o.readOnly ? () => false : mayEditPerson(d, o.me.id);
  const byId = new Map(d.customers.map(c => [c.id, c]));
  const rooms = new Map((d.rooms ?? []).map(r => [r.id, r.name]));
  const types = d.apptTypes ?? DEFAULT_APPT_TYPES;
  const appts: CalAppt[] = d.visits.filter(v => v.state !== "cancelled").flatMap(v => {
    const c = byId.get(v.customerId);
    if (!c?.assignedTo) return [];
    const at = officeStamp(v.start);
    // Where, how it stands and its own answers: the desktop's day list (an Online / other visit's room is named for it —
    // "Online meeting").
    return [{ who: c.assignedTo, day: at.slice(0, 10), t: at.slice(11), cust: c.name, customerId: c.id, visitId: v.id,
      where: rooms.get(v.showroomId) ?? "", status: visitStatus(v, o.now), details: visitDetails(v, types) }];
  });
  return {
    book, leaves: d.leaves ?? [], appts, now: officeStamp(o.now),
    canEdit: may, canLock: !o.readOnly && d.can.manage,
    ...(o.bookAppt && !o.readOnly ? { bookAppt: o.bookAppt } : {}),
    acts: {
      saveLeave: l => o.act.saveLeave(l),
      removeLeave: id => o.act.removeLeave(id),
      setPaused: (id, on) => o.act.setPaused(id, on),
      setDays: (id, days) => o.act.setPersonDays(id, days, teamOf(id, d.people)?.id ?? null),
      setLocked: (id, on) => o.act.setLocked(id, on),
      openAppt: o.openAppt,
    },
  };
}
