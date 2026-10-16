/**
 * The desktop CRM's context (CRM Desktop rev 1): the CRM's data and writes (the same as the phone's), the Revenue app's
 * frame around it, and the screen's own state — what is open, drafted, filtered — which the prototype keeps in one
 * object (CrmFrame.dc.html's this.state) and so does this.
 */
import type { Dispatch, SetStateAction } from "react";
import type { CrmData, CrmForm, CrmFormField, CrmPerson } from "@/lib/member/crm-data";
import type { PanelActions } from "../../panel/actions";
import type { Team } from "../../panel/vm/common";

export type DeskTab = "insight" | "inbox" | "assignment" | "calendar" | "adsperf" | "showrooms" | "settings" | "people" | "forms" | "channels" | "auditlog";
export type PaneMode = "closed" | "empty" | "docked" | "overlay" | "wide" | "wideEmpty";
export type PaneKind = "chat" | "alerts" | "section" | "info" | "clist" | "metrics" | "team" | "assign" | "book" | "note" | "form" | "move" | "share";

/** The screen's own state. Every key is the prototype's (same name, same meaning) unless it says otherwise. */
export interface DeskUi {
  tab: DeskTab;
  pane: PaneMode;
  kind: PaneKind;
  collapsed: boolean;
  /** Sidebar groups folded (profile = the CRM's tabs under Profile). */
  fold: Record<string, boolean>;
  /** The right menu (Assignment, Settings): 'menu' open, 'op' = the page picked. */
  stage: "menu" | "op";
  /** The section picked in the right menu (index into its list). */
  pick: number | null;
  menu: boolean;
  toast: string;
  /** Undo for a Send to / Move / Delete, and when it runs out. */
  undo: { kind: "send" | "delete"; customerId?: string; prev?: string | null; ids?: string[]; until: number } | null;
  // A chat, a customer, a list in the pane
  chat: string | null;
  fromTeam: boolean;
  fromList: boolean;
  fromInfo: boolean;
  infoId: string | null;
  visit: string | null;
  clist: string;
  clSort: string;
  clSortOpen: boolean;
  team: string | null;
  person: string | null;
  draft: Record<string, string>;
  // Insight's period (the design draws the switch; choosing is filled in, BUILD-NOTES.md)
  insPer: "day" | "week" | "month" | "custom";
  insRange: { a: number; b: number } | null;
  insOpen: boolean;
  /** Insight's Ads Performance cards: the metrics picked with + Metrics (the owner, 2026-10-13), in order. */
  insCards: string[] | null;
  /** What Customise metrics is picking for: Ads Performance's columns, or Insight's ad cards. */
  mFor: "ads" | "cards";
  // Inbox
  whoSel: string[];
  whoOpen: boolean;
  inbF: string;
  // Assignment
  sendFor: string | null;
  awChat: string | null;
  awMenuOpen: boolean;
  ad: string | null;
  adMode: "evenly" | "team";
  /** Ads to teams' editor: the ad's name while it is typed (null = as saved). */
  adNameDraft?: string | null;
  tm: Record<string, "evenly" | "pct" | "max">;
  mv: Record<string, number>;
  split: Record<string, number> | null;
  adSt: "Running" | "Paused" | "Pending" | "all";
  stOpen: boolean;
  ftEdit: string | null;
  ftDraft: { on: boolean; days: Record<string, number[]> } | null;
  // Chat progress
  cpF: string; cpT: string; cpFrom: string; cpTo: string; cpSort: string; cpMine: boolean; cpP: string | null; cpPOpen: boolean; cpSel: string | null;
  // Calendar
  calView: "month" | "week" | "day" | "upcoming" | "today";
  calTeam: string;
  calShowroom: string;
  calWho: string[];
  calWhoOpen: boolean;
  calRange: [number, number] | null;
  rangeOpen: boolean;
  // Ads Performance
  apSel: string[] | null; mDraft: string[] | null; mDrag: number | null; mq: string; mFold: Record<string, boolean>;
  apStF: string;
  /** Ads Performance's column widths, dragged at a header's right edge (the owner, 2026-10-13); "name" is the Ad column. */
  apW: Record<string, number>;
  /** Insight's ad table: its sort and dragged column widths (as Ads Performance's). */
  insSort: { k: string; dir: "asc" | "desc" } | null;
  insW: Record<string, number>; apStOpen: boolean; apSort: { k: string; dir: "asc" | "desc" } | null; apDlOpen: boolean;
  apRange: number | "custom"; apF: string; apT: string; apCF: string; apCT: string; apCmp: boolean; apCmpMode: number | "range" | "custom" | null; apPreset: string;
  dp: { open: boolean; from: string; to: string; cf: string; ct: string; preset: string; cmp: boolean; days: number; step: number; target: "main" | "cmp"; month: number; year: number; txt: Record<string, string> } | null;
  // Showrooms
  srEdit: string | null;
  srDraft: SrDraft | null;
  srTab: "info" | "slots" | "blk";
  srBlkOpen: boolean;
  srBlk: SrBlk | null;
  srCal: "from" | "to" | null;
  srCalM: number;
  srNewT: string | null;
  srNewD: number[] | null;
  // Settings
  mwt: Record<string, boolean> | null;
  mwtSaved: boolean;
  cltF: string; cltFOpen: boolean; cltEdit: string | null; cltDraft: string | null; cltDN: string | null; cltDC: "WhatsApp" | "Messenger" | null; cltIsNew: boolean; cltAsk: string | null; cltMore: boolean; cltVars: string[];
  frmOpen: boolean; frmCur: string | null; frmDraft: FormSection[] | null; frmName: string | null; frmIsNew: boolean; frmExp: string | null; frmOptIn: Record<string, string>;
  ntfTab: "all" | "unread" | "read"; ntfCat: string; ntfSel: boolean; ntfPick: Record<string, boolean>;
  // Screens the design does not draw (BUILD-NOTES.md)
  /** Appointment: showroom, day, time and the 7-day page; as RS's sheet also Week | Month and the month chooser (2026-10-13). */
  book: { room: number; day: number; slot: string | null; week: number; view?: "week" | "month"; monthOpen?: boolean; pickYear?: number } | null;
  // ── v2 (CrmFrame v2.dc.html): every column, pane and editor is dragged to size, double-click gives it back.
  ibListW: number | null; ibInfoW: number | null; ibCpW: number | null; ibCp: boolean | null;
  paneW: number | null; sheetW: number | null; menuW: number | null; perfW: number | null; mwtLogW: number | null; auditW: number | null;
  /** The audit logs' rails (closed by default, closed again on another ad or page). */
  adLog: boolean; mwtLog: boolean;
  /** Assignment's Ad performance folded to its strip (the owner, 2026-10-15). */
  adPerfShut: boolean;
  /** Inbox's Customer info column folded to its strip (the owner, 2026-10-16; open at first). */
  ibInfoShut: boolean;
  meMenu: boolean;
  // The chat: + menu, the message menu (the message's id), the message under the pointer, the reply's quote.
  attachOpen: boolean; attachView: "" | "quick" | "auto"; msgMenu: string | null; msgHov: string | null; replyTo: string | null;
  // The composer's emoji panel (the phone's Sticker panel, #425) and one's Recents as picked here.
  emo: { ecat: string; searching: boolean; q: string } | null; recents: string[] | null;
  // CRM alerts: Unread | Read.
  alR: "all" | "unread" | "read";
  // Contacts: the customer shown in the side panel; the chart card open (it starts folded — the owner, 2026-10-15).
  ppSel: string | null; ppChart: boolean; ppPer: number; ppPg: number;
  // Calendar: its analysis card open, and what it groups by (vm/analysis.ts).
  calAn: boolean; calAnBy: string;
  // Contacts' and the Calendar's right rail open (vm/rail.ts; folded at first).
  rail: boolean;
  // The Customer form's phone preview: what is typed into the real phone form there (nothing is saved).
  cfPv: Partial<import("../../sales/ui").CustomerForm> | null;
  // Assignment
  applyChk: boolean; ftApplyChk: boolean; evOpen: Record<string, boolean>;
  adPer: "Today" | "This week" | "This month" | "Custom"; adPerOpen: boolean; adCal: boolean;
  adCust: { a: number; b: number } | null; adCustT: { a: number; b: number; step: number } | null;
  // Calendar
  calBy: "team" | "room";
  // Contacts
  ppF: Record<string, string | null>; ppBy: string; ppQ: string; ppOpen: string | null; ppVis: string[] | null;
  ppSort: { k: string | null; dir: 1 | -1 }; ppCW: Record<string, number>; ppAdd: boolean;
  // Audit log
  auCat: "chat" | "marketing" | "management"; auPer: "today" | "7d" | "month"; auWho: string; auQ: string; auCols: number[] | null;
  // Customer form (the page): its draft, the preview's device
  cfDraft: import("./form").FormSectionV2[] | null; cfDev: "phone" | "desktop"; cfNew: Record<string, string>; cfType: string | null;
  /** The paged Customer form (2026-10-16): the page open in the editor; what is being dragged (a field or a section) and what it is over. */
  cfPage: number; cfDrag: { k: "f" | "s"; si: number; fi?: number } | null; cfOver: string | null;
  // Channels
  chTab: "conn" | "page" | "msgr" | "wa" | "tpl" | "ads"; chWaTab: string; chDraft: Record<string, unknown>; chDirty: Record<string, boolean>;
  chDlg: { kind: string; id: string } | null; chNewOpen: boolean; chNew: { name: string; cat: string; lang: string; body: string } | null; chWaNum: string | null;
  cform: Record<string, string> | null;
  history: HistRow[] | null;
  histF: string;
}

