"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CRM_LOST_REASONS, CRM_STATUSES, clipLength, autoRepliesFor, DEFAULT_AUTO_REPLIES, URGENCY_LABELS,
  appointmentRate, appointmentSlots, showUpRate, applyAutoFollowUp, cancelAppointment, crmStatusLabel, daySlots,
  lostReasonComplete, lostReasonLabel, markAttended, previousLabel, receiveCustomerMessage, replyUrgency,
  rescheduleAppointment, setLeadStatus, slotClash, sortByUrgency, statusAfterCancel, statusAfterReply, waitingLabel,
  type CrmAppointment, type CrmBusySlot, type CrmLead, type CrmLost, type CrmLostReason,
  type CrmAttachment, type CrmAutoReplySettings, type CrmShowroom, type CrmMessage, type CrmStatus, type CrmUrgency,
} from "@/lib/member/crm";
import { detectRequestedTime } from "@/lib/member/crm-datetime";
import { crmDemo, crmTeamDemo, demoShowrooms } from "@/lib/member/crm-demo";
import {
  ROLE_LABELS, allTeams, assignsAds, canReassign, canReply, hasDownlines, leadsHeld, setsFullTime, takesEnquiries, pickInTeam, teamHandlers, teamOf, visibleLeads, visibleMembers,
  type CrmAssignConfig, type CrmAssignment, type CrmMember,
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
import { apptLabel, dayLabel, openShowrooms, roomName, setShowroomList, time, whenLabel } from "./crm-format";
import MemberCrmShowrooms from "./MemberCrmShowrooms";
import { crmWrite, fetchCrm, sendCrmReply, type CrmWrite } from "@/app/(member)/member/crm-actions";
import { windowOpen } from "@/lib/whatsapp/send";
import { messengerWindow } from "@/lib/messenger/send";

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
export default function MemberCrm({ salesperson = "your salesperson", onExit, live = false }: {
  salesperson?: string;
  onExit?: () => void;
  /**
   * The signed-in member's real CRM, read and written under their own session
   * (crm-actions.ts). Every change is saved first and shown only once the
   * database said yes. Not yet on live: photos/voice, templates, auto-replies,
   * and telling the customer about an appointment. Without it, the demo (the preview page).
   */
  live?: boolean;
}) {
  const demo = useMemo(() => crmDemo(), []);
  const [leads, setLeads] = useState<CrmLead[]>(() => (live ? [] : applyAutoFollowUp(demo.leads)));
  const [appointments, setAppointments] = useState<CrmAppointment[]>(live ? [] : demo.appointments);
  const [load, setLoad] = useState<{ state: "loading" | "ready"; setup?: "not_linked" | "no_role" | null } | { state: "error"; error: string }>({ state: live ? "loading" : "ready" });
  // Live replies: one at a time, and why the last one failed.
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  // Live: why the last save failed (shown above the screen until the next one).
  const [liveError, setLiveError] = useState("");
  // Live settings save a moment after the last change, one save per thing changed.
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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
  // The people, as state: the HOD may switch an RS between full time and part time.
  const [members, setMembers] = useState<CrmMember[]>(live ? [] : team.members);
  const [viewerId, setViewerId] = useState(live ? "" : "a1");
  const [showrooms, setShowrooms] = useState<CrmShowroom[]>(live ? [] : demoShowrooms);
  // The format helpers name showrooms from this list (crm-format.ts) — hand it over before anything below renders.
  setShowroomList(showrooms);
  const [config, setConfig] = useState<CrmAssignConfig>(live ? { rules: [], teamRatios: {}, teams: {} } : team.config);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  // Before live data arrives (or for someone with no CRM role) there is nobody to look through: see the guard below.
  const viewer: CrmMember = members.find(m => m.id === viewerId) ?? members[0] ?? { id: "", name: salesperson, role: "rs" };
  const nameOf = (id: string) => members.find(m => m.id === id)?.name ?? "—";
  // Everything below works on what the viewer may see: an RS their own leads,
  // anyone above their whole downline's, the Boss everyone's.
  const visible = visibleLeads(viewer, members, leads);
  const visibleIds = new Set(visible.map(l => l.id));
  const visibleAppts = appointments.filter(a => visibleIds.has(a.leadId));

  function viewAs(id: string) {
    const next = members.find(m => m.id === id);
    setViewerId(id);
    setView({ kind: "tab" });
    setBooking(false);
    setTeamFilter(null);
    setInboxScope("all");
    setMemberPick([]);
    if (next && !hasDownlines(next, members) && tab === "team") setTab("inbox");
  }

  /**
   * The Boss or HOD sends an enquiry to a team — one no team took, or one moved
   * from another team. The team's own rules then pick who gets it: Fri–Sun a
   * full-time RS in turn, Mon–Thu the TL's % or the TL's "To assign" list.
   */
  async function sendToTeam(leadId: string, tlId: string) {
    const tl = members.find(m => m.id === tlId);
    let picked = pickInTeam(tlId, new Date(), config, leadsHeld(leads.filter(l => l.id !== leadId)), members);
    // Live: the database deals it by the team's saved rules and says who it went to.
    if (live) {
      const saved = await persist("crm_send_to_team", { p_contact: leadId, p_tl: tlId });
      if (!saved.ok) return;
      const r = saved.data as { member: string | null; how: CrmAssignment["memberBy"] };
      picked = { memberId: r.member, memberBy: r.how };
    }
    const { memberId, memberBy } = picked;
    const how = memberBy === "weekend" ? "Fri–Sun: full-time RS in turn" : memberBy === "ratio" ? `by ${firstName(tl?.name ?? "")}'s %`
      : memberBy === "no_full_time" ? "no full-time RS this weekend" : memberBy === "no_shares" ? "nobody has a %" : "Mon–Thu by hand";
    updateLead(leadId, l => ({
      ...l, teamId: tlId, assignedTo: memberId ?? undefined,
      messages: [...l.messages, systemNote(`Sent to ${tl?.teamName ?? "a team"} by ${nameOf(viewer.id)}. ${memberId
        ? `Assigned to ${nameOf(memberId)} (${how}).` : `Waits in ${firstName(tl?.name ?? "the TL")}'s To assign list (${how}).`}`)],
    }));
  }

  /**
   * Live: send a reply on WhatsApp. It shows only once the server says it went
   * AND was kept — never before — and the draft stays if it did not.
   */
  async function sendLive(leadId: string, text: string): Promise<boolean> {
    setSending(true);
    setSendError("");
    const result = await sendCrmReply(leadId, text);
    setSending(false);
    if (!result.ok) { setSendError(result.error); return false; }
    updateLead(leadId, l => ({
      ...l,
      status: statusAfterReply(l.status),
      unread: l.assignedTo === viewer.id ? 0 : l.unread,
      messages: [...l.messages, result.message],
    }));
    return true;
  }

  /**
   * Live: save first, change the screen only once the database said yes; on
   * no, say why above the screen and change nothing. The demo just changes.
   */
  async function persist(write: CrmWrite, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false }> {
    if (!live) return { ok: true, data: null };
    setLiveError("");
    const result = await crmWrite(write, args);
    if (!result.ok) { setLiveError(result.error); return { ok: false }; }
    return result;
  }

  /** The Boss / HOD add, rename, close or reopen a showroom (id null = a new one). */
  async function saveShowroom(id: string | null, name: string, active: boolean): Promise<boolean> {
    const saved = await persist("crm_save_showroom", { p_id: id, p_name: name, p_active: active });
    if (!saved.ok) return false;
    const row = saved.data as { id: string; name: string; active: boolean } | null;
    const next: CrmShowroom = row ? { id: row.id, name: row.name, active: row.active } : { id: id ?? crypto.randomUUID(), name: name.trim(), active };
    setShowrooms(list => (list.some(r => r.id === next.id) ? list.map(r => (r.id === next.id ? next : r)) : [...list, next]));
    return true;
  }

  /** The HOD sets who is full time (takes Fri–Sun enquiries). */
  async function setFullTime(staffId: string, on: boolean) {
    if (!(await persist("crm_set_full_time", { p_staff: staffId, p_full_time: on })).ok) return;
    setMembers(list => list.map(m => (m.id === staffId ? { ...m, fullTime: on } : m)));
  }

  /**
   * A settings change: on screen at once; live, saved a moment after the last
   * keystroke — one save per thing that changed (a team's rules, the split, an ad).
   */
  function changeConfig(next: CrmAssignConfig) {
    const prev = config;
    setConfig(next);
    if (!live) return;
    const later = (key: string, write: CrmWrite, args: () => Record<string, unknown>) => {
      clearTimeout(saveTimers.current[key]);
      saveTimers.current[key] = setTimeout(() => { void persist(write, args()); }, 600);
    };
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    for (const [tlId, st] of Object.entries(next.teams)) {
      const was = prev.teams[tlId];
      if (was && same({ ...was, editedBy: null }, { ...st, editedBy: null })) continue;
      later(`team:${tlId}`, "crm_save_team_settings", () => ({ p_tl: tlId, p_percent_days: st.percentDays, p_weekend_full_time: st.weekendFullTime, p_ratios: st.ratios }));
    }
    if (!same(prev.teamRatios, next.teamRatios)) later("shares", "crm_save_team_shares", () => ({ p_shares: next.teamRatios }));
    const ads = new Set([...prev.rules, ...next.rules].map(r => r.adName));
    for (const ad of ads) {
      const before = prev.rules.find(r => r.adName === ad)?.tlIds ?? [];
      const after = next.rules.find(r => r.adName === ad)?.tlIds ?? [];
      if (same(before, after)) continue;
      // Rules are kept by the Meta ad id; the screen shows the ad's name.
      const adId = leads.find(l => l.adName === ad)?.campaign;
      if (!adId) { setLiveError(`Could not find the ad "${ad}".`); continue; }
      later(`ad:${adId}`, "crm_save_ad_rule", () => ({ p_ad: adId, p_label: ad, p_tls: after }));
    }
  }

  /** A TL hands a lead to someone in their team (or takes it back from one). */
  async function assign(leadId: string, memberId: string) {
    if (!(await persist("crm_assign_member", { p_contact: leadId, p_member: memberId })).ok) return;
    updateLead(leadId, l => ({
      ...l, assignedTo: memberId, teamId: teamOf(memberId, members) ?? l.teamId,
      messages: [...l.messages, systemNote(`Assigned to ${nameOf(memberId)} by ${nameOf(viewer.id)}.`)],
    }));
  }

  // The clock behind the colours: every minute the waits grow, and a New lead
  // left unanswered past 24 opening hours moves to Follow up.
  useEffect(() => {
    const tick = setInterval(() => {
      const t = new Date();
      setNow(t);
      // On live data a status changes only when it is saved; the demo moves New leads itself.
      if (!live) setLeads(list => applyAutoFollowUp(list, t));
    }, 60_000);
    return () => clearInterval(tick);
  }, [live]);

  // Live: read once on opening, under the member's own session.
  useEffect(() => {
    if (!live) return;
    let current = true;
    fetchCrm().then(result => {
      if (!current) return;
      if (!result.ok) { setLoad({ state: "error", error: result.error }); return; }
      setMembers(result.data.members);
      setViewerId(result.data.viewerId ?? "");
      setLeads(result.data.leads);
      setAppointments(result.data.appointments);
      setConfig(result.data.config);
      setShowrooms(result.data.showrooms);
      setLoad({ state: "ready", setup: result.data.setup });
    });
    return () => { current = false; };
  }, [live]);

  // Live and not ready: loading, an error, or a person the CRM does not know yet.
  if (live && (load.state !== "ready" || !members.some(m => m.id === viewerId))) {
    return <div className={c.app}>
      <header className={c.appTop}>
        {onExit && <button className={c.back} onClick={onExit} aria-label="Back to the Revenue app"><Icon name="back" size={20} /></button>}
        <span className={c.appBrand}>HOUZS <strong>CRM</strong></span>
      </header>
      <main className={c.appMain}>
        <section className={s.card} aria-live="polite">
          {load.state === "loading" && <p className={s.sub}>Loading your customers…</p>}
          {load.state === "error" && <><h2>The CRM could not open</h2><p className={s.sub}>{load.error}</p></>}
          {load.state === "ready" && <>
            <h2>Your CRM is not set up yet</h2>
            {/* Say which link is missing, so the administrator knows what to fix. */}
            <p className={s.sub}>{load.setup === "no_role"
              ? "Your job title has no role in the CRM. The CRM is for the Revenue team (TL, TA, RS and their leaders); if you should be in it, ask your administrator to check your title in People."
              : "Your login is not linked to your employee record in People yet. Once your administrator links them, your customers appear here."}</p>
          </>}
        </section>
      </main>
    </div>;
  }

  // "mine" is the calendar of the salesperson who owns the lead — a leader
  // booking for Farah books into Farah's day, not their own.
  // Live: only real appointments fill a calendar — never the demo's made-up bookings.
  const busyFor = (exceptId?: string, ownerId: string | undefined = viewerId): BusyFor => roomId => ({
    room: [...(live ? [] : demo.showroomBusy[roomId] ?? []), ...appointmentSlots(appointments.filter(a => a.showroomId === roomId), "Showroom booked", exceptId)],
    mine: [...(!live && ownerId === "a1" ? demo.myBusy : []),
      ...appointmentSlots(appointments.filter(a => leads.find(l => l.id === a.leadId)?.assignedTo === ownerId), "Calendar: appointment", exceptId)],
  });

  const updateLead = (id: string, change: (lead: CrmLead) => CrmLead) =>
    setLeads(list => list.map(l => (l.id === id ? change(l) : l)));
  const note = (leadId: string, text: string, kind?: CrmMessage["kind"]) =>
    updateLead(leadId, l => ({ ...l, messages: [...l.messages, systemNote(text, kind)] }));

  function openLead(id: string, fromMember?: string) {
    // Only the salesperson's own opening clears their unread count; a leader looking in leaves it.
    const lead = leads.find(l => l.id === id);
    if (lead?.assignedTo === viewer.id) {
      updateLead(id, l => ({ ...l, unread: 0 }));
      if (live && lead.unread > 0) void crmWrite("crm_mark_read", { p_contact: id }); // nothing to undo if it fails
    }
    setBooking(false);
    setView({ kind: "chat", leadId: id, fromMember });
  }

  /** A reply from the viewer: tagged with who wrote it when it is not the lead's own salesperson. */
  const reply = (lead: CrmLead, part: Pick<CrmMessage, "text" | "attachment">): CrmMessage => ({
    id: crypto.randomUUID(), from: "me", at: new Date().toISOString(), ...part,
    ...(lead.assignedTo !== viewer.id ? { by: viewer.id } : {}),
  });

  // Live sends the customer nothing about appointments yet; the notes must not say it did.
  const tellThem = live ? " Not sent to the customer — tell them in the chat." : "";

  async function book(leadId: string, showroomId: string, start: string) {
    let appt: CrmAppointment = { id: crypto.randomUUID(), leadId, showroomId, start, minutes: 60, state: "booked" };
    if (live) {
      const saved = await persist("crm_book", { p_contact: leadId, p_showroom: showroomId, p_start: start, p_minutes: 60 });
      if (!saved.ok) return;
      appt = { ...appt, id: (saved.data as { id: string }).id };
    }
    setAppointments(list => [...list, appt]);
    updateLead(leadId, l => ({
      ...setLeadStatus(l, "appointment"),
      messages: [...l.messages,
        systemNote(`Appointment booked: ${apptLabel(appt)}. Added to the showroom calendar and yours.${tellThem}`, "booking"),
        // The demo shows the card the customer would receive; live does not send one yet.
        ...(live ? [] : [{ id: crypto.randomUUID(), from: "me" as const, text: "", at: new Date().toISOString(), card: { start, showroom: roomName(showroomId) } }]),
      ],
    }));
    setBooking(false);
  }

  async function reschedule(appt: CrmAppointment, start: string, showroomId: string) {
    if (!(await persist("crm_move_appointment", { p_appointment: appt.id, p_start: start, p_showroom: showroomId })).ok) return;
    const moved = rescheduleAppointment(appt, start, showroomId);
    setAppointments(list => list.map(a => (a.id === appt.id ? moved : a)));
    updateLead(appt.leadId, l => ({ ...l, messages: [...l.messages,
      systemNote(`Appointment changed to ${apptLabel(moved)}.${tellThem}`, "booking"),
      ...(live ? [] : [{ id: crypto.randomUUID(), from: "me" as const, text: "", at: new Date().toISOString(), card: { start, showroom: roomName(showroomId) } }]),
    ] }));
  }

  async function cancel(appt: CrmAppointment) {
    if (!(await persist("crm_set_appointment_state", { p_appointment: appt.id, p_state: "cancelled" })).ok) return;
    const next = appointments.map(a => (a.id === appt.id ? cancelAppointment(a) : a));
    setAppointments(next);
    updateLead(appt.leadId, l => ({
      ...l, status: statusAfterCancel(l, next),
      messages: [...l.messages, systemNote(`Appointment on ${dayLabel(appt.start)}, ${time(appt.start)} cancelled.${live ? tellThem : " Customer notified."} Back to Follow up.`)],
    }));
  }

  async function showedUp(appt: CrmAppointment) {
    if (!(await persist("crm_set_appointment_state", { p_appointment: appt.id, p_state: "attended" })).ok) return;
    setAppointments(list => list.map(a => (a.id === appt.id ? markAttended(a) : a)));
    note(appt.leadId, `Customer showed up on ${dayLabel(appt.start)}, ${time(appt.start)}.`);
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
      body = <AppointmentDetail appt={appt} lead={lead} busy={busyFor(appt.id, lead.assignedTo)} readOnly={!canReply(viewer, lead, members)} live={live}
        onBack={() => setView({ kind: "tab" })}
        onOpenChat={() => { setTab("inbox"); openLead(lead.id); }}
        onShowUp={() => void showedUp(appt)}
        onChange={(start, room) => void reschedule(appt, start, room)}
        onCancel={() => void cancel(appt)} />;
    }
  }

  // ── Conversation ──────────────────────────────────────────────────────────
  if (view.kind === "chat") {
    const lead = visible.find(l => l.id === view.leadId);
    const fromMember = view.fromMember;
    if (lead) {
      inDetail = true;
      // Live: free replies only inside Meta's 24-hour window; the rest (booking, Won/Lost) works any time.
      const mayReply = canReply(viewer, lead, members);
      // WhatsApp: 24 hours. Messenger: 24 hours, then up to 7 days as a person (the Human Agent tag).
      const onMessenger = lead.channel === "messenger";
      const mWindow = messengerWindow(lead.lastCustomerAt, now);
      const windowShut = live && (onMessenger ? mWindow === "shut" : !windowOpen(lead.lastCustomerAt, now));
      const windowNote = !live || !mayReply ? undefined
        : windowShut ? (onMessenger
          ? "More than 7 days since the customer's last message — Messenger no longer allows a reply. Call them instead."
          : "More than 24 hours since the customer's last message — WhatsApp only allows an approved template now (templates come later).")
          : onMessenger && mWindow === "human_agent" ? "Over 24 hours: Messenger allows a reply from a person (Human Agent) until 7 days." : undefined;
      body = <Conversation
        lead={lead}
        now={now}
        appointments={appointments.filter(a => a.leadId === lead.id)}
        salesperson={lead.assignedTo ? nameOf(lead.assignedTo) : "Not assigned yet"}
        viewer={viewer}
        nameOf={nameOf}
        readOnly={!mayReply}
        demoTools={!live}
        notice={windowNote}
        canCompose={mayReply && !windowShut}
        composer={live ? { textOnly: true, sending, error: sendError } : undefined}
        moveTo={assignsAds(viewer) ? allTeams(members) : undefined}
        onMoveTeam={tlId => void sendToTeam(lead.id, tlId)}
        reassignTo={canReassign(viewer, lead, members) ? teamHandlers(lead.teamId ?? teamOf(lead.assignedTo ?? "", members) ?? "", members) : undefined}
        onReassign={memberId => void assign(lead.id, memberId)}
        onBack={() => { setView(fromMember ? { kind: "member", memberId: fromMember } : { kind: "tab" }); setBooking(false); }}
        onOpenAppointment={id => { setTab("calendar"); openAppointment(id); }}
        onStatus={async (status, lost) => {
          if (!(await persist("crm_set_status", { p_contact: lead.id, p_status: status, p_reason: lost?.reason ?? null, p_note: lost?.note ?? null })).ok) return;
          updateLead(lead.id, l => {
            const next = setLeadStatus(l, status, lost);
            return lost ? { ...next, messages: [...next.messages, systemNote(`Marked Lost: ${lostReasonLabel(lost)}.`)] } : next;
          });
        }}
        onAttachment={attachment => updateLead(lead.id, l => ({
          ...l,
          status: statusAfterReply(l.status),
          messages: [...l.messages, reply(l, { text: "", attachment })],
        }))}
        onSend={text => (live ? sendLive(lead.id, text) : updateLead(lead.id, l => ({
          ...l,
          status: statusAfterReply(l.status),
          messages: [...l.messages, reply(l, { text })],
        })))}
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
        onBook={(room, start) => void book(lead.id, room, start)}
        onReschedule={(appt, start) => void reschedule(appt, start, appt.showroomId)}
      />;
    }
  }

  const manager = hasDownlines(viewer, members);
  // Assignment is for those who set it: Boss, HOD (and a Senior TL, read only) and each TL.
  const seesAssignment = manager && viewer.role !== "ta";

  // ── One person, from Team ─────────────────────────────────────────────────
  if (view.kind === "member" && manager) {
    const member = members.find(m => m.id === view.memberId);
    // Only someone in the viewer's own downline — a TL never opens another TL's team.
    if (member && visibleMembers(viewer, members).some(m => m.id === member.id)) {
      inDetail = true;
      body = <MemberCrmMember member={member} members={members} leads={visible} appointments={visibleAppts}
        now={now} viewer={viewer} stepIn={canReply(viewer, { assignedTo: member.id }, members)} nameOf={nameOf}
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
      {/* The HOD decides who is full time: only full-time RS take Friday–Sunday enquiries. */}
      {setsFullTime(viewer) && <section className={s.card} aria-label="Full time or part time">
        <h2>Full time / Part time</h2>
        <p className={s.caption}>Only full-time RS take Friday–Sunday enquiries, in turn within their team.</p>
        {allTeams(members).map(tl => <div key={tl.id} className={c.rule}>
          <strong>{tl.teamName} <small className={s.caption}>· {tl.name}</small></strong>
          {teamHandlers(tl.id, members).filter(m => m.role === "rs").map(rs => <label key={rs.id} className={c.ruleTop}>
            <span>{rs.name}</span>
            <span className={c.switch}>
              <input type="checkbox" checked={!!rs.fullTime} onChange={e => void setFullTime(rs.id, e.target.checked)} />
              {rs.fullTime ? "Full time" : "Part time"}
            </span>
          </label>)}
        </div>)}
      </section>}
      {/* The Boss and HOD keep the showroom list: a new one opens here and every booking list follows. */}
      {assignsAds(viewer) && <MemberCrmShowrooms showrooms={showrooms} onSave={saveShowroom} />}
      {!live ? <MemberCrmAutoReplies settings={autoReplies} onChange={setAutoReplies} /> : <p className={c.demoNote}><Icon name="info" size={16} /> Auto-replies are coming soon on live data.</p>}
    </div>;
  }

  // ── Assignment, from Settings ─────────────────────────────────────────────
  if (view.kind === "assignment" && seesAssignment) {
    inDetail = true;
    body = <MemberCrmAssignment viewer={viewer} members={members} readOnly={false}
      ads={[...new Set(leads.map(l => l.adName))].sort()} config={config} onConfig={changeConfig}
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
    ...visibleMembers(viewer, members).filter(m => m.id !== viewer.id && membersOnly.some(l => l.assignedTo === m.id)).map(m => ({ id: m.id, label: firstName(m.name) })),
    ...(membersOnly.some(l => !l.assignedTo) ? [{ id: "", label: "To assign" }] : []),
  ];
  // The Boss, HOD (and a Senior TL) narrow by team instead — the same choice as on the Team tab. "" = no team yet.
  const byTeam = manager && !takesEnquiries(viewer);
  const teamOfLead = (l: CrmLead) => l.teamId ?? (l.assignedTo ? teamOf(l.assignedTo, members) : undefined) ?? "";
  const teamChoices = byTeam ? [
    ...allTeams(members).filter(t => visibleMembers(viewer, members).some(m => m.id === t.id)),
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
      <p className={c.demoNote}><Icon name="info" size={16} /> {live ? "Live · read only for now — replying from the CRM arrives next" : "Demo data · not connected to Meta yet"}</p>
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
    body = <MemberCrmTeam viewer={viewer} members={members} leads={visible} appointments={visibleAppts} now={now}
      teamFilter={teamFilter} onTeamFilter={setTeamFilter}
      onOpenMember={id => setView({ kind: "member", memberId: id })} onOpenLead={id => openLead(id)}
      onAssign={(id, m) => void assign(id, m)} onSendToTeam={(id, tl) => void sendToTeam(id, tl)} />;
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
      {manager ? <MemberCrmPerformance viewer={viewer} members={members} leads={visible} appointments={visibleAppts} now={now} /> : <div className={c.stats}>
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
      <p className={c.demoNote}><Icon name="info" size={16} /> {live ? "Live · read only for now — replying from the CRM arrives next" : "Demo data · not connected to Meta yet"}</p>
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
  const demoViewers = ["boss", "hod", "lkv", "lnt", "a2", "a1"].map(id => members.find(m => m.id === id)).filter((m): m is CrmMember => !!m);

  return (
    <div className={c.app}>
      {!inDetail && <header className={c.appTop}>
        {onExit && <button className={c.back} onClick={onExit} aria-label="Back to the Revenue app"><Icon name="back" size={20} /></button>}
        <span className={c.appBrand}>HOUZS <strong>CRM</strong></span>
        {/* Demo only: until sign-in decides the role, try the CRM as each of them. */}
        {!live && <label className={c.roleSwitch}><span>Demo as</span>
          <select value={viewer.id} onChange={e => viewAs(e.target.value)} aria-label="Demo: view the CRM as">
            {demoViewers.map(m => <option key={m.id} value={m.id}>
              {ROLE_LABELS[m.role]} · {firstName(m.name)}{m.teamName ? ` (${m.teamName})` : ""}
            </option>)}
          </select>
        </label>}
        <button className={live ? c.appGear : c.back} onClick={() => setView({ kind: "settings" })} aria-label="Settings"><Icon name="gear" size={20} /></button>
      </header>}
      <main className={c.appMain}>
        {liveError && <p className={c.composerProblem} role="alert">{liveError} <button className={c.linkButton} onClick={() => setLiveError("")}>Dismiss</button></p>}
        {body}
      </main>
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

function Conversation({ lead, now, appointments, salesperson, viewer, nameOf, readOnly, notice, demoTools = true, canCompose, composer, reassignTo, onReassign, moveTo, onMoveTeam, onBack, onOpenAppointment, onStatus, onSend, onAttachment, onCustomerMessage, booking, onBooking, busy, onBook, onReschedule }: {
  lead: CrmLead;
  now: Date;
  appointments: CrmAppointment[];
  /** The lead's own salesperson. */
  salesperson: string;
  viewer: CrmMember;
  nameOf: (memberId: string) => string;
  /** The Boss and HOD read chats but never reply, book or close a lead. */
  readOnly: boolean;
  /** Why it is read only when it is not the Boss/HOD rule (live data before sending is built). */
  /** Something the person must know before writing (live: past the 24-hour window). */
  notice?: string;
  /** The demo's stand-in for a customer's message; never on live data. */
  demoTools?: boolean;
  /** Whether the reply box shows, when that differs from readOnly (live: replying works, the rest does not yet). */
  canCompose?: boolean;
  /** Live: text only, the send in flight, and why the last one failed. */
  composer?: { textOnly: boolean; sending: boolean; error: string };
  /** The team's people, when the viewer is its TL and may hand the lead to someone else. */
  reassignTo?: CrmMember[];
  onReassign: (memberId: string) => void;
  /** Every TL, when the viewer is the Boss or HOD and may send the lead to another team. */
  moveTo?: CrmMember[];
  onMoveTeam: (tlId: string) => void;
  onBack: () => void;
  onOpenAppointment: (id: string) => void;
  onStatus: (status: CrmStatus, lost?: CrmLost) => void;
  onSend: (text: string) => void | Promise<boolean>;
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
  const room = active?.showroomId ?? openShowrooms()[0]?.id ?? "";
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
      {notice && <p className={c.waitBanner} data-urgency="soon" role="status">{notice}</p>}
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
            {m.attachment?.kind === "file" && <a className={c.fileLink} href={m.attachment.url} download><Icon name="file" size={16} /> {m.attachment.name ?? "Document"}</a>}
            {m.text && <p>{m.text}</p>}
            <span>{whenLabel(m.at)}{m.status && m.status !== "failed" && <> · {m.status === "sent" ? "✓" : m.status === "delivered" ? "✓✓" : "✓✓ Read"}</>}</span>
            {m.status === "failed" && <small className={c.failedTag} role="status">Not delivered{m.error ? ` — ${m.error}` : ""}</small>}
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

      {(canCompose ?? !readOnly) && <MemberCrmComposer placeholder={`Reply to ${lead.name.split(" ")[0]}…`} onText={onSend} onAttachment={onAttachment} {...composer} />}

      {/* Demo only: stands in for a message arriving from the customer. */}
      {!readOnly && demoTools && <details className={c.demoTool}>
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
function AppointmentDetail({ appt, lead, busy, readOnly, live = false, onBack, onOpenChat, onShowUp, onChange, onCancel }: {
  appt: CrmAppointment;
  lead: CrmLead;
  busy: BusyFor;
  /** The Boss and HOD see an appointment but never change it. */
  readOnly: boolean;
  /** Live: the customer is not told anything about appointments yet. */
  live?: boolean;
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
        hint={live ? "The customer is not told automatically yet — tell them in the chat." : "The customer is notified of the new time."}
        onCancel={() => setMode("idle")} onConfirm={(room, start) => { onChange(start, room); setMode("idle"); }} />}

      {booked && mode === "cancel" && <section className={c.sheet} aria-label="Cancel appointment">
        <h3>Cancel this appointment?</h3>
        <p className={s.sub}>The slot is freed on the showroom calendar and yours, {lead.name.split(" ")[0]} {live ? "goes back to Follow up — tell them in the chat" : "is notified and goes back to Follow up"}.</p>
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
  const open = openShowrooms();
  const [showroom, setShowroom] = useState(initialShowroom && open.some(r => r.id === initialShowroom) ? initialShowroom : open[0]?.id ?? "");
  const [day, setDay] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const { room, mine } = busy(showroom);

  return (
    <section className={c.sheet} aria-label={title}>
      <h3>{title}</h3>
      {hint && <p className={s.caption}>{hint}</p>}
      <label className={s.field}><span>Showroom</span>
        <select value={showroom} onChange={e => { setShowroom(e.target.value); setSlot(null); }}>
          {open.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          {!open.length && <option value="">No showroom is open</option>}
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
