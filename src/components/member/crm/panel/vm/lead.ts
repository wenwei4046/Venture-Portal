/**
 * One customer's chat as the Control panel opens it — from Needs a reply,
 * Awaiting reply, Calendar or Assignment (design 1a, the chat's full mode;
 * user 2026-10-09: the Principal answers here too). Reply (their messages say
 * "Sent by"), Book visit, and ⋮: Assign to (moves at once, 30 s to Undo),
 * Customer info, Appointment. The database lets the Principal and the
 * Director answer anyone (crm_can_reply).
 */
import type { ChangeEvent } from "react";
import { DEFAULT_QUICK_REPLIES, type CrmChatMessage, type CrmCustomer } from "@/lib/member/crm-data";
import { chatStripOf, coldLine, DAY, day0, dayLabel, daySep, gb, msgTime, timeLabel, windowShut } from "../../sales/vm/common";
import { avatarTint } from "../../shared/palette";
import { failNote, roomClosed, roomSlots, slotAt, slotBlocked } from "../../sales/vm/chat";
import { bookingSkipsForm, infoRows } from "../../sales/vm/customer";
import { composerOf, dismiss as dismissComposer, initialComposer, type ComposerIn, type ComposerState, type TileLabel } from "../../sales/vm/composer";
import { first, ini, pickGroups, stop, type PanelCtx } from "./common";
import { teamAssignees } from "../../shared/people";
import { oneAtATime } from "../../shared/once";
import { openCamera } from "../../shared/camera";
import { cancelVoice, recTime, startVoice, stopVoice } from "../../shared/voice";
import { pickedOf, pickVM } from "../../shared/pick";
import { albumsOf, galleryOf, INLINE_TIME, MINE_BG, MINE_TIME, mediaOf, mediaWord, tickColor, tickPathOf } from "../../shared/chat-media";
import { focusDraft, MENU_ICON, openMsgMenu, openStarred, pressToOpen } from "../../shared/msg-menu";
import { autoChoices, openAttach } from "../../shared/attach-sheet";
import { forwardChats, messageInfo } from "../../shared/msg-info";
import { actionsOnScreen, closeActions, openActions, type ActionSheet } from "../../shared/action-sheet";

/** The voice note's on-screen clock (one recording at a time; shared/voice.ts holds the recorder). */
let recTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Send or assign a customer at once (CRM · Manage, crm_send_to), then offer 30 s to undo it (Organic Leads' Send to,
 * Awaiting reply's Assign, the chat's Assign to). Saved first, as everywhere. "Move" is only ever a request to one's
 * direct superior (2026-10-23), so none of these is called that.
 */
export async function reassign(ctx: PanelCtx, c: CrmCustomer, to: string, kind: "send" | "assign", extra: Partial<PanelCtxUi> = {}) {
  const prev = c.assignedTo;
  if (!(await ctx.act.sendTo(c.id, to))) return;
  ctx.set(u => ({ ...u, ...extra, pick: "", toast: "", movedRec: kind === "assign" ? { ...u.movedRec, [c.id]: { from: prev, to } } : u.movedRec,
    undo: { kind, customerId: c.id, prev, name: c.name, to: ctx.nameOf(to), verb: kind === "send" ? "sent to" : "assigned to", left: 30 } }));
}

/** A TL / STL / TA gives a customer to one of their own people (crm_assign_member) — at once and with no undo, as in Mine. */
async function assignInTeam(ctx: PanelCtx, c: CrmCustomer, to: string) {
  if (!(await ctx.act.assignMember(c.id, to))) return;
  ctx.set(u => ({ ...u, reSheet: false, pick: "" }));
  ctx.act.toast(`${c.name} assigned to ${ctx.nameOf(to)}`);
}

/** Whom a chat's ⋮ Assign to offers (PanelCtx.assign): a TL / STL / TA their own people; CRM · Manage everybody. */
const assignees = (ctx: PanelCtx, c: CrmCustomer | undefined) => (c && ctx.assign === "team" ? teamAssignees(ctx.me, ctx.data.people, c) : []);
type PanelCtxUi = PanelCtx["ui"];

