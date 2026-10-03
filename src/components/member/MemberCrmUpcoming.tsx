"use client";

import { useMemo, useState } from "react";
import { relativeWhen, upcomingByDay, type CrmAppointment, type CrmLead } from "@/lib/member/crm";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { dayLabel, roomName, roomTone, showroomList, time } from "./crm-format";
import { Icon, initials } from "./MemberUI";

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Upcoming appointments at a glance: the next one, the week ahead as a strip
 * (a dot per appointment, tap a day to see only it), and a timeline per day
 * coloured by showroom.
 */
export default function MemberCrmUpcoming({ appointments, leads, now, onOpen }: {
  appointments: CrmAppointment[];
  leads: CrmLead[];
  now: Date;
  onOpen: (appointmentId: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const groups = upcomingByDay(appointments, now);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const next = groups[0]?.items[0];
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d; }), [now]);
  const todayKey = dayKey(now);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const heading = (key: string, iso: string) => key === todayKey ? "Today" : key === dayKey(tomorrow) ? "Tomorrow" : dayLabel(iso);
  const leadOf = (a: CrmAppointment) => leads.find(l => l.id === a.leadId);
  const shown = picked ? groups.filter(g => g.day === picked) : groups;

  if (total === 0) return null;

  return (
    <section className={s.card} aria-label="Upcoming appointments">
      <h2 className={c.upHead}>Upcoming appointments <span className={c.upCount}>{total}</span></h2>

      {next && (() => {
        const lead = leadOf(next);
        return <button className={c.nextUp} data-tone={roomTone(next.showroomId)} onClick={() => onOpen(next.id)}>
          <span className={c.nextLabel}>NEXT UP · <strong>{relativeWhen(next.start, now)}</strong></span>
          <span className={c.nextTime}>{time(next.start)}</span>
          <span className={c.nextDay}>{heading(dayKey(new Date(next.start)), next.start)}</span>
          <span className={c.nextWho}>
            <span className={c.leadAvatar} aria-hidden="true">{initials(lead?.name ?? "?")}</span>
            <span><strong>{lead?.name ?? "Lead"}</strong><small>{roomName(next.showroomId)} · {lead?.adName}</small></span>
            <Icon name="chevron" size={18} />
          </span>
        </button>;
      })()}

      <div className={c.week} role="group" aria-label="Pick a day">
        {week.map(d => {
          const key = dayKey(d);
          const count = groups.find(g => g.day === key)?.items.length ?? 0;
          return <button key={key} className={c.weekDay} aria-pressed={picked === key} data-today={key === todayKey} disabled={count === 0}
            onClick={() => setPicked(p => (p === key ? null : key))} aria-label={`${dayLabel(d.toISOString())}: ${count} appointment${count === 1 ? "" : "s"}`}>
            <span>{key === todayKey ? "Today" : d.toLocaleDateString("en-MY", { weekday: "short" })}</span>
            <strong>{d.getDate()}</strong>
            <i aria-hidden="true">{Array.from({ length: Math.min(count, 3) }, (_, n) => <b key={n} />)}</i>
          </button>;
        })}
      </div>
      {picked && <button className={c.clearDay} onClick={() => setPicked(null)}>Show all days</button>}

      {shown.map(g => (
        <div key={g.day} className={c.dayGroup}>
          <p className={c.dayHead}>{heading(g.day, g.items[0].start)} <span>{g.items.length}</span></p>
          {g.items.map(a => {
            const lead = leadOf(a);
            return <button key={a.id} className={c.slotRow} data-tone={roomTone(a.showroomId)} onClick={() => onOpen(a.id)}>
              <span className={c.slotTime}><strong>{time(a.start)}</strong><small>{a.minutes} min</small></span>
              <span className={c.slotBar} aria-hidden="true" />
              <span className={c.slotBody}>
                <strong>{lead?.name ?? "Lead"}</strong>
                <small>{roomName(a.showroomId)}</small>
              </span>
              <span className={c.slotWhen}>{relativeWhen(a.start, now)}</span>
            </button>;
          })}
        </div>
      ))}

      <div className={c.legend} aria-label="Showrooms">
        {showroomList().map(r => <span key={r.id} data-tone={roomTone(r.id)}><i aria-hidden="true" />{r.name}</span>)}
      </div>
    </section>
  );
}
