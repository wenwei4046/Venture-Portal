/**
 * Share order (2026-10-21 — the user, on My sales orders' sheet: a ⋯ menu that sends a "share order" request; "我可以把这个
 * order allocation 分在不同的 sales 之间"; the colleague named accepts first, then HR approves on Comm Cal › Requests, and
 * the bill's commission and its sales value are split between them).
 *
 * The rule is the database's (migs 20261021150100, 20261021170000): one open request a bill, sent by the salesperson the
 * bill is on, naming ONE colleague of its sub-department — half each — on a bill nobody shares yet. It moves partner (the
 * colleague asked) → hr (accepted) → approved (written into `sales_order_shares`, as Comm Cal's own Share this bill writes
 * it) or rejected; the colleague may decline, the owner may withdraw it before HR decides. Every step is on its trail. This
 * file reads what the functions answer and says it in words — the Revenue app's sheets and Comm Cal's Requests tab share
 * it. (The JSON still carries a list of parts: the first version named up to five, and HR's Approve writes whatever a
 * request names.)
 */

export type ShareStatus = "partner" | "hr" | "approved" | "rejected" | "declined" | "cancelled";
export type ShareAnswer = "pending" | "accepted" | "declined";
export type ShareStep = "sent" | "accepted" | "declined" | "cancelled" | "approved" | "rejected";

/** Somebody holding a part of a bill now: the owner (1 − Σ shares) or a colleague. */
export interface ShareHolder { id: string; name: string; pct: number; owner: boolean }
/** A colleague a request names: their part, and their answer. */
export interface SharePart { id: string; name: string; pct: number; answer: ShareAnswer; answeredAt: string | null; note: string | null }
export interface ShareEvent { step: ShareStep; name: string; at: string; note: string | null }

export interface ShareRequest {
  id: string;
  status: ShareStatus;
  orderId: string;
  orderNo: string;
  /** The month the bill was in when it was sent, `YYYY-MM`. */
  periodMonth: string;
  subDepartmentId: string;
  owner: { id: string; name: string };
  note: string;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  /** What the reader is on it: its sender, a colleague it names — or neither (HR). */
  mine: "owner" | "partner" | null;
  /** The bill as it is now. */
  bill: { date: string | null; customer: string; venue: string; total: number; ownerId: string | null; counts: boolean; periodMonth: string | null } | null;
  parts: SharePart[];
  /** Who holds the bill now — before HR approves, the owner alone (or the shares HR made). */
  holders: ShareHolder[];
  events: ShareEvent[];
}

/** Somebody a bill may be shared with — and, when they cannot take a part now, why. */
export interface ShareTeamMember { id: string; name: string; title: string | null; unavailable: string | null }

/** The share sheet: the bill, why it cannot be shared now, its open request, who holds it, whom it may be shared with. */
export interface ShareContext {
  orderId: string;
  orderNo: string;
  total: number;
  blocked: string | null;
  request: ShareRequest | null;
  holders: ShareHolder[];
  team: ShareTeamMember[];
}

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const STATUSES: readonly ShareStatus[] = ["partner", "hr", "approved", "rejected", "declined", "cancelled"];
const ANSWERS: readonly ShareAnswer[] = ["pending", "accepted", "declined"];
const STEPS: readonly ShareStep[] = ["sent", "accepted", "declined", "cancelled", "approved", "rejected"];

function holderOf(v: unknown): ShareHolder | null {
  if (!isObj(v)) return null;
  const id = str(v.id), pct = num(v.pct);
  return id && pct !== null ? { id, name: str(v.name) ?? "", pct, owner: v.owner === true } : null;
}

/** One request as `share_requests_json` writes it; null when it is not one. */
export function shareRequestFromRow(v: unknown): ShareRequest | null {
  if (!isObj(v)) return null;
  const id = str(v.id), orderId = str(v.orderId), orderNo = str(v.orderNo), status = str(v.status) as ShareStatus | null;
  const owner = isObj(v.owner) ? { id: str(v.owner.id) ?? "", name: str(v.owner.name) ?? "" } : null;
  if (!id || !orderId || !orderNo || !status || !STATUSES.includes(status) || !owner?.id) return null;
  const bill = isObj(v.bill) ? {
    date: str(v.bill.date), customer: str(v.bill.customer) ?? "", venue: str(v.bill.venue) ?? "",
    total: num(v.bill.total) ?? 0, ownerId: str(v.bill.ownerId), counts: v.bill.counts !== false, periodMonth: str(v.bill.periodMonth),
  } : null;
  const parts = (Array.isArray(v.parts) ? v.parts : []).flatMap((p): SharePart[] => {
    if (!isObj(p)) return [];
    const pid = str(p.id), pct = num(p.pct), answer = str(p.answer) as ShareAnswer | null;
    return pid && pct !== null && answer && ANSWERS.includes(answer)
      ? [{ id: pid, name: str(p.name) ?? "", pct, answer, answeredAt: str(p.answeredAt), note: str(p.note) }] : [];
  });
  const events = (Array.isArray(v.events) ? v.events : []).flatMap((e): ShareEvent[] => {
    if (!isObj(e)) return [];
    const step = str(e.step) as ShareStep | null, at = str(e.at);
    return step && STEPS.includes(step) && at ? [{ step, name: str(e.name) ?? "", at, note: str(e.note) }] : [];
  });
  const mine = v.mine === "owner" || v.mine === "partner" ? v.mine : null;
  return {
    id, status, orderId, orderNo, periodMonth: str(v.periodMonth) ?? "", subDepartmentId: str(v.subDepartmentId) ?? "", owner,
    note: str(v.note) ?? "", createdAt: str(v.createdAt) ?? "", updatedAt: str(v.updatedAt) ?? "",
    decidedAt: str(v.decidedAt), decidedByName: str(v.decidedByName), decisionNote: str(v.decisionNote), mine, bill,
    parts, holders: (Array.isArray(v.holders) ? v.holders : []).map(holderOf).filter((h): h is ShareHolder => !!h), events,
  };
}

