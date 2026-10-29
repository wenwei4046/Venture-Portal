/**
 * The desktop CRM's context (CRM Desktop rev 1): the CRM's data and writes (the same as the phone's), the Revenue app's
 * frame around it, and the screen's own state — what is open, drafted, filtered — which the prototype keeps in one
 * object (CrmFrame.dc.html's this.state) and so does this.
 */
import type { CustomFields } from "../../shared/custom-book";
import type { ApplyPick } from "../../shared/apply-ads";
import type { Dispatch, SetStateAction } from "react";
import type { MetaAdRow, MetaFig } from "@/lib/member/crm-ad-names-meta";
import type { ApptType, CrmData, CrmForm, CrmFormField, CrmPerson } from "@/lib/member/crm-data";
import type { PanelActions } from "../../panel/actions";
import type { Team } from "../../panel/vm/common";

export type DeskTab = "insight" | "inbox" | "assignment" | "calendar" | "adsperf" | "showrooms" | "settings" | "people" | "forms" | "channels" | "auditlog" | "reports" | "workspace";
export type PaneMode = "closed" | "empty" | "docked" | "overlay" | "wide" | "wideEmpty";
export type PaneKind = "chat" | "alerts" | "section" | "info" | "clist" | "metrics" | "team" | "assign" | "book" | "note" | "form" | "move" | "share" | "partner";

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
  /** A partner's booking open in the pane (mig 20261029190000). */
  partner?: string | null;
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
  /** 4a's Insight: the team opened in place to its people (frame 01). */
  insTeam: string | null;
  /** Insight's Ads Performance cards: the metrics picked with + Metrics (the owner, 2026-10-13), in order. */
  insCards: string[] | null;
  /** Insight's brand: all, The Conts or DC (2026-10-29). */
  insSrc?: string;
  /** Ads to teams' brand: all, The Conts or Dream Crafter (2026-10-29). */
  adBrand?: string;
  /** What Customise metrics is picking for: Ads Performance's columns, or Insight's ad cards. */
  mFor: "ads" | "cards" | "chart";
  // Inbox
  whoSel: string[];
  whoOpen: boolean;
  inbF: string;
  /** 4a's Inbox search (frame 02): a name, a message or an ad. */
  ibQ: string;
  /** 4a Calendar's Book a visit: its customer picker (open, the search). */
  bookPick: boolean; bookQ: string;
  // Assignment
  sendFor: string | null;
  awChat: string | null;
  awMenuOpen: boolean;
  ad: string | null;
  /** Which ad's saved setting the editor's draft was loaded from (`id|rule` or `id|none`). The open ad is part of the place a
   *  refresh or Back restores, its draft is not — so a restored ad loads its saved split again (2026-10-24). */
  adDraftFor?: string | null;
  /** Save and apply to all's window (2026-10-24): for which ad, the ads ticked, Standard or Count together; null = shut. */
  applyPick?: (ApplyPick & { ad: string }) | null;
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
  /** Ads Performance's source: All · The Conts / DC, each by WhatsApp · Messenger (lib/member/crm-source.ts, 2026-10-27). */
  apSrc?: string; apSrcOpen?: boolean;
  /** Ads Performance shows the ads hidden by a right click too, dimmed, to show them again (2026-10-24). */
  apShowHidden?: boolean;
  /** Ads Performance's column widths, dragged at a header's right edge (the owner, 2026-10-13); "name" is the Ad column. */
  apW: Record<string, number>;
  /** Insight's ad table: its sort and dragged column widths (as Ads Performance's). */
  insSort: { k: string; dir: "asc" | "desc" } | null;
  insW: Record<string, number>; apStOpen: boolean; apSort: { k: string; dir: "asc" | "desc" } | null; apDlOpen: boolean;
  apRange: number | "custom"; apF: string; apT: string; apCF: string; apCT: string; apCmp: boolean; apCmpMode: number | "range" | "custom" | null; apPreset: string;
  dp: { open: boolean; from: string; to: string; cf: string; ct: string; preset: string; cmp: boolean; days: number; step: number; target: "main" | "cmp"; month: number; year: number; txt: Record<string, string> } | null;
  // Showrooms
  srEdit: string | null;
  /** 4a Showrooms: which showroom is on screen (frame 07, one at a time). */
  srAt: number;
  /** Showrooms' two pages: the showrooms, or Appointment types (2026-10-24), and the types' draft until Save. */
  srPage: "rooms" | "types" | "keys";
  /** Showrooms › Key log's showroom and key state (2026-10-29). */
  klRoom?: string; klState?: string;
  atDraft: ApptType[] | null;
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
  /** Assignment › Active members: switches not saved yet (id → locked), null = as saved. */
  actDraft: Record<string, boolean> | null;
  /** Ads to teams' "+": open, its search, Meta's ads (null = not read yet, "error" = Meta refused), a typed ad id. */
  /** Ads to teams: a team share being typed (two decimals). */
  splitTyping: { id: string; text: string } | null;
  /** Ads to teams' Split folded to its strip. */
  adSplitShut: boolean;
  /** The ad panel's tab (v2 frame 06): Split · Ad performance · Audit log, one panel. */
  adPane: "split" | "perf" | "audit";
  /** Split rows set by hand (note 06: dragging one re-balances only the rows not touched) and the teams opened to their people. */
  splitTouched: string[]; splitOpen: Record<string, boolean>; mvTyping: { key: string; text: string } | null;
  /** Assignment › Leads by ad: this month or all time. */
  lbaPer: "month" | "last" | "all" | "custom";
  /** Leads by ad (v2 06b): Custom's two days, the status filter, the search, the sort, the member picked (its panel folded), the lead opened. */
  lbaFrom: string | null; lbaTo: string | null; lbaSt: "all" | "running" | "paused" | "ended"; lbaQ: string;
  lbaSort: { k: "ad" | "status" | "members" | "leads"; dir: "asc" | "desc" } | null;
  lbaPick: { ad: string; who: string } | null; lbaPickShut: boolean; lbaLead: string | null;
  /** Leads by ad: an ad's card folded (by ad id), a person's list of leads opened ("ad|person"). */
  lbaShut: Record<string, boolean>; lbaOpen: Record<string, boolean>;
  /** Active members / Member work type: a team's card folded (by team name). */
  teamShut: Record<string, boolean>;
  /** Reports (2026-10-23): the category on screen, the period of Salespeople / Appointments / Lead sources, Salespeople's sort. */
  rpCat: import("./reports-page").RpCat; rpPer: import("./reports").RpPeriod; rpSort: { k: string; dir: "asc" | "desc" } | null;
  /** Reports › Salespeople (v2 12c / 12c·2): the team filter, the search, the person picked (their panel folded), the lead opened. */
  rpTeam: string; rpQ: string; rpPick: string | null; rpPickShut: boolean; rpLead: string | null;
  /** Ads Performance: Meta's figures by range ("from|to") and ad (null = one the token cannot see). */
  apMeta: Record<string, Record<string, MetaFig | null>>;
  /** Ads Performance's chart (2026-10-23): Meta's figures day by day, by range ("from|to") and ad (null = not readable). */
  apDaily: Record<string, Record<string, Record<string, MetaFig> | null>>;
  /** The chart's metrics (its tiles), the ones whose line is hidden, and the chart / the table folded. */
  /** Ads Performance's table a page at a time (v2 frame 05: "5 rows + pager (Show 5/10/20)"). */
  apPer: number; apPg: number;
  /** Insight's own tabs (v2 frames 01 / 01b): Team performance | Ads performance. */
  insTab: "team" | "ads";
  apChart: (string | null)[] | null; apChartOff: Record<string, boolean>; apChartShut: boolean; apTableShut: boolean;
  addAdOpen: boolean; addAdQ: string; addAdList: MetaAdRow[] | null | "error"; addAdId: string;
  mwtSaved: boolean;
  cltF: string; cltFOpen: boolean; cltEdit: string | null; cltDraft: string | null; cltDN: string | null; cltDC: "WhatsApp" | "Messenger" | null; cltIsNew: boolean; cltAsk: string | null; cltMore: boolean; cltVars: string[];
  frmOpen: boolean; frmCur: string | null; frmDraft: FormSection[] | null; frmName: string | null; frmIsNew: boolean; frmExp: string | null; frmOptIn: Record<string, string>;
  ntfTab: "all" | "unread" | "read"; ntfCat: string; ntfSel: boolean; ntfPick: Record<string, boolean>;
  // Screens the design does not draw (BUILD-NOTES.md)
  /** Appointment: showroom, day, time and the 7-day page; as RS's sheet also Week | Month and the month chooser (2026-10-13). */
  /** Showroom (room, day, slot) or online / elsewhere (shared/custom-book.tsx, 2026-10-24). */
  book: ({ room: number; day: number; slot: string | null; week: number; view?: "week" | "month"; monthOpen?: boolean; pickYear?: number } & CustomFields) | null;
  // ── v2 (CrmFrame v2.dc.html): every column, pane and editor is dragged to size, double-click gives it back.
  ibListW: number | null; ibInfoW: number | null; ibCpW: number | null; ibCp: boolean | null;
  paneW: number | null; sheetW: number | null; menuW: number | null; perfW: number | null; mwtLogW: number | null; auditW: number | null;
  /** The audit logs' rails (closed by default, closed again on another ad or page). */
  adLog: boolean; mwtLog: boolean;
  /** Assignment's Ad performance folded to its strip (the owner, 2026-10-15). */
  adPerfShut: boolean;
  /** 4a Assignment's editor tab (frame 06): Split · Ad performance · Audit log. */
  adTab: "split" | "perf" | "audit";
  /** Inbox's Customer info column folded to its strip (the owner, 2026-10-16; open at first). */
  /** null = as the width decides (open, unless the chat would fall under 300 px — a 1280 screen). */
  ibInfoShut: boolean | null;
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
  auCat: "chat" | "marketing" | "management"; auPer: "today" | "7d" | "month"; auWho: string; auQ: string; auCols: number[] | null; auArea: string; auOpen: "who" | "area" | "per" | null;
  // Customer form (the page): its draft, the preview's device
  cfDraft: import("./form").FormSectionV2[] | null; cfDev: "phone" | "desktop";
  /** v2 frame 08: which of the saved forms the editor is on (null = the first, the one Customer info asks); Delete asked again. */
  /** Forms page (2026-10-29): which kind is open — Customer info or the booking link's. */
  cfKind: "customer" | "booking";
  cfForm: string | null; cfDelAsk: boolean; cfNew: Record<string, string>; cfType: string | null;
  /** The paged Customer form (2026-10-16): the page open in the editor; what is being dragged (a field or a section) and what it is over. */
  cfPage: number; cfDrag: { k: "f" | "s"; si: number; fi?: number } | null; cfOver: string | null;
  // Channels
  chTab: "conn" | "page" | "msgr" | "wa" | "tpl" | "ads"; chWaTab: string;
  /** v2 frame 09b: the number whose Business profile drawer is open. */
  chProf: string | null;
  /** Channels › WhatsApp › Profile: the display name being typed (null = not editing). */
  chDn: string | null;
  /** v2: the New chat (Inbox) / Add customer (Contacts) sheet. */
  addCust: "chat" | "contact" | null; chDraft: Record<string, unknown>; chDirty: Record<string, boolean>;
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
  /** v2 frame 07: staff-only remarks (crm_save_showroom_remarks). */
  remarks: string;
}
export interface SrBlock { kind: "date"; from: string; to: string; allDay: boolean; ranges: { f: string; t: string }[]; reason: string }
export interface SrBlk { days: number[]; from: string; to: string; allDay: boolean; ranges: { f: string; t: string }[]; reason: string; wkReason: string }
export type FormField = CrmFormField;
export type FormSection = CrmForm["sections"][number];

