/**
 * Not my order (2026-11-14 — the user, after IT-0010: SHAWN keys and scans bills for others, and the ERP makes whoever keys
 * one its salesperson, so ZNT6430 sat in his margin; "他可以写 request 'not my order'，and then HR approve。这样它就会直接变成是
 * 完完全全 don't count 的形式" — in the bill's ⋯ beside Share order).
 *
 * The rule is the database's (mig 20261114210000): one open request a bill, sent by the salesperson the bill is on with a
 * reason; it moves hr → approved (the bill taken out exactly as Comm Cal's *Don't count this bill* takes it out — out of
 * sales, margin, commission, override, KPI and the Arena) or rejected (HR says why — the bill keeps counting); the
 * salesperson may withdraw it (cancelled) while HR has not decided. Refused while the bill does not count, its month is in
 * payroll, a close holds it, it is shared or a share request is open on it. This file reads what the functions answer and
 * says it in words — the Revenue app's sheets and Comm Cal's Requests tab share it.
 */

export type NotMineStatus = "hr" | "approved" | "rejected" | "cancelled";

export interface NotMineRequest {
  id: string;
  status: NotMineStatus;
  orderId: string;
  orderNo: string;
  /** The month the bill was in when it was sent, `YYYY-MM`. */
  periodMonth: string;
  subDepartmentId: string;
  /** Who sent it: the salesperson the bill was on. */
  staff: { id: string; name: string };
  reason: string;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  /** The bill as it is now. */
  bill: { date: string | null; customer: string; venue: string; total: number; ownerId: string | null; counts: boolean; periodMonth: string | null } | null;
}

/** The sheet: the bill, why it cannot be sent now, its open request. */
export interface NotMineContext {
  orderId: string;
  orderNo: string;
  total: number;
  customer: string;
  blocked: string | null;
  request: NotMineRequest | null;
}

/** The longest reason the database keeps. */
export const NOT_MINE_REASON_MAX = 500;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const STATUSES: readonly NotMineStatus[] = ["hr", "approved", "rejected", "cancelled"];

/** One request as the database writes it; null when it is not one. */
export function notMineRequestFromRow(v: unknown): NotMineRequest | null {
  if (!isObj(v)) return null;
  const id = str(v.id), orderId = str(v.orderId), orderNo = str(v.orderNo), status = str(v.status) as NotMineStatus | null;
  const staff = isObj(v.staff) ? { id: str(v.staff.id) ?? "", name: str(v.staff.name) ?? "" } : null;
  if (!id || !orderId || !orderNo || !status || !STATUSES.includes(status) || !staff?.id) return null;
  const bill = isObj(v.bill) ? {
    date: str(v.bill.date), customer: str(v.bill.customer) ?? "", venue: str(v.bill.venue) ?? "",
    total: num(v.bill.total) ?? 0, ownerId: str(v.bill.ownerId), counts: v.bill.counts !== false, periodMonth: str(v.bill.periodMonth),
  } : null;
  return {
    id, status, orderId, orderNo, periodMonth: str(v.periodMonth) ?? "", subDepartmentId: str(v.subDepartmentId) ?? "", staff,
    reason: str(v.reason) ?? "", createdAt: str(v.createdAt) ?? "", updatedAt: str(v.updatedAt) ?? "",
    decidedAt: str(v.decidedAt), decidedByName: str(v.decidedByName), decisionNote: str(v.decisionNote), bill,
  };
}

export function notMineRequestsFromRow(v: unknown): NotMineRequest[] {
  return (Array.isArray(v) ? v : []).map(notMineRequestFromRow).filter((r): r is NotMineRequest => !!r);
}

export function notMineContextFromRow(v: unknown): NotMineContext | null {
  if (!isObj(v)) return null;
  const orderId = str(v.orderId), orderNo = str(v.orderNo);
  if (!orderId || !orderNo) return null;
  return {
    orderId, orderNo, total: num(v.total) ?? 0, customer: str(v.customer) ?? "", blocked: str(v.blocked),
    request: v.request ? notMineRequestFromRow(v.request) : null,
  };
}

export type NotMineTone = "warn" | "good" | "bad" | "none";

/** A request's state, as the salesperson reads it. */
export function notMineStatus(r: Pick<NotMineRequest, "status">): { text: string; tone: NotMineTone } {
  switch (r.status) {
    case "hr": return { text: "Waiting for HR", tone: "warn" };
    case "approved": return { text: "Not counted", tone: "good" };
    case "rejected": return { text: "Rejected by HR", tone: "bad" };
    default: return { text: "Withdrawn", tone: "none" };
  }
}

/** The request still with HR on a bill, if any. */
export function openNotMineOn(list: readonly NotMineRequest[], orderId: string): NotMineRequest | null {
  return list.find(r => r.orderId === orderId && r.status === "hr") ?? null;
}

/** The reason as sent: trimmed; refused empty or past the database's length. */
export function notMineReasonRefusal(reason: string): string | null {
  const said = reason.trim();
  if (!said) return "Say whose order it is, or why it is not yours — HR reads it.";
  if (said.length > NOT_MINE_REASON_MAX) return `Keep the reason to ${NOT_MINE_REASON_MAX} characters.`;
  return null;
}
