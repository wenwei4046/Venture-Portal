/**
 * A chat (design 3b): day pills, bubbles (ours peach), ✓✓ ticks (blue once
 * read), a quoted reply, our reaction, visit cards; tap a bubble for its tools
 * (Reply · Copy · React · Pin · Delete for me). The ⋮ menu: Share (own team,
 * they accept) · Move (direct superior, they accept) · Customer info ·
 * Appointment. Book visit: customer details (step 1 of 2), then showroom, day
 * (week strip or month) and the showroom's own slots — closed days and full
 * slots struck through. Composer: + (Photos · Document · Quick replies), "/"
 * for quick replies, send; after the reply window, approved templates only.
 */
import type { ChangeEvent, MouseEvent, PointerEvent as RPointerEvent, WheelEvent } from "react";
import { DEFAULT_QUICK_REPLIES, type CrmChatMessage, type CrmCustomer, type CrmRoom, type CrmVisit } from "@/lib/member/crm-data";
import { personOf, teamOf, teamName, downlineOf, jobTitle, titleOf } from "../../shared/people";
import { BORDER, gb, CHANNEL, day0, DAY, daySep, dayLabel, firstName, ini, msgTime, money, stop, timeLabel, windowShut, type SalesCtx } from "./common";
import { customerFormVM, infoRows } from "./customer";
import { CRM_LOST_REASONS } from "@/lib/member/crm";
import { oneAtATime } from "../../shared/once";
import { CHAT_WALL } from "../wall";

const RUST = "#BD4A19", INK = "#3F2B22", SUB = "rgb(128 107 96)", BD = "#EBDDD2";
/** Own bubbles (rev 1010 §1.2; was #FFF0E4). */
const MINE = "#FCD6B8";
const parts = (text: string) => String(text).split(/(\*[^*\n]+\*)/).filter(Boolean).map(t => (/^\*[^*]+\*$/.test(t) ? { t: t.slice(1, -1), w: 650 } : { t, w: "inherit" as const }));
const plain = (text: string) => text.replace(/\*([^*\n]+)\*/g, "$1");

/** "HH:MM" → "11:00 am" (the design's slot labels). */
export const t12 = (s: string) => { const [H, M] = s.split("@")[0].split(":").map(Number); return `${H % 12 || 12}:${String(M).padStart(2, "0")} ${H < 12 ? "am" : "pm"}`; };
/** A slot label on a day → the moment it starts. */
export const slotAt = (day: number, label: string) => {
  const m = label.match(/(\d+):(\d+) (am|pm)/); if (!m) return new Date(day);
  const d = new Date(day); d.setHours((Number(m[1]) % 12) + (m[3] === "pm" ? 12 : 0), Number(m[2]), 0, 0); return d;
};
const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const inBlock = (b: CrmRoom["blocks"][number], day: number) => iso(day) >= b.a && iso(day) <= (b.b || b.a);
/** Closed that day: a weekly closure or a whole-day blocked date range (a block with set hours closes only those hours). */
export const roomClosed = (r: CrmRoom | undefined, day: number) => !!r && (r.weekly.includes(new Date(day).getDay()) || r.blocks.some(b => !(b.t1 && b.t2) && inBlock(b, day)));
/** Closed at that slot by a block with set hours (round 2): the date is inside it and the slot starts at or after t1 and
 * before t2 — the same test as crm_slot_check. */
export const slotBlocked = (r: CrmRoom | undefined, day: number, label: string) => {
  if (!r) return false;
  const at = slotAt(day, label), hm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return r.blocks.some(b => !!b.t1 && !!b.t2 && inBlock(b, day) && hm >= b.t1 && hm < b.t2);
};
/** The room's slots open on that weekday (0 = Monday in the slot code). */
export const roomSlots = (r: CrmRoom | undefined, day: number) => !r ? [] : r.slots.filter(s => !s.includes("@") || s.split("@")[1].includes(String((new Date(day).getDay() + 6) % 7))).map(t12);

