/**
 * The desktop CRM's frame (CRM Desktop v2): the CRM's own sidebar — its pages in three groups, Back to Revenue app and
 * the profile (Sign out), the 72 px rail — its top bar, the CRM's head, the right menu (Assignment, Showrooms, Customer
 * form, Settings), the side pane (docked / overlay / wide, dragged to size), Inbox's four columns and the toast. Ported
 * from the prototype's _rv; the numbers are the phone's.
 */
import type { CSSProperties } from "react";
import { notifsVM } from "../../panel/vm/notifs";
import { urgencyOf } from "../../sales/vm/common";
import type { DeskCtx, DeskTab, PaneKind, PaneMode } from "./ctx";
import { first, initials } from "./data";
import { ICON, LI, MANAGE_TABS, NAV, NAV_GROUPS, PANE_MODE, PANEL_TABS, PHONE_IC, SECTION_PICK, SHEET_COPY, SOLID, TINTS } from "./tokens";
import { edgeDrag } from "./columns";
import { alertsUnreadN } from "./inbox";
import { jobTitle } from "../../shared/people";

const SHEET_TABS: DeskTab[] = ["assignment", "settings", "showrooms", "forms"];
export const sheetOn = (tab: DeskTab) => SHEET_TABS.includes(tab);

/** Each right menu's rows: [title, sub, icon] (the prototype's LISTS), with the live counts. */
export function lists(ctx: DeskCtx): Record<string, [string, string, string][]> {
  const { data, now } = ctx;
  void now;
  const adIds = [...new Set(data.customers.map(c => c.adId).filter((x): x is string => !!x))];
  const unset = adIds.filter(a => !data.adRules.some(r => r.adId === a)).length;
  const held = data.customers.filter(c => c.held && !c.assignedTo).length;
  const ftTeams = ctx.teams.filter(t => data.ftRules.some(r => r.tlId === t.id && r.days.length)).length;
  return {
    // v2: Ads to teams · Full time lead allocation · Member work type (Awaiting reply and Chat progress left the menu —
    // Chat progress is Inbox's fourth column; Member work type moved here from Settings). No Organic Leads (2026-10-13).
    assignment: [
      ["Ads to teams", `${adIds.length} ads · ` + (held ? `${held} ${held === 1 ? "lead" : "leads"} over the limit` : unset ? `${unset} on the default (evenly)` : "all set"), "megaphone"],
      // v2 (06b / 06c): no line under the tabs — the table card carries its own title and counts.
      ["Leads by ad", "", "users"],
      ["Active members", data.lockedStaff?.length ? `${data.lockedStaff.length} locked · no new leads for now` : "Everyone takes new leads", "users"],
      ["Full time lead allocation", ftTeams ? `On for ${ftTeams} of ${ctx.teams.length} teams` : "Not set for any team", "users"],
      ["Member work type", "Full time or part time for each member", "briefcase"],
    ],
    // Settings = Cold lead templates and Notifications (v2). History is the sidebar's Audit log now.
    settings: [["General", "", "file"], ["Cold lead templates", "", "file"], ["Notifications", "", "bell"]],
    showrooms: [["Showrooms", "", "store"]],
    forms: [["Forms", "", "file"]],
  };
}

/** Counts on the right menu's rows (the prototype's BADGE). */
function badges(ctx: DeskCtx): Record<string, number> {
  const { data, now } = ctx;
  return {
    "Organic Leads": data.customers.filter(c => !c.assignedTo && !c.teamId && !c.held).length,
    "Awaiting reply": data.customers.filter(c => urgencyOf(c, now).level !== "none").length,
    Notifications: Number(notifsVM(panelLike(ctx)).notifUnread) || 0,
  };
}

