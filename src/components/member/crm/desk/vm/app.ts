/**
 * The desktop CRM's one view model (CRM Desktop rev 1): every binding the generated markup (../DeskApp.tsx) reads —
 * the prototype's own names (CrmFrame.dc.html; vm/proto-logic.ts is its logic, verbatim, for the pixel comparison) —
 * from the CRM's data, the phone's writes and permissions, and the desktop's own (PROPOSALS.md B1–B9).
 */
import type { DeskCtx } from "./ctx";
import { frameVM } from "./frame";
import { clistVM, insightVM } from "./insight";
import { alertsVM, assignVM, infoVM, inboxVM, teamPaneVM } from "./inbox";
import { calendarVM } from "./calendar";
import { assignPageVM } from "./assign";
import { showroomsVM } from "./showrooms";
import { settingsVM } from "./settings";
import { adsPerfVM } from "./adsperf";
import { chatProgressVM } from "./chatprogress";
import { chatVM } from "./chat";
import { bookVM, customerFormVM, historyVM, noteVM } from "./extras";

export function deskVM(ctx: DeskCtx) {
  const { ui, patch, data } = ctx;
  const fr = frameVM(ctx);
  const op = fr.opItem;
  const chat = chatVM(ctx, ui.chat), aw = chatVM(ctx, ui.awChat);
  const clist = clistVM(ctx), team = teamPaneVM(ctx), info = infoVM(ctx);
  const cur = ui.chat ? data.customers.find(c => c.id === ui.chat) : undefined;
  // The pane's head (the prototype's `ph`), per kind.
  const heads = {
    chat: chat.head ?? { avatar: "", title: "", sub: "", subColor: "#387557", menu: false },
    alerts: { avatar: "", title: "CRM alerts", sub: "Move · Share · Won · Lost · Overdue 9 h+", subColor: "#806B60", menu: false },
    section: { avatar: "", title: op, sub: ui.tab === "assignment" ? "Assignment · CRM · Manage" : "Settings · CRM · Manage", subColor: "#806B60", menu: false },
    assign: { avatar: "", title: "Assign to", sub: cur ? `${cur.name} · ${cur.ad}` : "", subColor: "#806B60", menu: false },
    metrics: { avatar: "", title: "Customise metrics", sub: ui.mFor === "cards" ? "Pick the cards for Insight" : "Pick the columns for Ads Performance", subColor: "#806B60", menu: false },
    clist: { avatar: "", ...clist.clistHead, subColor: "#806B60", menu: false },
    info: { avatar: "", ...info.infoHead, subColor: "#806B60", menu: false },
    team: { avatar: "", ...team.teamHead, subColor: "#806B60", menu: false },
    book: { avatar: "", title: "Appointment", sub: cur ? `${cur.name} · showroom visit` : "", subColor: "#806B60", menu: false },
    note: { avatar: "", title: "Notes", sub: cur?.name ?? "", subColor: "#806B60", menu: false },
    form: { avatar: "", title: "Edit customer", sub: data.customers.find(c => c.id === (ui.infoId ?? ""))?.name ?? "", subColor: "#806B60", menu: false },
  };
  const as = assignPageVM(ctx, op);
  const awC = ui.awChat ? data.customers.find(c => c.id === ui.awChat) : undefined;
  const undoOn = !!ui.undo && ui.undo.until > ctx.now.getTime();
  return {
    ...fr,
    ...insightVM(ctx),
    ...clist, ...team, ...info,
    ...inboxVM(ctx), ...assignVM(ctx), ...alertsVM(ctx),
    ...calendarVM(ctx),
    ...as,
    ...showroomsVM(ctx, op),
    ...settingsVM(ctx, op),
    ...adsPerfVM(ctx),
    ...chatProgressVM(ctx, op),
    ph: heads[ui.kind] ?? heads.chat,
    chatOwner: chat.owner, chatReply: chat.reply, msgs: chat.msgs, draft: chat.draft, setDraft: chat.setDraft, draftKey: chat.draftKey, send: chat.send, micD: chat.micD, attach: chat.attach, photo: chat.photo,
    awMsgs: aw.msgs, awDraft: aw.draft, awSetDraft: aw.setDraft, awDraftKey: aw.draftKey, awSend: aw.send, awMicD: aw.micD, awAttach: aw.attach, awPhoto: aw.photo,
    awInfo: () => { if (awC) patch({ awMenuOpen: false, tab: ui.tab, pane: "overlay", kind: "info", infoId: awC.id, visit: null }); },
    awBook: () => { if (awC) patch({ awMenuOpen: false, pane: "overlay", kind: "book", chat: awC.id, book: null }); },
    openNote: () => { if (ui.chat) patch({ menu: false, kind: "note" }); },
    editInfo: () => patch({ kind: "form", cform: null }),
    kBook: ui.kind === "book", kNote: ui.kind === "note", kForm: ui.kind === "form",
    book: bookVM(ctx, cur), note: noteVM(ctx, cur), cform: customerFormVM(ctx, data.customers.find(c => c.id === (ui.infoId ?? ui.chat ?? ""))), history: historyVM(ctx),
    cyclePeriod: () => { const order = ["month", "week", "day"] as const, i = order.indexOf(ui.insPer as (typeof order)[number]); patch({ insPer: order[(i + 1) % order.length], insRange: null }); },
    periodOpts: (["day", "week", "month", "custom"] as const).map((k, i) => ({ label: ["Today", "This week", "This month", "Custom"][i], on: ui.insPer === k, off: ui.insPer !== k,
      pick: () => (k === "custom" ? patch({ insPer: "custom", insRange: ui.insRange ?? { a: new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 1).getTime(), b: ctx.now.getTime() } }) : patch({ insPer: k, insRange: null })) })),
    periodNow: ({ day: "Today", week: "This week", month: "This month", custom: "Custom" } as const)[ui.insPer],
    // The toast's Undo (30 s): a Send to goes back to whoever had the customer; a delete brings the notifications back.
    canUndo: undoOn,
    undoSend: () => { const u = ui.undo; if (!u) return; patch({ undo: null, toast: "" });
      if (u.kind === "send" && u.customerId) void (u.prev ? ctx.act.sendTo(u.customerId, u.prev) : Promise.resolve(false));
      if (u.kind === "delete" && u.ids) void ctx.deskAct.restoreNotifs(u.ids); },
    toastText: ui.toast,
    // Meta Ads is not connected yet (PROPOSALS.md C): its columns read "—" and the line says why.
    metaSync: "Meta Ads not connected yet", metaDot: "#B4AEA4",
  };
}
export type DeskVM = ReturnType<typeof deskVM>;
