/**
 * The desktop CRM's one view model (CRM Desktop rev 1): every binding the generated markup (../DeskApp.tsx) reads —
 * the prototype's own names (CrmFrame.dc.html; vm/proto-logic.ts is its logic, verbatim, for the pixel comparison) —
 * from the CRM's data, the phone's writes and permissions, and the desktop's own (PROPOSALS.md B1–B9).
 */
import type { DeskCtx } from "./ctx";
import { frameVM } from "./frame";
import { frame4aVM, heads4a } from "./frame4a";
import { clistVM, insightVM } from "./insight";
import { alertsVM, assignVM, chatMenuVM, infoVM, inboxVM, moveHolder, teamPaneVM } from "./inbox";
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
import { reportsVM } from "./reports-page";
import { chatProgressVM } from "./chatprogress";
import { chatVM } from "./chat";
import { railVM } from "./rail";
import { bookVM, customerFormVM, historyVM, noteVM } from "./extras";
import { adHref } from "../../shared/AdLink";
import { urgencyOf } from "../../sales/vm/common";
import { avatarTint } from "../../shared/palette";

export function deskVM(ctx: DeskCtx) {
  const { ui, patch, data } = ctx;
  const fr = frameVM(ctx);
  const op = fr.opItem;
  const chat = chatVM(ctx, ui.chat);
  const clist = clistVM(ctx), team = teamPaneVM(ctx), info = infoVM(ctx);
  const cur = ui.chat ? data.customers.find(c => c.id === ui.chat) : undefined;
  // The pane's head (the prototype's `ph`), per kind.
  const heads = {
    chat: chat.head ?? { avatar: "", title: "", sub: "", subColor: "var(--crm-brown)", menu: false },
    alerts: { avatar: "", title: "CRM alerts", sub: "Assign · Move · Share · Won · Lost · Overdue 9 h+", subColor: "var(--crm-muted)", menu: false },
    section: { avatar: "", title: op, sub: ui.tab === "assignment" ? "Assignment · CRM · Manage" : "Settings · CRM · Manage", subColor: "var(--crm-muted)", menu: false },
    assign: { avatar: "", title: "Assign to", sub: cur ? `${cur.name} · ${cur.ad}` : "", subColor: "var(--crm-muted)", menu: false },
    // v2's Move / Share heads. A Move is a request (2026-10-23) — to whose direct upline, as chatMenuVM lists them.
    move: { avatar: "", title: "Move", sub: cur ? `${cur.name} · a request to ${moveHolder(ctx, cur) === ctx.me.id ? "your" : `${ctx.nameOf(moveHolder(ctx, cur))}'s`} direct upline` : "", subColor: "var(--crm-muted)", menu: false },
    share: { avatar: "", title: ctx.me.role === "boss" ? "Share · invite your team" : "Share", sub: cur ? `${cur.name}${ctx.me.role === "boss" ? " · they join the chat with you" : " · invite a teammate · same team only"}` : "", subColor: "var(--crm-muted)", menu: false },
    metrics: { avatar: "", title: "Customise metrics", sub: ui.mFor === "cards" ? "Pick the cards for Insight" : ui.mFor === "chart" ? "Pick up to 6 metrics for the chart" : "Pick the columns for Ads Performance", subColor: "var(--crm-muted)", menu: false },
    clist: { avatar: "", ...clist.clistHead, subColor: "var(--crm-muted)", menu: false },
    info: { avatar: "", ...info.infoHead, subColor: "var(--crm-muted)", menu: false },
    team: { avatar: "", ...team.teamHead, subColor: "var(--crm-muted)", menu: false },
    book: { avatar: "", title: "Appointment", sub: cur ? `${cur.name} · showroom visit` : "", subColor: "var(--crm-muted)", menu: false },
    note: { avatar: "", title: "Notes", sub: cur?.name ?? "", subColor: "var(--crm-muted)", menu: false },
    form: { avatar: "", title: "Edit customer", sub: data.customers.find(c => c.id === (ui.infoId ?? ""))?.name ?? "", subColor: "var(--crm-muted)", menu: false },
  };
  const as = assignPageVM(ctx, op);
  const awC = ui.awChat ? data.customers.find(c => c.id === ui.awChat) : undefined;
  const pp = peopleVM(ctx), cal = calendarVM(ctx);
  const undoOn = !!ui.undo && ui.undo.until > ctx.now.getTime();
  const out = {
    ...fr,
    ...insightVM(ctx),
    ...clist, ...team, ...info,
    ...inboxVM(ctx), ...assignVM(ctx), ...alertsVM(ctx),
    ...cal,
    ...as,
    ...assignV2VM(ctx, op, as, { sheetW: fr.sheetW, isAdsOp: fr.isAdsOp, isFtOp: fr.isFtOp, isMwtOp: fr.isMwtOp, sheetMode: fr.sheetMode, perfW: fr.perfW }),
    ...showroomsVM(ctx, op),
    ...settingsVM(ctx, op),
    ...pp, ...railVM(ctx, pp, cal.calAn, cal),
    ...formPageVM(ctx),
    ...auditVM(ctx),
    ...channelsVM(ctx),
    ...adsPerfVM(ctx),
    ...reportsVM(ctx),
    // Workspace (2026-10-27): one's own Weekly / Monthly reports (DeskWorkspace.tsx, vm/workspace-report.ts).
    kWorkspace: ui.tab === "workspace",
    workspace: { customers: data.customers, visits: data.visits, adNames: data.adNames ?? {}, nameOf: ctx.nameOf, now: ctx.now, live: ctx.live,
      teams: ctx.teams.map(t => ({ id: t.id, name: t.name, people: t.people.map(p => p.id) })) },
    ...chatProgressVM(ctx, op),
    // 4a's chat head (frame 02): the avatar in the customer's tint and, for a chat, the wait in oxblood ("Attention ·
    // waiting 6 h") or its status in the muted line's colour.
    ph: { avBg: undefined as string | undefined, avFg: undefined as string | undefined, status: "", statusColor: "var(--crm-muted)", ...(heads[ui.kind] ?? heads.chat),
      ...(ui.kind === "chat" && cur ? (() => { const u = urgencyOf(cur, ctx.now), [avBg, avFg] = avatarTint(cur.name);
        return { avBg, avFg, status: u.level !== "none" ? `Attention · waiting ${Math.floor(u.waitingMinutes / 60)} h` : "", statusColor: "var(--crm-oxblood)" }; })() : {}) },
    chatOwner: chat.owner, chatReply: chat.reply, msgs: chat.msgs, firstDay: chat.firstDay, draft: chat.draft, setDraft: chat.setDraft, draftKey: chat.draftKey, send: chat.send, micD: chat.micD, sendTitle: chat.sendTitle, photo: chat.photo,
    pinShown: chat.pinShown, pinText: chat.pinText, unpinMsg: chat.unpinMsg, replyOn: chat.replyOn, replyWho: chat.replyWho, replyText: chat.replyText, cancelReply: chat.cancelReply,
    attachOpen: chat.attachOpen, attachToggle: chat.attachToggle, attachClose: chat.attachClose, attachOpts: chat.attachOpts,
    emojiOpen: chat.emojiOpen, emojiToggle: chat.emojiToggle, emojiFg: chat.emojiFg, emoji: chat.emoji,
    // The design's one-message chat bindings, unused live (desk-chat-v2.cjs draws every message): the sample's values.
    sysLines: [] as { text: string; at: string }[], msgShown: false, chatIn: false, chatOut: false, chatText: "", chatTime: "", chatAppt: false,
    ...chatMenuVM(ctx, chat),
    // Inbox's Customer info column (v2): the Customer form's sections — what the CRM fills and what was asked (vm/form.ts).
    ibInfo: (() => { const c = cur; const secs = formV2(data);
      return { name: c?.name ?? "", ini: c ? initials(c.name) : "", groups: c ? secs.map(sec => ({ label: sec.label,
        rows: sec.fields.filter(fl => fl.id !== "name").map((fl, i) => { const val = answerOf(data, c, fl, ctx.nameOf);
          return { k: fl.label.replace(/ (RM)$/, ""), v: val, href: fl.id === "ad" ? adHref(c.adUrl) : null, bt: i ? "1px solid var(--crm-field)" : "0", w: val === "—" ? 400 : 650, c: val === "—" ? "var(--crm-faint)" : "var(--crm-ink)" }; }) })) : [] }; })(),
    awInfo: () => { if (awC) patch({ awMenuOpen: false, tab: ui.tab, pane: "overlay", kind: "info", infoId: awC.id, visit: null }); },
    awBook: () => { if (awC) patch({ awMenuOpen: false, pane: "overlay", kind: "book", chat: awC.id, book: null }); },
    // 4a Customer info's Book a visit (frame 02): the chat's own Appointment, as its ⋮ menu opens it.
    ibBook: () => { if (ui.chat) patch({ menu: false, kind: "book", book: null }); },
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
    metaSync: "Meta Ads not connected yet", metaDot: "var(--crm-faint)",
  };
  // 4a's frame (2026-10-18): the Revenue sidebar, the CRM nav, the top bar and each page's head — vm/frame4a.ts.
  return { ...out, f4: frame4aVM(ctx, out, heads4a(ctx, { ...out, ppCount: data.customers.length, showroomCount: data.rooms.filter(r => !r.virtual).length })) };
}
export type DeskVM = ReturnType<typeof deskVM>;
