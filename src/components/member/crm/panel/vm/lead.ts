/**
 * One customer's chat as the Control panel opens it — from Needs a reply,
 * Awaiting reply, Calendar or Assignment (design 1a, the chat's full mode;
 * user 2026-10-09: the Principal answers here too). Reply (their messages say
 * "Sent by"), Book visit, and ⋮: Assign to (moves at once, 30 s to Undo),
 * Customer info, Appointment. The database lets the Principal and the
 * Director answer anyone (crm_can_reply).
 */
import type { ChangeEvent } from "react";
import type { CrmChatMessage, CrmCustomer } from "@/lib/member/crm-data";
import { DAY, day0, dayLabel, daySep, gb, msgTime, timeLabel } from "../../sales/vm/common";
import { roomClosed, roomSlots, slotAt, windowLeft } from "../../sales/vm/chat";
import { infoRows } from "../../sales/vm/customer";
import { first, ini, pickGroups, stop, type PanelCtx } from "./common";
import { oneAtATime } from "../../shared/once";

/**
 * Send or move a customer, then offer 30 s to undo it (Organic Leads' Send to,
 * Awaiting reply's Move, the chat's Assign to). Saved first, as everywhere.
 */
export async function reassign(ctx: PanelCtx, c: CrmCustomer, to: string, kind: "send" | "move", extra: Partial<PanelCtxUi> = {}) {
  const prev = c.assignedTo;
  if (!(await ctx.act.sendTo(c.id, to))) return;
  ctx.set(u => ({ ...u, ...extra, pick: "", toast: "", movedRec: kind === "move" ? { ...u.movedRec, [c.id]: { from: prev, to } } : u.movedRec,
    undo: { kind, customerId: c.id, prev, name: c.name, to: ctx.nameOf(to), verb: kind === "send" ? "sent to" : "moved to", left: 30 } }));
}
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
      bg: card.kind === "Cancelled" ? "#F5EBE3" : "#FFF0E4", fg: card.kind === "Cancelled" ? "#806B60" : "#BD4A19", deco: card.kind === "Cancelled" ? "line-through" : "none",
      go: () => patch({ lead: null, tab: "calendar", cView: "grid", cDay: day0(cd), cGM: [cd.getFullYear(), cd.getMonth()] }),
    } : null };
  };
  const msgs = (c?.messages ?? []).map((m, k, arr) => {
    const sep = daySep(m.at, now), mine = m.from === "me", by = mine && m.by && m.by !== ow ? `Sent by ${nameOf(m.by)}` : m.auto ? "Auto-reply" : "";
    return { sep: !k || daySep(arr[k - 1].at, now) !== sep ? sep : "", time: msgTime(m.at), mine, text: m.text || (m.media ? `[${m.media.kind === "image" ? "Photo" : m.media.kind === "audio" ? "Voice note" : m.media.kind === "video" ? "Video" : "File"}]` : ""), at: msgTime(m.at),
      by, hasBy: !!by, align: mine ? "flex-end" : "flex-start", bg: mine ? "#FCD6B8" : "#fff", bd: mine ? "#FCD6B8" : "#fff", radius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
      // A visit sent to the customer shows as the visit card, as in the salesperson's chat (sales/vm/chat.ts › ev), not
      // as its text with the map links (user 2026-10-11). Tap → Calendar on that day.
      ...visitCard(m.card), pDisp: m.card ? "none" : "block" };
  });
  return {
    onLead: on, toast: ui.toast, stop, back: () => patch({ lead: null, toast: "", pMenu: false, pInfo: false, pForm: null, pBook: null, reSheet: false, pick: "" }),
    ld: {
      name: c?.name ?? "", ini: c ? ini(c.name) : "", ad: c?.ad ?? "", ownerFirst: ow ? first(ownerName) : "No one", ownerName,
      // No "· reply window open Xh Ym" under the name (rev 1011 §2.3, as RS rev 1010 §1.4); the cold banner stays.
      windowNote: "",
      msgs, stop,
      movedTo: c && rec ? `${c.name} moved from ${rec.from ? nameOf(rec.from) : "Organic Leads"} to ${nameOf(rec.to)} · by you` : "",
      // Assign to (⋮) moves at once, as the design's inbox mode does.
      groups: c ? pickGroups(ctx, { skip: ow, sel: ui.pick, pick: id => void reassign(ctx, c, id, "move", { reSheet: false }) }) : [],
      pickLabel: ui.pick ? nameOf(ui.pick) : "Choose a person", moveBg: ui.pick ? "#BD4A19" : "#D9C7BA",
      sheetOpen: on && ui.reSheet, openSheet: () => patch({ reSheet: true }), closeSheet: () => patch({ reSheet: false }),
      move: c && ui.pick ? () => void reassign(ctx, c, ui.pick, "move", { reSheet: false }) : undefined,
    },
    lx: lxVM(ctx, c, on),
  };
}
export type LeadVM = ReturnType<typeof leadVM>;

