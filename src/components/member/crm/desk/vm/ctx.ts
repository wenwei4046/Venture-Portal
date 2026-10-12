/**
 * The desktop CRM's context (CRM Desktop rev 1): the CRM's data and writes (the same as the phone's), the Revenue app's
 * frame around it, and the screen's own state — what is open, drafted, filtered — which the prototype keeps in one
 * object (CrmFrame.dc.html's this.state) and so does this.
 */
import type { Dispatch, SetStateAction } from "react";
import type { CrmData, CrmForm, CrmFormField, CrmPerson } from "@/lib/member/crm-data";
import type { PanelActions } from "../../panel/actions";
import type { Team } from "../../panel/vm/common";

export type DeskTab = "insight" | "inbox" | "assignment" | "calendar" | "adsperf" | "showrooms" | "settings";
export type PaneMode = "closed" | "empty" | "docked" | "overlay" | "wide" | "wideEmpty";
export type PaneKind = "chat" | "alerts" | "section" | "info" | "clist" | "metrics" | "team" | "assign" | "book" | "note" | "form";

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
  apStF: string; apStOpen: boolean; apSort: { k: string; dir: "asc" | "desc" } | null; apDlOpen: boolean;
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
  ntfTab: "unread" | "read"; ntfCat: string; ntfSel: boolean; ntfPick: Record<string, boolean>;
  // Screens the design does not draw (BUILD-NOTES.md)
  book: { room: number; day: number; slot: string | null; week: number } | null;
  cform: Record<string, string> | null;
  history: HistRow[] | null;
  histF: string;
}

/** One change to a CRM setting (audit_changes). */
export interface HistRow { at: string; who: string; table: string; op: string; what: string; changes: { field: string; from: string; to: string }[] }

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
  insPer: "month", insRange: null, insOpen: false,
  whoSel: [], whoOpen: false, inbF: "All",
  sendFor: null, awChat: null, awMenuOpen: false, ad: null, adMode: "team", tm: {}, mv: {}, split: null, adSt: "Running", stOpen: false, ftEdit: null, ftDraft: null,
  cpF: "All", cpT: "This month", cpFrom: "", cpTo: "", cpSort: "Latest update", cpMine: false, cpP: null, cpPOpen: false, cpSel: null,
  calView: "upcoming", calTeam: "all", calShowroom: "all", calWho: [], calWhoOpen: false, calRange: null, rangeOpen: false,
  apSel: null, mDraft: null, mDrag: null, mq: "", mFold: {}, apStF: "all", apStOpen: false, apSort: null, apDlOpen: false,
  apRange: 0, apF: "", apT: "", apCF: "", apCT: "", apCmp: false, apCmpMode: null, apPreset: "", dp: null,
  srEdit: null, srDraft: null, srTab: "info", srBlkOpen: false, srBlk: null, srCal: null, srCalM: 0, srNewT: null, srNewD: null,
  mwt: null, mwtSaved: false,
  cltF: "all", cltFOpen: false, cltEdit: null, cltDraft: null, cltDN: null, cltDC: null, cltIsNew: false, cltAsk: null, cltMore: false, cltVars: [],
  frmOpen: false, frmCur: null, frmDraft: null, frmName: null, frmIsNew: false, frmExp: null, frmOptIn: {},
  ntfTab: "unread", ntfCat: "all", ntfSel: false, ntfPick: {},
  book: null, cform: null, history: null, histF: "all",
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
}