/** The system lines a chat shows between messages: visits, outcomes, invitations, takeovers. */
function systemLines(ctx: SalesCtx, c: CrmCustomer): { at: string; text: string }[] {
  const { data, nameOf, owner } = ctx, out: { at: string; text: string }[] = [];
  const room = (id: string) => data.rooms.find(r => r.id === id)?.name ?? "Showroom";
  for (const v of data.visits.filter(x => x.customerId === c.id)) {
    const when = `${dayLabel(new Date(v.start))}, ${timeLabel(new Date(v.start))}`;
    if (v.state === "attended") out.push({ at: v.start, text: `Showed up · ${when} · ${room(v.showroomId)}` });
    if (v.state === "no_show") out.push({ at: v.start, text: `No show · ${when} · ${room(v.showroomId)}` });
  }
  for (const e of data.events.filter(x => x.customerId === c.id)) {
    if (e.kind === "won") out.push({ at: e.at, text: `Won${e.data.amount != null ? " · " + money(Number(e.data.amount)) : ""}` });
    if (e.kind === "lost") out.push({ at: e.at, text: `Lost · ${e.data.reason === "other" && e.data.note ? String(e.data.note) : CRM_LOST_REASONS.find(r => r.value === e.data.reason)?.label ?? ""}` });
    if (e.kind === "shared") out.push({ at: e.at, text: `${nameOf(String(e.data.to ?? ""))} joined the chat` });
    if (e.kind === "moved") out.push({ at: e.at, text: `${nameOf(String(e.data.to ?? ""))} took over this chat` });
    if (e.kind === "share_declined") out.push({ at: e.at, text: `${nameOf(String(e.data.to ?? ""))} declined the invitation` });
    if (e.kind === "move_declined") out.push({ at: e.at, text: `${nameOf(String(e.data.to ?? ""))} declined the move request` });
  }
  // The invitation stays in the chat once answered (user 2026-10-09): the invite, then "joined" when it is accepted.
  // Lines like these are ours only — nothing here is ever sent to the customer.
  for (const i of data.invites.filter(x => x.customerId === c.id)) {
    const who = i.from === owner.id ? "You" : nameOf(i.from), wait = i.state === "pending" ? " · waiting to accept" : "";
    out.push({ at: i.createdAt, text: i.kind === "share" ? `${who} invited ${nameOf(i.to)} to this chat${wait}` : `${who === "You" ? "Move request" : `${who}'s move request`} sent to ${nameOf(i.to)}${wait}` });
  }
  return out;
}

/** "reply window open 20h 15m" / Messenger's 7 days as a person. */
export function windowLeft(c: CrmCustomer, now: Date): string {
  if (!c.lastCustomerAt) return "";
  const gone = now.getTime() - new Date(c.lastCustomerAt).getTime();
  const left = 24 * 3_600_000 - gone;
  if (left > 0) return `· reply window open ${Math.floor(left / 3_600_000)}h ${Math.floor((left % 3_600_000) / 60_000)}m`;
  if (c.channel === "messenger") { const days = Math.ceil((7 * DAY - gone) / DAY); return days > 0 ? `· person replies allowed for ${days} more day${days === 1 ? "" : "s"}` : ""; }
  return "";
}

export function chatVM(ctx: SalesCtx) {
  const { ui, set, patch, data, now, act, refs, owner, nameOf, live } = ctx;
  const c = ui.chat ? data.customers.find(x => x.id === ui.chat) : undefined;
  if (!c) return null;
  const ch = CHANNEL[c.channel], first = firstName(c.name);
  const hidden = new Set(data.hiddenMessages);
  const shut = windowShut(c, now);
  const draft = ui.draft[c.id] ?? "";
  const setDraft = (v: string) => set(u => ({ ...u, draft: { ...u.draft, [c.id]: v } }));
  const scrollDown = () => setTimeout(() => document.querySelectorAll<HTMLElement>("[data-chat-list]").forEach(el => { el.scrollTop = el.scrollHeight; }), 60);
  const prefs = data.prefs[c.id];
  const pinned = prefs?.pinnedMessageId ? c.messages.find(m => m.id === prefs.pinnedMessageId) : undefined;
  const booked = data.visits.filter(v => v.customerId === c.id && v.state === "booked").sort((a, b) => a.start.localeCompare(b.start));
  const nextVisit: CrmVisit | undefined = booked[0];
  const rooms = data.rooms.filter(r => r.active);
  const roomOf = (id: string) => data.rooms.find(r => r.id === id);

  // ── Messages, with the system lines in time order ──
  type Item = { kind: "msg"; m: CrmChatMessage } | { kind: "sys"; at: string; text: string };
  const items: Item[] = [
    ...c.messages.filter(m => !hidden.has(m.id)).map(m => ({ kind: "msg" as const, m })),
    ...systemLines(ctx, c).map(s => ({ kind: "sys" as const, ...s })),
  ].sort((a, b) => (a.kind === "msg" ? a.m.at : a.at).localeCompare(b.kind === "msg" ? b.m.at : b.at));
  const msgs3b = items.map((it, k, arr) => {
    const at = it.kind === "msg" ? it.m.at : it.at, prevAt = k ? (arr[k - 1].kind === "msg" ? (arr[k - 1] as { m: CrmChatMessage }).m.at : (arr[k - 1] as { at: string }).at) : null;
    const sep = !prevAt || new Date(at).toDateString() !== new Date(prevAt).toDateString() ? daySep(at, now) : "";
    if (it.kind === "sys") return {
      sep, plain: true, align: "center", max: "100%", rowDir: "row" as const, rxGap: "0", radius: "12px", bg: "rgba(255,255,255,.8)", borderStyle: "dashed", border: BORDER, textAlign: "center" as const, fg: SUB,
      quote: null, ev: null, pDisp: "block", size: "12px", textStyle: "normal", textColor: "inherit", parts: parts(it.text), timeJustify: "center", timeColor: SUB, by: "", at: msgTime(at),
      tick: false, tickColor: "#A8968B", tickLabel: "", showTools: false, openMenu: undefined, openReact: undefined, reaction: "", rxLeft: "auto", rxRight: "auto", rbLeft: "auto", rbRight: "auto",
      enter: undefined, leave: undefined,
    };
    const m = it.m, mine = m.from === "me", key = m.id;
    const q = m.replyTo ? c.messages.find(x => x.id === m.replyTo) : undefined;
    const card = m.card;
    const cd = card ? new Date(card.start) : null;
    const read = m.status === "read";
    // "Sent by": a reply from someone other than the customer's own person.
    const by = mine && m.by && m.by !== c.assignedTo && !m.auto ? nameOf(m.by) : m.auto ? "Auto-reply" : "";
    return {
      sep, plain: true, align: mine ? "flex-end" : "flex-start", max: "80%", rowDir: mine ? ("row-reverse" as const) : ("row" as const), rxGap: m.myReaction ? "14px" : "0",
      radius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", bg: mine ? MINE : "#fff", borderStyle: "solid", border: mine ? MINE : "#fff",
      textAlign: "left" as const, fg: INK, quote: q ? { who: q.from === "me" ? "You" : c.name, text: plain(q.text) } : null,
      ev: card && cd ? {
        kind: card.kind, title: "Showroom visit", wk: cd.toLocaleDateString("en-GB", { weekday: "short" }), dn: String(cd.getDate()), mon: gb(cd, { month: "short" }),
        time: timeLabel(cd), room: card.room, addr: card.addr,
        bg: card.kind === "Cancelled" ? "#F5EBE3" : "#FFF0E4", fg: card.kind === "Cancelled" ? "#806B60" : "#BD4A19", deco: card.kind === "Cancelled" ? "line-through" : "none",
        // Tap the card → Calendar on the visit's date.
        go: () => set(u => ({ ...u, chat: null, tab: "calendar", calView: "month", calSel: day0(cd), calYM: [cd.getFullYear(), cd.getMonth()], hist: [...u.hist, u.tab].slice(-20) })),
      } : null,
      pDisp: card ? "none" : "block", size: "14px", textStyle: "normal", textColor: "inherit", parts: parts(m.media && !m.text ? (m.media.kind === "image" ? "📷 Photo" : "📄 " + (m.media.name ?? "Document")) : m.text),
      timeJustify: "flex-end", timeColor: mine ? "#806B60" : SUB, by, at: msgTime(m.at),
      tick: mine, tickColor: read ? "#2F8FD8" : "#A8968B", tickLabel: read ? "Read" : m.status === "failed" ? "Not delivered" : "Delivered",
      showTools: ui.hover === key, enter: () => patch({ hover: key }), leave: () => set(u => (u.hover === key ? { ...u, hover: null } : u)),
      openMenu: () => patch({ menu: { msgId: key, full: true, from: m.from, text: m.text } }),
      openReact: () => patch({ menu: { msgId: key, full: false, from: m.from, text: m.text } }),
      reaction: m.myReaction ?? "", rxLeft: mine ? "auto" : "10px", rxRight: mine ? "10px" : "auto", rbLeft: mine ? "-38px" : "auto", rbRight: mine ? "auto" : "-38px",
    };
  });

  // ── Message menu (WhatsApp-style) ──
  const mu = ui.menu, close = () => patch({ menu: null, hover: null });
  const muMsg = mu ? c.messages.find(m => m.id === mu.msgId) : undefined;
  const isPinned = !!mu && prefs?.pinnedMessageId === mu.msgId;
  const menuItems = mu ? ([
    ["Reply", "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v4", () => patch({ reply: { msgId: mu.msgId, from: mu.from, text: mu.text }, menu: null, hover: null })],
    ["Copy", "M9 9h11v11H9zM5 15H4V4h11v1", () => { void navigator.clipboard?.writeText(plain(mu.text)).catch(() => {}); close(); }],
    ["React", "M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z", () => patch({ menu: { ...mu, full: false } })],
    [isPinned ? "Unpin" : "Pin", "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z", () => { close(); void act.setPref(c.id, { pinnedMessageId: isPinned ? null : mu.msgId }); }],
    // A sent WhatsApp cannot be unsent: Delete takes it off this person's chat only.
    ["Delete for me", "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", () => { close(); void act.hideMessage(mu.msgId); }],
  ] as [string, string, () => void][]).map(([label, icon, go]) => ({ label, icon, go, color: label.startsWith("Delete") ? "#A3371A" : "#3F2B22", rule: label.startsWith("Delete") ? "1px solid #EBDDD2" : "0" })) : [];

  // ── ⋮ menu ──
  const hm = ui.hm ?? {}, setHm = (p: NonNullable<typeof ui.hm>) => set(u => ({ ...u, hm: { ...(u.hm ?? {}), ...p } }));
  const superior = personOf(owner.uplineId, data.people);
  const myTeam = teamOf(owner.id, data.people);
  // Share: anyone in one's own team (peers, above, below) — never the HOD; the customer's own person and those already in are shown done.
  const teamPeople = myTeam ? [myTeam, ...downlineOf(myTeam.id, data.people).map(id => personOf(id, data.people)!)].filter(p => p && p.id !== owner.id) : downlineOf(owner.id, data.people).map(id => personOf(id, data.people)!).filter(Boolean);
  const already = new Set([...data.shares.filter(s => s.customerId === c.id).map(s => s.staffId), ...(c.assignedTo ? [c.assignedTo] : [])]);
  const ss = hm.ssel ?? [];
  // The Principal / Director in someone's chat: Assign to anyone, beside Share and Move (user 2026-10-09: 3个功能都要有). Their Move goes to the owner's superior (crm_invite).
  // Offered only with CRM · Manage (CrmApp hands it over then).
  const assigner = ctx.embedded?.assignTo ?? null;
  const assignList = assigner ? (ctx.embedded?.switchList ?? []).filter(p => p.role !== "boss") : [];
  const assigning = !!(assigner && hm.assign);
  const assignSel = assigning ? assignList.find(p => p.id === hm.sel) : undefined;
  const sNames = teamPeople.filter(p => ss.includes(p.id)).map(p => p.name);
  const goBook = () => {
    // A first booking asks for the customer's details first (step 1 of 2).
    if (c.detailsSaved) set(u => ({ ...u, hm: null, book: { customerId: c.id, room: 0, day: firstOpenDay(0, day0(now)), slot: null } }));
    else set(u => ({ ...u, hm: null, cform: { customerId: c.id, edit: false } }));
  };
  const firstOpenDay = (ri: number, from: number) => { for (let k = 0; k < 60; k++) { const d = from + k * DAY; if (!roomClosed(rooms[ri], d)) return d; } return from; };
  const hmVM = {
    open: !!hm.menu, btnBg: hm.menu ? "#F5EBE3" : "#fff", toggle: () => setHm({ menu: !hm.menu }), close: () => patch({ hm: null }), toast: hm.toast ?? "",
    items: ([
      ...(assigner ? [["Assign to", "M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3", () => setHm({ menu: false, assign: true, sel: null }), "Give this customer to anyone", "#E4EDF8", "#2F6FB5"]] : []),
      ["Share", "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12m-8-4 4-4 4 4", () => setHm({ menu: false, share: true, ssel: [] }), "Invite a teammate", "#FFF0E4", "#BD4A19"],
      // Move only when there is somebody to hand over to (rev 1010 §1.5): no upline → no Move. Never by title.
      ...(superior ? [["Move", "M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3", () => setHm({ menu: false, move: true, sel: null }), `Hand over to ${firstName(superior.name)}`, "#E4EDF8", "#2F6FB5"]] : []),
      ["Customer info", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0", () => setHm({ menu: false, info: true }), "", "#E4F1E8", "#387557"],
      ["Appointment", "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14", () => setHm({ menu: false, appt: true }), "", "#F3E8EF", "#8E4B6E"],
    ] as [string, string, () => void, string, string, string][]).map(([label, icon, go, sub, bg, fg]) => ({ label, icon, go, sub, bg, fg })),
    apptOpen: !!hm.appt, apptHas: !!nextVisit, apptNone: !nextVisit,
    apptRoom: nextVisit ? (roomOf(nextVisit.showroomId)?.name ?? "").replace(/ showroom$/i, "") : "",
    apptWhen: nextVisit ? `${dayLabel(new Date(nextVisit.start))}, ${timeLabel(new Date(nextVisit.start))}` : "",
    apptCal: () => { if (!nextVisit) return; const d = new Date(nextVisit.start); set(u => ({ ...u, hm: null, chat: null, tab: "calendar", calView: "month", calSel: day0(d), calYM: [d.getFullYear(), d.getMonth()] })); },
    apptChange: () => { if (!nextVisit) return; const d = new Date(nextVisit.start); set(u => ({ ...u, hm: null, book: { customerId: c.id, room: Math.max(0, rooms.findIndex(r => r.id === nextVisit.showroomId)), day: day0(d), slot: timeLabel(d), visitId: nextVisit.id } })); },
    apptCancel: () => { if (nextVisit) set(u => ({ ...u, hm: null, cancelAsk: nextVisit.id })); },
    apptBook: goBook,
    infoOpen: !!hm.info, edit: () => set(u => ({ ...u, hm: null, cform: { customerId: c.id, edit: true } })), rows: infoRows(c),
    shareOpen: !!hm.share,
    groups: [{ name: myTeam ? teamName(myTeam) : "My team", c: RUST, n: teamPeople.length, people: teamPeople.map(p => {
      const done = already.has(p.id), on = done || ss.includes(p.id);
      return { label: p.name, sub: done ? `${titleOf(p)} · in this chat` : titleOf(p), on, ring: on ? RUST : "#D9C7BA", fill: on ? RUST : "transparent", op: done ? 0.55 : 1, cur: done ? "default" : "pointer",
        pick: done ? undefined : () => setHm({ ssel: ss.includes(p.id) ? ss.filter(x => x !== p.id) : [...ss, p.id] }) };
    }) }],
    sLabel: sNames.length ? `Send invite to ${sNames.length === 1 ? sNames[0] : sNames.length + " people"}` : "Choose people", sBg: sNames.length ? RUST : "#D9C7BA",
    sConfirm: sNames.length ? async () => {
      let sent = 0;
      for (const id of ss) if (await act.invite("share", c.id, id)) sent++;
      if (sent) set(u => ({ ...u, hm: { toast: `Invite sent to ${sNames.length === 1 ? sNames[0] : sent + " people"}` } }));
      setTimeout(() => set(u => (u.hm?.toast ? { ...u, hm: null } : u)), 3000);
    } : undefined,
    moveOpen: !!(hm.move || assigning), moveTitle: `${assigning ? "Assign" : "Move"} ${c.name} to`,
    people: assigning ? assignList.map(p => ({ name: p.id === c.assignedTo ? `${p.name} · now` : p.name, role: titleOf(p), ini: ini(p.name), ring: hm.sel === p.id ? RUST : "#D9C7BA", dot: hm.sel === p.id ? RUST : "transparent", pick: () => setHm({ sel: p.id }) }))
      : superior ? [{ name: superior.name, role: jobTitle(superior), ini: ini(superior.name), ring: hm.sel === superior.id ? RUST : "#D9C7BA", dot: hm.sel === superior.id ? RUST : "transparent", pick: () => setHm({ sel: superior.id }) }] : [],
    cLabel: assigning ? (assignSel ? `Assign to ${assignSel.name}` : "Choose a person") : superior && hm.sel ? `Send move request to ${superior.name}` : "Choose a person", cBg: (assigning ? !!assignSel : !!(superior && hm.sel)) ? RUST : "#D9C7BA",
    confirm: assigning ? (assignSel && assignSel.id !== c.assignedTo ? async () => {
      if (!(await assigner?.(c.id, assignSel.id))) return;
      // The customer leaves this person's CRM: back to their Inbox, and say where it went.
      set(u => ({ ...u, hm: null, chat: null }));
      act.toast(`${c.name} assigned to ${assignSel.name}`);
    } : undefined) : superior && hm.sel ? async () => {
      if (!(await act.invite("move", c.id, superior.id))) return;
      set(u => ({ ...u, hm: { toast: `Move request sent to ${superior.name}` } }));
      setTimeout(() => set(u => (u.hm?.toast ? { ...u, hm: null } : u)), 3000);
    } : undefined,
  };

  // ── Book visit ──
  const b = ui.book && ui.book.customerId === c.id ? ui.book : null;
  const closeBook = () => {
    // Rebook from a No show: closing without a time returns to the No show popup.
    if (ui.rebookFor) set(u => ({ ...u, book: null, chat: null, tab: "calendar", outcomeAsk: u.rebookFor, rebookFor: null }));
    else patch({ book: null });
  };
  let book = {
    bookOpen: false, closeBook, rooms: [] as { name: string; addr: string; pick: () => void; border: string; bg: string; dot: string }[],
    monthLabel: "", monthOpen: false, toggleMonth: () => {}, pickYear: 0, yPrev: undefined as undefined | (() => void), yPrevFg: "#D9C7BA", yPrevCur: "default", yNext: undefined as undefined | (() => void), yNextFg: "#D9C7BA", yNextCur: "default",
    ymonths: [] as { label: string; weight: number; cursor: string; bg: string; fg: string; pick?: () => void }[],
    isWeekView: true, isMonthView: false, viewWeek: () => {}, viewMonth: () => {}, viewWeekBg: "#fff", viewWeekFg: "#3F2B22", viewMonthBg: "transparent", viewMonthFg: "#806B60",
    days: [] as { wk: string; n: number; pick?: () => void; bg: string; fg: string; border: string }[], wkHead: [] as string[],
    monthCells: [] as { n: number | string; pick?: () => void; cursor: string; weight: number; deco: string; bg: string; fg: string; border: string }[],
    slots: [] as { t: string; left: string; pick?: () => void; cursor: string; deco: string; bg: string; fg: string; border: string; weight: number }[],
    confirmLabel: "", confirmBg: RUST, confirmBook: undefined as undefined | (() => void),
    dateLeft: (_: MouseEvent) => {}, dateRight: (_: MouseEvent) => {}, dateWheel: (_: WheelEvent<HTMLElement>) => {}, dateDown: (_: RPointerEvent<HTMLElement>) => {}, dateMove: (_: RPointerEvent<HTMLElement>) => {}, dateUp: (_: RPointerEvent<HTMLElement>) => {}, dateClickGuard: (_: MouseEvent) => {},
    mDown: (_: RPointerEvent<HTMLElement>) => {}, mUp: (_: RPointerEvent<HTMLElement>) => {}, mCancel: () => {}, mClickGuard: (_: MouseEvent) => {},
  };
  if (b) {
    const T = day0(now), room = rooms[b.room] ?? rooms[0];
    const put = (p: Partial<typeof b>) => set(u => (u.book ? { ...u, book: { ...u.book, ...p } } : u));
    // Every time any showroom offers, sorted; the ones this room does not offer that day are struck through.
    const SLOTS = [...new Set(rooms.flatMap(r => r.slots.map(s => s.split("@")[0])))].sort().map(t12);
    const blocked = (day: number) => roomClosed(room, day);
    // Booked at a start, not counting the visit being changed (it does not hold its own slot against itself).
    const bookedAt = (at: Date) => {
      const n = ctx.slotCounts[at.toISOString()] ?? 0;
      const own = b.visitId && data.visits.find(v => v.id === b.visitId && new Date(v.start).getTime() === at.getTime() && v.showroomId === room?.id) ? 1 : 0;
      return n - own;
    };
    const taken = (day: number, label: string) => {
      if (blocked(day) || !roomSlots(room, day).includes(label) || slotBlocked(room, day, label)) return true;
      const at = slotAt(day, label);
      if (at <= now) return true;
      return bookedAt(at) >= (room?.cap ?? 2);
    };
    // Under each time (rev 1010 §7.1): N left · Full · Passed, or Closed where the showroom does not offer it that day.
    const leftOf = (day: number, label: string) => {
      if (blocked(day) || !roomSlots(room, day).includes(label) || slotBlocked(room, day, label)) return "Closed";
      const at = slotAt(day, label), cap = room?.cap ?? 2, n = bookedAt(at);
      return at <= now ? "Passed" : n >= cap ? "Full" : `${cap - n} left`;
    };
    const dd = new Date(b.day), dLabel = dayLabel(dd);
    const ready = b.slot != null && !taken(b.day, b.slot);
    // Book visit opens on the month (user 2026-10-09).
    const mv = (b.view ?? "month") === "month";
    const m0 = new Date(dd.getFullYear(), dd.getMonth(), 1), lead = (m0.getDay() + 6) % 7, dim = new Date(dd.getFullYear(), dd.getMonth() + 1, 0).getDate();
    const strip = (e: MouseEvent) => (e.currentTarget as HTMLElement).closest("main")?.querySelector<HTMLElement>("[data-date-strip]");
    const py = b.pickYear ?? dd.getFullYear(), curIdx = (dd.getFullYear() - now.getFullYear()) * 12 + dd.getMonth() - now.getMonth();
    book = {
      ...book, bookOpen: true,
      rooms: rooms.map((r, i) => ({ name: r.name, addr: r.address, border: b.room === i ? RUST : BD, bg: b.room === i ? "#FFF8F2" : "#fff", dot: b.room === i ? RUST : "transparent",
        pick: () => put({ room: i, slot: null, ...(roomClosed(r, b.day) ? { day: firstOpenDay(i, T) } : {}) }) })),
      monthLabel: gb(dd, { month: "short", year: "numeric" }), monthOpen: !!b.monthOpen,
      toggleMonth: () => put({ monthOpen: !b.monthOpen, pickYear: dd.getFullYear() }),
      pickYear: py,
      yPrev: py > now.getFullYear() ? () => put({ pickYear: py - 1 }) : undefined, yPrevFg: py > now.getFullYear() ? INK : "#D9C7BA", yPrevCur: py > now.getFullYear() ? "pointer" : "default",
      yNext: py < now.getFullYear() + 1 ? () => put({ pickYear: py + 1 }) : undefined, yNextFg: py < now.getFullYear() + 1 ? INK : "#D9C7BA", yNextCur: py < now.getFullYear() + 1 ? "pointer" : "default",
      // A year ahead from this month.
      ymonths: Array.from({ length: 12 }, (_, m) => {
        const idx = (py - now.getFullYear()) * 12 + m - now.getMonth(), ok = idx >= 0 && idx <= 12, on = idx === curIdx;
        const firstDay = Math.max(T, new Date(py, m, 1).getTime());
        return { label: gb(new Date(py, m, 1), { month: "short" }), weight: on ? 650 : 500, cursor: ok ? "pointer" : "default", bg: on ? RUST : "transparent", fg: on ? "#fff" : ok ? INK : "#D9C7BA",
          pick: ok ? () => put({ day: firstDay, slot: null, monthOpen: false, pickYear: undefined }) : undefined };
      }),
      isWeekView: !mv, isMonthView: mv,
      viewWeek: () => put({ view: "week" }), viewMonth: () => put({ view: "month", monthOpen: false }),
      viewWeekBg: mv ? "transparent" : "#fff", viewWeekFg: mv ? "#806B60" : "#3F2B22", viewMonthBg: mv ? "#fff" : "transparent", viewMonthFg: mv ? "#3F2B22" : "#806B60",
      days: Array.from({ length: 120 }, (_, i) => {
        const t = T + i * DAY, x = new Date(t), blk = blocked(t), on = b.day === t && !blk;
        return { wk: blk ? "Closed" : i === 0 ? "Today" : x.toLocaleDateString("en-GB", { weekday: "short" }), n: x.getDate(), pick: blk ? undefined : () => put({ day: t, slot: null }),
          bg: on ? RUST : blk ? "#F5F0EC" : "#fff", fg: on ? "#fff" : blk ? "#B5A398" : INK, border: on ? RUST : blk ? "#F5F0EC" : BD };
      }),
      wkHead: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      monthCells: [
        ...Array.from({ length: lead }, () => ({ n: "" as number | string, cursor: "default", weight: 500, deco: "none", bg: "transparent", fg: "transparent", border: "transparent" })),
        ...Array.from({ length: dim }, (_, k) => {
          const t = new Date(dd.getFullYear(), dd.getMonth(), k + 1).getTime(), past = t < T, blk = !past && blocked(t), ok = !past && !blk, on = t === b.day && !blk;
          return { n: k + 1, pick: ok ? () => put({ day: t, slot: null }) : undefined, cursor: blk ? "not-allowed" : ok ? "pointer" : "default", weight: on || t === T ? 650 : 500, deco: blk ? "line-through" : "none",
            bg: on ? RUST : blk ? "#F5F0EC" : "transparent", fg: on ? "#fff" : blk ? "#B5A398" : ok ? INK : "#C9B8AC", border: on ? RUST : blk ? "#F5F0EC" : t === T ? BD : "transparent" };
        }),
      ],
      slots: SLOTS.map(t => {
        const off = taken(b.day, t), on = b.slot === t && !off;
        return { t, left: leftOf(b.day, t), pick: off ? undefined : () => put({ slot: t }), cursor: off ? "not-allowed" : "pointer", deco: off ? "line-through" : "none",
          bg: on ? RUST : off ? "#FBF6F2" : "#fff", fg: on ? "#fff" : off ? "#B5A398" : INK, border: on ? RUST : off ? "#FBF6F2" : BD, weight: on ? 650 : 500 };
      }),
      confirmLabel: ready ? `${b.visitId ? "Change to" : "Book"} ${dLabel}, ${b.slot}` : "Pick a time",
      confirmBg: ready ? RUST : "#D9C7BA",
      confirmBook: ready && room ? () => void oneAtATime(`book:${c.id}`, async () => {
        const start = slotAt(b.day, b.slot!).toISOString();
        let ok: boolean;
        if (b.visitId) ok = await act.moveVisit(b.visitId, room.id, start);
        else {
          const rb = ui.rebookFor;
          if (rb && !(await act.outcome(rb.visitId, false, "rebooked"))) return;
          ok = await act.book(c.id, room.id, start);
        }
        if (ok) { set(u => ({ ...u, book: null, rebookFor: null })); scrollDown(); }
      }) : undefined,
      dateLeft: (e: MouseEvent) => strip(e)?.scrollBy({ left: -260, behavior: "smooth" }),
      dateRight: (e: MouseEvent) => strip(e)?.scrollBy({ left: 260, behavior: "smooth" }),
      dateWheel: (e: WheelEvent<HTMLElement>) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; },
      dateDown: (e: RPointerEvent<HTMLElement>) => { if (e.pointerType !== "mouse") return; const el = e.currentTarget; refs.dr = { x: e.clientX, left: el.scrollLeft, moved: false }; el.style.scrollBehavior = "auto"; el.style.cursor = "grabbing"; },
      dateMove: (e: RPointerEvent<HTMLElement>) => { const d = refs.dr; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 4) d.moved = true; e.currentTarget.scrollLeft = d.left - dx; },
      dateUp: (e: RPointerEvent<HTMLElement>) => { if (!refs.dr) return; const el = e.currentTarget; el.style.scrollBehavior = "smooth"; el.style.cursor = "grab"; refs.dMoved = refs.dr.moved; refs.dr = null; },
      dateClickGuard: (e: MouseEvent) => { if (refs.dMoved) { e.stopPropagation(); e.preventDefault(); refs.dMoved = false; } },
      // Swipe the month grid: left → next month, right → previous (this month to a year ahead).
      mDown: (e: RPointerEvent<HTMLElement>) => { refs.mSwiped = 0; refs.mSw = { x: e.clientX, y: e.clientY }; },
      mCancel: () => { refs.mSw = null; },
      mUp: (e: RPointerEvent<HTMLElement>) => {
        const s = refs.mSw; refs.mSw = null; if (!s) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        refs.mSwiped = Date.now();
        const n = new Date(dd.getFullYear(), dd.getMonth() + (dx < 0 ? 1 : -1), 1).getTime();
        if (n < new Date(now.getFullYear(), now.getMonth(), 1).getTime() || n > new Date(now.getFullYear() + 1, now.getMonth(), 1).getTime()) return;
        put({ day: Math.max(T, n), slot: null, monthOpen: false });
      },
      mClickGuard: (e: MouseEvent) => { if (refs.mSwiped && Date.now() - refs.mSwiped < 300) { e.stopPropagation(); e.preventDefault(); } refs.mSwiped = 0; },
    };
  }

  // ── Quick replies, "/" shortcuts, attachments, templates ──
  const qrs = data.quickReplies.length ? data.quickReplies : DEFAULT_QUICK_REPLIES.map((q, i) => ({ id: "d" + i, ...q }));
  const nw = ui.qrNew, canSave = !!(nw.s.trim() && nw.m.trim());
  const slash = /^\/(\S*)$/.exec(draft), sq = slash ? slash[1].toLowerCase() : "";
  const hits = slash ? qrs.filter(q => q.shortcut.toLowerCase().includes(sq)) : [];
  const cancelVisit = ui.cancelAsk ? data.visits.find(v => v.id === ui.cancelAsk) : undefined;
  const tpls = ui.templates;
  const tplList = c.channel === "messenger"
    ? [{ name: "Messenger has no templates", text: "After 7 days Messenger allows no message from the Page. Call the customer instead.", send: () => patch({ tpl: false }) }]
    : tpls == null ? [{ name: "Loading…", text: "Reading the templates you may send.", send: () => {} }]
      // rev 1011: the Principal or Director switches templates on in the Control panel (Profile › Cold lead templates).
      : !tpls.length ? [{ name: "No templates switched on", text: "Your Principal or Director switches approved templates on for salespeople. They show here once they do.", send: () => patch({ tpl: false }) }]
        : tpls.map(t => {
          const params = Array.from({ length: t.params }, (_, i) => (i === 0 ? first : ""));
          return { name: t.label ?? t.name.replace(/_/g, " ").replace(/^\w/, x => x.toUpperCase()), text: t.text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] || "…"),
            send: async () => { if (await oneAtATime(`send:${c.id}`, () => act.sendTemplate(c.id, t, params))) { patch({ tpl: false }); scrollDown(); } } };
        });
  const sendDraft = async () => {
    const text = draft.trim(); if (!text || ui.sending) return;
    patch({ sending: true });
    const ok = await oneAtATime(`send:${c.id}`, () => act.send(c.id, text, ui.reply?.msgId ?? null));
    if (ok === undefined) return; // the first tap is still sending
    set(u => ({ ...u, sending: false, ...(ok ? { draft: { ...u.draft, [c.id]: "" }, reply: null } : {}) }));
    if (ok) scrollDown();
  };

  return {
    cl: { name: c.name, ad: c.ad, first, ini: ini(c.name), chanName: ch.name, chanFg: ch.fg, chanIcon: ch.icon },
    wallBg: CHAT_WALL.bg, wallImg: CHAT_WALL.img, wallSize: CHAT_WALL.size,
    closeChat: () => set(u => ({ ...u, chat: null, menu: null, book: null, tpl: false, qr: false, att: false, hm: null, reply: null })),
    hm: hmVM, msgs3b, // stop comes with the customer form below
    pinText: pinned ? plain(pinned.text) : "", unpin: () => void act.setPref(c.id, { pinnedMessageId: null }),
    chatCold: shut, chatWarm: !shut,
    coldMsg: c.channel === "messenger" ? "the 7-day Messenger reply window has closed. Only template messages can be sent until the customer writes again." : "the 24 h WhatsApp window has closed. Only template messages can be sent until the customer writes again.",
    simReplyShow: !live, simReply: () => act.toast("Demo: the customer's reply arrives through WhatsApp on the live CRM."),
    notBooked: !nextVisit, openBook: goBook,
    editText: "", cancelEdit: () => {},
    replyText: ui.reply ? plain(ui.reply.text) : "", replyWho: ui.reply ? (ui.reply.from === "me" ? "You" : c.name) : "", cancelReply: () => patch({ reply: null }),
    slashOpen: !!slash, slashQ: "/" + sq, slashEmpty: !!slash && !hits.length,
    slashList: hits.map((q, i) => ({ title: q.shortcut, text: q.message, rule: i ? "1px solid #EBDDD2" : "0", pick: () => setDraft(q.message) })),
    qrEdit: () => patch({ qr: false, qrPage: "list" }),
    draftVal: draft, onDraft: (e: ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value), hasDraft: !!draft.trim() && !ui.sending, noDraft: !draft,
    draftBorder: draft ? RUST : "rgb(235 221 210)",
    // Height from text: ~22 characters a line, explicit line breaks; six lines, then it scrolls.
    draftH: `${Math.min(154, 22 + 22 * Math.max(1, draft.split("\n").reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / 22)), 0)))}px`,
    sendDraft,
    openAtt: () => patch({ att: true }), attOpen: ui.att, closeAtt: () => patch({ att: false }),
    attTiles: ([
      ["Photos", "M4 5h16v14H4V5Zm0 10 4-4 4 4 3-3 5 5M15 9h.01", "#2F8FD8", () => { patch({ att: false }); document.getElementById("crm-pick-photo")?.click(); }],
      ["Document", "M7 3h7l5 5v13H7V3Zm7 0v5h5", "#BD4A19", () => { patch({ att: false }); document.getElementById("crm-pick-file")?.click(); }],
      ["Quick replies", "M13 2 4 14h7l-1 8 9-12h-7l1-8Z", "#A46312", () => patch({ att: false, qr: true })],
    ] as [string, string, string, () => void][]).map(([label, icon, color, go]) => ({ label, icon, color, go })),
    /** The chat's hidden file pickers (Photos · Document) send what is chosen, the draft as its caption. */
    pickMedia: async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (!file) return;
      if (await oneAtATime(`send:${c.id}`, () => act.sendMedia(c.id, file, draft.trim()))) { setDraft(""); scrollDown(); }
    },
    qrOpen: ui.qr, closeQR: () => patch({ qr: false }),
    qrList: qrs.map((q, i) => ({ title: q.shortcut, text: q.message, rule: i ? "1px solid #EBDDD2" : "0",
      pick: () => set(u => ({ ...u, qr: false, draft: { ...u.draft, [c.id]: q.message } })),
      editIt: () => patch({ qrPage: "new", qrNew: { s: q.shortcut, m: q.message }, qrEditIdx: i }),
      remove: () => void act.saveQuickReplies(qrs.filter((_, j) => j !== i).map(x => ({ shortcut: x.shortcut, message: x.message }))) })),
    qrListPage: ui.qrPage === "list", qrNewPage: ui.qrPage === "new",
    qrBack: () => patch({ qrPage: null, qr: true }),
    qrAdd: () => patch({ qrPage: "new", qrNew: { s: "", m: "" }, qrEditIdx: null }),
    qrNewTitle: ui.qrEditIdx != null ? "Edit quick reply" : "New quick reply",
    qrCancelNew: () => patch({ qrPage: "list", qrEditIdx: null }),
    qrNewS: nw.s, qrNewM: nw.m,
    qrSetS: (e: ChangeEvent<HTMLInputElement>) => patch({ qrNew: { ...nw, s: e.target.value } }),
    qrSetM: (e: ChangeEvent<HTMLTextAreaElement>) => patch({ qrNew: { ...nw, m: e.target.value } }),
    qrSaveBg: canSave ? RUST : "#D9C7BA", qrSaveCur: canSave ? "pointer" : "default",
    qrSave: canSave ? async () => {
      const list = qrs.map(x => ({ shortcut: x.shortcut, message: x.message }));
      const next = ui.qrEditIdx != null ? list.map((x, j) => (j === ui.qrEditIdx ? { shortcut: nw.s.trim(), message: nw.m.trim() } : x)) : [{ shortcut: nw.s.trim(), message: nw.m.trim() }, ...list];
      await act.saveQuickReplies(next);
      patch({ qrNew: { s: "", m: "" }, qrEditIdx: null, qrPage: "list" });
    } : undefined,
    menuOpen: !!mu, closeMenu: close, menuFull: !!mu?.full, menuAlign: mu?.from === "me" ? "flex-end" : "flex-start",
    menuMsg: { text: mu ? plain(mu.text) : "", bg: mu?.from === "me" ? MINE : "#fff", border: mu?.from === "me" ? MINE : "#EBDDD2", radius: mu?.from === "me" ? "16px 16px 4px 16px" : "16px 16px 16px 4px" },
    reactBar: ["👍", "❤️", "😂", "😮", "😢", "🙏"].map(e => ({ e, bg: muMsg?.myReaction === e ? "#F5EBE3" : "transparent",
      pick: (ev: MouseEvent) => { ev.stopPropagation(); if (!mu) return; close(); void act.react(mu.msgId, muMsg?.myReaction === e ? "" : e); } })),
    menuItems,
    tplOpen: ui.tpl, closeTpl: () => patch({ tpl: false }), tplList,
    openTpl: async () => { patch({ tpl: true }); if (c.channel === "whatsapp" && ui.templates == null) { const t = await act.loadTemplates(); patch({ templates: t ?? [] }); } },
    cancelAskOpen: !!cancelVisit, cancelAskNo: () => patch({ cancelAsk: null }),
    cancelAskText: cancelVisit ? `${roomOf(cancelVisit.showroomId)?.name ?? "Showroom"}, ${dayLabel(new Date(cancelVisit.start))}, ${timeLabel(new Date(cancelVisit.start))}.` : "",
    cancelAskYes: async () => { if (!cancelVisit) return; patch({ cancelAsk: null }); await act.cancelVisit(cancelVisit.id); scrollDown(); },
    ...customerFormVM(ctx),
    ...book,
  };
}
export type ChatVM = NonNullable<ReturnType<typeof chatVM>>;