export function shareRequestsFromRow(v: unknown): ShareRequest[] {
  return (Array.isArray(v) ? v : []).map(shareRequestFromRow).filter((r): r is ShareRequest => !!r);
}

export function shareContextFromRow(v: unknown): ShareContext | null {
  if (!isObj(v)) return null;
  const orderId = str(v.orderId), orderNo = str(v.orderNo);
  if (!orderId || !orderNo) return null;
  return {
    orderId, orderNo, total: num(v.total) ?? 0, blocked: str(v.blocked),
    request: v.request ? shareRequestFromRow(v.request) : null,
    holders: (Array.isArray(v.holders) ? v.holders : []).map(holderOf).filter((h): h is ShareHolder => !!h),
    team: (Array.isArray(v.team) ? v.team : []).flatMap((t): ShareTeamMember[] => {
      if (!isObj(t)) return [];
      const tid = str(t.id);
      return tid ? [{ id: tid, name: str(t.name) ?? "", title: str(t.title), unavailable: str(t.unavailable) }] : [];
    }),
  };
}

/** 0.5 → `50%`, 0.3333 → `33.33%`, 0.125 → `12.5%`. */
export function pctLabel(p: number): string {
  const v = Math.round(p * 10_000) / 100;
  return `${Number.isInteger(v) ? v.toFixed(0) : String(v)}%`;
}

/** "LUCAS 50% · ANTHONY 50%" — the owner first. */
export function holdersLine(holders: readonly ShareHolder[]): string {
  return [...holders].sort((a, b) => Number(b.owner) - Number(a.owner)).map(h => `${h.name} ${pctLabel(h.pct)}`).join(" · ");
}

/**
 * A share is ONE colleague, and the bill is half each (2026-10-21 — the user: "only can share one pax, then percentage for
 * them request is fix with 50% 50%"; mig 20261021170000). The database refuses anything else.
 */
export const SHARE_PART = 0.5;

/** What the phone sends: the bill, the colleague's part as a fraction of it (always `SHARE_PART`), and a note. */
export interface ShareSendInput {
  orderId: string;
  parts: { staffId: string; pct: number }[];
  note: string;
}

/** What the form sends for the colleague picked: their half. */
export function draftPayload(pick: { id: string }): { staffId: string; pct: number }[] {
  return [{ staffId: pick.id, pct: SHARE_PART }];
}

export type ShareTone = "warn" | "good" | "bad" | "none";

/** A request's state in words, and its tone. */
export function shareStatus(r: Pick<ShareRequest, "status" | "parts">): { text: string; tone: ShareTone } {
  switch (r.status) {
    case "partner": {
      const waiting = r.parts.filter(p => p.answer === "pending").map(p => p.name);
      return { text: waiting.length ? `Waiting for ${listNames(waiting)}` : "Waiting for an answer", tone: "warn" };
    }
    case "hr": return { text: "With HR", tone: "warn" };
    case "approved": return { text: "Shared", tone: "good" };
    case "rejected": return { text: "Rejected by HR", tone: "bad" };
    case "declined": {
      const who = r.parts.filter(p => p.answer === "declined").map(p => p.name);
      return { text: who.length ? `Declined by ${listNames(who)}` : "Declined", tone: "bad" };
    }
    default: return { text: "Withdrawn", tone: "none" };
  }
}

/** One step of the trail, in words. */
export function stepLabel(step: ShareStep): string {
  return {
    sent: "Share request sent", accepted: "Accepted", declined: "Declined", cancelled: "Withdrawn",
    approved: "Approved by HR", rejected: "Rejected by HR",
  }[step];
}

/**
 * Who would hold the bill once HR approves a request: the colleagues it names at their parts, anybody holding a part now
 * whom it does not name at theirs, and the owner the rest — the owner first.
 */
export function proposedHolders(r: Pick<ShareRequest, "owner" | "parts" | "holders">): ShareHolder[] {
  const named = new Set(r.parts.map(p => p.id));
  const others = r.holders.filter(h => !h.owner && h.id !== r.owner.id && !named.has(h.id));
  const given = [...r.parts.map(p => ({ id: p.id, name: p.name, pct: p.pct, owner: false })), ...others];
  const kept = Math.round((1 - given.reduce((a, h) => a + h.pct, 0)) * 10_000) / 10_000;
  return [{ id: r.owner.id, name: r.owner.name, pct: kept, owner: true }, ...given];
}

/** The request still open on a bill (partner or hr), if any. */
export function openRequestOn(requests: readonly ShareRequest[], orderId: string): ShareRequest | null {
  return requests.find(r => r.orderId === orderId && (r.status === "partner" || r.status === "hr")) ?? null;
}

/** A request a colleague named still has to answer — the bell's and Today's "needs you". */
export function waitingOn(r: ShareRequest, staffId: string): boolean {
  return r.status === "partner" && r.parts.some(p => p.id === staffId && p.answer === "pending");
}

/** "ANTHONY", "ANTHONY and BEN", "ANTHONY, BEN and CAROL". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
