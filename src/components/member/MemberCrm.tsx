"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CRM_LOST_REASONS, CRM_STATUSES, clipLength, autoRepliesFor, DEFAULT_AUTO_REPLIES, URGENCY_LABELS,
  appointmentRate, appointmentSlots, showUpRate, applyAutoFollowUp, cancelAppointment, crmStatusLabel, daySlots,
  lostReasonComplete, lostReasonLabel, markAttended, previousLabel, receiveCustomerMessage, replyUrgency,
  rescheduleAppointment, setLeadStatus, slotClash, sortByUrgency, statusAfterCancel, statusAfterReply, waitingLabel,
  type CrmAppointment, type CrmBusySlot, type CrmLead, type CrmLost, type CrmLostReason,
  type CrmAttachment, type CrmAutoReplySettings, type CrmMessage, type CrmStatus, type CrmUrgency,
} from "@/lib/member/crm";
import { detectRequestedTime } from "@/lib/member/crm-datetime";
import { crmDemo, crmTeamDemo, demoShowrooms } from "@/lib/member/crm-demo";
import {
  ROLE_LABELS, allTeams, assignsAds, canReassign, canReply, hasDownlines, leadsHeld, takesEnquiries, pickInTeam, teamHandlers, teamOf, visibleLeads, visibleMembers,
  type CrmAssignConfig, type CrmMember,
} from "@/lib/member/crm-team";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { Icon, initials } from "./MemberUI";
import MemberCrmUpcoming from "./MemberCrmUpcoming";
import MemberCrmComposer from "./MemberCrmComposer";
import MemberCrmContacts from "./MemberCrmContacts";
import MemberCrmAutoReplies from "./MemberCrmAutoReplies";
import MemberCrmLeadRow, { firstName } from "./MemberCrmLeadRow";
import { MemberCrmMember, MemberCrmPerformance, MemberCrmTeam, roleTag } from "./MemberCrmTeam";
import MemberCrmAssignment from "./MemberCrmAssignment";
import { apptLabel, dayLabel, roomName, time, whenLabel } from "./crm-format";

const systemNote = (text: string, kind?: CrmMessage["kind"]): CrmMessage =>
  ({ id: crypto.randomUUID(), from: "system", kind, text, at: new Date().toISOString() });

/** Which calendars a slot must be free on: the showroom's and the salesperson's own. */
type BusyFor = (showroomId: string) => { room: CrmBusySlot[]; mine: CrmBusySlot[] };

/** The CRM's own bottom bar: Inbox (leads and chats), Calendar (appointments), Profile (your numbers). */
type Tab = "inbox" | "contacts" | "calendar" | "team" | "profile";
type View =
  | { kind: "tab" }
  | { kind: "chat"; leadId: string; fromMember?: string } // fromMember: opened from that salesperson's page in Team
  | { kind: "appointment"; appointmentId: string }
  | { kind: "member"; memberId: string }
  | { kind: "settings" } // the gear, top right: every setting the viewer has
  | { kind: "assignment" };

/**
 * CRM, reached from Profile. A prototype on demo data: the lead list, the
 * conversation, booking against the showroom's calendar and the salesperson's
 * own, and managing an appointment. Only the salesperson books, moves or
 * cancels; a customer asks in the chat, the time they name is picked out for
 * the salesperson to confirm, and the customer is told the new time.
 */
