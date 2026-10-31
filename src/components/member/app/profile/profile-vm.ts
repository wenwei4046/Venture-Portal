import type { ClaimRates, TransportParts } from "@/lib/member/claim-rules";
import type { MemberWaitingForm } from "@/lib/member/server";
import type { EditField } from "@/lib/member/request-edit";

/**
 * What every Profile screen draws — strings and flags only, ready to render.
 * The live app builds these from the database (`profile-model.ts`); the design
 * preview hands them over from the prototype's own data (`fixtures/proto-profile.ts`),
 * so both run the very same screens.
 */

/** `pending` and `accepted` are a request's (the HR revamp's handoff, 2026-10-10): gold for still with HR, deep green for on the waiting list. */
export type Tone = "good" | "neutral" | "warn" | "bad" | "none" | "pending" | "accepted";

// ── Profile ──
export type WorkKey = "income" | "honours" | "team" | "requests" | "track" | "rooms" | "docs" | "crm" | "memos";
export interface ProfileMainVM {
  name: string;
  ini: string;
  /** `HOUZS Venture · Revenue · Fair`. */
  sub: string;
  title: string;
  rank: string;
  /** `1 pending`, `2 new` — a row's badge, when it has one. */
  badges: Partial<Record<WorkKey, string>>;
}

// ── My income ──
export interface IncomeRowVM {
  label: string;
  sub: string;
  amt: string;
  /** A deduction: drawn in red. */
  neg?: boolean;
}
export interface IncomePastVM {
  /** `YYYY-MM` — tapping the row opens that month. */
  period: string;
  month: string;
  /** `Paid 7 Sep`, `With Finance`, `Closed 30 Sep`. */
  paid: string;
  amt: string;
  /** `Paid` (green) or another state (amber). */
  status: string;
  settled: boolean;
}
export interface IncomeVM {
  period: string;
  periodLabel: string;
  /** `Estimated income · not settled`, `Closed income · final`. */
  heroLabel: string;
  amount: string;
  heroNote: string;
  rows: IncomeRowVM[];
  total: string;
  /**
   * The two salary payments the total reaches the bank as — Net basic and
   * Balance commission, HR's payout (2026-10-20); null without a fixed salary.
   */
  paidAs: IncomeRowVM[] | null;
  /** `2 orders are waiting for a deposit.` + why — absent when nothing is held. */
  held: { strong: string; rest: string } | null;
  past: IncomePastVM[];
  /** The month has bills or override to list. */
  hasOrders: boolean;
  /** Said instead of the breakdown when the month cannot be worked out. */
  notice: string | null;
}

// ── Commission by order ──
export interface CoRowVM {
  id: string;
  no: string;
  meta: string;
  pay: string;
  /** Commission held (no cost yet / waiting for a deposit): the amount in amber. */
  held: boolean;
  sub: string;
}
export interface CoTabVM {
  tab: string;
  label: string;
  total: string;
  base: string;
  rate: string;
  rows: CoRowVM[];
  note: string;
}
export interface CoLineVM {
  name: string;
  qty: string;
  amt: string;
  pay: string;
  kpiPay: string;
  kpi: boolean;
}
export interface CoSheetVM {
  no: string;
  meta: string;
  tag: string;
  tone: Tone;
  amt: string;
  commLabel: string;
  comm: string;
  kpiPay: string;
  kpiSub: string;
  /** KPI pay in green, or a dash in the muted ink. */
  kpiPaid: boolean;
  lines: CoLineVM[];
  total: string;
  note: string;
}
export interface IncomeOrdersVM {
  periodLabel: string;
  mine: CoTabVM;
  override: CoTabVM;
  /** By row id: `m:<order>` for the member's own bills, `o:<order>` for override. */
  sheets: Record<string, CoSheetVM>;
}