/** One change to a CRM setting (audit_changes). */
export interface HistRow { at: string; who: string; table: string; op: string; what: string; changes: { field: string; from: string; to: string }[]; /** The row as it was after (or before, when removed). */ row: Record<string, unknown>; before: Record<string, unknown> | null; after: Record<string, unknown> | null }

export interface SrDraft {
  id: string | null; dispName: string; addr: string; gmap: string; waze: string; manual: boolean; photo: string; photoFile: File | null;
  limit: number; times: string[]; off: Record<string, 1>; weekDays: number[]; blocks: SrBlock[];
}
export interface SrBlock { kind: "date"; from: string; to: string; allDay: boolean; ranges: { f: string; t: string }[]; reason: string }
export interface SrBlk { days: number[]; from: string; to: string; allDay: boolean; ranges: { f: string; t: string }[]; reason: string; wkReason: string }
export type FormField = CrmFormField;
export type FormSection = CrmForm["sections"][number];

export const initialDeskUi = (): DeskUi => ({
  tab: "insight", pane: "closed", kind: "chat", collapsed: false, fold: {}, stage: "menu", pick: null, menu: false, toast: "", undo: null,
  chat: null, fromTeam: false, fromList: false, fromInfo: false, infoId: null, visit: null, clist: "Leads", clSort: "Last chat", clSortOpen: false, team: null, person: null, draft: {},
  insPer: "month", insRange: null, insOpen: false, insCards: null, mFor: "ads",
  whoSel: [], whoOpen: false, inbF: "All",
  sendFor: null, awChat: null, awMenuOpen: false, ad: null, adMode: "team", tm: {}, mv: {}, split: null, adSt: "all", stOpen: false, ftEdit: null, ftDraft: null,
  cpF: "All", cpT: "This month", cpFrom: "", cpTo: "", cpSort: "Latest update", cpMine: false, cpP: null, cpPOpen: false, cpSel: null,
  calView: "month", // the owner, 2026-10-15: "default month" (the prototype opens on Upcoming)
  calTeam: "all", calShowroom: "all", calWho: [], calWhoOpen: false, calRange: null, rangeOpen: false,
  apSel: null, mDraft: null, mDrag: null, mq: "", mFold: {}, apStF: "all", apW: {}, insSort: null, insW: {}, apStOpen: false, apSort: null, apDlOpen: false,
  apRange: 0, apF: "", apT: "", apCF: "", apCT: "", apCmp: false, apCmpMode: null, apPreset: "", dp: null,
  srEdit: null, srDraft: null, srTab: "info", srBlkOpen: false, srBlk: null, srCal: null, srCalM: 0, srNewT: null, srNewD: null,
  mwt: null, mwtSaved: false,
  cltF: "all", cltFOpen: false, cltEdit: null, cltDraft: null, cltDN: null, cltDC: null, cltIsNew: false, cltAsk: null, cltMore: false, cltVars: [],
  frmOpen: false, frmCur: null, frmDraft: null, frmName: null, frmIsNew: false, frmExp: null, frmOptIn: {},
  ntfTab: "all", ntfCat: "all", ntfSel: false, ntfPick: {},
  book: null, cform: null, history: null, histF: "all",
  ibListW: null, ibInfoW: null, ibCpW: null, ibCp: null, paneW: null, sheetW: null, menuW: null, perfW: null, mwtLogW: null, auditW: null,
  adLog: false, adPerfShut: false, ibInfoShut: false, mwtLog: false, meMenu: false, attachOpen: false, attachView: "", msgMenu: null, msgHov: null, replyTo: null, emo: null, recents: null, alR: "all", ppSel: null, ppChart: false, ppPer: 10, ppPg: 0, calAn: false, calAnBy: "rep", rail: false, cfPv: null,
  applyChk: false, ftApplyChk: false, evOpen: {}, adPer: "This month", adPerOpen: false, adCal: false, adCust: null, adCustT: null,
  calBy: "team",
  ppF: {}, ppBy: "type", ppQ: "", ppOpen: null, ppVis: null, ppSort: { k: null, dir: 1 }, ppCW: {}, ppAdd: false,
  auCat: "chat", auPer: "7d", auWho: "all", auQ: "", auCols: null,
  cfDraft: null, cfDev: "phone", cfNew: {}, cfType: null, cfPage: 0, cfDrag: null, cfOver: null,
  chTab: "conn", chWaTab: "prof", chDraft: {}, chDirty: {}, chDlg: null, chNewOpen: false, chNew: null, chWaNum: null,
});

