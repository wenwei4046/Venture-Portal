"use client";

import { replyUrgency, sortByUrgency, type CrmAppointment, type CrmLead } from "@/lib/member/crm";
import {
  MAX_DOWNLINES, ROLE_LABELS, allDownlines, allTeams, assignsAds, canReassign, isUnassigned, directDownlines, durationLabel, memberStats, teamHandlers,
  visibleMembers, visibleTeams, withoutTeam,
  type CrmMember,
} from "@/lib/member/crm-team";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { Icon, initials } from "./MemberUI";
import MemberCrmLeadRow, { firstName } from "./MemberCrmLeadRow";

const pct = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate * 100)}%`);

/** "TA", "RS · Full time", "RS · Part time". */
export const roleTag = (m: CrmMember) => (m.role === "rs" ? `RS · ${m.fullTime ? "Full time" : "Part time"}` : ROLE_LABELS[m.role]);

/** A team's people in reporting order — the TL, each TA, then that TA's RS — with how deep each sits. */
export function inLineOrder(tlId: string, members: CrmMember[]): { member: CrmMember; depth: number }[] {
  const out: { member: CrmMember; depth: number }[] = [];
  const walk = (id: string, depth: number) => {
    const m = members.find(x => x.id === id);
    if (m) out.push({ member: m, depth });
    for (const d of directDownlines(id, members)) walk(d.id, depth + 1);
  };
  walk(tlId, 0);
  return out;
}

/**
 * The Team tab, for anyone with a downline: each person's numbers, team by
 * team. Boss, HOD and a Senior TL see every team below them and may narrow
 * to one; a TL sees their team; a TA their RS. A TL also assigns the
 * enquiries waiting in their "To assign" list here.
 */
export function MemberCrmTeam({ viewer, members, leads, appointments, now, teamFilter, onTeamFilter, onOpenMember, onOpenLead, onAssign, onSendToTeam }: {
  viewer: CrmMember;
  members: CrmMember[];
  leads: CrmLead[];
  appointments: CrmAppointment[];
  now: Date;
  teamFilter: string | null;
  onTeamFilter: (teamId: string | null) => void;
  onOpenMember: (memberId: string) => void;
  onOpenLead: (leadId: string) => void;
  /** A TL hands a waiting enquiry to someone. Absent while the CRM cannot save it (live, read only). */
  onAssign?: (leadId: string, memberId: string) => void;
  /** The Boss or HOD sends an enquiry no team took to a TL's team. */
  onSendToTeam?: (leadId: string, tlId: string) => void;
}) {
  const seen = new Set(visibleMembers(viewer, members).map(m => m.id));
  const teams = visibleTeams(viewer, members);
  const shown = teamFilter ? teams.filter(t => t.id === teamFilter) : teams;
  const above = viewer.role === "boss" || viewer.role === "hod" || viewer.role === "stl";
  const nameOf = (id: string) => members.find(m => m.id === id)?.name ?? "—";
  const vacantStl = above && viewer.role !== "stl" && !members.some(m => m.role === "stl");

  // The walnut card: everyone the viewer is looking at, as one set of numbers.
  const shownLeads = leads.filter(l => shown.some(t => l.teamId === t.id || (!!l.assignedTo && teamHandlers(t.id, members).some(h => h.id === l.assignedTo))));
  const sum = memberStats(shown.length ? shownLeads : leads, appointments, now);
  const headcount = shown.reduce((n, t) => n + allDownlines(t.id, members).filter(m => seen.has(m.id)).length + (seen.has(t.id) ? 1 : 0), 0);

  return <>
    <div className={c.tabTitle}>
      <span className={c.eyebrow}>{ROLE_LABELS[viewer.role]} · {viewer.name}</span>
      <h1>Team</h1>
      <p className={s.sub}>{above ? `${teams.length} teams · tap a person` : `${viewer.teamName ?? "Your team"} · ${headcount} people`}</p>
    </div>
    {teams.length > 1 && <div className={c.chips} role="group" aria-label="Team">
      <button className={c.chip} aria-pressed={!teamFilter} onClick={() => onTeamFilter(null)}>All teams</button>
      {teams.map(t => <button key={t.id} className={c.chip} aria-pressed={teamFilter === t.id} onClick={() => onTeamFilter(t.id)}>{t.teamName ?? t.name}</button>)}
    </div>}

    <section className={c.statHero} aria-label="Team numbers">
      <div className={c.statHeroGrid} data-cols="3">
        <div><span>Leads</span><strong>{sum.leads}</strong></div>
        <div><span>Reply in 24 h</span><strong>{pct(sum.replyRate)}</strong></div>
        <div><span>1st reply</span><strong>{sum.avgFirstReplyMinutes == null ? "—" : durationLabel(sum.avgFirstReplyMinutes)}</strong></div>
        <div><span>Appt rate</span><strong>{pct(sum.apptRate)}</strong></div>
        <div><span>Show-up</span><strong>{pct(sum.showUpRate)}</strong></div>
        <div><span>Won</span><strong>{sum.won}</strong></div>
      </div>
    </section>

    {/* Boss and HOD: enquiries no team took wait here to be sent to a TL; the team's own rules take it from there. */}
    {assignsAds(viewer) && (() => {
      const unassigned = leads.filter(isUnassigned);
      return unassigned.length > 0 && <section className={`${s.card} ${c.queue}`} aria-label="Unassigned">
        <div className={c.cardHead}><h2>Unassigned · {unassigned.length}</h2><span className={s.caption}>their team&apos;s rules pick who</span></div>
        {unassigned.map(l => <div key={l.id} className={c.queueRow}>
          <button className={c.queueLead} onClick={() => onOpenLead(l.id)}><strong>{l.name}</strong><span className={s.caption}>{l.adName}</span></button>
          {onSendToTeam && <select value="" onChange={e => e.target.value && onSendToTeam(l.id, e.target.value)} aria-label={`Send ${l.name} to a team`}>
            <option value="">Send to TL…</option>
            {allTeams(members).map(tl => <option key={tl.id} value={tl.id}>{tl.teamName} · {tl.name}</option>)}
          </select>}
        </div>)}
      </section>;
    })()}
    {/* Boss and HOD: people the chart leaves outside every team — no team's rules will deal them an enquiry. */}
    {assignsAds(viewer) && !teamFilter && (() => {
      const loose = withoutTeam(members);
      return loose.length > 0 && <section className={`${s.card} ${c.tableCard}`} aria-label="Not in a team">
        <div className={c.cardHead}><h2>Not in a team · {loose.length}</h2></div>
        <p className={s.caption}>No TL above them in People › Hierarchy, so no enquiry is dealt to them. Set who they report to there.</p>
        {loose.map(p => <button key={p.id} className={c.personRow} onClick={() => onOpenMember(p.id)}>
          <span className={c.personWho}>
            <span className={c.leadAvatar} aria-hidden="true">{initials(p.name)}</span>
            <span><strong>{p.name}</strong><small>{roleTag(p)}{p.uplineId ? ` · reports to ${nameOf(p.uplineId)}` : " · reports to nobody"}</small></span>
          </span>
          <span className={c.mono}>{leads.filter(l => l.assignedTo === p.id).length}</span>
          <em className={c.mono} />
          <span className={c.mono} />
        </button>)}
      </section>;
    })()}
    {vacantStl && <p className={c.demoNote}><Icon name="info" size={16} /> Senior TL: vacant · TLs report to the HOD for now.</p>}

    {shown.map(team => {
      // A TL and a TA take enquiries too, so they are listed with their own numbers.
      const people = inLineOrder(team.id, members).filter(p => seen.has(p.member.id));
      const handlers = teamHandlers(team.id, members);
      const teamLeads = leads.filter(l => l.teamId === team.id || (l.assignedTo && handlers.some(h => h.id === l.assignedTo)));
      const waiting = teamLeads.filter(l => !l.assignedTo);
      return <div key={team.id} className={c.teamBlock}>
        {waiting.length > 0 && <section className={`${s.card} ${c.queue}`} aria-label="To assign">
          <div className={c.cardHead}><h2>To assign · {waiting.length}</h2>{shown.length > 1 && <span className={s.caption}>{team.teamName ?? team.name}</span>}</div>
          {onAssign && canReassign(viewer, waiting[0], members)
            ? waiting.map(l => <div key={l.id} className={c.queueRow}>
              <button className={c.queueLead} onClick={() => onOpenLead(l.id)}><strong>{l.name}</strong><span className={c.chatAdLine}>{l.adName}</span></button>
              <select value="" onChange={e => e.target.value && onAssign(l.id, e.target.value)} aria-label={`Assign ${l.name}`}>
                <option value="">Assign to…</option>
                {handlers.map(h => <option key={h.id} value={h.id}>{h.name} · {roleTag(h)}</option>)}
              </select>
            </div>)
            : <p className={s.caption}>Waiting for {firstName(team.name)} to assign them.</p>}
        </section>}

        {/* Peers never see each other: below the TL, the header counts only the viewer's own downline. */}
        <section className={`${s.card} ${c.tableCard}`} aria-label={team.teamName ?? team.name}>
          <div className={c.peopleHead}>
            <h2>{seen.has(team.id) ? (shown.length > 1 ? team.teamName ?? team.name : "People") : "Your downline"}</h2>
            <span>Leads</span><span>Waiting</span><span>Appt</span>
          </div>
          {people.map(({ member: p, depth }) => {
            const own = leads.filter(l => l.assignedTo === p.id);
            const st = memberStats(own, appointments, now);
            const pending = own.filter(l => replyUrgency(l, now).level !== "none").length;
            const overdue = own.some(l => replyUrgency(l, now).level === "overdue");
            const downs = directDownlines(p.id, members).length;
            return <button key={p.id} className={c.personRow} onClick={() => onOpenMember(p.id)}>
              <span className={c.personWho} style={{ paddingLeft: depth * 10 }}>
                <span className={c.leadAvatar} aria-hidden="true">{initials(p.name)}</span>
                <span><strong>{p.name}</strong><small data-over={downs > MAX_DOWNLINES || undefined}>{roleTag(p)}{p.role !== "rs" ? ` · ${downs}/${MAX_DOWNLINES} downlines` : ""}</small></span>
              </span>
              <span className={c.mono}>{st.leads}</span>
              <em className={c.mono} data-urgency={pending ? (overdue ? "overdue" : "urgent") : undefined}>{pending}</em>
              <span className={c.mono}>{pct(st.apptRate)}</span>
            </button>;
          })}
        </section>
      </div>;
    })}
    <p className={c.demoNote}><Icon name="info" size={16} /> Reply rate = first message answered by a person within 24 real hours; auto-replies don&apos;t count. Showing {nameOf(viewer.id)}&apos;s downline only.</p>
  </>;
}

/**
 * Profile for anyone with a downline: how everyone below them performs as a
 * whole and, with more than one team, each team side by side.
 */
export function MemberCrmPerformance({ viewer, members, leads, appointments, now }: {
  viewer: CrmMember;
  members: CrmMember[];
  leads: CrmLead[];
  appointments: CrmAppointment[];
  now: Date;
}) {
  const all = memberStats(leads, appointments, now);
  const teams = visibleTeams(viewer, members);
  const people = allDownlines(viewer.id, members).filter(m => m.role === "rs" || m.role === "ta");
  const winRate = all.leads ? all.won / all.leads : null;
  const teamLeads = (tlId: string) => { const h = new Set(teamHandlers(tlId, members).map(m => m.id)); return leads.filter(l => l.teamId === tlId || (!!l.assignedTo && h.has(l.assignedTo))); };

  return <>
    <div className={c.stats}>
      <div className={c.stat}><span>Leads</span><strong>{all.leads}</strong><small>{people.length} TA &amp; RS{teams.length > 1 ? ` · ${teams.length} teams` : ""}</small></div>
      <div className={c.stat}><span>Reply within 24 h</span><strong>{pct(all.replyRate)}</strong><small>by a person, not an auto-reply</small></div>
      <div className={c.stat}><span>Avg first reply</span><strong>{all.avgFirstReplyMinutes == null ? "—" : durationLabel(all.avgFirstReplyMinutes)}</strong><small>real time</small></div>
      <div className={c.stat}><span>Appt rate</span><strong>{pct(all.apptRate)}</strong><small>{all.booked} of {all.leads} leads</small></div>
      <div className={c.stat}><span>Show-up rate</span><strong>{pct(all.showUpRate)}</strong><small>{all.due ? `${all.showedUp} of ${all.due} came` : "None due yet"}</small></div>
      <div className={c.stat}><span>Won</span><strong>{all.won}</strong><small>{pct(winRate)} of leads</small></div>
    </div>
    {teams.length > 1 && <section className={s.card} aria-label="Teams side by side">
      <h2>Teams side by side</h2>
      <div className={c.compare} role="table">
        <div role="row" className={c.compareHead}>
          <span role="columnheader">Team</span><span role="columnheader">Leads</span><span role="columnheader">Reply</span>
          <span role="columnheader">Appt</span><span role="columnheader">Show</span><span role="columnheader">Won</span>
        </div>
        {teams.map(t => {
          const st = memberStats(teamLeads(t.id), appointments, now);
          return <div role="row" key={t.id}>
            <span role="cell"><strong>{t.teamName ?? t.name}</strong></span><span role="cell">{st.leads}</span><span role="cell">{pct(st.replyRate)}</span>
            <span role="cell">{pct(st.apptRate)}</span><span role="cell">{pct(st.showUpRate)}</span><span role="cell">{st.won}</span>
          </div>;
        })}
      </div>
    </section>}
  </>;
}

/** One person, seen by an upline: their numbers and every lead. */
export function MemberCrmMember({ member, members, leads, appointments, now, viewer, stepIn, nameOf, onBack, onOpenLead, backLabel = "Back to Team" }: {
  member: CrmMember;
  members: CrmMember[];
  leads: CrmLead[];
  appointments: CrmAppointment[];
  now: Date;
  viewer: CrmMember;
  /** Whether the viewer may reply in this person's chats (never the Boss or HOD). */
  stepIn: boolean;
  nameOf: (memberId: string) => string;
  onBack: () => void;
  onOpenLead: (leadId: string) => void;
  backLabel?: string;
}) {
  const own = sortByUrgency(leads.filter(l => l.assignedTo === member.id), now);
  const st = memberStats(own, appointments, now);
  const upline = members.find(m => m.id === member.uplineId);
  return <div className={c.chat}>
    <div className={c.chatHead}>
      <button className={c.back} onClick={onBack} aria-label={backLabel}><Icon name="back" size={20} /></button>
      <span className={c.leadAvatar} aria-hidden="true">{initials(member.name)}</span>
      <div className={c.chatWho}><strong>{member.name}</strong><span className={s.caption}>{roleTag(member)}{upline ? ` · reports to ${upline.name}` : ""}</span></div>
    </div>
    <div className={c.stats}>
      <div className={c.stat}><span>Reply within 24 h</span><strong>{pct(st.replyRate)}</strong><small>{st.repliedIn24h} of the leads old enough to judge</small></div>
      <div className={c.stat}><span>Avg first reply</span><strong>{st.avgFirstReplyMinutes == null ? "—" : durationLabel(st.avgFirstReplyMinutes)}</strong><small>real time, not opening hours</small></div>
      <div className={c.stat}><span>Appt rate</span><strong>{pct(st.apptRate)}</strong><small>{st.booked} of {st.leads} leads</small></div>
      <div className={c.stat}><span>Show-up rate</span><strong>{pct(st.showUpRate)}</strong><small>{st.due ? `${st.showedUp} of ${st.due} came` : "None due yet"}</small></div>
      <div className={c.stat}><span>Won</span><strong>{st.won}</strong></div>
      <div className={c.stat}><span>Leads</span><strong>{st.leads}</strong></div>
    </div>
    <section className={s.card} aria-label={`${member.name}'s leads`}>
      <h2>Leads</h2>
      <p className={s.caption}>{stepIn
        ? <>Open a chat to reply for {firstName(member.name)} — the customer sees one conversation; the team sees &ldquo;Replied by&rdquo; you.</>
        : viewer.role === "boss" ? "View only — the Principal reads chats but doesn't reply in them." : "View only."}</p>
      {own.length === 0 && <p className={s.sub}>No leads yet.</p>}
      {own.map(l => <MemberCrmLeadRow key={l.id} lead={l} now={now} viewerId={viewer.id} nameOf={nameOf} onOpen={() => onOpenLead(l.id)} />)}
    </section>
  </div>;
}
