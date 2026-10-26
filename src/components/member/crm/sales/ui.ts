/**
 * The salesperson CRM's screen state — one object, as the design's prototype
 * keeps it (what is open, what is typed, which sheet shows). Data lives in
 * CrmData; this is only what the person is doing on screen.
 */
import type { CustomFields } from "../shared/custom-book";
export type SalesTab = "inbox" | "contacts" | "calendar" | "insight" | "profile";
export type InboxFilter = { type: "status" | "urgency" | "cold" | "label" | "new"; v: string } | null;

export interface OutcomeAsk {
  visitId: string;
  customerId: string;
  name: string;
  when: string;
  room: string;
  mode?: "noshow";
  wonStep?: boolean;
  lostStep?: boolean;
  amount?: string;
  reason?: string;
  otherText?: string;
}

/** Showroom (room, day, slot) or online / elsewhere (shared/custom-book.tsx, 2026-10-24). */
export interface BookState extends CustomFields {
  customerId: string;
  room: number;
  /** The chosen day, local midnight (ms). */
  day: number;
  slot: string | null;
  view?: "week" | "month";
  monthOpen?: boolean;
  pickYear?: number;
  /** Changing this visit rather than booking a new one. */
  visitId?: string;
}

export interface CustomerForm {
  customerId: string;
  edit: boolean;
  name?: string; phone?: string; type?: string; size?: string; loc?: string; req?: string; budget?: string;
  /** Answers to the form's own questions as typed (CRM Desktop rev 1, B5), by question id. */
  extra?: Record<string, string>;
  /** The page of a paged form being filled (0 = the first; 2026-10-16). */
  page?: number;
}

export interface SalesUi {
  tab: SalesTab;
  hist: SalesTab[];
  chat: string | null;
  // Inbox
  q: string;
  filter: InboxFilter;
  adSel: string[];
  adSheet: { sel: string[] } | null;
  swipe: string | null;
  /** The row swiped RIGHT (Read · Pin, 2026-10-14). */
  swipeR?: string | null;
  moreLead: string | null;
  moreView: "main" | "labels" | "labelEdit";
  /** key: the label being edited (its id, or "name:…" for a design default not yet saved); null = a new one. */
  labelForm: { key: string | null; name: string; color: string } | null;
  toast: string;
  // Contacts
  cq: string;
  cSwipe: { id: string; x: number; drag: boolean } | null;
  rename: { id: string; v: string; ph: string } | null;
  cInfo: string | null;
  // Chat
  hover: string | null;
  menu: { msgId: string; full: boolean; from: "lead" | "me"; text: string } | null;
  reply: { msgId: string; from: "lead" | "me"; text: string } | null;
  draft: Record<string, string>;
  /** The composer of the chat it was opened in (`chat`): its panel (Sticker / Attach), emoji search and category, toast
   *  (vm/composer.ts). Another chat's — or none — opens as new: a chat left any way (the Calendar, Assign, a switch)
   *  never hands its panel to the next. */
  cmp?: (import("./vm/composer").ComposerState & { chat: string }) | null;
  qr: boolean;
  qrPage: "list" | "new" | null;
  qrNew: { s: string; m: string };
  qrEditIdx: number | null;
  hm: { menu?: boolean; share?: boolean; ssel?: string[]; move?: boolean; assign?: boolean; sel?: string | null; info?: boolean; appt?: boolean; toast?: string } | null;
  cform: CustomerForm | null;
  book: BookState | null;
  cancelAsk: string | null;
  tpl: boolean;
  /** The WhatsApp Business Account's approved templates, read when the sheet first opens. */
  templates: import("@/lib/whatsapp/send").WaTemplate[] | null;
  sending: boolean;
  /** A voice note being recorded: when it started (shared/voice.ts); recTick moves its clock. */
  rec: number | null;
  /** Photos / videos picked, waiting on the preview with its HD switch (shared/pick.ts). */
  pick?: import("../shared/pick").Picked | null;
  recTick?: number;
  // Calendar
  calView: "month" | "week" | "day";
  calSel: number | null;
  calYM: [number, number] | null;
  outcomeAsk: OutcomeAsk | null;
  celebrate: { name: string; amount: string; customerId: string } | null;
  rebookFor: OutcomeAsk | null;
  // Insight
  insPeriod: "month" | "week" | "day" | "range";
  insRange: { a: number; b: number } | null;
  insSheet: { cm: [number, number]; a: number | null; b: number | null; dragged?: boolean } | null;
  /** rev 1010 §5: Team | Me (Me on every open), the Leads / Appointments / Upcoming list (its measured height) and its Customer info. */
  /** Profile › Notifications: Unread (default) | Read (rev 1010 §6). */
  nTab: "all" | "unread" | "read";
  insList: { kind: "leads" | "appts" | "up"; h: string } | null;
  insInfo: string | null;
  // Profile
  profSub: null | "notif" | "auto" | "quick";
  teamOpen: boolean;
  swOpen: boolean;
  tp: { k: "from" | "to"; h: number; m: number; ap: "AM" | "PM" } | null;
}

export const initialSalesUi = (): SalesUi => ({
  tab: "inbox", hist: [], chat: null,
  q: "", filter: null, adSel: [], adSheet: null, swipe: null, moreLead: null, moreView: "main", labelForm: null, toast: "",
  cq: "", cSwipe: null, rename: null, cInfo: null,
  hover: null, menu: null, reply: null, draft: {}, qr: false, qrPage: null, qrNew: { s: "", m: "" }, qrEditIdx: null,
  hm: null, cform: null, book: null, cancelAsk: null, tpl: false, templates: null, sending: false, rec: null,
  calView: "month", calSel: null, calYM: null, outcomeAsk: null, celebrate: null, rebookFor: null,
  insPeriod: "month", insRange: null, insSheet: null, insList: null, insInfo: null, nTab: "all",
  profSub: null, teamOpen: false, swOpen: false, tp: null,
});

/** Pointer bookkeeping for swipes and drags (the prototype's this._ls, this._sw …) — not state, never rendered. */
export interface SalesRefs {
  ls?: { x: number; y: number } | null;
  /** An inbox row being dragged sideways: the row, where it started, whether it is a drag yet, where it is. */
  rowSw?: { el: HTMLElement; base: number; drag: boolean; x: number; tr: string } | null;
  lsT?: number;
  /** A row's long press (opens More). */
  lp?: ReturnType<typeof setTimeout>;
  cs?: { id: string; x0: number; b: number } | null;
  moved?: boolean;
  dr?: { x: number; left: number; moved: boolean } | null;
  dMoved?: boolean;
  mSw?: { x: number; y: number } | null;
  mSwiped?: number;
  calSw?: { x: number; y: number } | null;
  calSwiped?: boolean;
  irDrag?: boolean;
  celT?: ReturnType<typeof setTimeout>;
  toastT?: ReturnType<typeof setTimeout>;
  panelToastT?: ReturnType<typeof setTimeout>;
  /** When this screen last changed the data itself (a background read older than that is dropped). */
  localAt?: number;
  slotKey?: string;
}