/** The Revenue app around the CRM: its sidebar pages, top bar and who is signed in. */
export interface DeskApp {
  greeting: string;
  subName: string;
  dateLine: string;
  bellUnread: boolean;
  notifCount: number;
  go(screen: "today" | "insight" | "quote" | "arena" | "account"): void;
  openNotifications(): void;
  openSubDept(): void;
  openBell(): void;
  signOut(): void;
}

/**
 * What only the desktop writes. Every one changes what RS / TL / TA see too (user 2026-10-13: the control panel's
 * settings reach everybody's CRM) — reminders reach the salesperson's bell, notes their customer, forms their Customer
 * info, showroom photos and links their visit cards.
 */
export interface DeskActions {
  remind(customerId: string): Promise<boolean>;
  deleteNotifs(keys: string[]): Promise<boolean>;
  restoreNotifs(keys: string[]): Promise<boolean>;
  addNote(customerId: string, text: string): Promise<boolean>;
  saveForm(form: { id: string | null; name: string; sections: FormSection[] }): Promise<string | false>;
  deleteForm(id: string): Promise<boolean>;
  saveShowroomExtras(roomId: string, x: { photo: File | null; removePhoto: boolean; gmap: string; waze: string }): Promise<boolean>;
  /** Channels (v2): link / unlink an asset, its default (crm_set_channel); send a tab to Meta (saveCrmChannel). */
  setChannel(kind: "page" | "wa", id: string, name: string, linked: boolean, isDefault: boolean): Promise<boolean>;
  /** One's emoji Recents, kept on the server as the phone keeps them (crm_save_recent_emoji). */
  saveRecents(list: string[]): void;
  saveMeta(s: Parameters<typeof import("@/app/(member)/member/crm-channels-actions").saveCrmChannel>[0]): Promise<boolean>;
}

export interface DeskCtx {
  data: CrmData;
  me: CrmPerson;
  now: Date;
  live: boolean;
  ui: DeskUi;
  set: Dispatch<SetStateAction<DeskUi>>;
  patch(p: Partial<DeskUi>): void;
  act: PanelActions;
  /** The desktop's own writes (PROPOSALS.md B1–B6), each a database function asking CRM · Manage. */
  deskAct: DeskActions;
  teams: Team[];
  directors: CrmPerson[];
  nameOf(id: string | null | undefined): string;
  /** Booked visits per slot start (ISO) for the showroom and week Appointment shows. */
  slotCounts: Record<string, number>;
  /** The viewport the desktop fills. */
  W: number;
  H: number;
  app: DeskApp;
  /** The Director's Mine: their own CRM. */
  toMine?: () => void;
  /** Leave the CRM (the sidebar's other pages). */
  exit(): void;
  /** Channels: what Meta answered (read when Channels opens). */
  meta: import("./channels").MetaState;
}
