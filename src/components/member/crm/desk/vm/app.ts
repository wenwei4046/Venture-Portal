/**
 * The desktop CRM's one view model (CRM Desktop rev 1): every binding the generated markup (../DeskApp.tsx) reads —
 * the prototype's own names (CrmFrame.dc.html; vm/proto-logic.ts is its logic, verbatim, for the pixel comparison) —
 * from the CRM's data, the phone's writes and permissions, and the desktop's own (PROPOSALS.md B1–B9).
 */
import type { DeskCtx } from "./ctx";
import { frameVM } from "./frame";
import { clistVM, insightVM } from "./insight";
import { alertsVM, assignVM, chatMenuVM, infoVM, inboxVM, teamPaneVM } from "./inbox";
import { answerOf, formV2 } from "./form";
import { initials } from "./data";
import { calendarVM } from "./calendar";
import { assignPageVM } from "./assign";
import { assignV2VM } from "./assign-v2";
import { peopleVM } from "./people";
import { formPageVM } from "./formpage";
import { auditVM } from "./audit";
import { channelsVM } from "./channels";
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
  const chat = chatVM(ctx, ui.chat);
  const clist = clistVM(ctx), team = teamPaneVM(ctx), info = infoVM(ctx);
  const cur = ui.chat ? data.customers.find(c => c.id === ui.chat) : undefined;
  // The pane's head (the prototype's `ph`), per kind.
  const heads = {
    chat: chat.head ?? { avatar: "", title: "", sub: "", subColor: "#387557", menu: false },
    alerts: { avatar: "", title: "CRM alerts", sub: "Move · Share · Won · Lost · Overdue 9 h+", subColor: "#806B60", menu: false },
    section: { avatar: "", title: op, sub: ui.tab === "assignment" ? "Assignment · CRM · Manage" : "Settings · CRM · Manage", subColor: "#806B60", menu: false },
    assign: { avatar: "", title: "Assign to", sub: cur ? `${cur.name} · ${cur.ad}` : "", subColor: "#806B60", menu: false },
    // v2's Move / Share heads.
    move: { avatar: "", title: "Move", sub: cur ? `${cur.name} · to your direct upline only` : "", subColor: "#806B60", menu: false },
    share: { avatar: "", title: ctx.me.role === "boss" ? "Share · invite your team" : "Share", sub: cur ? `${cur.name}${ctx.me.role === "boss" ? " · they join the chat with you" : " · invite a teammate · same team only"}` : "", subColor: "#806B60", menu: false },
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
    ...assignV2VM(ctx, op, as, { sheetW: fr.sheetW, isAdsOp: fr.isAdsOp, isFtOp: fr.isFtOp, isMwtOp: fr.isMwtOp, sheetMode: fr.sheetMode, perfW: fr.perfW }),
    ...showroomsVM(ctx, op),
    ...settingsVM(ctx, op),
    ...peopleVM(ctx),
    ...formPageVM(ctx),
    ...auditVM(ctx),
    ...channelsVM(ctx),
    ...adsPerfVM(ctx),
    ...chatProgressVM(ctx, op),
    ph: heads[ui.kind] ?? heads.chat,
    chatOwner: chat.owner, chatReply: chat.reply, msgs: chat.msgs, firstDay: chat.firstDay, draft: chat.draft, setDraft: chat.setDraft, draftKey: chat.draftKey, send: chat.send, micD: chat.micD, sendTitle: chat.sendTitle, photo: chat.photo,
    pinShown: chat.pinShown, pinText: chat.pinText, unpinMsg: chat.unpinMsg, replyOn: chat.replyOn, replyWho: chat.replyWho, replyText: chat.replyText, cancelReply: chat.cancelReply,
    attachOpen: chat.attachOpen, attachToggle: chat.attachToggle, attachClose: chat.attachClose, attachOpts: chat.attachOpts,
    // The design's one-message chat bindings, unused live (desk-chat-v2.cjs draws every message): the sample's values.
    sysLines: [] as { text: string; at: string }[], msgShown: false, chatIn: false, chatOut: false, chatText: "", chatTime: "", chatAppt: false,
    ...chatMenuVM(ctx, chat),
    // Inbox's Customer info column (v2): the Customer form's sections — what the CRM fills and what was asked (vm/form.ts).
    ibInfo: (() => { const c = cur; const secs = formV2(data);
      return { name: c?.name ?? "", ini: c ? initials(c.name) : "", groups: c ? secs.map(sec => ({ label: sec.label,
        rows: sec.fields.filter(fl => fl.id !== "name").map((fl, i) => { const val = answerOf(data, c, fl, ctx.nameOf);
          return { k: fl.label.replace(/ (RM)$/, ""), v: val, bt: i ? "1px solid #F1E7DF" : "0", w: val === "—" ? 400 : 650, c: val === "—" ? "#A08E82" : "#3F2B22" }; }) })) : [] }; })(),
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