/** The phone panel's view models take a PanelCtx: the same data and writes, with the phone's own screen state. */
import { initialPanelUi } from "../../panel/ui";
import type { PanelCtx } from "../../panel/vm/common";
export function panelLike(ctx: DeskCtx): PanelCtx {
  return {
    data: ctx.data, me: ctx.me, now: ctx.now, live: ctx.live, ui: initialPanelUi(), set: () => {}, patch: () => {}, act: ctx.act,
    nameOf: ctx.nameOf, teams: ctx.teams, directors: ctx.directors,
    teamOfStaff: id => (id ? ctx.teams.find(t => t.id === id || t.people.some(p => p.id === id)) : undefined),
    openCrmOf: () => {}, exitApp: ctx.exit, slotCounts: {},
  };
}

export function frameVM(ctx: DeskCtx) {
  const { ui, set, patch, W, H, me, data } = ctx;
  const tab = ui.tab, pane = ui.pane, kind = ui.kind;
  const collapsed = ui.collapsed;
  // 4a: the Revenue sidebar folded to its icons, 68 px (it opens over the CRM when pointed at — Desk4aSide; the owner
  // 2026-10-18: "点入crm 后，左手边自动收起"; it was 240), and the CRM nav (237); shut, the 72 px rail.
  const sbW = collapsed ? 72 : 305;
  const crmW = W - sbW;
  const role = me.role === "boss" ? "principal" : "director";
  const teamMine = role === "director";
  const W1440 = W >= 1440;
  // Inbox's four columns (v2): list › chat › Customer info › Chat progress (a 44 px rail when shut), each dragged to size.
  const ibOn = tab === "inbox" && (pane === "docked" || pane === "empty");
  const ibHas = pane === "docked";
  // 4a (frames 02 / 02b / 02c, change list 13): the list 290, Customer info 260, the chat's Audit log 290 — each a 44 px
  // strip when folded, docked beside the chat at every width. From 1680 px both may be open; below, opening one folds
  // the other (the toggles below).
  const ibCpOpen = !!ui.ibCp, ibCpDock = ibCpOpen;
  const ibListW = ui.ibListW ?? 290, ibInfoW = ui.ibInfoW ?? 260, ibCpW = ui.ibCpW ?? 290;
  const BOTH = W >= 1680;
  // Customer info opens by default (the owner, 2026-10-16); on a narrow screen (1280) it starts folded so the chat keeps room.
  const infoShut = ui.ibInfoShut ?? (crmW - ibListW - ibInfoW - 44 < 300);
  let dockW = W1440 ? 440 : 400;
  if (ibOn) dockW = crmW - ibListW - (infoShut ? 44 : ibInfoW) - (ibCpDock ? ibCpW : 44);
  const ibSpare = Math.max(0, dockW - 300);
  const manage = data.can.manage;
  const tabList = PANEL_TABS.filter(([id]) => manage || !MANAGE_TABS.has(id));
  // Entering Inbox always gives its columns their standard widths and shuts Chat progress (README › Navigation).
  const go = (id: DeskTab) => set(u => ({ ...u, tab: id, pane: PANE_MODE[id], toast: "", pick: null, stage: "op", // 4a: no right-hand menu — Assignment's sections are the head's tabs (frame 06)
    ...(id === "inbox" ? { ibListW: null, ibInfoW: null, ibCpW: null, ibCp: null } : {}), adLog: false, mwtLog: false, meMenu: false,
    chat: null, sendFor: null, awChat: null, ad: null, ftEdit: null, srEdit: null, srDraft: null, cpSel: null, frmOpen: false, cltEdit: null, menu: false, attachOpen: false, emo: null, msgMenu: null, rail: false, ppSel: null })); // Contacts' and the Calendar's rails start folded on every page (the owner, 2026-10-18 — twice)
  const scopeOpts = ([["Team", false], ["Mine", true]] as const).map(([label, isMine]) => ({ label, on: !isMine, off: isMine,
    pick: () => { if (isMine) ctx.toMine?.(); } }));
  const periodOpts = ["Today", "This week", "This month", "Custom"].map((label, i) => ({ label, on: i === 2, off: i !== 2 }));

  const sheetMode = sheetOn(tab);
  const stage = ui.stage;
  const isWide = !sheetMode && pane === "wide";
  const isCenter = !sheetMode && pane === "wideEmpty";
  const isOverlay = pane === "overlay";
  const paneShown = !sheetMode && pane !== "closed" && pane !== "wideEmpty";
  // A chat opened in the pane outside Inbox (the Calendar's Customer info › Open chat …) takes more room, and the page
  // beside it shifts left (the owner, 2026-10-15: "聊天在右边打开，日历往左缩"): 42 % of the CRM, never under the dock.
  const chatPane = !ibOn && ui.kind === "chat" && ui.pane === "docked" ? Math.max(dockW, Math.min(crmW - 560, Math.round(crmW * 0.42))) : 0;
  const paneW0 = isWide ? crmW - 380 : chatPane || dockW, paneW = Math.max(300, Math.min(crmW - 320, ui.paneW ?? paneW0));
  const base: CSSProperties = { width: paneW, display: "flex", flexDirection: "column", background: "var(--crm-page)", boxSizing: "border-box", overflow: "hidden" };
  const paneStyle: CSSProperties = isOverlay
    ? { ...base, position: "absolute", top: 0, right: 0, bottom: 0, borderLeft: "1px solid var(--crm-rule)", boxShadow: "-16px 0 40px rgba(42,22,12,.16)", zIndex: 4 }
    : { ...base, flex: `0 0 ${paneW}px`, minWidth: 0, position: "relative", overflow: ibOn ? "visible" : "hidden", borderLeft: isWide ? 0 : "1px solid var(--crm-rule)" };

  const L = lists(ctx), B = badges(ctx);
  const empties: Record<string, [string, string, string]> = {
    inbox: ["Pick a chat to read and reply", "It opens here; the list stays where it is", "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z"],
    assignment: ["Pick a section", "Its editors open here", "M6 3v6a6 6 0 0 0 6 6h6m0 0-3-3m3 3-3 3M6 21v-6"],
    settings: ["Pick a setting", "It opens here", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  };
  const em = empties[tab] ?? empties.inbox;
  const pickIdx = pane === "wide" ? (ui.pick ?? SECTION_PICK[tab] ?? 0) : -1;
  const listCards = (L[tab] ?? []).map(([title, sub, ic], i) => ({
    title, sub, d: LI[ic], bg: TINTS[i % 4][0], fg: TINTS[i % 4][1],
    rowBg: i === pickIdx ? "var(--crm-tint-attention)" : "transparent", titleColor: i === pickIdx ? "var(--crm-rust)" : "var(--crm-ink)",
    pick: () => patch({ pane: "wide", kind: "section", pick: i }),
  }));

  const fold = ui.fold;
  const mkSec = <T,>(id: string, items: T[]) => ({ num: "", label: "", scope: false, items, open: !fold[id], rot: fold[id] ? -90 : 0,
    toggle: () => set(u => ({ ...u, fold: { ...u.fold, [id]: !u.fold[id] } })) });
  const crmItems = tabList.map(([id, label]) => ({ label, d: ICON[id], count: null as number | null, on: id === tab, off: id !== tab, pick: () => go(id) }));
  // The sidebar's groups (v2): the reading pages, MARKETING, MANAGEMENT — a page one may not open is left out, and so is a group with none.
  const crmGroups = NAV_GROUPS.map(([label, ids]) => ({ label: label || null, items: ids.map(id => crmItems[tabList.findIndex(t => t[0] === id)]).filter(Boolean) }))
    .filter(g => g.items.length).map((g, gi) => ({ ...g, pt: gi ? "14px" : "0" }));
  const appGo: Record<string, () => void> = {
    Today: () => ctx.app.go("today"), Insight: () => ctx.app.go("insight"), Quote: () => ctx.app.go("quote"), Arena: () => ctx.app.go("arena"),
  };
  const appTop = NAV.filter(n => n[0] !== "Notifications" && n[0] !== "Profile").map(([label, d]) => ({ label, d, count: null as number | null, on: false, off: true, pick: appGo[label] }));
  const appBottom = NAV.filter(n => n[0] === "Notifications").map(([label, d]) => ({ label, d, count: ctx.app.notifCount || null, on: false, off: true, pick: ctx.app.openNotifications }));
  const profIcon = { label: "Profile", d: NAV[4][1], count: null as number | null, on: false, off: true, pick: () => patch({ collapsed: false }) };
  void profIcon;
  // The 72 px rail: the CRM's pages only (v2 — the Revenue app is Back to Revenue app away).
  const sections = [mkSec("crm", crmItems)];
  const curTab = tabList.find(t => t[0] === tab) ?? PANEL_TABS[0];
  const opIdx = ui.pick ?? SECTION_PICK[tab] ?? 0;
  const opItem = (L[tab] ?? [])[opIdx] ?? ["", "", ""];
  const sc = SHEET_COPY[tab] ?? ["", "", ""];
  const sheetRows = (L[tab] ?? []).map(([title, sub, ic], i) => ({ title, sub, d: PHONE_IC[title] ?? LI[ic], badge: B[title] || null, bg: SOLID[i % 5], fg: "var(--crm-page)",
    tint: ["var(--crm-tint-attention)", "var(--crm-tint-cold)", "var(--crm-tint-new)", "var(--crm-tint-follow)", "var(--crm-field)"][i % 5], bt: i ? "1px solid var(--crm-field)" : "0",
    pick: () => patch({ pick: i, stage: "op", adLog: false, mwtLog: false, actDraft: null, sendFor: null, awChat: null, ad: null, ftEdit: null, cpSel: null, frmOpen: false, cltEdit: null }) }));

  const closePane = () => {
    if (sheetMode) {
      set(u => u.sendFor ? { ...u, sendFor: null } : u.awChat ? { ...u, awChat: null } : u.srEdit ? { ...u, srEdit: null, srDraft: null }
        : u.ftEdit ? { ...u, ftEdit: null } : u.ad != null ? { ...u, ad: null } : u.cpSel ? { ...u, cpSel: null } : { ...u, stage: "op" });
      return;
    }
    if (pane === "closed" || pane === "empty" || pane === "wideEmpty") return;
    set(u => ({ ...u, pane: PANE_MODE[tab] as PaneMode, kind: "chat" as PaneKind, chat: null, pick: null, fromTeam: false, fromList: false, fromInfo: false }));
  };
  const meCard = me.role === "boss"
    ? { ini: "PR", name: "Principal", first: "Principal", sub: "Principal · All access" }
    : { ini: initials(me.name), name: me.name, first: first(me.name), sub: `${jobTitle(me)} · ${ctx.app.subName.replace(/ view$/, "")}` };
  const undo = ui.undo;
  // 4a: the docked editor (frame 06). On Ads to teams it stands beside Ad performance's and the Audit log's strips, so it
  // starts narrower and the ad list keeps room for the names (the owner, 2026-10-18: "调一下 Split 宽度"); a drag still sets it.
  const adsOp = opItem[0] === "Ads to teams";
  const sheetW = ui.sheetW ?? (adsOp ? (W1440 ? 460 : 400) : W1440 ? 461 : 420), menuW = ui.menuW ?? (W1440 ? 340 : 310);
  const alertsN = alertsUnreadN(ctx);
  return {
    W, H, sbW, sbOpen: !collapsed, sbClosed: collapsed, sections, appTop, appBottom, crmItems, crmGroups,
    // The profile (v2): its menu has Sign out; Back to Revenue app sits above it.
    meMenuOpen: ui.meMenu, meBd: ui.meMenu ? "var(--crm-rust)" : "var(--crm-rule)", toggleMeMenu: () => patch({ meMenu: !ui.meMenu }),
    closeMeMenu: () => patch({ meMenu: false }), returnApp: () => { patch({ meMenu: false }); ctx.exit(); },
    signOutMe: () => { patch({ meMenu: false }); ctx.app.signOut(); },
    // CRM alerts' count: the alerts its pane lists (rev 1 drew the design's sample 7 whatever there was).
    alertsN: alertsN ? String(alertsN) : "", alertsHas: alertsN > 0,
    // Inbox's columns (v2).
    ibCols: ibOn, ibInfoW, ibCpW, ibHas, ibNone: !ibHas,
    // Customer info folds to a strip and back (the owner, 2026-10-16: "右邊的 customer info 做也能收起的功能，但是 default 是開著的").
    ibInfoShut: infoShut, ibInfoFold: () => patch({ ibInfoShut: true }), ibInfoRail: { title: "Customer info", open: () => patch({ ibInfoShut: false, ...(BOTH ? {} : { ibCp: false }) }) },
    // v2 (note 06): the list 300–480 px, the Audit log 240–520 px, the chat keeping at least 420 (ibSpare).
    dragList: edgeDrag(set, "ibListW", ibListW, 1, 290, Math.min(480, ibListW + ibSpare)), dragInfo: edgeDrag(set, "ibInfoW", ibInfoW, -1, 220, Math.min(440, ibInfoW + ibSpare)),
    dragCp: edgeDrag(set, "ibCpW", ibCpW, -1, 240, ibCpDock ? Math.min(520, ibCpW + ibSpare) : 520),
    resetList: () => patch({ ibListW: null }), resetInfo: () => patch({ ibInfoW: null }), resetCp: () => patch({ ibCpW: null }),
    ibCpOpen: ibOn && ibCpOpen, ibCpClosed: ibOn && !ibCpDock,
    ibCpStyle: (ibCpDock ? { position: "relative", flex: `0 0 ${ibCpW}px`, width: ibCpW, boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", minHeight: 0 }
      : { position: "absolute", top: 0, right: ibInfoW + 44, bottom: 0, width: ibCpW, boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", boxShadow: "-16px 0 40px rgba(42,22,12,.16)", display: "flex", flexDirection: "column", zIndex: 4 }) as CSSProperties,
    ibCpToggle: () => patch({ ibCp: !ui.ibCp, ...(!ui.ibCp && !BOTH ? { ibInfoShut: true } : {}) }),
    // Every pane and editor is dragged to size; a double-click gives it back (v2).
    sheetW, dragSheet: edgeDrag(set, "sheetW", sheetW, -1, 360, W1440 ? 760 : 620), resetSheet: () => patch({ sheetW: null }),
    paneDrag: !ibOn && !sheetMode && !isOverlay && paneShown, dragPane: edgeDrag(set, "paneW", paneW, -1, 300, crmW - 320), resetPane: () => patch({ paneW: null }),
    perfW: ui.perfW ?? sheetW, dragPerf: edgeDrag(set, "perfW", ui.perfW ?? 260, -1, 220, 420), resetPerf: () => patch({ perfW: null }),
    dragMwtLog: edgeDrag(set, "mwtLogW", ui.mwtLogW ?? 280, -1, 220, 440), resetMwtLog: () => patch({ mwtLogW: null }),
    dragAudit: edgeDrag(set, "auditW", ui.auditW ?? 280, -1, 220, 420), resetAudit: () => patch({ auditW: null }),
    menuW, dragMenu: edgeDrag(set, "menuW", menuW, -1, 280, W1440 ? 760 : 620), resetMenu: () => patch({ menuW: null }),
    me: meCard, profileOpen: !fold.profile, profileRot: fold.profile ? -90 : 0, showScope: teamMine && !!ctx.toMine,
    toggleProfile: () => set(u => ({ ...u, fold: { ...u.fold, profile: !u.fold.profile } })), toggleSb: () => patch({ collapsed: !collapsed }),
    pageTitle: curTab[1], pageBadge: null as number | null, scopeOpts,
    showPeriod: tab === "insight" && W >= 1440 && !teamMine, showPeriodCompact: tab === "insight" && (W < 1440 || teamMine),
    periodNow: "This month", alertsLabel: W >= 1440, periodOpts, openAlerts: () => patch({ pane: "overlay", kind: "alerts" }),
    isWide, isCenter, notWide: !isWide && !isCenter && !sheetMode, listCards,
    showScrim: isOverlay, paneShown, paneStyle, paneEmpty: pane === "empty" || pane === "wideEmpty", paneFull: pane === "docked" || pane === "overlay" || pane === "wide",
    emptyText: em[0], emptyHint: em[1], emptyIcon: em[2],
    kChat: kind === "chat", kAlerts: kind === "alerts", kSection: kind === "section", kInfo: kind === "info", kClist: kind === "clist", kMetrics: kind === "metrics", kTeam: kind === "team", kAssign: kind === "assign",
    closePane,
    sheetMode, sheetOpen: sheetMode && stage === "menu", sheetTitle: sc[0], sheetSub: sc[1], sheetRows,
    opKicker: sc[0].toUpperCase(), opTitle: tab === "forms" ? "Customer form" : opItem[0], opChip: sc[2], opSub: opItem[1], openSheet: () => patch({ stage: "menu" }),
    showKicker: tab !== "showrooms" && tab !== "forms", // The section pill ("All assignment ⌄") is gone (the owner, 2026-10-13): the right menu already switches sections.
    showOpChip: false,
    isAdsOp: opItem[0] === "Ads to teams", notAdsOp: opItem[0] !== "Ads to teams" && opItem[0] !== "Full time lead allocation",
    isFtOp: opItem[0] === "Full time lead allocation", isMwtOp: opItem[0] === "Member work type", isActOp: opItem[0] === "Active members", isLbaOp: opItem[0] === "Leads by ad", isHistOp: false, isSrOp: opItem[0] === "Showrooms", isCltOp: opItem[0] === "Cold lead templates",
    isCpOp: opItem[0] === "Chat progress", isFrmOp: opItem[0] === "Forms" && tab !== "forms", isNtfOp: tab === "settings" && opItem[0] === "Notifications", isGenOp: tab === "settings" && opItem[0] === "General",
    // v2's page padding and title size: Ads to teams and Full time take the frame's whole width.
    // 4a: the pages' gutter under the head (frames 06–11): 16 px down, 36 px in.
    pagePad: tab === "forms" ? "0" : opItem[0] === "Ads to teams" ? "16px 28px 20px 36px" : tab === "settings" && opItem[0] === "General" ? "6px 36px 32px" : "16px 36px 32px",
    h1Size: opItem[0] === "Full time lead allocation" || opItem[0] === "Ads to teams" ? "22px" : "34px",
    kAudit: tab === "auditlog", kPeople: tab === "people", kCh: tab === "channels", cfOn: tab === "forms",
    plainOp: !["Ads to teams", "Leads by ad", "Active members", "Full time lead allocation", "Member work type", "Cold lead templates", "Showrooms", "Forms"].includes(opItem[0]) && !(tab === "settings" && (opItem[0] === "Notifications" || opItem[0] === "General")),
    opItem: opItem[0],
    showToast: !!ui.toast, toastText: ui.toast, canUndo: !!undo && undo.until > ctx.now.getTime(),
    // The Revenue app's own top bar (desk-patches.cjs).
    frameRadius: "0", frameShadow: "none", greetWord: ctx.app.greeting, subLabel: ctx.app.subName ? `${ctx.app.subName} view` : "", subCur: "pointer", dateLine: ctx.app.dateLine,
    appBellDot: ctx.app.bellUnread, openSubDept: ctx.app.openSubDept, openAppBell: ctx.app.openBell, signOut: ctx.app.signOut,
    role,
  };
}
export type FrameVM = ReturnType<typeof frameVM>;