const NONE = () => {};
type Cell = { n: number | string; bg: string; fg: string; cur: string; deco: string; w: number; pick?: () => void };
type Slot = { t: string; left: string; hasLeft: boolean; cur: string; deco: string; bg: string; fg: string; bd: string; pick?: () => void };
const ALL_TIMES = ["10:00 am", "11:00 am", "12:00 pm", "1:00 pm", "2:00 pm", "3:00 pm", "4:00 pm", "5:00 pm", "6:00 pm", "7:00 pm", "8:00 pm"];

export function leadVM(ctx: PanelCtx) {
  const { ui, patch, now, nameOf } = ctx;
  const c = ui.lead ? ctx.data.customers.find(x => x.id === ui.lead) : undefined;
  const on = !!c && ["overview", "calendar", "assign", "inbox"].includes(ui.tab);
  const ow = c?.assignedTo ?? null, ownerName = ow ? nameOf(ow) : "No one yet";
  const rec = c ? ui.movedRec[c.id] : undefined;
  const visitCard = (card: CrmChatMessage["card"]) => {
    const cd = card ? new Date(card.start) : null;
    return { ev: card && cd ? {
      kind: card.kind, title: "Showroom visit", wk: cd.toLocaleDateString("en-GB", { weekday: "short" }), dn: String(cd.getDate()), mon: gb(cd, { month: "short" }),
      time: timeLabel(cd), room: card.room, addr: card.addr,
      bg: card.kind === "Cancelled" ? "var(--crm-field)" : "var(--crm-tint-attention)", fg: card.kind === "Cancelled" ? "var(--crm-muted)" : "var(--crm-rust)", deco: card.kind === "Cancelled" ? "line-through" : "none",
      go: () => patch({ lead: null, tab: "calendar", cView: "grid", cDay: day0(cd), cGM: [cd.getFullYear(), cd.getMonth()] }),
    } : null };
  };
  const gallery = galleryOf(c?.messages ?? []), al = albumsOf(c?.messages ?? []);
  const hiddenMsgs = new Set(ctx.data.hiddenMessages), stars = new Set(ctx.data.starredMessages ?? []);
  const msgs = (c?.messages ?? []).filter(m => !hiddenMsgs.has(m.id)).map((m, k, arr) => {
    const sep = daySep(m.at, now), mine = m.from === "me", by = mine && m.by && m.by !== ow ? `Sent by ${nameOf(m.by)}` : m.auto ? "Auto-reply" : "";
    // A photo, video or voice note shows as itself (2026-10-13), as in the salesperson's chat; a file opens.
    const md = m.media, mk = md?.kind, shows = mk === "image" || mk === "video" || mk === "audio";
    const star = stars.has(m.id) ? "★ " : "";
    return { sep: !k || daySep(arr[k - 1].at, now) !== sep ? sep : "", time: star + msgTime(m.at), mine, text: m.text || (md && !shows ? (md.name ?? "File") : ""), at: star + msgTime(m.at),
      ...mediaOf(m, gallery, al.lead.get(m.id)), ...(by ? { timeTop: "4px", ...(md?.kind === "audio" ? { inPad: "0 2px" } : {}) } : {}), ...(!md && !m.card && m.text ? INLINE_TIME : {}),
      // flow-root: the bubble holds the floated time (INLINE_TIME).
      vis: al.hidden.has(m.id) ? "none" : "flow-root",
      // The message menu, as in Mine's chat (shared/msg-menu.tsx): a long press — reactions, Reply, Copy, Delete for me.
      reaction: m.myReaction ?? "", rxGap: m.myReaction ? "14px" : "0", rxSide: mine ? "auto" : "10px", rxRight: mine ? "10px" : "auto",
      quote: (() => { const q = m.replyTo ? c?.messages.find(x => x.id === m.replyTo) : undefined; return q ? { who: q.from === "me" ? "You" : c?.name ?? "", text: q.text || mediaWord(q) } : null; })(),
      // data-mine: the quote in our own orange bubble is drawn light, as in Mine's chat (crm.module.css) — it was the dark
      // default on the orange, unreadable (the owner, 2026-10-23).
      press: { "data-msg": m.id, ...(mine ? { "data-mine": "1" } : {}), ...pressToOpen(() => openMsgMenu({
        mine, preview: m.text || (m.media ? mediaWord(m) : ""), reaction: m.myReaction ?? "", react: e => void ctx.act.react(m.id, e),
        forward: c ? { chats: forwardChats(ctx.data.customers, c.id, nameOf), send: toId => void ctx.act.forward(m.id, toId) } : undefined,
        info: c ? messageInfo(m, c, nameOf) : undefined,
        actions: [
          { label: "Reply", icon: MENU_ICON.reply, run: () => patch({ pReply: { chat: c?.id ?? "", msgId: m.id, who: mine ? "You" : c?.name ?? "", text: m.text || mediaWord(m) } }) },
          { label: "Forward", icon: MENU_ICON.forward, run: () => {} },
          ...(m.text ? [{ label: "Copy", icon: MENU_ICON.copy, run: () => { void navigator.clipboard?.writeText(m.text).catch(() => {}); } }] : []),
          { label: "Info", icon: MENU_ICON.info, run: () => {} },
          { label: stars.has(m.id) ? "Unstar" : "Star", icon: MENU_ICON.star, run: () => void ctx.act.star(m.id, !stars.has(m.id)) },
          { label: "Delete for me", icon: MENU_ICON.del, danger: true, run: () => void ctx.act.hideMessage(m.id) },
        ],
      }), () => { patch({ pReply: { chat: c?.id ?? "", msgId: m.id, who: mine ? "You" : c?.name ?? "", text: m.text || mediaWord(m) } }); focusDraft(); }) },
      tickC: tickColor(m.status), tickPath: tickPathOf(m.status),
      // Not delivered says why under it, as in Mine's chat (2026-10-17 — the owner: two videos WhatsApp refused showed
      // in the Team chat as sent; only Mine's said so).
      failNote: mine && m.status === "failed" ? failNote(m.error) : "",
      by, hasBy: !!by, align: mine ? "flex-end" : "flex-start", bg: mine ? MINE_BG : "#fff", bd: mine ? MINE_BG : "#fff", fg: mine ? "#fff" : "var(--crm-ink)", timeC: mine ? MINE_TIME : "var(--crm-muted)", radius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
      // A visit sent to the customer shows as the visit card, as in the salesperson's chat (sales/vm/chat.ts › ev), not
      // as its text with the map links (user 2026-10-11). Tap → Calendar on that day.
      ...visitCard(m.card), pDisp: !md && !m.card && m.text ? "inline" : m.card || mk === "file" || (shows && !m.text) ? "none" : "block" };
  });
  return {
    onLead: on, toast: ui.toast, stop, back: () => patch({ lead: null, pReply: null, pCmp: null, pPick: null, toast: "", pMenu: false, pInfo: false, pForm: null, pBook: null, reSheet: false, pick: "" }),
    ld: {
      // 4a (M04 / change list 18): the customer's tint, "ad · channel", the status strip.
      avBg: avatarTint(c?.name ?? "")[0], avFg: avatarTint(c?.name ?? "")[1], sub: [c?.ad, c ? (c.channel === "messenger" ? "Messenger" : "WhatsApp") : ""].filter(Boolean).join(" · "),
      strip: c ? chatStripOf(c, now) : { cold: false, left: "", right: "", dot: "transparent" },
      name: c?.name ?? "", ini: c ? ini(c.name) : "", ad: c?.ad ?? "", ownerFirst: ow ? first(ownerName) : "No one", ownerName,
      // No "· reply window open Xh Ym" under the name (rev 1011 §2.3, as RS rev 1010 §1.4); the cold banner stays.
      windowNote: "",
      msgs, stop,
      movedTo: c && rec ? `${c.name} reassigned from ${rec.from ? nameOf(rec.from) : "Organic Leads"} to ${nameOf(rec.to)} · by you` : "",
      // Assign to (⋮), Mine's rule (2026-10-23): CRM · Manage anyone at once (30 s to undo); a TL / STL / TA their own people.
      groups: c ? (ctx.assign === "team"
        ? pickGroups(ctx, { only: assignees(ctx, c), skip: ow, sel: ui.pick, pick: id => void assignInTeam(ctx, c, id) })
        : pickGroups(ctx, { skip: ow, sel: ui.pick, pick: id => void reassign(ctx, c, id, "assign", { reSheet: false }) })) : [],
      pickLabel: ui.pick ? nameOf(ui.pick) : "Choose a person", moveBg: ui.pick ? "var(--crm-rust)" : "var(--crm-line)",
      sheetOpen: on && ui.reSheet, openSheet: () => patch({ reSheet: true }), closeSheet: () => patch({ reSheet: false }),
      move: c && ui.pick ? () => void (ctx.assign === "team" ? assignInTeam(ctx, c, ui.pick) : reassign(ctx, c, ui.pick, "assign", { reSheet: false })) : undefined,
    },
    lx: lxVM(ctx, c, on),
  };
}
export type LeadVM = ReturnType<typeof leadVM>;