export default function MemberCrm({ salesperson = "your salesperson", onExit }: { salesperson?: string; onExit?: () => void }) {
  const demo = useMemo(() => crmDemo(), []);
  const [leads, setLeads] = useState<CrmLead[]>(() => applyAutoFollowUp(demo.leads));
  const [appointments, setAppointments] = useState<CrmAppointment[]>(demo.appointments);
  const [now, setNow] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>("inbox");
  const [view, setView] = useState<View>({ kind: "tab" });
  const [filter, setFilter] = useState<CrmStatus | "all">("all");
  // A TL or TA has leads of their own and their members': the Inbox shows all, only theirs, or only the members'.
  const [inboxScope, setInboxScope] = useState<"all" | "mine" | "members">("all");
  // Under Members: the people ticked (none ticked = every member). "" stands for the team's "To assign" leads.
  const [memberPick, setMemberPick] = useState<string[]>([]);
  const [autoReplies, setAutoReplies] = useState<CrmAutoReplySettings>(DEFAULT_AUTO_REPLIES);
  const [booking, setBooking] = useState(false);
  // The team behind the CRM (demo): who is looking, and how new enquiries are dealt.
  const team = useMemo(() => crmTeamDemo(salesperson), [salesperson]);
  const [viewerId, setViewerId] = useState("a1");
  const [config, setConfig] = useState<CrmAssignConfig>(team.config);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const viewer: CrmMember = team.members.find(m => m.id === viewerId) ?? team.members[0];
  const nameOf = (id: string) => team.members.find(m => m.id === id)?.name ?? "—";
  // Everything below works on what the viewer may see: an RS their own leads,
  // anyone above their whole downline's, the Boss everyone's.
  const visible = visibleLeads(viewer, team.members, leads);
  const visibleIds = new Set(visible.map(l => l.id));
  const visibleAppts = appointments.filter(a => visibleIds.has(a.leadId));

  function viewAs(id: string) {
    const next = team.members.find(m => m.id === id);
    setViewerId(id);
    setView({ kind: "tab" });
    setBooking(false);
    setTeamFilter(null);
    setInboxScope("all");
    setMemberPick([]);
    if (next && !hasDownlines(next, team.members) && tab === "team") setTab("inbox");
  }

  /**
   * The Boss or HOD sends an enquiry to a team — one no team took, or one moved
   * from another team. The team's own rules then pick who gets it: Fri–Sun a
   * full-time RS in turn, Mon–Thu the TL's % or the TL's "To assign" list.
   */
  function sendToTeam(leadId: string, tlId: string) {
    const tl = team.members.find(m => m.id === tlId);
    const { memberId, memberBy } = pickInTeam(tlId, new Date(), config, leadsHeld(leads.filter(l => l.id !== leadId)), team.members);
    const how = memberBy === "weekend" ? "Fri–Sun: full-time RS in turn" : memberBy === "ratio" ? `by ${firstName(tl?.name ?? "")}'s %`
      : memberBy === "no_full_time" ? "no full-time RS this weekend" : memberBy === "no_shares" ? "nobody has a %" : "Mon–Thu by hand";
    updateLead(leadId, l => ({
      ...l, teamId: tlId, assignedTo: memberId ?? undefined,
      messages: [...l.messages, systemNote(`Sent to ${tl?.teamName ?? "a team"} by ${nameOf(viewer.id)}. ${memberId
        ? `Assigned to ${nameOf(memberId)} (${how}).` : `Waits in ${firstName(tl?.name ?? "the TL")}'s To assign list (${how}).`}`)],
    }));
  }

  /** A TL hands a lead to someone in their team (or takes it back from one). */
  function assign(leadId: string, memberId: string) {
    updateLead(leadId, l => ({
      ...l, assignedTo: memberId, teamId: teamOf(memberId, team.members) ?? l.teamId,
      messages: [...l.messages, systemNote(`Assigned to ${nameOf(memberId)} by ${nameOf(viewer.id)}.`)],
    }));
  }

  // The clock behind the colours: every minute the waits grow, and a New lead
  // left unanswered past 24 opening hours moves to Follow up.
  useEffect(() => {
    const tick = setInterval(() => {
      const t = new Date();
      setNow(t);
      setLeads(list => applyAutoFollowUp(list, t));
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  // "mine" is the calendar of the salesperson who owns the lead — a leader
  // booking for Farah books into Farah's day, not their own.
  const busyFor = (exceptId?: string, ownerId: string | undefined = viewerId): BusyFor => roomId => ({
    room: [...(demo.showroomBusy[roomId] ?? []), ...appointmentSlots(appointments.filter(a => a.showroomId === roomId), "Showroom booked", exceptId)],
    mine: [...(ownerId === "a1" ? demo.myBusy : []),
      ...appointmentSlots(appointments.filter(a => leads.find(l => l.id === a.leadId)?.assignedTo === ownerId), "Calendar: appointment", exceptId)],
  });

  const updateLead = (id: string, change: (lead: CrmLead) => CrmLead) =>
    setLeads(list => list.map(l => (l.id === id ? change(l) : l)));
  const note = (leadId: string, text: string, kind?: CrmMessage["kind"]) =>
    updateLead(leadId, l => ({ ...l, messages: [...l.messages, systemNote(text, kind)] }));

  function openLead(id: string, fromMember?: string) {
    // Only the salesperson's own opening clears their unread count; a leader looking in leaves it.
    if (leads.find(l => l.id === id)?.assignedTo === viewer.id) updateLead(id, l => ({ ...l, unread: 0 }));
    setBooking(false);
    setView({ kind: "chat", leadId: id, fromMember });
  }

  /** A reply from the viewer: tagged with who wrote it when it is not the lead's own salesperson. */
  const reply = (lead: CrmLead, part: Pick<CrmMessage, "text" | "attachment">): CrmMessage => ({
    id: crypto.randomUUID(), from: "me", at: new Date().toISOString(), ...part,
    ...(lead.assignedTo !== viewer.id ? { by: viewer.id } : {}),
  });

  function book(leadId: string, showroomId: string, start: string) {
    const appt: CrmAppointment = { id: crypto.randomUUID(), leadId, showroomId, start, minutes: 60, state: "booked" };
    setAppointments(list => [...list, appt]);
    updateLead(leadId, l => ({
      ...setLeadStatus(l, "appointment"),
      messages: [...l.messages,
        systemNote(`Appointment booked: ${apptLabel(appt)}. Added to the showroom calendar and yours.`, "booking"),
        { id: crypto.randomUUID(), from: "me", text: "", at: new Date().toISOString(), card: { start, showroom: roomName(showroomId) } },
      ],
    }));
    setBooking(false);
  }

  function reschedule(appt: CrmAppointment, start: string, showroomId: string) {
    const moved = rescheduleAppointment(appt, start, showroomId);
    setAppointments(list => list.map(a => (a.id === appt.id ? moved : a)));
    updateLead(appt.leadId, l => ({ ...l, messages: [...l.messages,
      systemNote(`Appointment changed to ${apptLabel(moved)}.`, "booking"),
      { id: crypto.randomUUID(), from: "me", text: "", at: new Date().toISOString(), card: { start, showroom: roomName(showroomId) } },
    ] }));
  }

  function cancel(appt: CrmAppointment) {
    const next = appointments.map(a => (a.id === appt.id ? cancelAppointment(a) : a));
    setAppointments(next);
    updateLead(appt.leadId, l => ({
      ...l, status: statusAfterCancel(l, next),
      messages: [...l.messages, systemNote(`Appointment on ${dayLabel(appt.start)}, ${time(appt.start)} cancelled. Customer notified. Back to Follow up.`)],
    }));
  }

  const openAppointment = (id: string) => setView({ kind: "appointment", appointmentId: id });
  const goTab = (t: Tab) => { setTab(t); setView({ kind: "tab" }); setBooking(false); };

  let body: React.ReactNode = null;
  let inDetail = false;

  // ── Appointment detail ────────────────────────────────────────────────────
  if (view.kind === "appointment") {
    const appt = appointments.find(a => a.id === view.appointmentId);
    const lead = appt && leads.find(l => l.id === appt.leadId);
    if (appt && lead) {
      inDetail = true;
      body = <AppointmentDetail appt={appt} lead={lead} busy={busyFor(appt.id, lead.assignedTo)} readOnly={!canReply(viewer, lead, team.members)}
        onBack={() => setView({ kind: "tab" })}
        onOpenChat={() => { setTab("inbox"); openLead(lead.id); }}
        onShowUp={() => { setAppointments(list => list.map(a => (a.id === appt.id ? markAttended(a) : a))); note(lead.id, `Customer showed up on ${dayLabel(appt.start)}, ${time(appt.start)}.`); }}
        onChange={(start, room) => reschedule(appt, start, room)}
        onCancel={() => cancel(appt)} />;
    }
  }

  // ── Conversation ──────────────────────────────────────────────────────────
  if (view.kind === "chat") {
    const lead = visible.find(l => l.id === view.leadId);
    const fromMember = view.fromMember;
    if (lead) {
      inDetail = true;
      body = <Conversation
        lead={lead}
        now={now}
        appointments={appointments.filter(a => a.leadId === lead.id)}
        salesperson={lead.assignedTo ? nameOf(lead.assignedTo) : "Not assigned yet"}
        viewer={viewer}
        nameOf={nameOf}
        readOnly={!canReply(viewer, lead, team.members)}
        moveTo={assignsAds(viewer) ? allTeams(team.members) : undefined}
        onMoveTeam={tlId => sendToTeam(lead.id, tlId)}
        reassignTo={canReassign(viewer, lead, team.members) ? teamHandlers(lead.teamId ?? teamOf(lead.assignedTo ?? "", team.members) ?? "", team.members) : undefined}
        onReassign={memberId => assign(lead.id, memberId)}
        onBack={() => { setView(fromMember ? { kind: "member", memberId: fromMember } : { kind: "tab" }); setBooking(false); }}
        onOpenAppointment={id => { setTab("calendar"); openAppointment(id); }}
        onStatus={(status, lost) => updateLead(lead.id, l => {
          const next = setLeadStatus(l, status, lost);
          return lost ? { ...next, messages: [...next.messages, systemNote(`Marked Lost: ${lostReasonLabel(lost)}.`)] } : next;
        })}
        onAttachment={attachment => updateLead(lead.id, l => ({
          ...l,
          status: statusAfterReply(l.status),
          messages: [...l.messages, reply(l, { text: "", attachment })],
        }))}
        onSend={text => updateLead(lead.id, l => ({
          ...l,
          status: statusAfterReply(l.status),
          messages: [...l.messages, reply(l, { text })],
        }))}
        onCustomerMessage={text => updateLead(lead.id, l => {
          const message: CrmMessage = { id: crypto.randomUUID(), from: "lead", text, at: new Date().toISOString() };
          const received = receiveCustomerMessage(l, message);
          const replies = autoRepliesFor(received, message, autoReplies)
            .map((reply, i): CrmMessage => ({ id: crypto.randomUUID(), from: "me", auto: true, text: reply, at: new Date(Date.now() + 1000 * (i + 1)).toISOString() }));
          return { ...received, unread: 0, messages: [...received.messages, ...replies] }; // they are looking at the chat
        })}
        booking={booking}
        onBooking={setBooking}
        busy={exceptId => busyFor(exceptId, lead.assignedTo)}
        onBook={(room, start) => book(lead.id, room, start)}
        onReschedule={(appt, start) => reschedule(appt, start, appt.showroomId)}
      />;
    }
  }

  const manager = hasDownlines(viewer, team.members);
  // Assignment is for those who set it: Boss, HOD (and a Senior TL, read only) and each TL.
  const seesAssignment = manager && viewer.role !== "ta";

  // ── One person, from Team ─────────────────────────────────────────────────
  if (view.kind === "member" && manager) {
    const member = team.members.find(m => m.id === view.memberId);
    // Only someone in the viewer's own downline — a TL never opens another TL's team.
    if (member && visibleMembers(viewer, team.members).some(m => m.id === member.id)) {
      inDetail = true;
      body = <MemberCrmMember member={member} members={team.members} leads={visible} appointments={visibleAppts}
        now={now} viewer={viewer} stepIn={canReply(viewer, { assignedTo: member.id }, team.members)} nameOf={nameOf}
        onBack={() => setView({ kind: "tab" })} onOpenLead={id => openLead(id, member.id)} />;
    }
  }

  // ── Settings (the gear, top right) ────────────────────────────────────────
  if (view.kind === "settings") {
    inDetail = true;
    body = <div className={c.chat}>
      <div className={c.chatHead}>
        <button className={c.back} onClick={() => setView({ kind: "tab" })} aria-label="Close settings"><Icon name="back" size={20} /></button>
        <div className={c.chatWho}><strong>Settings</strong><span className={s.caption}>How your CRM works</span></div>
      </div>
      {seesAssignment && <section className={s.card} aria-label="Assignment">
        <button className={`${s.listRow} ${s.listButton}`} onClick={() => setView({ kind: "assignment" })}>
          <div className={s.listIcon}><Icon name="branch" /><div><strong>Assignment</strong><p className={s.caption}>{viewer.role === "tl" ? "Who in your team gets new enquiries" : "Which team gets new enquiries"}</p></div></div>
          <Icon name="chevron" size={16} />
        </button>
      </section>}
      <MemberCrmAutoReplies settings={autoReplies} onChange={setAutoReplies} />
    </div>;
  }

  // ── Assignment, from Settings ─────────────────────────────────────────────
  if (view.kind === "assignment" && seesAssignment) {
    inDetail = true;
    body = <MemberCrmAssignment viewer={viewer} members={team.members}
      ads={[...new Set(leads.map(l => l.adName))].sort()} config={config} onConfig={setConfig}
      onBack={() => setView({ kind: "settings" })} />;
  }

  const rate = appointmentRate(visible, visibleAppts);
  const showUp = showUpRate(visibleAppts, now);
  const needsReply = visible.filter(l => l.unread > 0 || replyUrgency(l, now).level !== "none").length;
  const upcomingCount = visibleAppts.filter(a => a.state === "booked" && new Date(a.start) > now).length;

  // ── Whose leads: All · Mine · Members (a TL or TA), shared by Inbox and Contacts ─
  // A TL or TA takes enquiries and has members: they may narrow to their own leads or the members'.
  const scoped = manager && takesEnquiries(viewer);
  const scope = scoped ? inboxScope : "all";
  const membersOnly = visible.filter(l => l.assignedTo !== viewer.id);
  // The members to tick: everyone below who holds a lead, then "To assign" when the team has some waiting.
  const pickable = [
    ...visibleMembers(viewer, team.members).filter(m => m.id !== viewer.id && membersOnly.some(l => l.assignedTo === m.id)).map(m => ({ id: m.id, label: firstName(m.name) })),
    ...(membersOnly.some(l => !l.assignedTo) ? [{ id: "", label: "To assign" }] : []),
  ];
  // The Boss, HOD (and a Senior TL) narrow by team instead — the same choice as on the Team tab. "" = no team yet.
  const byTeam = manager && !takesEnquiries(viewer);
  const teamOfLead = (l: CrmLead) => l.teamId ?? (l.assignedTo ? teamOf(l.assignedTo, team.members) : undefined) ?? "";
  const teamChoices = byTeam ? [
    ...allTeams(team.members).filter(t => visibleMembers(viewer, team.members).some(m => m.id === t.id)),
    ...(visible.some(l => teamOfLead(l) === "") ? [{ id: "", teamName: "No team" }] : []),
  ] : [];
  const inScope = byTeam ? visible.filter(l => teamFilter === null || teamOfLead(l) === teamFilter)
    : scope === "all" ? visible
      : scope === "mine" ? visible.filter(l => l.assignedTo === viewer.id)
        : membersOnly.filter(l => memberPick.length === 0 || memberPick.includes(l.assignedTo ?? ""));
  const scopeBar = <>
    {byTeam && teamChoices.length > 1 && <div className={c.chips} role="group" aria-label="Team">
      <button className={c.chip} aria-pressed={teamFilter === null} onClick={() => setTeamFilter(null)}>All teams {visible.length}</button>
      {teamChoices.map(t => <button key={t.id || "no-team"} className={c.chip} aria-pressed={teamFilter === t.id} onClick={() => setTeamFilter(t.id)}>
        {t.teamName} {visible.filter(l => teamOfLead(l) === t.id).length}
      </button>)}
    </div>}
    {scoped && <div className={c.segment3} role="radiogroup" aria-label="Whose leads">
      {([["all", "All", visible.length], ["mine", "Mine", visible.filter(l => l.assignedTo === viewer.id).length], ["members", "Members", visible.filter(l => l.assignedTo !== viewer.id).length]] as const).map(([value, label, n]) =>
        <button key={value} role="radio" aria-checked={inboxScope === value} onClick={() => setInboxScope(value)}>{label} <small>{n}</small></button>)}
    </div>}
    {scope === "members" && pickable.length > 1 && <div className={c.chips} role="group" aria-label="Filter by member">
      <button className={c.chip} aria-pressed={memberPick.length === 0} onClick={() => setMemberPick([])}>Everyone</button>
      {pickable.map(p => <button key={p.id || "to-assign"} className={c.chip} aria-pressed={memberPick.includes(p.id)}
        onClick={() => setMemberPick(list => (list.includes(p.id) ? list.filter(x => x !== p.id) : [...list, p.id]))}>
        {memberPick.includes(p.id) ? "✓ " : ""}{p.label} {membersOnly.filter(l => (l.assignedTo ?? "") === p.id).length}
      </button>)}
    </div>}
  </>;

  // ── Inbox ─────────────────────────────────────────────────────────────────
  if (!inDetail && tab === "inbox") {
    const shown = sortByUrgency(inScope.filter(l => filter === "all" || l.status === filter), now);
    const waiting = (level: CrmUrgency) => inScope.filter(l => replyUrgency(l, now).level === level).length;
    const scopeWaiting = inScope.filter(l => l.unread > 0 || replyUrgency(l, now).level !== "none").length;
    body = <>
      <div className={c.tabTitle}><h1>Inbox</h1><p className={s.sub}>{byTeam && teamFilter !== null ? `${teamChoices.find(x => x.id === teamFilter)?.teamName ?? "This"} team` : scope === "mine" ? "Your own leads" : scope === "members" ? "Your members' leads" : manager ? "Your downline's leads" : "Leads from Meta ads"} · {scopeWaiting} waiting</p></div>
      {scopeBar}
      <p className={c.demoNote}><Icon name="info" size={16} /> Demo data · not connected to Meta yet</p>
      <section className={s.card}>
        <div className={c.urgencyKey} aria-label="Waiting for your reply">
          {(["overdue", "urgent", "soon"] as const).map(level => (
            <span key={level} data-urgency={level}><i aria-hidden="true" />{waiting(level)} {URGENCY_LABELS[level].toLowerCase()}</span>
          ))}
        </div>
        <div className={c.chips} role="group" aria-label="Filter by status">
          {([{ value: "all", label: "All" }, ...CRM_STATUSES] as const).map(f => (
            <button key={f.value} className={c.chip} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}{f.value !== "all" && ` ${inScope.filter(l => l.status === f.value).length}`}
            </button>
          ))}
        </div>
        {filter === "lost" && shown.length > 0 && <div className={c.lostSummary} aria-label="Why leads were lost">
          {CRM_LOST_REASONS.map(r => ({ r, n: shown.filter(l => l.lost?.reason === r.value).length })).filter(x => x.n > 0)
            .map(({ r, n }) => <span key={r.value}>{r.label} <strong>{n}</strong></span>)}
        </div>}
        {shown.length === 0 && <p className={s.sub}>No leads with this status.</p>}
        {shown.map(lead => <MemberCrmLeadRow key={lead.id} lead={lead} now={now} viewerId={viewer.id} nameOf={nameOf}
          owner={!lead.assignedTo ? (lead.teamId ? "To assign" : "No team") : lead.assignedTo !== viewer.id ? firstName(nameOf(lead.assignedTo)) : undefined}
          onOpen={() => openLead(lead.id)} />)}
      </section>
    </>;
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  if (!inDetail && tab === "contacts") {
    body = <>
      <div className={c.tabTitle}><h1>Contacts</h1><p className={s.sub}>{inScope.length} customers{scope === "mine" ? " of your own" : scope === "members" ? " of your members" : " from both pages"}</p></div>
      {scopeBar}
      <MemberCrmContacts leads={inScope} appointments={visibleAppts} onOpen={id => { setTab("inbox"); openLead(id); }} />
    </>;
  }

  // ── Calendar ──────────────────────────────────────────────────────────────
  if (!inDetail && tab === "calendar") {
    // The calendar follows the same All · Mine · Members choice.
    const scopeIds = new Set(inScope.map(l => l.id));
    const scopeAppts = visibleAppts.filter(a => scopeIds.has(a.leadId));
    const scopeUpcoming = scopeAppts.filter(a => a.state === "booked" && new Date(a.start) > now).length;
    const scopeShowUp = showUpRate(scopeAppts, now);
    const unmarked = scopeAppts
      .filter(a => a.state === "booked" && new Date(a.start) <= now)
      .sort((a, b) => b.start.localeCompare(a.start));
    const recent = scopeAppts
      .filter(a => a.state === "attended")
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, 5);
    const leadName = (a: CrmAppointment) => leads.find(l => l.id === a.leadId)?.name ?? "Lead";
    body = <>
      <div className={c.tabTitle}><h1>Calendar</h1><p className={s.sub}>{scopeUpcoming} upcoming · show-up rate {scopeShowUp.rate == null ? "—" : `${Math.round(scopeShowUp.rate * 100)}%`}</p></div>
      {scopeBar}
      {/* Marking show-ups and recent visits is the salesperson's work; a leader or the Boss only looks ahead. */}
      {!manager && unmarked.length > 0 && <section className={s.card} aria-label="Did they show up?">
        <h2>Did they show up?</h2>
        <p className={s.caption}>Past appointments not marked yet count as no-shows.</p>
        {unmarked.map(a => (
          <button key={a.id} className={`${s.listRow} ${s.listButton}`} onClick={() => openAppointment(a.id)}>
            <div className={s.listIcon}><Icon name="info" /><div><strong>{leadName(a)}</strong><p className={s.caption}>{apptLabel(a)}</p></div></div>
            <Icon name="chevron" size={16} />
          </button>
        ))}
      </section>}
      <MemberCrmUpcoming appointments={scopeAppts} leads={inScope} now={now} onOpen={openAppointment} />
      {scopeUpcoming === 0 && <section className={s.card}><p className={s.sub}>No upcoming appointments. Book one from a chat in Inbox.</p></section>}
      {!manager && recent.length > 0 && <section className={s.card} aria-label="Recent visits">
        <h2>Recent visits</h2>
        {recent.map(a => (
          <button key={a.id} className={`${s.listRow} ${s.listButton}`} onClick={() => openAppointment(a.id)}>
            <div className={s.listIcon}><Icon name="check" /><div><strong>{leadName(a)}</strong><p className={s.caption}>{apptLabel(a)} · showed up</p></div></div>
            <Icon name="chevron" size={16} />
          </button>
        ))}
      </section>}
    </>;
  }

  // ── Team ──────────────────────────────────────────────────────────────────
  if (!inDetail && tab === "team" && manager) {
    body = <MemberCrmTeam viewer={viewer} members={team.members} leads={visible} appointments={visibleAppts} now={now}
      teamFilter={teamFilter} onTeamFilter={setTeamFilter}
      onOpenMember={id => setView({ kind: "member", memberId: id })} onOpenLead={id => openLead(id)}
      onAssign={assign} onSendToTeam={sendToTeam} />;
  }

  // ── Profile ───────────────────────────────────────────────────────────────
  if (!inDetail && tab === "profile") {
    const lostLeads = visible.filter(l => l.status === "lost");
    body = <>
      <div className={c.profileHead}>
        <span className={c.profileAvatar} aria-hidden="true">{initials(viewer.name)}</span>
        <div><h1>{viewer.name}</h1><p className={s.sub}>{manager ? `${roleTag(viewer)}${viewer.teamName ? ` · ${viewer.teamName}` : ""} · your downline's numbers` : `${roleTag(viewer)} · your CRM`}</p></div>
      </div>
      {/* A leader or the Boss sees the team's performance; a salesperson their own four numbers. */}
      {manager ? <MemberCrmPerformance viewer={viewer} members={team.members} leads={visible} appointments={visibleAppts} now={now} /> : <div className={c.stats}>
        <div className={c.stat}><span>Leads</span><strong>{rate.leads}</strong></div>
        <div className={c.stat}><span>Appointments</span><strong>{rate.booked}</strong></div>
        <div className={c.stat}><span>Appt rate</span><strong>{rate.rate == null ? "—" : `${Math.round(rate.rate * 100)}%`}</strong><small>{rate.booked} of {rate.leads} leads</small></div>
        <div className={c.stat}><span>Show-up rate</span><strong>{showUp.rate == null ? "—" : `${Math.round(showUp.rate * 100)}%`}</strong><small>{showUp.due ? `${showUp.showed} of ${showUp.due} came` : "None due yet"}</small></div>
      </div>}
      <section className={s.card} aria-label="Leads by status">
        <h2>Leads by status</h2>
        {CRM_STATUSES.map(st => {
          const n = visible.filter(l => l.status === st.value).length;
          return <div key={st.value} className={c.barRow}>
            <span className={c.status} data-status={st.value}>{st.label}</span>
            <span className={c.bar}><i style={{ width: `${visible.length ? (n / visible.length) * 100 : 0}%` }} /></span>
            <strong>{n}</strong>
          </div>;
        })}
      </section>
      <section className={s.card} aria-label="Why leads were lost">
        <h2>Why leads were lost</h2>
        {lostLeads.length === 0 && <p className={s.sub}>No lost leads.</p>}
        {CRM_LOST_REASONS.map(r => ({ r, n: lostLeads.filter(l => l.lost?.reason === r.value).length })).filter(x => x.n > 0).map(({ r, n }) => (
          <div key={r.value} className={c.barRow}>
            <span className={c.barLabel}>{r.label}</span>
            <span className={c.bar}><i style={{ width: `${(n / lostLeads.length) * 100}%` }} /></span>
            <strong>{n}</strong>
          </div>
        ))}
      </section>
      {onExit && <button className={`${s.button} ${s.full}`} onClick={onExit}><Icon name="back" size={18} /> Back to the Revenue app</button>}
      <p className={c.demoNote}><Icon name="info" size={16} /> Demo data · not connected to Meta yet</p>
    </>;
  }

  const tabs: { id: Tab; icon: string; label: string; badge?: number }[] = [
    { id: "inbox", icon: "chat", label: "Inbox", badge: needsReply },
    { id: "contacts", icon: "team", label: "Contacts" },
    { id: "calendar", icon: "calendar", label: "Calendar", badge: upcomingCount },
    // Team: a leader's or the Boss's window on their salespeople. A salesperson never sees it.
    ...(manager ? [{ id: "team" as const, icon: "chart", label: "Team" }] : []),
    { id: "profile", icon: "user", label: "Profile" },
  ];
  // Demo: one of each level, and two TLs to show they never see each other's team.
  const demoViewers = ["boss", "hod", "lkv", "lnt", "a2", "a1"].map(id => team.members.find(m => m.id === id)).filter((m): m is CrmMember => !!m);

  return (
    <div className={c.app}>
      {!inDetail && <header className={c.appTop}>
        {onExit && <button className={c.back} onClick={onExit} aria-label="Back to the Revenue app"><Icon name="back" size={20} /></button>}
        <span className={c.appBrand}>HOUZS <strong>CRM</strong></span>
        {/* Demo only: until sign-in decides the role, try the CRM as each of them. */}
        <label className={c.roleSwitch}><span>Demo as</span>
          <select value={viewer.id} onChange={e => viewAs(e.target.value)} aria-label="Demo: view the CRM as">
            {demoViewers.map(m => <option key={m.id} value={m.id}>
              {ROLE_LABELS[m.role]} · {firstName(m.name)}{m.teamName ? ` (${m.teamName})` : ""}
            </option>)}
          </select>
        </label>
        <button className={c.back} onClick={() => setView({ kind: "settings" })} aria-label="Settings"><Icon name="gear" size={20} /></button>
      </header>}
      <main className={c.appMain}>{body}</main>
      <nav className={c.appNav} aria-label="CRM" data-tabs={tabs.length}>
        {tabs.map(t => (
          <button key={t.id} aria-current={tab === t.id ? "page" : undefined} onClick={() => goTab(t.id)}>
            <span className={c.appNavIcon}><Icon name={t.icon} size={23} />{!!t.badge && <b>{t.badge}</b>}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Conversation({ lead, now, appointments, salesperson, viewer, nameOf, readOnly, reassignTo, onReassign, moveTo, onMoveTeam, onBack, onOpenAppointment, onStatus, onSend, onAttachment, onCustomerMessage, booking, onBooking, busy, onBook, onReschedule }: {
  lead: CrmLead;
  now: Date;
  appointments: CrmAppointment[];
  /** The lead's own salesperson. */
  salesperson: string;
  viewer: CrmMember;
  nameOf: (memberId: string) => string;
  /** The Boss and HOD read chats but never reply, book or close a lead. */
  readOnly: boolean;
  /** The team's people, when the viewer is its TL and may hand the lead to someone else. */
  reassignTo?: CrmMember[];
  onReassign: (memberId: string) => void;
  /** Every TL, when the viewer is the Boss or HOD and may send the lead to another team. */
  moveTo?: CrmMember[];
  onMoveTeam: (tlId: string) => void;
  onBack: () => void;
  onOpenAppointment: (id: string) => void;
  onStatus: (status: CrmStatus, lost?: CrmLost) => void;
  onSend: (text: string) => void;
  onAttachment: (attachment: CrmAttachment) => void;
  onCustomerMessage: (text: string) => void;
  booking: boolean;
  onBooking: (open: boolean) => void;
  busy: (exceptId?: string) => BusyFor;
  onBook: (showroomId: string, start: string) => void;
  onReschedule: (appt: CrmAppointment, start: string) => void;
}) {
  const [demoDraft, setDemoDraft] = useState("");
  const [askingLost, setAskingLost] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The ⋯ menu closes on a tap outside it or on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [menuOpen]);

  const urgency = replyUrgency(lead, now);
  const active = appointments.find(a => a.state === "booked") ?? null;

  // The time the customer asked for in their latest message, if any and not yet answered.
  const lastCustomer = [...lead.messages].reverse().find(m => m.from === "lead");
  const answeredAfter = lastCustomer && lead.messages.slice(lead.messages.indexOf(lastCustomer) + 1).some(m => m.kind === "booking");
  const requested = lastCustomer && !answeredAfter && !handled.has(lastCustomer.id) ? detectRequestedTime(lastCustomer.text, now) : null;
  const requestedIso = requested?.toISOString() ?? null;
  const sameAsBooked = active && requestedIso === active.start;
  const room = active?.showroomId ?? demoShowrooms[0].id;
  const clash = requestedIso ? (() => { const b = busy(active?.id)(room); return slotClash(requestedIso, 60, b.room) ? "The showroom is full then" : slotClash(requestedIso, 60, b.mine) ? "You're busy then" : null; })() : null;
  const done = (id: string) => setHandled(prev => new Set(prev).add(id));

  return (
    <div className={c.chat}>
      <div className={c.chatHead}>
        <button className={c.back} onClick={onBack} aria-label="Back to leads"><Icon name="back" size={20} /></button>
        <span className={c.leadAvatar} aria-hidden="true">{initials(lead.name)}</span>
        <div className={c.chatWho}>
          <span className={c.nameLine}>
            <strong>{lead.name}</strong>
            <span className={c.status} data-status={lead.status}>{crmStatusLabel(lead.status)}</span>
            {lead.previous && <span className={c.previous}>{previousLabel(lead.previous)}</span>}
          </span>
          <a href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`} className={s.caption}>{lead.phone}</a>
        </div>
        {!readOnly && <div className={c.menuWrap} ref={menuRef}>
          <button className={c.back} aria-label="More actions" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>
            <Icon name="more" size={20} />
          </button>
          {menuOpen && <div className={c.menu} role="menu">
            <button role="menuitem" disabled={lead.status === "won"} onClick={() => { setMenuOpen(false); setAskingLost(false); onStatus("won"); }}>
              <Icon name="check" size={18} /> Mark as Won
            </button>
            <button role="menuitem" disabled={lead.status === "lost"} onClick={() => { setMenuOpen(false); setAskingLost(true); }}>
              <Icon name="close" size={18} /> Mark as Lost…
            </button>
          </div>}
        </div>}
      </div>
      <p className={c.chatAd}><Icon name="target" size={14} /> {lead.adName}</p>
      {readOnly
        ? <p className={c.stepIn}><Icon name="eye" size={16} /> View only · {lead.assignedTo ? `${firstName(salesperson)}'s customer` : "not assigned yet"} — the {ROLE_LABELS[viewer.role]} reads chats but doesn&apos;t reply</p>
        : lead.assignedTo !== viewer.id && <p className={c.stepIn}>
          <Icon name="eye" size={16} /> {lead.assignedTo ? `${firstName(salesperson)}'s customer` : "Not assigned yet"} · your replies show to the team as &ldquo;Replied by {firstName(viewer.name)}&rdquo;
        </p>}
      {moveTo && <label className={c.reassign}>
        <span>{lead.teamId ? "Team" : "Send to team"}</span>
        <select value={lead.teamId ?? ""} onChange={e => e.target.value && e.target.value !== lead.teamId && onMoveTeam(e.target.value)}>
          {!lead.teamId && <option value="">Choose a TL…</option>}
          {moveTo.map(t => <option key={t.id} value={t.id}>{t.teamName} · {t.name}</option>)}
        </select>
      </label>}
      {reassignTo && <label className={c.reassign}>
        <span>{lead.assignedTo ? "Assigned to" : "Assign to"}</span>
        <select value={lead.assignedTo ?? ""} onChange={e => e.target.value && e.target.value !== lead.assignedTo && onReassign(e.target.value)}>
          {!lead.assignedTo && <option value="">Choose…</option>}
          {reassignTo.map(m => <option key={m.id} value={m.id}>{m.name} · {roleTag(m)}</option>)}
        </select>
      </label>}
      {urgency.level !== "none" && <p className={c.waitBanner} data-urgency={urgency.level}>
        {URGENCY_LABELS[urgency.level]}: waiting {waitingLabel(urgency.waitingMinutes)} (opening hours) for your reply
        {urgency.level === "overdue" && lead.status === "follow_up" && " · moved to Follow up automatically"}
      </p>}

      {askingLost && <LostSheet onCancel={() => setAskingLost(false)} onConfirm={lost => { onStatus("lost", lost); setAskingLost(false); }} />}
      {!askingLost && lead.lost && <p className={c.lostBanner}>Lost · {lostReasonLabel(lead.lost)} <span>· moves back to Follow up if the customer writes again</span></p>}
      {lead.status === "won" && <p className={c.wonBanner}><Icon name="check" size={16} /> Won <span>· moves back to Follow up if the customer writes again</span></p>}

      {appointments.filter(a => a.state !== "cancelled").map(a => (
        <button key={a.id} className={c.apptBanner} onClick={() => onOpenAppointment(a.id)}>
          <Icon name="calendar" size={16} /> {apptLabel(a)}
          <span className={c.apptState}>{a.state === "attended" ? "Showed up ✓" : "Manage ›"}</span>
        </button>
      ))}

      <div className={c.messages}>
        {lead.messages.map(m => (
          <div key={m.id} className={c.bubble} data-from={m.from} data-media={m.attachment?.kind} data-auto={m.auto || undefined} data-card={m.card ? true : undefined}>
            {m.auto && <small className={c.autoTag}>Auto-reply</small>}
            {m.by && <small className={c.byTag}>Replied by {m.by === viewer.id ? "you" : nameOf(m.by)}</small>}
            {m.card && <span className={c.apptCard}>
              <small>APPOINTMENT CONFIRMED</small>
              <strong>{dayLabel(m.card.start)}, {time(m.card.start)}</strong>
              <span>{m.card.showroom}</span>
              <em>Sent to the customer · they can pin it in Messenger</em>
            </span>}
            {/* eslint-disable-next-line @next/next/no-img-element -- a customer's photo (a blob or Meta CDN URL), not a site asset next/image can optimise */}
            {m.attachment?.kind === "image" && <a href={m.attachment.url} target="_blank" rel="noreferrer"><img className={c.media} src={m.attachment.url} alt={m.attachment.name ?? "Photo"} /></a>}
            {m.attachment?.kind === "video" && <video className={c.media} src={m.attachment.url} controls playsInline preload="metadata" />}
            {m.attachment?.kind === "audio" && <span className={c.voice}><Icon name="mic" size={16} /><audio src={m.attachment.url} controls preload="metadata" />{m.attachment.seconds ? <small>{clipLength(m.attachment.seconds)}</small> : null}</span>}
            {m.text && <p>{m.text}</p>}
            <span>{whenLabel(m.at)}</span>
          </div>
        ))}
      </div>

      {!readOnly && requestedIso && lastCustomer && !sameAsBooked && pickingFor !== lastCustomer.id && (
        <section className={c.suggest} aria-label="Customer asked for a time">
          <p className={c.suggestHead}><Icon name="calendar" size={16} /> {lead.name.split(" ")[0]} asked for <strong>{dayLabel(requestedIso)}, {time(requestedIso)}</strong></p>
          <p className={s.caption}>{active ? `Currently booked: ${apptLabel(active)}` : "No appointment yet"}{clash ? ` · ${clash}` : " · Free on the showroom calendar and yours"}</p>
          <div className={c.sheetActions}>
            <button className={s.button} onClick={() => done(lastCustomer.id)}>Ignore</button>
            <button className={s.button} onClick={() => setPickingFor(lastCustomer.id)}>Pick another time</button>
            <button className={`${s.button} ${s.primary}`} disabled={!!clash} onClick={() => {
              if (active) onReschedule(active, requestedIso); else onBook(room, requestedIso);
              done(lastCustomer.id);
            }}>{active ? "Confirm new time" : "Book this time"}</button>
          </div>
        </section>
      )}

      {lastCustomer && pickingFor === lastCustomer.id && (
        <BookingSheet title={active ? "Change appointment" : "Book appointment"} confirmLabel={active ? "Confirm new time" : "Confirm"}
          initialShowroom={room} busy={busy(active?.id)}
          onCancel={() => setPickingFor(null)}
          onConfirm={(r, start) => { if (active) onReschedule(active, start); else onBook(r, start); done(lastCustomer.id); setPickingFor(null); }} />
      )}

      {!readOnly && !active && !pickingFor && (booking
        ? <BookingSheet title="Book appointment" confirmLabel="Confirm" busy={busy()} onCancel={() => onBooking(false)} onConfirm={(r, start) => onBook(r, start)} />
        : <button className={`${s.button} ${s.primary} ${s.full}`} onClick={() => onBooking(true)}><Icon name="calendar" /> Book appointment</button>)}

      {!readOnly && <MemberCrmComposer placeholder={`Reply to ${lead.name.split(" ")[0]}…`} onText={onSend} onAttachment={onAttachment} />}

      {/* Demo only: stands in for a message arriving from the customer. */}
      {!readOnly && <details className={c.demoTool}>
        <summary>Demo: send a message as {lead.name.split(" ")[0]}</summary>
        <div className={c.demoRow}>
          <input value={demoDraft} onChange={e => setDemoDraft(e.target.value)} placeholder="e.g. Can we change to Saturday 3pm?" aria-label="Customer message (demo)"
            onKeyDown={e => { if (e.key === "Enter" && demoDraft.trim()) { onCustomerMessage(demoDraft.trim()); setDemoDraft(""); } }} />
          <button className={s.button} disabled={!demoDraft.trim()} onClick={() => { onCustomerMessage(demoDraft.trim()); setDemoDraft(""); }}>Send</button>
        </div>
        <p className={s.caption}>To {firstName(salesperson)}: this is how a customer&apos;s reply would arrive.</p>
      </details>}
    </div>
  );
}

/** The salesperson's view of one appointment: showed up, change, cancel. */
function AppointmentDetail({ appt, lead, busy, readOnly, onBack, onOpenChat, onShowUp, onChange, onCancel }: {
  appt: CrmAppointment;
  lead: CrmLead;
  busy: BusyFor;
  /** The Boss and HOD see an appointment but never change it. */
  readOnly: boolean;
  onBack: () => void;
  onOpenChat: () => void;
  onShowUp: () => void;
  onChange: (start: string, showroomId: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "change" | "cancel">("idle");
  const booked = appt.state === "booked" && !readOnly;

  return (
    <div className={c.chat}>
      <div className={c.chatHead}>
        <button className={c.back} onClick={onBack} aria-label="Back to CRM"><Icon name="back" size={20} /></button>
        <span className={c.leadAvatar} aria-hidden="true">{initials(lead.name)}</span>
        <div className={c.chatWho}>
          <span className={c.nameLine}><strong>{lead.name}</strong><span className={c.status} data-status={lead.status}>{crmStatusLabel(lead.status)}</span></span>
          <a href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`} className={s.caption}>{lead.phone}</a>
        </div>
      </div>

      <section className={c.sheet} aria-label="Appointment">
        <h3>Appointment</h3>
        <dl className={s.dl}>
          <dt>When</dt><dd>{dayLabel(appt.start)}, {time(appt.start)}</dd>
          <dt>Where</dt><dd>{roomName(appt.showroomId)}</dd>
          <dt>Status</dt><dd>{appt.state === "attended" ? "Showed up ✓" : appt.state === "cancelled" ? "Cancelled" : new Date(appt.start) <= new Date() ? "No show — not marked as showed up" : "Booked"}</dd>
        </dl>
      </section>

      {booked && mode === "idle" && <div className={c.apptActions}>
        <button className={`${s.button} ${s.primary}`} onClick={onShowUp}><Icon name="check" size={18} /> Showed up</button>
        <button className={s.button} onClick={() => setMode("change")}><Icon name="calendar" size={18} /> Change</button>
        <button className={`${s.button} ${c.danger}`} onClick={() => setMode("cancel")}><Icon name="close" size={18} /> Cancel</button>
      </div>}

      {booked && mode === "change" && <BookingSheet title="Change appointment" confirmLabel="Save new time" initialShowroom={appt.showroomId} busy={busy}
        hint="The customer is notified of the new time."
        onCancel={() => setMode("idle")} onConfirm={(room, start) => { onChange(start, room); setMode("idle"); }} />}

      {booked && mode === "cancel" && <section className={c.sheet} aria-label="Cancel appointment">
        <h3>Cancel this appointment?</h3>
        <p className={s.sub}>The slot is freed on the showroom calendar and yours, {lead.name.split(" ")[0]} is notified and goes back to Follow up.</p>
        <div className={c.sheetActions}>
          <button className={s.button} onClick={() => setMode("idle")}>Keep it</button>
          <button className={`${s.button} ${c.dangerSolid}`} onClick={() => { onCancel(); setMode("idle"); }}>Cancel appointment</button>
        </div>
      </section>}

      <button className={`${s.button} ${s.full}`} onClick={onOpenChat}><Icon name="chat" size={18} /> Open chat</button>
    </div>
  );
}

function BookingSheet({ title, confirmLabel, busy, initialShowroom, hint, onCancel, onConfirm }: {
  title: string;
  confirmLabel: string;
  busy: BusyFor;
  initialShowroom?: string;
  hint?: string;
  onCancel: () => void;
  onConfirm: (showroomId: string, start: string) => void;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i + 1); d.setHours(0, 0, 0, 0); return d; }), []);
  const [showroom, setShowroom] = useState(initialShowroom ?? demoShowrooms[0].id);
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const { room, mine } = busy(showroom);

  return (
    <section className={c.sheet} aria-label={title}>
      <h3>{title}</h3>
      {hint && <p className={s.caption}>{hint}</p>}
      <label className={s.field}><span>Showroom</span>
        <select value={showroom} onChange={e => { setShowroom(e.target.value); setSlot(null); }}>
          {demoShowrooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <div className={c.days}>
        {days.map((d, i) => (
          <button key={i} className={c.chip} aria-pressed={day === i} onClick={() => { setDay(i); setSlot(null); }}>{dayLabel(d.toISOString())}</button>
        ))}
      </div>
      <div className={c.slots}>
        {daySlots(days[day]).map(start => {
          const roomClash = slotClash(start, 60, room);
          const myClash = slotClash(start, 60, mine);
          const clash = roomClash ?? myClash;
          return <button key={start} className={c.slot} disabled={!!clash} aria-pressed={slot === start}
            title={clash?.label} onClick={() => setSlot(start)}>
            {time(start)}
            {clash && <small>{roomClash ? "Showroom full" : "You're busy"}</small>}
          </button>;
        })}
      </div>
      <div className={c.sheetActions}>
        <button className={s.button} onClick={onCancel}>Back</button>
        <button className={`${s.button} ${s.primary}`} disabled={!slot} onClick={() => slot && onConfirm(showroom, slot)}>{confirmLabel}</button>
      </div>
    </section>
  );
}

function LostSheet({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (lost: CrmLost) => void }) {
  const [reason, setReason] = useState<CrmLostReason | null>(null);
  const [note, setNote] = useState("");
  const ready = lostReasonComplete(reason, note);
  return (
    <section className={c.sheet} aria-label="Why was this lead lost?">
      <h3>Why was this lead lost?</h3>
      <div className={c.reasons} role="radiogroup" aria-label="Lost reason">
        {CRM_LOST_REASONS.map(r => (
          <button key={r.value} role="radio" aria-checked={reason === r.value} className={c.chip} onClick={() => setReason(r.value)}>{r.label}</button>
        ))}
      </div>
      {reason === "other" && <label className={s.field}><span>What happened?</span>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Moving overseas" autoFocus />
      </label>}
      <div className={c.sheetActions}>
        <button className={s.button} onClick={onCancel}>Cancel</button>
        <button className={`${s.button} ${s.primary}`} disabled={!ready} onClick={() => reason && onConfirm({ reason, note })}>Mark as Lost</button>
      </div>
    </section>
  );
}
