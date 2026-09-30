import type { CrmAppointment } from "@/lib/member/crm";
import { demoShowrooms } from "@/lib/member/crm-demo";

/** How the member CRM writes times, days and showrooms. */
export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });

export const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });

/** Today's times as a time, anything else as a day. */
export const whenLabel = (iso: string) => {
  const d = new Date(iso), today = new Date();
  return d.toDateString() === today.toDateString() ? time(iso) : dayLabel(iso);
};

export const roomName = (id: string) => demoShowrooms.find(r => r.id === id)?.name ?? id;

/** Each showroom's place in the list, so it keeps one colour everywhere. */
export const roomTone = (id: string) => Math.max(0, demoShowrooms.findIndex(r => r.id === id));

export const apptLabel = (a: Pick<CrmAppointment, "start" | "showroomId">) =>
  `${dayLabel(a.start)} · ${time(a.start)} · ${roomName(a.showroomId)}`;
