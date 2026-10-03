"use client";

import { useMemo, useState } from "react";
import { relativeWhen, upcomingByDay, type CrmAppointment, type CrmLead } from "@/lib/member/crm";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { dayLabel, roomName } from "./crm-format";

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * Upcoming appointments: the week ahead as a strip (a dot per day that has
 * one), the picked day as a timeline — each visit the walnut card — and
 * everything after it under Coming up.
 */
export default function MemberCrmUpcoming({ appointments, leads, now, onOpen }: {
  appointments: CrmAppointment[];
  leads: CrmLead[];
  now: Date;
  onOpen: (appointmentId: string) => void;
}) {
  const groups = upcomingByDay(appointments, now);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d; }), [now]);
  const todayKey = dayKey(now);
  // Opens on today, or the first day that has a visit.
  const [picked, setPicked] = useState<string>(() => (groups.some(g => g.day === todayKey) ? todayKey : groups[0]?.day ?? todayKey));
  const leadOf = (a: CrmAppointment) => leads.find(l => l.id === a.leadId);
  const pickedDay = week.find(d => dayKey(d) === picked) ?? new Date(groups.find(g => g.day === picked)?.items[0].start ?? now);
  const onDay = groups.find(g => g.day === picked)?.items ?? [];
  const later = groups.filter(g => g.day > picked).flatMap(g => g.items).slice(0, 8);

  if (total === 0) return null;

  return <>
    <div className={c.week} role="group" aria-label="Pick a day">
      {week.map(d => {
        const key = dayKey(d);
        const count = groups.find(g => g.day === key)?.items.length ?? 0;
        return <button key={key} className={c.weekDay} aria-pressed={picked === key} data-today={key === todayKey}
          onClick={() => setPicked(key)} aria-label={`${dayLabel(d.toISOString())}: ${count} appointment${count === 1 ? "" : "s"}`}>
          <span>{key === todayKey ? "Today" : d.toLocaleDateString("en-MY", { weekday: "short" })}</span>
          <strong>{d.getDate()}</strong>
          <i aria-hidden="true">{count > 0 && <b />}</i>
        </button>;
      })}
    </div>

    <section className={c.dayPlan} aria-label={`Appointments on ${dayLabel(pickedDay.toISOString())}`}>
      <h2>{picked === todayKey ? "Today" : dayLabel(pickedDay.toISOString())}</h2>
      {onDay.length === 0 && <p className={s.caption}>Nothing booked this day.</p>}
      {onDay.map(a => {
        const lead = leadOf(a);
        return <div key={a.id} className={c.dayPlanRow}>
          <span className={c.mono}>{hhmm(a.start)}</span>
          <button className={c.dayPlanCard} onClick={() => onOpen(a.id)}>
            <strong>{lead?.name ?? "Lead"}</strong>
            <small>{[lead?.adName, roomName(a.showroomId)].filter(Boolean).join(" · ")} · {a.minutes} min</small>
          </button>
        </div>;
      })}
    </section>

    {later.length > 0 && <section className={`${s.card} ${c.comingUp}`} aria-label="Coming up">
      <h2>Coming up</h2>
      {later.map(a => {
        const lead = leadOf(a);
        return <button key={a.id} className={c.comingRow} onClick={() => onOpen(a.id)}>
          <span className={c.mono}>{new Date(a.start).toLocaleDateString("en-MY", { weekday: "short" })} {hhmm(a.start)}</span>
          <span><strong>{lead?.name ?? "Lead"}</strong><small>{roomName(a.showroomId)}</small></span>
          <em>{relativeWhen(a.start, now)}</em>
        </button>;
      })}
    </section>}
  </>;
}
