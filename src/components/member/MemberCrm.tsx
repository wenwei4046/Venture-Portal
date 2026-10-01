"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CRM_LOST_REASONS, CRM_STATUSES, messagePreview, clipLength, autoRepliesFor, DEFAULT_AUTO_REPLIES, URGENCY_LABELS,
  appointmentRate, appointmentSlots, showUpRate, applyAutoFollowUp, cancelAppointment, crmStatusLabel, daySlots,
  lostReasonComplete, lostReasonLabel, markAttended, previousLabel, receiveCustomerMessage, replyUrgency,
  rescheduleAppointment, setLeadStatus, slotClash, sortByUrgency, statusAfterCancel, statusAfterReply, waitingLabel,
  type CrmAppointment, type CrmBusySlot, type CrmLead, type CrmLost, type CrmLostReason,
  type CrmAttachment, type CrmAutoReplySettings, type CrmMessage, type CrmStatus, type CrmUrgency,
} from "@/lib/member/crm";
import { detectRequestedTime } from "@/lib/member/crm-datetime";
import { crmDemo, demoShowrooms } from "@/lib/member/crm-demo";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { Icon, initials } from "./MemberUI";
import MemberCrmUpcoming from "./MemberCrmUpcoming";
import MemberCrmComposer from "./MemberCrmComposer";
import MemberCrmContacts from "./MemberCrmContacts";
import MemberCrmAutoReplies from "./MemberCrmAutoReplies";
import { apptLabel, dayLabel, roomName, time, whenLabel } from "./crm-format";

const systemNote = (text: string, kind?: CrmMessage["kind"]): CrmMessage =>
  ({ id: crypto.randomUUID(), from: "system", kind, text, at: new Date().toISOString() });

/** Which calendars a slot must be free on: the showroom's and the salesperson's own. */
type BusyFor = (showroomId: string) => { room: CrmBusySlot[]; mine: CrmBusySlot[] };

