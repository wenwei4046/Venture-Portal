import type { CustomerForm } from "../sales/ui";
/** The Control panel's screen state (design 1a) — what is open and typed, not data. */
export type PanelTab = "overview" | "inbox" | "assign" | "calendar" | "profile" | "ads";
export type Period = "day" | "week" | "month" | "custom";
export interface Range { a: number; b: number }

export interface AdDraft { id: string; label: string; page: string; leads: number; mode: "even" | "split" | "people" | "unset"; split: Record<string, number>; pm: "cnt" | "pct"; pp: Record<string, number>; lockT: string[]; lockP: string[]; /** A team share being typed (two decimals; 2026-10-22). */ typing?: { id: string; text: string } | null }
export interface FtDraft { tid: string; m: "cnt" | "pct"; on: number[]; v: Record<string, Record<number, number>>; sel: { id: string; days: number[] } | null; lockD: Record<number, string[]> }
export interface RoomDraft {
  i: number; id: string | null; name: string; addr: string; slots: string[]; cap: number; weekly: number[]; blocks: { a: string; b: string; why: string }[];
  /** v3 T07: staff-only remarks. */
  remarks?: string;
  newT: string; newD: number[] | null; bA: string; bB: string; bWhy: string; bAll: boolean; bT1: string; bT2: string; bPick: "t1" | "t2" | null; calFor: "A" | "B" | null; calYM: [number, number] | null;
  /** 4a (T07): a draft begun on the page itself — the page stays in place with a Save bar (the full editor is for closures). */
  quick?: boolean;
}