/** The chat's full mode: reply, the ⋮ menu, Customer info and Book visit. */
function lxVM(ctx: PanelCtx, c: CrmCustomer | undefined, on: boolean) {
  const { ui, patch, set, now, data, act, nameOf } = ctx;
  // This chat's own words and the message it answers (as Mine's): another chat's never show here, and never go here.
  const cid = c?.id ?? "";
  const draft = (c ? ui.pDrafts[c.id] : undefined) ?? "", has = !!draft.trim();
  const setDraft = (text: string) => set(u => ({ ...u, pDrafts: { ...u.pDrafts, [cid]: text } }));
  const reply = c && ui.pReply?.chat === c.id ? ui.pReply : null;
  const rooms = data.rooms.filter(r => r.active);
  const B = c && ui.pBook && ui.pBook.customerId === c.id ? ui.pBook : null;
  const T = day0(now);
  const toBook = (id: string) => patch({ pMenu: false, pInfo: false, pForm: null, pBook: { customerId: id, room: 0, day: T + DAY, slot: null, view: "month" } });
  // Booking asks for the customer's details first (step 1 of 2) until they are complete, as the salesperson's does.
  const openBook = () => { if (!c) return; if (bookingSkipsForm(c, data)) toBook(c.id); else patch({ pMenu: false, pInfo: false, pForm: { customerId: c.id, edit: false } }); };
  // ⋮ › Appointment with a visit booked (2026-10-14, "成功 book visit 之後 … 無法修改 & cancel 預約"): the visit with
  // Change (the booking sheet on its showroom, day and time; Book moves it — crm_move_appointment) and Cancel visit
  // (asked again; crm_set_appointment_state), as Mine's chat. No visit booked: Book visit, as before.
  const nextVisit = c ? data.visits.filter(v => v.customerId === c.id && v.state === "booked").sort((a, b) => a.start.localeCompare(b.start))[0] : undefined;
  const appointment = () => {
    if (!c || !nextVisit) { openBook(); return; }
    patch({ pMenu: false });
    const v = nextVisit, d = new Date(v.start), rm = data.rooms.find(r => r.id === v.showroomId);
    const where = `${(rm?.name ?? "Showroom").replace(/ showroom$/i, "")} · ${dayLabel(d)}, ${timeLabel(d)}`;
    openActions({ title: "Appointment", sub: where, actions: [
      { label: "Change", primary: true, run: () => patch({ pBook: { customerId: c.id, room: Math.max(0, rooms.findIndex(r => r.id === v.showroomId)), day: day0(d), slot: timeLabel(d), view: "month", visitId: v.id } }) },
      { label: "Cancel visit", danger: true, run: () => openActions({ title: "Cancel this visit?", sub: `${where}. ${c.name} is told it is cancelled.`, actions: [
        { label: "Yes, cancel visit", danger: true, run: () => { void oneAtATime(`book:${c.id}`, () => act.cancelVisit(v.id)).then(ok => { if (ok) act.toast(`Visit cancelled for ${c.name}`); }); } },
        { label: "Keep it", run: () => {} },
      ] }) },
      { label: "Close", run: () => {} },
    ] });
  };
  const setB = (p: Partial<NonNullable<typeof B>>) => set(u => (u.pBook ? { ...u, pBook: { ...u.pBook, ...p } } : u));
  // Shows at once and the box empties (2026-10-13); a failed send puts the words back into its own chat's empty box.
  const send = async () => {
    if (!c || !has) return;
    const id = c.id, text = draft.trim(), replyTo = reply?.msgId ?? null;
    set(u => ({ ...u, pDrafts: { ...u.pDrafts, [id]: "" }, pReply: u.pReply?.chat === id ? null : u.pReply }));
    if (!(await act.send(id, text, replyTo))) set(u => ({ ...u, pDrafts: { ...u.pDrafts, [id]: u.pDrafts[id] || text } }));
  };
  // Voice notes: the mic is held to record, as in Mine's chat (the composer, 2026-10-14) — let go and it goes, let go on
  // the bin and it is thrown away; the time ticks on screen.
  const recOn = ui.pRec != null;
  const voiceStart = async () => {
    if (ui.pRec != null) return true;
    if (!c) return false;
    const why = await startVoice();
    if (why) { patch({ toast: why }); return false; }
    set(u => ({ ...u, pRec: Date.now() }));
    clearInterval(recTimer);
    recTimer = setInterval(() => set(u => (u.pRec != null ? { ...u, pRecTick: Date.now() } : u)), 500);
    return true;
  };
  const recStop = async (sendIt: boolean) => {
    clearInterval(recTimer); recTimer = undefined;
    set(u => ({ ...u, pRec: null }));
    if (!sendIt) { cancelVoice(); return; }
    const file = await stopVoice();
    if (file && c) await act.sendMedia(c.id, file, "");
  };
  // A cold chat (the reply window closed) sends a template, as Mine's: the composer's button opens them with the words each
  // sends. Read each time — this is where templates are switched on and off (Profile › Cold lead templates), so a list
  // kept from earlier would go stale — and the sheet waiting on the read is replaced only while it is still on screen
  // (closed, it stays closed: a template is never offered over another chat).
  const shut = !!c && windowShut(c, now);
  const openTpl = async () => {
    if (!c) return;
    const name = first(c.name), id = c.id;
    if (c.channel === "messenger") { openActions({ title: "Messenger has no templates", sub: "After 7 days Messenger allows no message from the Page. Call the customer instead.", actions: [{ label: "Close", run: NONE }] }); return; }
    const reading: ActionSheet = { title: "Send template message", sub: "Reading the templates you may send.", actions: [{ label: "Close", run: NONE }] };
    openActions(reading);
    const tpls = await act.loadTemplates();
    if (actionsOnScreen() !== reading) return;
    // The read failed: its toast says why.
    if (!tpls) { closeActions(); return; }
    if (!tpls.length) { openActions({ title: "No templates switched on", sub: "Switch approved templates on in Profile › Cold lead templates.", actions: [{ label: "Close", run: NONE }] }); return; }
    openActions({ title: "Send template message", sub: `Only template messages reach ${name} until they write again.`, actions: [
      ...tpls.map(t => {
        const params = Array.from({ length: t.params }, (_, i) => (i === 0 ? name : ""));
        return { label: t.label ?? t.name.replace(/_/g, " ").replace(/^\w/, x => x.toUpperCase()), detail: t.text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] || "…"),
          run: () => { void oneAtATime(`send:${id}:${t.name}`, () => act.sendTemplate(id, t, params)); } };
      }),
      { label: "Close", run: NONE },
    ] });
  };
  // "/" in the reply box lists one's quick replies, as Mine's (the ones saved in Mine › Profile, the design's set until then).
  const qrs = data.quickReplies.length ? data.quickReplies : DEFAULT_QUICK_REPLIES.map((q, i) => ({ id: "d" + i, ...q }));
  const slash = /^\/(\S*)$/.exec(draft), sq = slash ? slash[1].toLowerCase() : "";
  const hits = slash ? qrs.filter(q => q.shortcut.toLowerCase().includes(sq)) : [];
  const textChoices = { quick: data.quickReplies.map(q => ({ label: q.shortcut ? `/${q.shortcut}` : "Quick reply", text: q.message })), auto: autoChoices(data.autoReplies), pick: setDraft };
  // The Attach panel's tiles: the CRM's own pickers (PanelScreens' hidden inputs) and lists.
  const tile = (label: TileLabel) => {
    if (label === "Photos") document.getElementById("crm-panel-photo")?.click();
    else if (label === "Document") document.getElementById("crm-panel-file")?.click();
    else openAttach({ ...textChoices, view: label === "Quick replies" ? "quick" : "auto" });
  };
  const setCmp = (f: (s: ComposerState) => ComposerState) => set(u => ({ ...u, pCmp: { ...f(composerOf(u.pCmp, cid) ?? initialComposer()), chat: cid } }));
  // The composer (the chat composer handoff — sales/ChatComposer.tsx), Mine's exactly; its words this chat's draft.
  const cmp: ComposerIn = {
    key: cid, state: composerOf(ui.pCmp, cid) ?? initialComposer(), set: setCmp,
    placeholder: c ? `Reply to ${first(c.name)}…` : "", draft, setDraft, canSend: has, send: () => void send(),
    warm: !shut, openTpl: () => void openTpl(), tplOn: ctx.data.settings?.suggestTemplate !== false, coldSub: c ? coldLine(c, now) : "",
    reply: reply ? { who: reply.who, text: reply.text } : null, cancelReply: () => patch({ pReply: null }),
    slash: slash ? { q: sq, empty: !hits.length, list: hits.map((q, i) => ({ title: q.shortcut, text: q.message, rule: i ? "1px solid var(--crm-rule)" : "0", pick: () => setDraft(q.message) })) } : null,
    rec: recOn ? { time: recTime(ui.pRec as number, ui.pRecTick && ui.pRecTick > (ui.pRec as number) ? ui.pRecTick : Date.now()) } : null,
    voiceStart, voiceStop: sendIt => void recStop(sendIt),
    camera: () => openCamera("crm-panel-camera", act.toast),
    tile,
    // One's recent emoji: CrmApp's list, shared with Mine's chat; kept on the server a moment later.
    recents: ctx.recents?.list ?? data.recentEmoji ?? [],
    saveRecents: list => { ctx.recents?.keep(list); act.saveRecentEmoji(list); },
  };
  const room = B ? rooms[B.room] ?? rooms[0] : undefined;
  const taken = (start: Date) => data.visits.filter(v => v.id !== B?.visitId && v.showroomId === room?.id && v.state === "booked" && new Date(v.start).getTime() === start.getTime()).length;
  const cell = (d: Date): Cell => {
    const t = day0(d), past = t < T, blk = !past && roomClosed(room, t), sel = !!B && B.day === t && !blk, ok = !past && !blk;
    return { n: d.getDate(), pick: ok ? () => setB({ day: t, slot: null }) : undefined, cur: ok ? "pointer" : "default", deco: blk ? "line-through" : "none", w: sel || t === T ? 700 : 500,
      bg: sel ? "var(--crm-rust)" : blk ? "var(--crm-field)" : "transparent", fg: sel ? "#fff" : past || blk ? "var(--crm-faint-2)" : "var(--crm-ink)" };
  };
  const book = B ? (() => {
    const sd = new Date(B.day), ym = B.ym ?? [sd.getFullYear(), sd.getMonth()], firstD = new Date(ym[0], ym[1], 1), lead = (firstD.getDay() + 6) % 7, dim = new Date(ym[0], ym[1] + 1, 0).getDate();
    const wS = new Date(sd); wS.setDate(sd.getDate() - ((sd.getDay() + 6) % 7));
    const open = roomSlots(room, B.day), cap = room?.cap ?? 2;
    return {
      rooms: rooms.map((r, i) => ({ label: r.name, pick: () => setB({ room: i, slot: null }), bd: B.room === i ? "var(--crm-rust)" : "var(--crm-rule)", bg: B.room === i ? "var(--crm-sel)" : "#fff", dot: B.room === i ? "var(--crm-rust)" : "transparent", ring: B.room === i ? "var(--crm-rust)" : "var(--crm-line)" })),
      isMonth: B.view !== "week", isWeek: B.view === "week", vMonth: () => setB({ view: "month" }), vWeek: () => setB({ view: "week" }),
      vMonthBg: B.view !== "week" ? "#fff" : "transparent", vWeekBg: B.view === "week" ? "#fff" : "transparent", vMonthFg: B.view !== "week" ? "var(--crm-ink)" : "var(--crm-muted)", vWeekFg: B.view === "week" ? "var(--crm-ink)" : "var(--crm-muted)",
      monthLbl: firstD.toLocaleDateString("en-GB", { month: "short", year: "numeric" }).replace("Sept", "Sep"),
      mPrev: () => setB({ ym: [ym[1] ? ym[0] : ym[0] - 1, (ym[1] + 11) % 12] }), mNext: () => setB({ ym: [ym[1] === 11 ? ym[0] + 1 : ym[0], (ym[1] + 1) % 12] }),
      cells: [...Array.from({ length: lead }, (): Cell => ({ n: "", bg: "transparent", fg: "transparent", cur: "default", deco: "none", w: 500 })), ...Array.from({ length: dim }, (_, k) => cell(new Date(ym[0], ym[1], k + 1)))],
      wk: Array.from({ length: 7 }, (_, k) => { const d = new Date(wS); d.setDate(wS.getDate() + k); return cell(d); }),
      // The showroom's own times that day; passed or full stay listed, struck through.
      slots: ALL_TIMES.filter(t => open.includes(t)).map((t): Slot => {
        // A block with set hours closes the slots inside it (round 2), struck through as Closed.
        const at = slotAt(B.day, t), past = at <= now, shut = !past && slotBlocked(room, B.day, t), n = taken(at), full = !past && !shut && n >= cap, ok = !past && !shut && !full, sel = B.slot === t && ok;
        return { t, left: past ? "Passed" : shut ? "Closed" : full ? "Full" : `${cap - n} left`, hasLeft: true, pick: ok ? () => setB({ slot: t }) : undefined, cur: ok ? "pointer" : "not-allowed", deco: ok ? "none" : "line-through",
          bg: sel ? "var(--crm-rust)" : ok ? "#fff" : "var(--crm-field)", fg: sel ? "#fff" : ok ? "var(--crm-ink)" : "var(--crm-faint-2)", bd: sel ? "var(--crm-rust)" : ok ? "var(--crm-rule)" : "var(--crm-field)" };
      }),
      bookLabel: B.slot ? `${B.visitId ? "Move to" : "Book"} ${dayLabel(new Date(B.day))}, ${B.slot}` : "Pick a time", bookBg: B.slot ? "var(--crm-rust)" : "var(--crm-line)",
      remarks: room?.remarks?.trim() ?? "",
      confirm: B.slot && c && room ? () => {
        const name = c.name;
        const at = slotAt(B.day, B.slot!).toISOString(), moving = B.visitId;
        void oneAtATime(`book:${c.id}`, () => (moving ? act.moveVisit(moving, room.id, at) : act.book(c.id, room.id, at))).then(ok => { if (ok) { patch({ pBook: null }); act.toast(`Visit ${moving ? "moved" : "booked"} for ${name}`); } });
      } : undefined,
    };
  })() : null;
  const info = c ? (() => {
    const rows = infoRows(c, data);
    // Owner right after Status (the shared rows gained Last chat, rev 1010 §4).
    rows.splice(rows.findIndex(r => r.k === "Status") + 1, 0, { k: "Owner", v: c.assignedTo ? nameOf(c.assignedTo) : "No one yet", rule: "1px solid var(--crm-rule)", vFg: c.assignedTo ? "var(--crm-ink)" : "var(--crm-faint)", href: null });
    return rows;
  })() : [];
  return {
    inbox: on, viewOnly: false,
    // The reply box, the Sticker and Attach panels, Camera, the mic held to record — Mine's composer.
    cmp,
    // A tap on the messages closes the keyboard and any panel (the composer handoff).
    dismiss: () => { setCmp(dismissComposer); (document.activeElement as HTMLElement | null)?.blur?.(); },
    // Photos and videos (Camera, Photos) wait on the preview with its HD switch; a document goes at once.
    pickVisual: (e: ChangeEvent<HTMLInputElement>) => {
      const files = [...(e.target.files ?? [])]; e.target.value = "";
      // The camera's photo fills the 9:16 screen (2026-10-15); the photo library's stays whole.
      const camera = e.target.id.endsWith("-camera");
      if (files.length) set(u => ({ ...u, pPick: { ...pickedOf(files, { camera }), caption: draft } }));
    },
    pk: c ? pickVM(ui.pPick, p => set(u => ({ ...u, pPick: p })), async (files, captions) => {
      if (draft) setDraft("");
      await Promise.all(files.map((f, i) => act.sendMedia(c.id, f, captions[i] ?? "")));
    }) : null,
    // Several files at once, each its own message; the typed words go with the first.
    pickMedia: async (e: ChangeEvent<HTMLInputElement>) => {
      const files = [...(e.target.files ?? [])]; e.target.value = "";
      if (!files.length || !c) return;
      // A photo or video picked here too waits on the editor (caption, HD, edits) — the Team chat's + is this picker, and
      // a photo chosen through it went straight out (the owner, 2026-10-14: "點勾選後就直接發送了"); only a document goes at once.
      const isVisual = (f: File) => f.type.startsWith("image/") || f.type.startsWith("video/");
      const visual = files.filter(isVisual), docs = files.filter(f => !isVisual(f));
      if (visual.length) set(u => ({ ...u, pPick: { ...pickedOf(visual), caption: draft } }));
      if (!docs.length) return;
      const caption = visual.length ? "" : draft.trim();
      if (caption) setDraft("");
      await Promise.all(docs.map((f, i) => act.sendMedia(c.id, f, i === 0 ? caption : "")));
    },
    // The header, as Mine's: the avatar's title names the channel; ⋮ tints while its menu is open.
    chanName: c?.channel === "messenger" ? "Messenger" : "WhatsApp",
    menuOpen: on && ui.pMenu, menuBg: on && ui.pMenu ? "var(--crm-field)" : "transparent", toggleMenu: () => set(u => ({ ...u, pMenu: !u.pMenu })),
    // The reply window closed: the cold-lead note in the header, and the composer's template button (Mine's words).
    cold: on && shut,
    coldMsg: c?.channel === "messenger" ? "the 7-day Messenger reply window has closed. Only template messages can be sent until the customer writes again." : "the 24 h WhatsApp window has closed. Only template messages can be sent until the customer writes again.",
    menu: [
      // Assign to only for whom it can work (2026-10-23 — it showed to every leader, and the database refused all but CRM ·
      // Manage): CRM · Manage, or a TL / STL / TA with somebody in this customer's team below them.
      ...(ctx.assign === "any" || assignees(ctx, c).length ? [{ label: "Assign to", icon: "M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3", bg: "var(--crm-tint-cold)", fg: "var(--crm-ink-soft)", go: () => patch({ pMenu: false, reSheet: true }) }] : []),
      { label: "Customer info", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0", bg: "var(--crm-tint-follow)", fg: "var(--crm-brown)", go: () => patch({ pMenu: false, pInfo: true }) },
      { label: "Appointment", icon: "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14", bg: "var(--crm-tint-new)", fg: "var(--crm-ink-soft)", go: appointment },
      // One's own starred messages in this chat (the message menu's Star, 2026-10-14).
      { label: "Starred messages", icon: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z", bg: "var(--crm-tint-appt)", fg: "var(--crm-brown)", go: () => { patch({ pMenu: false }); if (c) openStarred(c.messages.filter(x => (ctx.data.starredMessages ?? []).includes(x.id)).map(x => ({ id: x.id, who: x.from === "me" ? "You" : c.name, text: x.text || (x.media ? mediaWord(x) : ""), at: msgTime(x.at) }))); } },
    ],
    shareOpen: false, closeShare: NONE, shareList: [] as { name: string; role: string; ini: string; pick: () => void }[],
    infoOpen: on && ui.pInfo, closeInfo: () => patch({ pInfo: false }), info,
    editInfo: () => { if (c) patch({ pInfo: false, pForm: { customerId: c.id, edit: true } }); },
    bookOpen: on && !!B, closeBook: () => patch({ pBook: null }),
    rooms: book?.rooms ?? [], isMonth: book?.isMonth ?? true, isWeek: book?.isWeek ?? false, vMonth: book?.vMonth ?? NONE, vWeek: book?.vWeek ?? NONE,
    vMonthBg: book?.vMonthBg ?? "#fff", vWeekBg: book?.vWeekBg ?? "transparent", vMonthFg: book?.vMonthFg ?? "var(--crm-ink)", vWeekFg: book?.vWeekFg ?? "var(--crm-muted)",
    monthLbl: book?.monthLbl ?? "", mPrev: book?.mPrev ?? NONE, mNext: book?.mNext ?? NONE, cells: book?.cells ?? [], wk: book?.wk ?? [], slots: book?.slots ?? [],
    bookLabel: book?.bookLabel ?? "Pick a time", bookBg: book?.bookBg ?? "var(--crm-line)", confirm: book?.confirm, bookRemarks: book?.remarks ?? "",
  };
}