// ── My honours ──
export type HonourBoard = "Sales" | "Margin" | "KPI" | "Championship" | "Fair";
export type HonourKind = "monthly" | "quarterly" | "annual";
export interface HonourItemVM {
  title: string;
  sub: string;
  board: HonourBoard;
}
export interface HonourPlaceVM {
  place: number;
  label: string;
  short: string;
  count: number;
  unit: string;
}
export interface HonoursVM {
  periodLabel: string;
  eyebrow: string;
  podiums: number;
  finishes: number;
  /** `+3 vs Aug` — absent with no earlier period to compare, or no change. */
  delta: string | null;
  podium: { gold: number; silver: number; bronze: number };
  highlight: string | null;
  places: HonourPlaceVM[];
  /** By place. */
  sheets: Record<number, { title: string; items: HonourItemVM[] }>;
  /** Said when nothing is final yet. */
  notice: string | null;
}

// ── Team & capacity ──
export type TeamDot = "good" | "wait" | "up";
export interface TeamNodeVM {
  id: string;
  name: string;
  title: string;
  ini: string;
  dot: TeamDot;
}
/** One level above the member. */
export interface TeamLevelVM {
  /** `DIRECTOR`, `DIRECTORS` or `UPLINE`. */
  level: string;
  /** Peers, drawn side by side: every director of the sub-department shares one level. */
  nodes: TeamNodeVM[];
}
/** Somebody below the member, with their own people — every level down (2026-10-27). */
export interface TeamKidVM extends TeamNodeVM {
  kids: TeamKidVM[];
}
export interface PersonSheetVM {
  name: string;
  role: string;
  ini: string;
  self: boolean;
  stats: { label: string; value: string; tone: "ink" | "good" | "up" | "wait" }[];
  reportsTo: string;
}
export interface TeamVM {
  lede: string;
  capacity: {
    occupied: number;
    capacity: number | null;
    /** `1 open place`, `Full`, `No limit set`. */
    chip: string;
    full: boolean;
    note: string;
  };
  count: string;
  /** Green, amber and grey — `KPI hit · Pending · Upline` or the sales reading when KPI is off. */
  legend: [string, string, string];
  /** Top first: the directors' level, then the line of uplines — one person per level. */
  ups: TeamLevelVM[];
  me: TeamNodeVM;
  kids: TeamKidVM[];
  sheets: Record<string, PersonSheetVM>;
}

// ── Requests ──
/** `food` is a claim too (`claimType` food, 2026-10-13) — its own row on Requests, its own form and filter. */
export type RequestKindVM = "claim" | "food" | "replacement" | "waiting";
export interface RequestRowVM {
  id: string;
  kind: RequestKindVM;
  title: string;
  sub: string;
  status: string;
  tone: Tone;
}
export interface RequestEventVM {
  what: string;
  who: string;
  when: string;
  note: string;
  /** The last event's colour: good news, a stop, or a step on the way. */
  dot: "past" | "good" | "bad";
}
export interface RequestDetailVM {
  id: string;
  title: string;
  code: string;
  status: string;
  tone: Tone;
  facts: { l: string; v: string }[];
  log: RequestEventVM[];
  canCancel: boolean;
  /** HR returned a claim: the member updates it and sends it again (the whole form). */
  canUpdate: boolean;
  /** A waiting list or replacement still with HR: Edit request → Update in the sheet (2026-10-10). */
  edit?: { fields: readonly EditField[]; values: Record<string, string> } | null;
  /** Decided, so it can no longer be changed — the handoff's words. */
  lockedNote?: string | null;
}

// ── Waiting list & replacements (the HR revamp, 2026-10-10) ──
export interface TrackRowVM {
  id: string;
  title: string;
  sub: string;
  status: string;
  tone: Tone;
}
export interface TrackVM {
  /** The member's sub-department's waiting list: theirs by name, everybody else's by an initial. */
  queue: { title: string; total: string; rows: { pos: string; name: string; mine: boolean }[] } | null;
  waiting: TrackRowVM[];
  replacements: TrackRowVM[];
}

