/**
 * One customer's chat as the Control panel opens it from Calendar, Awaiting
 * reply or Assignment (design 1a): read-only, with Reassign — pick a person,
 * Move, and 30 seconds to Undo. Answering happens in the owner's own CRM
 * (Inbox opens it there).
 */
import type { CrmCustomer } from "@/lib/member/crm-data";
import { daySep, msgTime } from "../../sales/vm/common";
import { windowLeft } from "../../sales/vm/chat";
import { first, ini, pickGroups, stop, type PanelCtx } from "./common";

/**
 * Send or move a customer, then offer 30 s to undo it (Organic Leads' Send to,
 * Awaiting reply's Move, the chat's Reassign). Saved first, as everywhere.
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

export function leadVM(ctx: PanelCtx) {
  const { ui, patch, set, now, nameOf } = ctx;
  const c = ui.lead ? ctx.data.customers.find(x => x.id === ui.lead) : undefined;
  const on = !!c && ["overview", "calendar", "assign", "inbox"].includes(ui.tab);
  const ow = c?.assignedTo ?? null, ownerName = ow ? nameOf(ow) : "No one yet";
  const rec = c ? ui.movedRec[c.id] : undefined;
  const msgs = (c?.messages ?? []).map((m, k, arr) => {
    const sep = daySep(m.at, now), mine = m.from === "me", by = mine && m.by && m.by !== ow ? `Sent by ${nameOf(m.by)}` : m.auto ? "Auto-reply" : "";
    return { sep: !k || daySep(arr[k - 1].at, now) !== sep ? sep : "", time: msgTime(m.at), mine, text: m.text || (m.media ? `[${m.media.kind === "image" ? "Photo" : m.media.kind === "audio" ? "Voice note" : m.media.kind === "video" ? "Video" : "File"}]` : ""), at: msgTime(m.at),
      by, hasBy: !!by, align: mine ? "flex-end" : "flex-start", bg: mine ? "#FFF0E4" : "#fff", bd: mine ? "#FFF0E4" : "#EBDDD2", radius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px" };
  });
  return {
    onLead: on, toast: ui.toast, stop, back: () => patch({ lead: null, toast: "", pMenu: false, reSheet: false, pick: "" }),
    ld: {
      name: c?.name ?? "", ini: c ? ini(c.name) : "", ad: c?.ad ?? "", ownerFirst: ow ? first(ownerName) : "No one", ownerName,
      windowNote: c && windowLeft(c, now) ? " " + windowLeft(c, now) : "",
      msgs, stop,
      movedTo: c && rec ? `${c.name} moved from ${rec.from ? nameOf(rec.from) : "Organic Leads"} to ${nameOf(rec.to)} · by you` : "",
      groups: c ? pickGroups(ctx, { skip: ow, sel: ui.pick, pick: id => patch({ pick: id, reSheet: false }) }) : [],
      pickLabel: ui.pick ? nameOf(ui.pick) : "Choose a person", moveBg: ui.pick ? "#BD4A19" : "#D9C7BA",
      sheetOpen: on && ui.reSheet, openSheet: () => patch({ reSheet: true }), closeSheet: () => patch({ reSheet: false }),
      move: c && ui.pick ? () => void reassign(ctx, c, ui.pick, "move", { reSheet: false }) : undefined,
    },
    // The Principal reads here; replying and booking are in the owner's CRM (Inbox). The design's inbox mode stays closed.
    lx: {
      inbox: false, viewOnly: true, draft: ui.pDraft, setDraft: NONE as (e: unknown) => void, send: undefined as (() => void) | undefined, sendBg: "#D9C7BA", ph: "", sendIcon: "", sendTitle: "",
      chC: c?.channel === "messenger" ? "#2F6FB5" : "#1F7A4D", menuOpen: false, toggleMenu: () => set(u => ({ ...u, pMenu: !u.pMenu })),
      menu: [] as { label: string; icon: string; bg: string; fg: string; go: () => void }[],
      shareOpen: false, closeShare: NONE, shareList: [] as { name: string; role: string; ini: string; pick: () => void }[],
      infoOpen: false, closeInfo: NONE, info: [] as { k: string; v: string; rule: string; vFg: string }[],
      openBook: NONE, bookOpen: false, closeBook: NONE, rooms: [] as { label: string; pick: () => void; bd: string; bg: string; dot: string; ring: string }[],
      isMonth: true, isWeek: false, vMonth: NONE, vWeek: NONE, vMonthBg: "#fff", vWeekBg: "transparent", vMonthFg: "#3F2B22", vWeekFg: "#806B60",
      monthLbl: "", mPrev: NONE, mNext: NONE, cells: [] as Cell[], wk: [] as Cell[], slots: [] as Slot[], bookLabel: "Pick a time", bookBg: "#D9C7BA", confirm: undefined as (() => void) | undefined,
    },
  };
}
export type LeadVM = ReturnType<typeof leadVM>;
