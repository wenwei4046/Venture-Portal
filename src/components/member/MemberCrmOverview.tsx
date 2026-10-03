"use client";

import { allTeams, assignsAds, isUnassigned, memberStats, teamHandlers, visibleTeams, type CrmMember } from "@/lib/member/crm-team";
import type { CrmAppointment, CrmLead } from "@/lib/member/crm";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { Icon } from "./MemberUI";

const pct = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate * 100)}%`);

/**
 * The Principal's first screen (user 2026-10-03): the numbers that matter —
 * leads, appointment rate, show-up rate — for everyone, then each team side
 * by side. Tap a team to open its TL's page.
 */
export default function MemberCrmOverview({ viewer, members, leads, appointments, now, onOpenMember, onOpenAssignment }: {
  viewer: CrmMember;
  members: CrmMember[];
  leads: CrmLead[];
  appointments: CrmAppointment[];
  now: Date;
  onOpenMember: (memberId: string) => void;
  onOpenAssignment: () => void;
}) {
  const all = memberStats(leads, appointments, now);
  // The Principal and HOD compare every team, whether or not the reporting line reaches them.
  const teams = assignsAds(viewer) ? allTeams(members) : visibleTeams(viewer, members);
  const teamLeads = (tlId: string) => {
    const h = new Set(teamHandlers(tlId, members).map(m => m.id));
    return leads.filter(l => l.teamId === tlId || (!!l.assignedTo && h.has(l.assignedTo)));
  };
  const hodLeads = leads.filter(l => !!l.assignedTo && members.find(m => m.id === l.assignedTo)?.role === "hod");
  const waiting = leads.filter(isUnassigned);
  const thisWeek = leads.filter(l => now.getTime() - new Date(l.createdAt).getTime() < 7 * 24 * 3_600_000).length;

  return <>
    <div className={c.tabTitle}><h1>Overview</h1><p className={s.sub}>{teams.length} teams · {thisWeek} new leads this week</p></div>
    <div className={c.stats}>
      <div className={c.stat}><span>Leads</span><strong>{all.leads}</strong><small>{thisWeek} in the last 7 days</small></div>
      <div className={c.stat}><span>Appt rate</span><strong>{pct(all.apptRate)}</strong><small>{all.booked} of {all.leads} leads booked</small></div>
      <div className={c.stat}><span>Show-up rate</span><strong>{pct(all.showUpRate)}</strong><small>{all.due ? `${all.showedUp} of ${all.due} came` : "None due yet"}</small></div>
      <div className={c.stat}><span>Reply within 24 h</span><strong>{pct(all.replyRate)}</strong><small>by a person</small></div>
    </div>

    {waiting.length > 0 && <button className={`${s.card} ${c.queue} ${c.queueButton}`} onClick={onOpenAssignment}>
      <h3><Icon name="info" size={16} /> {waiting.length} not in a team yet</h3>
      <p className={s.caption}>Send them to a team in Assignment.</p>
    </button>}

    <section className={s.card} aria-label="Teams">
      <h2>Teams</h2>
      {teams.length === 0 && <p className={s.sub}>No teams yet — a team is a TL and the people below them in People › Hierarchy.</p>}
      {teams.length > 0 && <div className={c.compare} role="table">
        <div role="row" className={c.compareHead}>
          <span role="columnheader">Team</span><span role="columnheader">Leads</span><span role="columnheader">Appt</span>
          <span role="columnheader">Show</span><span role="columnheader">Reply</span><span role="columnheader">Won</span>
        </div>
        {teams.map(t => {
          const st = memberStats(teamLeads(t.id), appointments, now);
          return <div role="row" key={t.id} className={c.compareRow} onClick={() => onOpenMember(t.id)}>
            <span role="cell"><strong>{t.teamName ?? t.name}</strong></span><span role="cell">{st.leads}</span>
            <span role="cell">{pct(st.apptRate)}</span><span role="cell">{pct(st.showUpRate)}</span>
            <span role="cell">{pct(st.replyRate)}</span><span role="cell">{st.won}</span>
          </div>;
        })}
        {hodLeads.length > 0 && (() => {
          const st = memberStats(hodLeads, appointments, now);
          return <div role="row" className={c.compareRow}>
            <span role="cell"><strong>HOD</strong></span><span role="cell">{st.leads}</span>
            <span role="cell">{pct(st.apptRate)}</span><span role="cell">{pct(st.showUpRate)}</span>
            <span role="cell">{pct(st.replyRate)}</span><span role="cell">{st.won}</span>
          </div>;
        })()}
      </div>}
      <p className={s.caption}>Appt = leads booked · Show = booked appointments that came · Reply = first message answered by a person within 24 h.</p>
    </section>
  </>;
}
