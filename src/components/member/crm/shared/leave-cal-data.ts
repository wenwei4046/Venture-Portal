/** What Calendar and Assignment › People read from the CRM: the people book, leave, appointments and who may change what. */
import type { CrmData, CrmPerson } from "@/lib/member/crm-data";
import { officeTime } from "@/lib/office-time";
import type { PanelActions } from "../panel/actions";
import { downlineOf, teamOf } from "./people";
import { peopleBook } from "./people-book";
import type { CalAppt, LeaveCalIn } from "./leave-cal";

/** "2026-11-06T18:00", the office's. */
export const officeStamp = (at: Date | string) => officeTime(at).format("YYYY-MM-DDTHH:mm");

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
  openAppt?: (customerId: string) => void;
}): Omit<LeaveCalIn, "mode" | "ui" | "set" | "flash"> {
  const { data: d } = o;
  const book = peopleBook(d, o.teams, o.directors);
  const may = o.readOnly ? () => false : mayEditPerson(d, o.me.id);
  const byId = new Map(d.customers.map(c => [c.id, c]));
  const appts: CalAppt[] = d.visits.filter(v => v.state !== "cancelled").flatMap(v => {
    const c = byId.get(v.customerId);
    if (!c?.assignedTo) return [];
    const at = officeStamp(v.start);
    return [{ who: c.assignedTo, day: at.slice(0, 10), t: at.slice(11), cust: c.name, customerId: c.id }];
  });
  return {
    book, leaves: d.leaves ?? [], appts, now: officeStamp(o.now),
    canEdit: may, canLock: !o.readOnly && d.can.manage,
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