/** The CRM's own bottom bar: Inbox (leads and chats), Calendar (appointments), Profile (your numbers). */
type Tab = "inbox" | "contacts" | "calendar" | "profile" | "settings";
type View = { kind: "tab" } | { kind: "chat"; leadId: string } | { kind: "appointment"; appointmentId: string };

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
  const [autoReplies, setAutoReplies] = useState<CrmAutoReplySettings>(DEFAULT_AUTO_REPLIES);
  const [booking, setBooking] = useState(false);

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

  const busyFor = (exceptId?: string): BusyFor => roomId => ({
    room: [...(demo.showroomBusy[roomId] ?? []), ...appointmentSlots(appointments.filter(a => a.showroomId === roomId), "Showroom booked", exceptId)],
    mine: [...demo.myBusy, ...appointmentSlots(appointments, "Your calendar: appointment", exceptId)],
  });

  const updateLead = (id: string, change: (lead: CrmLead) => CrmLead) =>
    setLeads(list => list.map(l => (l.id === id ? change(l) : l)));
  const note = (leadId: string, text: string, kind?: CrmMessage["kind"]) =>
    updateLead(leadId, l => ({ ...l, messages: [...l.messages, systemNote(text, kind)] }));

  function openLead(id: string) {
    updateLead(id, l => ({ ...l, unread: 0 }));
    setBooking(false);
    setView({ kind: "chat", leadId: id });
  }

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
      body = <AppointmentDetail appt={appt} lead={lead} busy={busyFor(appt.id)}
        onBack={() => setView({ kind: "tab" })}
        onOpenChat={() => { setTab("inbox"); openLead(lead.id); }}
        onShowUp={() => { setAppointments(list => list.map(a => (a.id === appt.id ? markAttended(a) : a))); note(lead.id, `Customer showed up on ${dayLabel(appt.start)}, ${time(appt.start)}.`); }}
        onChange={(start, room) => reschedule(appt, start, room)}
        onCancel={() => cancel(appt)} />;
    }
  }

  // ── Conversation ──────────────────────────────────────────────────────────
  if (view.kind === "chat") {
    const lead = leads.find(l => l.id === view.leadId);
    if (lead) {
      inDetail = true;
      body = <Conversation
        lead={lead}
        now={now}
        appointments={appointments.filter(a => a.leadId === lead.id)}
        salesperson={salesperson}
        onBack={() => { setView({ kind: "tab" }); setBooking(false); }}
        onOpenAppointment={id => { setTab("calendar"); openAppointment(id); }}
        onStatus={(status, lost) => updateLead(lead.id, l => {
          const next = setLeadStatus(l, status, lost);
          return lost ? { ...next, messages: [...next.messages, systemNote(`Marked Lost: ${lostReasonLabel(lost)}.`)] } : next;
        })}
        onAttachment={attachment => updateLead(lead.id, l => ({
          ...l,
          status: statusAfterReply(l.status),
          messages: [...l.messages, { id: crypto.randomUUID(), from: "me", text: "", attachment, at: new Date().toISOString() }],
        }))}
        onSend={text => updateLead(lead.id, l => ({
          ...l,
          status: statusAfterReply(l.status),
          messages: [...l.messages, { id: crypto.randomUUID(), from: "me", text, at: new Date().toISOString() }],
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
        busy={busyFor}
        onBook={(room, start) => book(lead.id, room, start)}
        onReschedule={(appt, start) => reschedule(appt, start, appt.showroomId)}
      />;
    }
  }

  const rate = appointmentRate(leads, appointments);
  const showUp = showUpRate(appointments, now);
  const needsReply = leads.filter(l => l.unread > 0 || replyUrgency(l, now).level !== "none").length;
  const upcomingCount = appointments.filter(a => a.state === "booked" && new Date(a.start) > now).length;

  // ── Inbox ─────────────────────────────────────────────────────────────────
  if (!inDetail && tab === "inbox") {
    const shown = sortByUrgency(leads.filter(l => filter === "all" || l.status === filter), now);
    const waiting = (level: CrmUrgency) => leads.filter(l => replyUrgency(l, now).level === level).length;
    body = <>
      <div className={c.tabTitle}><h1>Inbox</h1><p className={s.sub}>Leads from Meta ads · {needsReply} waiting for you</p></div>
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
              {f.label}{f.value !== "all" && ` ${leads.filter(l => l.status === f.value).length}`}
            </button>
          ))}
        </div>
        {filter === "lost" && shown.length > 0 && <div className={c.lostSummary} aria-label="Why leads were lost">
          {CRM_LOST_REASONS.map(r => ({ r, n: shown.filter(l => l.lost?.reason === r.value).length })).filter(x => x.n > 0)
            .map(({ r, n }) => <span key={r.value}>{r.label} <strong>{n}</strong></span>)}
        </div>}
        {shown.length === 0 && <p className={s.sub}>No leads with this status.</p>}
        {shown.map(lead => {
          const last = lead.messages[lead.messages.length - 1];
          const urgency = replyUrgency(lead, now);
          return <button key={lead.id} className={c.leadRow} data-urgency={urgency.level} onClick={() => openLead(lead.id)}>
            <span className={c.leadAvatar} aria-hidden="true">{initials(lead.name)}</span>
            <span className={c.leadBody}>
              <span className={c.leadTop}><strong>{lead.name}</strong><span className={s.caption}>{whenLabel(last?.at ?? lead.createdAt)}</span></span>
              <span className={c.leadAd}>{lead.adName}</span>
              <span className={c.leadPreview}>{last?.from === "me" ? "You: " : ""}{last && messagePreview(last)}</span>
              <span className={c.leadMeta}>
                <span className={c.status} data-status={lead.status}>{crmStatusLabel(lead.status)}{lead.lost && ` · ${lostReasonLabel(lead.lost)}`}</span>
                {lead.previous && <span className={c.previous}>{previousLabel(lead.previous)}</span>}
                {urgency.level !== "none" && <span className={c.waitBadge} data-urgency={urgency.level}>{URGENCY_LABELS[urgency.level]} · {waitingLabel(urgency.waitingMinutes)}</span>}
                {lead.unread > 0 && <span className={c.unread}>{lead.unread} new</span>}
              </span>
            </span>
          </button>;
        })}
      </section>
    </>;
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  if (!inDetail && tab === "contacts") {
    body = <>
      <div className={c.tabTitle}><h1>Contacts</h1><p className={s.sub}>{leads.length} customers from both pages</p></div>
      <MemberCrmContacts leads={leads} appointments={appointments} onOpen={id => { setTab("inbox"); openLead(id); }} />
    </>;
  }

  // ── Calendar ──────────────────────────────────────────────────────────────
  if (!inDetail && tab === "calendar") {
    const unmarked = appointments
      .filter(a => a.state === "booked" && new Date(a.start) <= now)
      .sort((a, b) => b.start.localeCompare(a.start));
    const recent = appointments
      .filter(a => a.state === "attended")
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, 5);
    const leadName = (a: CrmAppointment) => leads.find(l => l.id === a.leadId)?.name ?? "Lead";
    body = <>
      <div className={c.tabTitle}><h1>Calendar</h1><p className={s.sub}>{upcomingCount} upcoming · show-up rate {showUp.rate == null ? "—" : `${Math.round(showUp.rate * 100)}%`}</p></div>
      {unmarked.length > 0 && <section className={s.card} aria-label="Did they show up?">
        <h2>Did they show up?</h2>
        <p className={s.caption}>Past appointments not marked yet count as no-shows.</p>
        {unmarked.map(a => (
          <button key={a.id} className={`${s.listRow} ${s.listButton}`} onClick={() => openAppointment(a.id)}>
            <div className={s.listIcon}><Icon name="info" /><div><strong>{leadName(a)}</strong><p className={s.caption}>{apptLabel(a)}</p></div></div>
            <Icon name="chevron" size={16} />
          </button>
        ))}
      </section>}
      <MemberCrmUpcoming appointments={appointments} leads={leads} now={now} onOpen={openAppointment} />
      {upcomingCount === 0 && <section className={s.card}><p className={s.sub}>No upcoming appointments. Book one from a chat in Inbox.</p></section>}
      {recent.length > 0 && <section className={s.card} aria-label="Recent visits">
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

  // ── Profile ───────────────────────────────────────────────────────────────
  if (!inDetail && tab === "profile") {
    const lostLeads = leads.filter(l => l.status === "lost");
    body = <>
      <div className={c.profileHead}>
        <span className={c.profileAvatar} aria-hidden="true">{initials(salesperson)}</span>
        <div><h1>{salesperson}</h1><p className={s.sub}>Your CRM</p></div>
      </div>
      <div className={c.stats}>
        <div className={c.stat}><span>Leads</span><strong>{rate.leads}</strong></div>
        <div className={c.stat}><span>Appointments</span><strong>{rate.booked}</strong></div>
        <div className={c.stat}><span>Appt rate</span><strong>{rate.rate == null ? "—" : `${Math.round(rate.rate * 100)}%`}</strong><small>{rate.booked} of {rate.leads} leads</small></div>
        <div className={c.stat}><span>Show-up rate</span><strong>{showUp.rate == null ? "—" : `${Math.round(showUp.rate * 100)}%`}</strong><small>{showUp.due ? `${showUp.showed} of ${showUp.due} came` : "None due yet"}</small></div>
      </div>
      <section className={s.card} aria-label="Leads by status">
        <h2>Leads by status</h2>
        {CRM_STATUSES.map(st => {
          const n = leads.filter(l => l.status === st.value).length;
          return <div key={st.value} className={c.barRow}>
            <span className={c.status} data-status={st.value}>{st.label}</span>
            <span className={c.bar}><i style={{ width: `${leads.length ? (n / leads.length) * 100 : 0}%` }} /></span>
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

  // ── Settings ──────────────────────────────────────────────────────────────
  if (!inDetail && tab === "settings") {
    body = <>
      <div className={c.tabTitle}><h1>Settings</h1><p className={s.sub}>How your CRM works for you</p></div>
      <MemberCrmAutoReplies settings={autoReplies} onChange={setAutoReplies} />
    </>;
  }

  const tabs: { id: Tab; icon: string; label: string; badge?: number }[] = [
    { id: "inbox", icon: "chat", label: "Inbox", badge: needsReply },
    { id: "contacts", icon: "team", label: "Contacts" },
    { id: "calendar", icon: "calendar", label: "Calendar", badge: upcomingCount },
    { id: "profile", icon: "user", label: "Profile" },
    { id: "settings", icon: "gear", label: "Settings" },
  ];

  return (
    <div className={c.app}>
      {!inDetail && <header className={c.appTop}>
        {onExit && <button className={c.back} onClick={onExit} aria-label="Back to the Revenue app"><Icon name="back" size={20} /></button>}
        <span className={c.appBrand}>HOUZS <strong>CRM</strong></span>
      </header>}
      <main className={c.appMain}>{body}</main>
      <nav className={c.appNav} aria-label="CRM">
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

function Conversation({ lead, now, appointments, salesperson, onBack, onOpenAppointment, onStatus, onSend, onAttachment, onCustomerMessage, booking, onBooking, busy, onBook, onReschedule }: {
  lead: CrmLead;
  now: Date;
  appointments: CrmAppointment[];
  salesperson: string;
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
        <div className={c.menuWrap} ref={menuRef}>
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
        </div>
      </div>
      <p className={c.chatAd}><Icon name="target" size={14} /> {lead.adName}</p>
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

      {requestedIso && lastCustomer && !sameAsBooked && pickingFor !== lastCustomer.id && (
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

      {!active && !pickingFor && (booking
        ? <BookingSheet title="Book appointment" confirmLabel="Confirm" busy={busy()} onCancel={() => onBooking(false)} onConfirm={(r, start) => onBook(r, start)} />
        : <button className={`${s.button} ${s.primary} ${s.full}`} onClick={() => onBooking(true)}><Icon name="calendar" /> Book appointment</button>)}

      <MemberCrmComposer placeholder={`Reply to ${lead.name.split(" ")[0]}…`} onText={onSend} onAttachment={onAttachment} />

      {/* Demo only: stands in for a message arriving from the customer. */}
      <details className={c.demoTool}>
        <summary>Demo: send a message as {lead.name.split(" ")[0]}</summary>
        <div className={c.demoRow}>
          <input value={demoDraft} onChange={e => setDemoDraft(e.target.value)} placeholder="e.g. Can we change to Saturday 3pm?" aria-label="Customer message (demo)"
            onKeyDown={e => { if (e.key === "Enter" && demoDraft.trim()) { onCustomerMessage(demoDraft.trim()); setDemoDraft(""); } }} />
          <button className={s.button} disabled={!demoDraft.trim()} onClick={() => { onCustomerMessage(demoDraft.trim()); setDemoDraft(""); }}>Send</button>
        </div>
        <p className={s.caption}>To {salesperson}: this is how a customer&apos;s reply would arrive.</p>
      </details>
    </div>
  );
}

/** The salesperson's view of one appointment: showed up, change, cancel. */
function AppointmentDetail({ appt, lead, busy, onBack, onOpenChat, onShowUp, onChange, onCancel }: {
  appt: CrmAppointment;
  lead: CrmLead;
  busy: BusyFor;
  onBack: () => void;
  onOpenChat: () => void;
  onShowUp: () => void;
  onChange: (start: string, showroomId: string) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "change" | "cancel">("idle");
  const booked = appt.state === "booked";

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