export interface PanelUi {
  tab: PanelTab;
  // Overview / Ads Performance: the period, a custom range, the comparison.
  period: Period;
  ovRange: Range | null;
  cmp: Range | null;
  cmpFold: boolean;
  ovSheet: { a: number; b: number; per: Exclude<Period, "custom"> | null; ca: number | null; cb: number | null; tab: "a" | "b"; only?: boolean; cm: [number, number]; step: 0 | 1 } | null;
  openT: Record<string, boolean>;
  // Inbox
  inbTeam: string;
  inbWho: string;
  /** 4a (T02): the status tab last tapped above the board, underlined. */
  inbCol: number;
  pcOpen: boolean;
  pcQ: string;
  // One customer's chat (from Calendar / Awaiting reply)
  lead: string | null;
  pMenu: boolean;
  pInfo: boolean;
  /** The customer form (Book visit step 1 of 2 for a customer with no details yet, or Customer info › Edit). */
  pForm: CustomerForm | null;
  /** rev 1011 §5: Calendar › Customer info (a visit, or a list row), and the Leads / Upcoming / Showed up list open. */
  calInfo: string | null;
  cLs: "leads" | "up" | "came" | false;
  /** Assignment's open section (rev 1011 §6.1); null = the overview. Leaving the tab resets it. */
  asSec: "Org" | "Ads" | "Act" | "Aw" | "Ft" | null;
  /** Full time lead allocation's editor: the team and its draft ticks (staff → weekdays, 0 = Monday). */
  ftx: { tid: string; v: Record<string, number[]> } | null;
  /** By team's inside-team draft for the ad being edited: modes, values, and who was typed in (for the auto-balance). */
  bp: { adId: string; tm: Record<string, "even" | "pct" | "cnt">; pv: Record<string, number>; touch: Record<string, string[]>; ty?: { id: string; text: string } | null } | null;
  /** v3 T04b: the team whose Adjust split sheet is open, and the inside split as it was when it opened (Cancel puts it back). */
  bpSheet: string | null;
  bpSnap: PanelUi["bp"];
  /** The Over the limit page. */
  hlOpen: boolean;
  /** Profile › Member work type and Cold lead templates pages, and a template being edited. */
  ftsOpen: boolean;
  /** Member work type's changes not saved yet (person → full time), the owner's Save (2026-10-18). */
  ftsDraft: Record<string, boolean> | null;
  tplOpen: boolean;
  tplEd: { id: string | null; name: string; ch: "whatsapp" | "messenger"; body: string } | null;
  pBook: { customerId: string; room: number; day: number; slot: string | null; view?: "week" | "month"; ym?: [number, number]; /** Change: the visit this booking moves. */ visitId?: string } | null;
  reSheet: boolean;
  pick: string;
  /** What is typed in each chat, by customer — as Mine's (`SalesUi.draft`): words typed in one chat never go to another. */
  pDrafts: Record<string, string>;
  /** The message being answered (the message menu's Reply, 2026-10-14): shown over the reply box, sent as its reply — in
   *  the chat it was chosen in only. */
  pReply?: { chat: string; msgId: string; who: string; text: string } | null;
  /** A voice note being recorded in the chat: when it started (shared/voice.ts); pRecTick moves its clock. */
  pRec: number | null;
  /** The chat's composer, as Mine's (the chat composer handoff; sales/vm/composer.ts): its panel, emoji search and
   *  category, toast — of the chat it was opened in; another chat opens with nothing open. */
  pCmp?: (import("../sales/vm/composer").ComposerState & { chat: string }) | null;
  /** Photos / videos picked in the chat, waiting on the preview with its HD switch. */
  pPick?: import("../shared/pick").Picked | null;
  pRecTick?: number;
  toast: string;
  // Assignment
  sendFor: string | null;
  sdSel: string | null;
  mvFor: string | null;
  mvSel: string | null;
  undo: { kind: "send" | "assign"; customerId: string; prev: string | null; name: string; to: string; verb: string; left: number } | null;
  /** The last reassignment made here, per customer — the chat keeps saying so after the Undo bar is gone. */
  movedRec: Record<string, { from: string | null; to: string }>;
  adEd: AdDraft | null;
  ftEd: FtDraft | null;
  att: boolean;
  attF: "all" | "overdue" | "urgent" | "soon";
  asgF: "overdue" | "urgent" | "soon" | null;
  // Profile
  viewAs: boolean;
  vaQ: string;
  nfOpen: boolean;
  nfF: string;
  /** Notifications: Unread (default) | Read (rev 1011). */
  nfR: "all" | "unread" | "read";
  roomsOpen: boolean;
  rmEdit: RoomDraft | null;
  rmTP: { h: number; m: number; ap: "am" | "pm" } | null;
  rmDel: number | null;
  /** The showroom on screen — Showrooms shows one at a time, ‹ › between them (2026-10-16). */
  rmAt: number;
  /** The ad editor's name while it is typed (null = the ad's name as saved). */
  adNameDraft: string | null;
  /** Assignment › Ads to teams: running ads or paused ones (2026-10-22; the desktop lists both). */
  adTab: "running" | "paused";
  /** Work type: the teams opened (folded at first — the owner, 2026-10-23 "這個也可收起", 2026-10-24 "默認收起"). */
  ftsShut: Record<string, boolean>;
  /** Insight's Team performance | Ads performance switch (v3 T01): true = Ads performance, drawn on Insight. */
  ovAds: boolean;
  /** Assignment › Active: switches not saved yet (id → locked), null = as saved. */
  actDraft: Record<string, boolean> | null;
  // Calendar
  cView: "list" | "grid";
  cTeam: string;
  cPerson: string;
  cpSheet: boolean;
  cDay: number | null;
  cGM: [number, number] | null;
  cRange: Range | null;
  crSheet: { a: number; b: number; cm: [number, number]; step: 0 | 1 } | null;
}

export const initialPanelUi = (): PanelUi => ({
  tab: "overview", period: "month", ovRange: null, cmp: null, cmpFold: false, ovSheet: null, openT: {},
  inbTeam: "", inbWho: "", inbCol: 0, pcOpen: false, pcQ: "",
  lead: null, pMenu: false, pInfo: false, pForm: null, calInfo: null, cLs: false, asSec: null, ftx: null, bp: null, bpSheet: null, bpSnap: null, hlOpen: false, ftsOpen: false, ftsDraft: null, tplOpen: false, tplEd: null, pBook: null, reSheet: false, pick: "", pDrafts: {}, pRec: null, toast: "",
  sendFor: null, sdSel: null, mvFor: null, mvSel: null, undo: null, movedRec: {}, adEd: null, ftEd: null, att: false, attF: "all", asgF: null,
  viewAs: false, vaQ: "", nfOpen: false, nfF: "", nfR: "all", roomsOpen: false, rmEdit: null, rmTP: null, rmDel: null, rmAt: 0, adNameDraft: null, adTab: "running", ovAds: false, ftsShut: {}, actDraft: null,
  cView: "grid", cTeam: "all", cPerson: "", cpSheet: false, cDay: null, cGM: null, cRange: null, crSheet: null,
});
