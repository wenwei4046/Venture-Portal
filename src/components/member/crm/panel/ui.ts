/** The Control panel's screen state (design 1a) — what is open and typed, not data. */
export type PanelTab = "overview" | "inbox" | "assign" | "calendar" | "profile" | "ads";
export type Period = "day" | "week" | "month" | "custom";
export interface Range { a: number; b: number }

export interface AdDraft { id: string; label: string; page: string; leads: number; mode: "even" | "split" | "people" | "unset"; split: Record<string, number>; pm: "cnt" | "pct"; pp: Record<string, number>; lockT: string[]; lockP: string[] }
export interface FtDraft { tid: string; m: "cnt" | "pct"; on: number[]; v: Record<string, Record<number, number>>; sel: { id: string; days: number[] } | null; lockD: Record<number, string[]> }
export interface RoomDraft {
  i: number; id: string | null; name: string; addr: string; slots: string[]; cap: number; weekly: number[]; blocks: { a: string; b: string; why: string }[];
  newT: string; newD: number[] | null; bA: string; bB: string; bWhy: string; calFor: "A" | "B" | null; calYM: [number, number] | null;
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
  pcOpen: boolean;
  pcQ: string;
  // One customer's chat (from Calendar / Awaiting reply)
  lead: string | null;
  pMenu: boolean;
  pInfo: boolean;
  pBook: { customerId: string; room: number; day: number; slot: string | null; view?: "week" | "month"; ym?: [number, number] } | null;
  reSheet: boolean;
  pick: string;
  pDraft: string;
  toast: string;
  // Assignment
  sendFor: string | null;
  sdSel: string | null;
  mvFor: string | null;
  mvSel: string | null;
  undo: { kind: "send" | "move"; customerId: string; prev: string | null; name: string; to: string; verb: string; left: number } | null;
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
  roomsOpen: boolean;
  rmEdit: RoomDraft | null;
  rmTP: { h: number; m: number; ap: "am" | "pm" } | null;
  rmDel: number | null;
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
  inbTeam: "", inbWho: "", pcOpen: false, pcQ: "",
  lead: null, pMenu: false, pInfo: false, pBook: null, reSheet: false, pick: "", pDraft: "", toast: "",
  sendFor: null, sdSel: null, mvFor: null, mvSel: null, undo: null, movedRec: {}, adEd: null, ftEd: null, att: false, attF: "all", asgF: null,
  viewAs: false, vaQ: "", nfOpen: false, nfF: "", roomsOpen: false, rmEdit: null, rmTP: null, rmDel: null,
  cView: "list", cTeam: "all", cPerson: "", cpSheet: false, cDay: null, cGM: null, cRange: null, crSheet: null,
});
