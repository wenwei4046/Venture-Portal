"use client";

import { useState } from "react";
import { allTeams, assignsAds, isUnassigned, leadsBetween, memberStats, periodRange, teamHandlers, visibleTeams, type CrmMember, type CrmPeriod } from "@/lib/member/crm-team";
import { CRM_LOST_REASONS, replyUrgency, type CrmAppointment, type CrmLead } from "@/lib/member/crm";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { Icon } from "./MemberUI";

const pct = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate * 100)}%`);

/**
 * The Principal's first screen (user 2026-10-03): the numbers that matter —
 * leads, appointment rate, show-up rate — for everyone on the rust card,
 * what waits on somebody, then each team side by side. Tap a team to open its
 * TL's page. Week / Month (user 2026-10-04) narrows the numbers, the teams and
 * the lost reasons to the leads that arrived this week or this month; what
 * waits on somebody is always now.
 */
export default function MemberCrmOverview({ viewer, members, leads: allLeads, appointments, now, onOpenMember, onOpenAssignment }: {
  viewer: CrmMember;
  members: CrmMember[];
  leads: CrmLead[];
  appointments: CrmAppointment[];
  now: Date;
  onOpenMember: (memberId: string) => void;
  onOpenAssignment: () => void;
}) {
  const [period, setPeriod] = useState<CrmPeriod>("month");
  const range = periodRange(period, now);
  // The period's leads drive the numbers; what waits on somebody is read from all of them.
  const leads = leadsBetween(allLeads, range.start, range.end);
  const before = leadsBetween(allLeads, range.prevStart, range.start).length;
  const all = memberStats(leads, appointments, now);
  // The Principal and HOD compare every team, whether or not the reporting line reaches them.
  const teams = assignsAds(viewer) ? allTeams(members) : visibleTeams(viewer, members);
  const teamLeads = (tlId: string) => {
    const h = new Set(teamHandlers(tlId, members).map(m => m.id));
    return leads.filter(l => l.teamId === tlId || (!!l.assignedTo && h.has(l.assignedTo)));
  };
  const hodLeads = leads.filter(l => !!l.assignedTo && members.find(m => m.id === l.assignedTo)?.role === "hod");
  const waiting = allLeads.filter(isUnassigned);
  const overdue = allLeads.filter(l => replyUrgency(l, now).level === "overdue").length;
  const thisWeek = allLeads.filter(l => now.getTime() - new Date(l.createdAt).getTime() < 7 * 24 * 3_600_000).length;
  const lost = leads.filter(l => l.status === "lost");
  const rows = [
    ...teams.map(t => ({ id: t.id, name: t.teamName ?? t.name, who: t.name, st: memberStats(teamLeads(t.id), appointments, now), open: true })),
    ...(hodLeads.length ? [{ id: "hod", name: "HOD", who: "Own customers", st: memberStats(hodLeads, appointments, now), open: false }] : []),
  ];

  return <>
    <div className={c.titleWithAction}>
      <div className={c.tabTitle}>
        <span className={c.eyebrow}>{viewer.role === "boss" ? "Boss" : viewer.role.toUpperCase()} · {viewer.name}</span>
        <h1>Overview</h1>
        <p className={s.sub}>{teams.length} teams · {thisWeek} new leads in the last 7 days</p>
      </div>
      <div className={c.periodSwitch} role="radiogroup" aria-label="Period">
        {(["week", "month"] as const).map(p => <button key={p} role="radio" aria-checked={period === p} onClick={() => setPeriod(p)}>{p === "week" ? "Week" : "Month"}</button>)}
      </div>
    </div>

    <section className={c.statHero} aria-label="Everyone">
      <div className={c.statHeroTop}>
        <span>Leads {range.label}</span><strong>{all.leads}</strong>
        <small>{all.leads === before ? `Same as ${range.prevLabel}` : `${all.leads > before ? "+" : "−"}${Math.abs(all.leads - before)} vs ${range.prevLabel} (${before})`}</small>
      </div>
      <div className={c.statHeroGrid}>
        <div><span>Appt rate</span><strong>{pct(all.apptRate)}</strong></div>
        <div><span>Show-up rate</span><strong>{pct(all.showUpRate)}</strong></div>
        <div><span>Reply in 24 h</span><strong>{pct(all.replyRate)}</strong></div>
        <div><span>Won</span><strong>{all.won}</strong></div>
      </div>
    </section>

    {waiting.length > 0 && <button className={c.actionRow} onClick={onOpenAssignment}>
      <span><strong>Waiting for a team</strong><small>No team took these yet — send them in Assignment</small></span>
      <em data-tone="link">{waiting.length}</em>
      <Icon name="chevron" size={16} />
    </button>}
    <div className={c.actionRow}>
      <span><strong>Waiting too long</strong><small>Customers nobody answered within a day</small></span>
      <em data-tone={overdue ? "danger" : undefined}>{overdue} overdue</em>
    </div>

    <section className={`${s.card} ${c.tableCard}`} aria-label="Teams">
      <div className={c.cardHead}><h2>Teams</h2><span className={s.caption}>Leads · Appt · Show-up</span></div>
      {rows.length === 0 && <p className={s.sub}>No teams yet — a team is a TL and the people below them in People › Hierarchy.</p>}
      {rows.length > 0 && <div role="table" aria-label="Teams side by side">
        <div role="row" className={c.srOnly}>
          <span role="columnheader">Team</span><span role="columnheader">Leads</span><span role="columnheader">Appt</span><span role="columnheader">Show</span>
        </div>
        {rows.map(r => <div role="row" key={r.id} className={c.teamRow}>
          <span role="cell" aria-label={r.name}>{r.open
            ? <button onClick={() => onOpenMember(r.id)}><strong>{r.name}</strong><small>{r.who}</small></button>
            : <><strong>{r.name}</strong><small>{r.who}</small></>}</span>
          <span role="cell">{r.st.leads}</span>
          <span role="cell">{pct(r.st.apptRate)}</span>
          <span role="cell">{pct(r.st.showUpRate)}</span>
        </div>)}
      </div>}
      <p className={s.caption}>Leads that arrived {range.label}. Appt = leads booked · Show-up = booked visits that came. Tap a team for its people.</p>
    </section>

    {lost.length > 0 && <section className={`${s.card} ${c.tableCard}`} aria-label="Why leads were lost">
      <div className={c.cardHead}><h2>Why leads were lost</h2><span className={s.caption}>{lost.length} lost</span></div>
      {CRM_LOST_REASONS.map(r => ({ r, n: lost.filter(l => l.lost?.reason === r.value).length })).filter(x => x.n > 0).map(({ r, n }) => (
        <div key={r.value} className={c.reasonRow}><span>{r.label}</span><strong>{n}</strong></div>
      ))}
    </section>}
  </>;
}