// ── Memos ──
export type MemoCat = "hr" | "mgmt" | "arena" | "ops";
export interface MemoVM {
  id: string;
  cat: MemoCat;
  from: string;
  when: string;
  whenFull: string;
  title: string;
  paras: string[];
  read: boolean;
  needsAck: boolean;
  acked: boolean;
  ackedText: string;
  /** The file sent with it (2026-10-12): its name and the tile's "PDF" / "JPEG" — null when there is none. */
  file?: { name: string; ext: string } | null;
}

// ── View as ──
export interface VaPersonVM {
  id: string;
  departmentId: string;
  name: string;
  ini: string;
  sub: string;
  /** 0 = directs the sub-department, 1 = top of its tree, 2+ below. */
  level: number;
  viewing: boolean;
}
export interface VaGroupVM {
  title: string;
  people: VaPersonVM[];
}

// ── The request form ──
/** A fair weekend a claim can be for — the brand the member worked and the booth it was at. */
export interface ClaimWeek {
  key: string;
  /** `OCT` — on the badge, so October's W1 is not September's. */
  month: string;
  n: string;
  /** `Akemi week` — or `No brand week`. */
  brandWeek: string;
  brand: string | null;
  dates: string;
  venue: string | null;
  org: string | null;
  /** The brand week's fair: what the claim is for, and whose venue sets its region. */
  fairId: string | null;
  /** That fair's first and last day (`YYYY-MM-DD`): an Airbnb stay must cover them. */
  start: string | null;
  end: string | null;
  /** Not on the ERP's Sales Attending that weekend: placed at the booth they opened the most bills at (2026-10-12). */
  auto: boolean;
  /** A claim is only ever for the member's own brand week's fair (user 2026-10-06). */
  claimable: boolean;
  /**
   * They had a booth that weekend — the ERP's, or auto-located — so its days can take a food claim
   * (2026-10-13), even before the portal has a fair for it (Outstation and Airbnb need the fair's venue).
   */
  worked?: boolean;
  /** The brand's colours: the badge, and the card when picked. */
  color: string;
  tint: string;
}
export interface FormOptions {
  /** `Fair` — and `Klang Valley`, the base an outstation route starts from. */
  subName: string;
  weeks: ClaimWeek[];
  rates: ClaimRates;
  /** Replacement: the people the member may propose (their own team). */
  members: { id: string; name: string }[];
  /** Every Revenue sub-department: a transfer's receiver, a waiting list's preference. */
  departments: { id: string; name: string; capacity: number | null; occupied: number }[];
  departmentId: string;
  /** The member's waiting-list requests that HR approved — a replacement may use one. */
  waitingList: { id: string; name: string; sub: string; status: string; ok: boolean }[];
  /** First choices, as the design preview shows them. Live: nothing is chosen for the member. */
  initial?: { member?: string; male?: number; female?: number; department?: string };
  /** The waiting-list form HR set (2026-10-10) — its own questions and whether the signed form must come with it. */
  waitingForm?: MemberWaitingForm | null;
  /** The replacement form HR set (2026-10-11, round 2's README 18.5) — the same, for a replacement. */
  replacementForm?: MemberWaitingForm | null;
  /** The office's today (`YYYY-MM-DD`): a fair day after it cannot take a food claim yet (2026-10-13). */
  today?: string;
  /** The member's own food claims — a month (or a day) one of them holds is not offered again; its number says which. */
  foodClaims?: { id: string; kind: string; status: string; detail: Record<string, unknown>; requestNo?: string | null }[];
  /**
   * What of a transport claim their title may send (2026-10-31): by road and an Airbnb stay, a plane ticket — HR's two
   * ticks (`transportPartsFor`). Absent (the design preview's forms): all of it.
   */
  transport?: TransportParts;
  /** Their seat title, to name it where the form says a part is not theirs. */
  title?: string | null;
}