/** The chat's full mode: reply, the ⋮ menu, Customer info and Book visit. */
function lxVM(ctx: PanelCtx, c: CrmCustomer | undefined, on: boolean) {
  const { ui, patch, set, now, data, act, nameOf } = ctx;
  const draft = ui.pDraft, has = !!draft.trim();
  const rooms = data.rooms.filter(r => r.active);
  const B = c && ui.pBook && ui.pBook.customerId === c.id ? ui.pBook : null;
  const T = day0(now);
  const toBook = (id: string) => patch({ pMenu: false, pInfo: false, pForm: null, pBook: { customerId: id, room: 0, day: T + DAY, slot: null, view: "month" } });
  // A first booking asks for the customer's details first (step 1 of 2), as the salesperson's does.
  const openBook = () => { if (!c) return; if (c.detailsSaved) toBook(c.id); else patch({ pMenu: false, pInfo: false, pForm: { customerId: c.id, edit: false } }); };
  const setB = (p: Partial<NonNullable<typeof B>>) => set(u => (u.pBook ? { ...u, pBook: { ...u.pBook, ...p } } : u));
  const send = async () => {
    if (!c || !has) return;
    if (await oneAtATime(`send:${c.id}`, () => act.send(c.id, draft.trim()))) set(u => ({ ...u, pDraft: "" }));
  };
  const room = B ? rooms[B.room] ?? rooms[0] : undefined;
  const taken = (start: Date) => data.visits.filter(v => v.showroomId === room?.id && v.state === "booked" && new Date(v.start).getTime() === start.getTime()).length;
  const cell = (d: Date): Cell => {
    const t = day0(d), past = t < T, blk = !past && roomClosed(room, t), sel = !!B && B.day === t && !blk, ok = !past && !blk;
    return { n: d.getDate(), pick: ok ? () => setB({ day: t, slot: null }) : undefined, cur: ok ? "pointer" : "default", deco: blk ? "line-through" : "none", w: sel || t === T ? 700 : 500,
      bg: sel ? "#BD4A19" : blk ? "#F5F0EC" : "transparent", fg: sel ? "#fff" : past || blk ? "#C9B8AC" : "#3F2B22" };
  };
  const book = B ? (() => {
    const sd = new Date(B.day), ym = B.ym ?? [sd.getFullYear(), sd.getMonth()], firstD = new Date(ym[0], ym[1], 1), lead = (firstD.getDay() + 6) % 7, dim = new Date(ym[0], ym[1] + 1, 0).getDate();
    const wS = new Date(sd); wS.setDate(sd.getDate() - ((sd.getDay() + 6) % 7));
    const open = roomSlots(room, B.day), cap = room?.cap ?? 2;
    return {
      rooms: rooms.map((r, i) => ({ label: r.name, pick: () => setB({ room: i, slot: null }), bd: B.room === i ? "#BD4A19" : "#EBDDD2", bg: B.room === i ? "#FFF8F2" : "#fff", dot: B.room === i ? "#BD4A19" : "transparent", ring: B.room === i ? "#BD4A19" : "#D9C7BA" })),
      isMonth: B.view !== "week", isWeek: B.view === "week", vMonth: () => setB({ view: "month" }), vWeek: () => setB({ view: "week" }),
      vMonthBg: B.view !== "week" ? "#fff" : "transparent", vWeekBg: B.view === "week" ? "#fff" : "transparent", vMonthFg: B.view !== "week" ? "#3F2B22" : "#806B60", vWeekFg: B.view === "week" ? "#3F2B22" : "#806B60",
      monthLbl: firstD.toLocaleDateString("en-GB", { month: "short", year: "numeric" }).replace("Sept", "Sep"),
      mPrev: () => setB({ ym: [ym[1] ? ym[0] : ym[0] - 1, (ym[1] + 11) % 12] }), mNext: () => setB({ ym: [ym[1] === 11 ? ym[0] + 1 : ym[0], (ym[1] + 1) % 12] }),
      cells: [...Array.from({ length: lead }, (): Cell => ({ n: "", bg: "transparent", fg: "transparent", cur: "default", deco: "none", w: 500 })), ...Array.from({ length: dim }, (_, k) => cell(new Date(ym[0], ym[1], k + 1)))],
      wk: Array.from({ length: 7 }, (_, k) => { const d = new Date(wS); d.setDate(wS.getDate() + k); return cell(d); }),
      // The showroom's own times that day; passed or full stay listed, struck through.
      slots: ALL_TIMES.filter(t => open.includes(t)).map((t): Slot => {
        const at = slotAt(B.day, t), past = at <= now, n = taken(at), full = !past && n >= cap, ok = !past && !full, sel = B.slot === t && ok;
        return { t, left: past ? "Passed" : full ? "Full" : `${cap - n} left`, hasLeft: true, pick: ok ? () => setB({ slot: t }) : undefined, cur: ok ? "pointer" : "not-allowed", deco: ok ? "none" : "line-through",
          bg: sel ? "#BD4A19" : ok ? "#fff" : "#F8F3EF", fg: sel ? "#fff" : ok ? "#3F2B22" : "#C9B8AC", bd: sel ? "#BD4A19" : ok ? "#EBDDD2" : "#F8F3EF" };
      }),
      bookLabel: B.slot ? `Book ${dayLabel(new Date(B.day))}, ${B.slot}` : "Pick a time", bookBg: B.slot ? "#BD4A19" : "#D9C7BA",
      confirm: B.slot && c && room ? () => {
        const name = c.name;
        void oneAtATime(`book:${c.id}`, () => act.book(c.id, room.id, slotAt(B.day, B.slot!).toISOString())).then(ok => { if (ok) { patch({ pBook: null }); act.toast(`Visit booked for ${name}`); } });
      } : undefined,
    };
  })() : null;
  const info = c ? (() => {
    const rows = infoRows(c);
    // Owner right after Status (the shared rows gained Last chat, rev 1010 §4).
    rows.splice(rows.findIndex(r => r.k === "Status") + 1, 0, { k: "Owner", v: c.assignedTo ? nameOf(c.assignedTo) : "No one yet", rule: "1px solid #EBDDD2", vFg: c.assignedTo ? "#3F2B22" : "#B5A398" });
    return rows;
  })() : [];
  return {
    inbox: on, viewOnly: false, draft, setDraft: (e: ChangeEvent<HTMLInputElement>) => { const v = e.target.value; set(u => ({ ...u, pDraft: v })); },
    send: has ? () => void send() : undefined, sendBg: has ? "#BD4A19" : "#D9C7BA",
    // + = a document, the camera = a photo (PanelScreens' hidden pickers); the typed text goes as the caption.
    attach: () => document.getElementById("crm-panel-file")?.click(),
    photo: () => document.getElementById("crm-panel-photo")?.click(),
    pickMedia: async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (!file || !c) return;
      if (await oneAtATime(`send:${c.id}`, () => act.sendMedia(c.id, file, draft.trim()))) set(u => ({ ...u, pDraft: "" }));
    },
    ph: c ? `Reply to ${first(c.name)}…` : "", sendIcon: has ? "M5 12h14m-6-6 6 6-6 6" : "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3", sendTitle: has ? "Send" : "Voice note",
    chC: c?.channel === "messenger" ? "#2F6FB5" : "#1F7A4D", menuOpen: on && ui.pMenu, toggleMenu: () => set(u => ({ ...u, pMenu: !u.pMenu })),
    menu: [
      { label: "Assign to", icon: "M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3", bg: "#E4EDF8", fg: "#2F6FB5", go: () => patch({ pMenu: false, reSheet: true }) },
      { label: "Customer info", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0", bg: "#E4F1E8", fg: "#387557", go: () => patch({ pMenu: false, pInfo: true }) },
      { label: "Appointment", icon: "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14", bg: "#F3E8EF", fg: "#8E4B6E", go: openBook },
    ],
    shareOpen: false, closeShare: NONE, shareList: [] as { name: string; role: string; ini: string; pick: () => void }[],
    infoOpen: on && ui.pInfo, closeInfo: () => patch({ pInfo: false }), info,
    editInfo: () => { if (c) patch({ pInfo: false, pForm: { customerId: c.id, edit: true } }); },
    openBook, bookOpen: on && !!B, closeBook: () => patch({ pBook: null }),
    rooms: book?.rooms ?? [], isMonth: book?.isMonth ?? true, isWeek: book?.isWeek ?? false, vMonth: book?.vMonth ?? NONE, vWeek: book?.vWeek ?? NONE,
    vMonthBg: book?.vMonthBg ?? "#fff", vWeekBg: book?.vWeekBg ?? "transparent", vMonthFg: book?.vMonthFg ?? "#3F2B22", vWeekFg: book?.vWeekFg ?? "#806B60",
    monthLbl: book?.monthLbl ?? "", mPrev: book?.mPrev ?? NONE, mNext: book?.mNext ?? NONE, cells: book?.cells ?? [], wk: book?.wk ?? [], slots: book?.slots ?? [],
    bookLabel: book?.bookLabel ?? "Pick a time", bookBg: book?.bookBg ?? "#D9C7BA", confirm: book?.confirm,
  };
}