export const initialDeskUi = (): DeskUi => ({
  tab: "insight", pane: "closed", kind: "chat", collapsed: false, fold: {}, stage: "menu", pick: null, menu: false, toast: "", undo: null,
  chat: null, fromTeam: false, fromList: false, fromInfo: false, infoId: null, visit: null, clist: "Leads", clSort: "Last chat", clSortOpen: false, team: null, person: null, draft: {},
  insPer: "month", insRange: null, insOpen: false, insTeam: null, insCards: null, mFor: "ads",
  whoSel: [], whoOpen: false, inbF: "All", ibQ: "", bookPick: false, bookQ: "",
  sendFor: null, awChat: null, awMenuOpen: false, ad: null, adMode: "team", tm: {}, mv: {}, split: null, adSt: "all", stOpen: false, ftEdit: null, ftDraft: null,
  cpF: "All", cpT: "This month", cpFrom: "", cpTo: "", cpSort: "Latest update", cpMine: false, cpP: null, cpPOpen: false, cpSel: null,
  calView: "month", // the owner, 2026-10-15: "default month" (the prototype opens on Upcoming)
  calTeam: "all", calShowroom: "all", calWho: [], calWhoOpen: false, calRange: null, rangeOpen: false,
  apSel: null, mDraft: null, mDrag: null, mq: "", mFold: {}, apStF: "all", apW: {}, insSort: null, insW: {}, apStOpen: false, apSort: null, apDlOpen: false,
  apRange: 0, apF: "", apT: "", apCF: "", apCT: "", apCmp: false, apCmpMode: null, apPreset: "", dp: null,
  srEdit: null, srAt: 0, srPage: "rooms", atDraft: null, srDraft: null, srTab: "info", srBlkOpen: false, srBlk: null, srCal: null, srCalM: 0, srNewT: null, srNewD: null,
  mwt: null, mwtSaved: false, actDraft: null, splitTyping: null, adSplitShut: false, adPane: "split", splitTouched: [], splitOpen: {}, mvTyping: null, lbaPer: "month", lbaFrom: null, lbaTo: null, lbaSt: "all", lbaQ: "", lbaSort: null, lbaPick: null, lbaPickShut: false, lbaLead: null, lbaShut: {}, lbaOpen: {}, teamShut: {}, rpCat: "ads", rpPer: "month", rpSort: null, rpTeam: "all", rpQ: "", rpPick: null, rpPickShut: false, rpLead: null, apMeta: {}, apDaily: {}, apPer: 5, apPg: 0, insTab: "team", apChart: null, apChartOff: {}, apChartShut: false, apTableShut: false, addAdOpen: false, addAdQ: "", addAdList: null, addAdId: "",
  cltF: "all", cltFOpen: false, cltEdit: null, cltDraft: null, cltDN: null, cltDC: null, cltIsNew: false, cltAsk: null, cltMore: false, cltVars: [],
  frmOpen: false, frmCur: null, frmDraft: null, frmName: null, frmIsNew: false, frmExp: null, frmOptIn: {},
  ntfTab: "all", ntfCat: "all", ntfSel: false, ntfPick: {},
  book: null, cform: null, history: null, histF: "all",
  ibListW: null, ibInfoW: null, ibCpW: null, ibCp: null, paneW: null, sheetW: null, menuW: null, perfW: null, mwtLogW: null, auditW: null,
  adLog: false, adPerfShut: true, adTab: "split", ibInfoShut: null, mwtLog: false, meMenu: false, attachOpen: false, attachView: "", msgMenu: null, msgHov: null, replyTo: null, emo: null, recents: null, alR: "all", ppSel: null, ppChart: false, ppPer: 10, ppPg: 0, calAn: false, calAnBy: "rep", rail: false, cfPv: null,
  applyChk: false, ftApplyChk: false, evOpen: {}, adPer: "This month", adPerOpen: false, adCal: false, adCust: null, adCustT: null,
  calBy: "room",
  ppF: {}, ppBy: "status", ppQ: "", ppOpen: null, ppVis: null, ppSort: { k: null, dir: 1 }, ppCW: {}, ppAdd: false,
  auCat: "chat", auPer: "7d", auWho: "all", auQ: "", auCols: null, auArea: "all", auOpen: null,
  cfDraft: null, cfKind: "customer", cfForm: null, cfDelAsk: false, cfDev: "phone", cfNew: {}, cfType: null, cfPage: 0, cfDrag: null, cfOver: null,
  chTab: "conn", chProf: null, chDn: null, addCust: null, chWaTab: "prof", chDraft: {}, chDirty: {}, chDlg: null, chNewOpen: false, chNew: null, chWaNum: null,
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
  /** 4a's Revenue sidebar (2026-10-18), as the Revenue app's own desktop sidebar has them: the screens their ticks close, */
  hidden?: readonly string[];
  /** the CRM's unread (its row's count), */
  crmUnread?: number;
  /** the Product List row (an account holding product_list), */
  products?: { group: string; onOpen: () => void } | null;
  /** and the module switcher (a Principal's). */
  modules?: { current: string; onPick: (id: string) => void } | null;
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
  /** kind: a new form's — Customer info ("customer", the default) or the booking link's ("booking"). */
  saveForm(form: { id: string | null; name: string; sections: FormSection[] }, kind?: "customer" | "booking"): Promise<string | false>;
  deleteForm(id: string): Promise<boolean>;
  /** v2 frame 08: the form every Customer info asks (crm_set_active_form puts it first). */
  setActiveForm(id: string): Promise<boolean>;
  /** v2 frames 02 / 03: a customer added by hand on WhatsApp (crm_add_contact) — their id, or false. */
  addCustomer(name: string, phone: string, assign: string | null): Promise<string | false>;
  saveShowroomExtras(roomId: string, x: { photo: File | null; removePhoto: boolean; gmap: string; waze: string }): Promise<boolean>;
  /** v2 frame 07: a showroom's staff-only remarks, and deleting it (refused while visits are upcoming). */
  saveRoomRemarks(roomId: string, remarks: string): Promise<boolean>;
  deleteRoom(roomId: string): Promise<boolean>;
  /** Channels (v2): link / unlink an asset, its default (crm_set_channel); send a tab to Meta (saveCrmChannel). */
  setChannel(kind: "page" | "wa", id: string, name: string, linked: boolean, isDefault: boolean): Promise<boolean>;
  /** One's emoji Recents, kept on the server as the phone keeps them (crm_save_recent_emoji). */
  saveRecents(list: string[]): void;
  saveMeta(s: Parameters<typeof import("@/app/(member)/member/crm-channels-actions").saveCrmChannel>[0]): Promise<boolean>;
  /** v2 frame 09b: one business profile to the number's WhatsApp and / or Facebook Page, each answered on its own. */
  saveProfile(form: FormData): Promise<import("@/app/(member)/member/crm-channels-actions").ProfileSaveResult | null>;
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
  /** Chats with unread messages per brand, over every brand (DeskScreens; the Inbox's brand tabs, 2026-10-29). */
  brandCounts?: Record<"all" | "conts" | "dc", number>;
  /** The viewport the desktop fills. */
  W: number;
  H: number;
  app: DeskApp;
  /** The Director's Mine: their own CRM. */
  toMine?: () => void;
  /** View as a team member (2026-10-29): read-only, as the phone's View as. */
  viewAs?: DeskViewAs;
  /** Leave the CRM (the sidebar's other pages). */
  exit(): void;
  /** Channels: what Meta answered (read when Channels opens). */
  meta: import("./channels").MetaState;
}

/** The people a desktop may view the CRM of (one's line; anybody for View at All), and opening one's — read-only. */
export interface DeskViewAs { people: { id: string; name: string; title: string }[]; open: (staffId: string) => void }
