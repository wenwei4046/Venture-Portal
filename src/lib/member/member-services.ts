/**
 * People › Member services as the HR revamp draws it (2026-10-10, the handoff
 * "Sidebar design revamp from HR", variant A): Request reviews — a list of
 * every request beside the one open — Brand weeks, Claim rates and Publish
 * memo. The words, facts and steps each request shows, from
 * `member_admin_snapshot()` and `member_admin_request_facts()` (mig
 * 20261010160000) — pure, so the tabs stay thin and this is tested.
 */

import type { AdminMemberData } from "@/lib/member/server";
import type { MemberMemo, MemberRequest } from "@/lib/member/types";
import { dayLabel, historyOf, statusOf, type RequestEvent, type RequestTone } from "@/lib/commission/sales-group-requests";
import { formatMoney } from "@/lib/utils";

export type RequestKind = "claim" | "replacement" | "waiting";
export type RequestFilter = "all" | RequestKind;

/** The list's filters, in the handoff's order. */
export const REQUEST_FILTERS: ReadonlyArray<readonly [RequestFilter, string]> = [
  ["all", "All"],
  ["claim", "Claim"],
  ["replacement", "Replacement"],
  ["waiting", "Waiting list"],
];

export const KIND_WORD: Readonly<Record<string, string>> = {
  claim: "Claim",
  replacement: "Replacement",
  waiting: "Waiting list",
};

/** `member_admin_request_facts()`'s answer for one request. */
export interface RequestFacts {
  submittedBy: string | null;
  original: string | null;
  successor: string | null;
  target: string | null;
  acceptedAt: string | null;
  events: RequestEvent[];
}

export function requestFactsFromRow(raw: unknown): Record<string, RequestFacts> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  const out: Record<string, RequestFacts> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const f = value as Record<string, unknown>;
    out[id] = {
      submittedBy: text(f.submittedBy),
      original: text(f.original),
      successor: text(f.successor),
      target: text(f.target),
      acceptedAt: text(f.acceptedAt),
      events: Array.isArray(f.events)
        ? (f.events as unknown[]).flatMap(e => {
            if (!e || typeof e !== "object") return [];
            const x = e as Record<string, unknown>;
            return typeof x.to === "string" && typeof x.at === "string"
              ? [{ to: x.to, at: x.at, note: text(x.note), by: text(x.by) }]
              : [];
          })
        : [],
    };
  }
  return out;
}

/** A request's status in Member services' words and its chip — a claim's paid included. */
export function requestStatus(status: string): { name: string; tone: RequestTone } {
  if (status === "paid") return { name: "Paid", tone: "info" };
  return statusOf(status);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** "Amelia Tan · Waiting List", "Marcus · Replacement", a claim's own title. */
export function requestTitle(r: MemberRequest, facts: RequestFacts | undefined): string {
  if (r.kind === "waiting") return `${str(r.detail.newPerson) || "New member"} · Waiting List`;
  if (r.kind === "replacement") return `${facts?.original ?? "A member"} · Replacement`;
  return r.title;
}

/** "Waiting list · RQ-2610-004". */
export function requestMeta(r: MemberRequest): string {
  return `${KIND_WORD[r.kind] ?? r.kind} · ${r.requestNo ?? r.id.slice(0, 8)}`;
}

export function filterRequests(requests: readonly MemberRequest[], filter: RequestFilter): MemberRequest[] {
  return filter === "all" ? [...requests] : requests.filter(r => r.kind === filter);
}

/** Still to be decided: what Request more information, Reject and the approval act on. */
export function isOpen(r: MemberRequest): boolean {
  return r.status === "submitted" || r.status === "needs_info" || (r.kind === "waiting" && r.status === "expired");
}

const DESTINATION: Readonly<Record<string, string>> = {
  member_exit: "Leave this department only",
  department_exit: "Leave this department only",
  resignation: "Leave the company",
  company_exit: "Leave the company",
  exit: "Leave the company",
  transfer: "Transfer to another department",
};
const SOURCE: Readonly<Record<string, string>> = {
  new: "New member joining",
  existing: "Existing member",
  waiting: "From the waiting list",
  vacancy: "Release the position without a replacement",
};
const CATEGORY: Readonly<Record<string, string>> = {
  "Outstation 住宿": "Outstation accommodation",
  "Airbnb 住宿": "Airbnb accommodation",
};

export interface Fact {
  l: string;
  v: string;
}

/** The facts a request opens on, in the handoff's order; a blank one is left out. */
export function requestFacts(r: MemberRequest, facts: RequestFacts | undefined, data: Pick<AdminMemberData, "departments">): Fact[] {
  const d = r.detail;
  const sub = data.departments.find(x => x.id === str(d.subDepartmentId))?.name ?? str(d.department);
  const department = sub ? `Revenue · ${sub}` : "";
  const rows: Array<[string, string]> =
    r.kind === "waiting"
      ? [
          ["Applicant", str(d.newPerson)],
          ["Mobile number", str(d.contact)],
          ["Joining date", str(d.start) ? dayLabel(str(d.start)) : ""],
          ["Signed by", str(d.signature)],
          ["Request department", department],
          ["Submitted by", facts?.submittedBy ?? ""],
          ["Signed form", typeof d.signatureImage === "string" && d.signatureImage ? "Signed in the Revenue app" : "Paper form on file"],
        ]
      : r.kind === "replacement"
        ? [
            ["Original member", facts?.original ?? ""],
            ["Original member arrangement", DESTINATION[str(d.destination)] ?? str(d.destination)],
            ["Receiving department", facts?.target ? `Revenue · ${facts.target}` : ""],
            ["Proposed replacement", str(d.newPerson) || SOURCE[str(d.replacementSource)] || ""],
            ["Planned effective date", str(d.effective) ? dayLabel(str(d.effective)) : ""],
            ["Reason and notes", str(d.reason)],
            ["Request department", department],
            ["Submitted by", facts?.submittedBy ?? ""],
          ]
        : [
            ["Claim category", CATEGORY[str(d.category)] ?? str(d.category)],
            ["Claim amount", d.amount !== null && d.amount !== undefined && d.amount !== "" && Number.isFinite(Number(d.amount)) ? formatMoney(Number(d.amount)) : ""],
            ["Location", str(d.location)],
            ["Stay", str(d.start) && str(d.end) ? `${dayLabel(str(d.start))} — ${dayLabel(str(d.end))}` : ""],
            ["Submitted by", facts?.submittedBy ?? ""],
          ];
  return rows.filter(([, v]) => v !== "").map(([l, v]) => ({ l, v }));
}

/** What HR does next, as the section under the facts names it. */
export function requestStep(r: MemberRequest): string {
  if (r.kind === "waiting") return isOpen(r) ? "Accept onto the waiting list" : "On the waiting list";
  if (r.kind === "replacement") {
    if (isOpen(r)) return "Approve the arrangement";
    if (r.status === "approved") return "Complete the arrangement";
    return r.status === "executed" ? "Completed" : "Decided";
  }
  return isOpen(r) ? "Decide the claim" : "Decided";
}

/** The line under the step. */
export function requestCaption(r: MemberRequest, sub: string | null): string {
  if (r.kind === "waiting" && isOpen(r)) {
    return `Accepting puts the applicant at the end of ${sub ?? "the sub-department"}'s waiting list. The department was chosen when the request was submitted.`;
  }
  if (r.kind === "claim" && isOpen(r)) return "Approving names where the money comes from.";
  if (r.kind === "replacement" && isOpen(r)) return "Approving records the plan; the staff changes are made in People Management and confirmed here once done.";
  if (r.kind === "replacement" && r.status === "approved") {
    return "Make the change in People Management and Revenue — the original member's arrangement and the replacement's place — then confirm it here on or after the effective date.";
  }
  return "";
}

/** A waiting-list acceptance goes on the record even when HR adds nothing. */
export const ACCEPT_NOTE = "Accepted onto the waiting list.";

/** The audit history, oldest first, one step per move (the trigger's echo folded). */
export function requestHistory(facts: RequestFacts | undefined) {
  return historyOf(facts?.events ?? []);
}

// ── Publish memo ────────────────────────────────────────────────────────────

export interface MemoReads {
  read: number;
  acknowledged: number;
}

export function memoReadsFromRow(raw: unknown): Record<string, MemoReads> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, MemoReads> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const v = (value ?? {}) as Record<string, unknown>;
    out[id] = { read: Number(v.read) || 0, acknowledged: Number(v.acknowledged) || 0 };
  }
  return out;
}

/** "Fair, IR · read by 18". */
export function memoLine(memo: Pick<MemberMemo, "id" | "departments">, reads: Record<string, MemoReads> | null): string {
  const audience = memo.departments.join(", ") || "No department";
  return reads ? `${audience} · read by ${reads[memo.id]?.read ?? 0}` : audience;
}

/** Why a memo cannot go yet — the handoff's one sentence — or null. */
export function memoRefusal(title: string, body: string, audience: readonly string[]): string | null {
  return !title.trim() || !body.trim() || audience.length === 0 ? "Add a title, a body and at least one department." : null;
}

// ── Brand weeks ─────────────────────────────────────────────────────────────

/** The four brands a week can be, in the order a click cycles them, and their chip colours. */
export const WEEK_BRANDS = [
  { code: "AKEMI", name: "Akemi", fg: "189 74 25", bg: "255 240 228" },
  { code: "DUNLOP", name: "Dunlopillo", fg: "78 101 116", bg: "230 237 241" },
  { code: "ZANOTTI", name: "Zanotti", fg: "125 91 32", bg: "246 237 213" },
  { code: "ERGOTEX", name: "Ergotex", fg: "56 117 87", bg: "232 243 237" },
] as const;

export type WeekBrandCode = (typeof WEEK_BRANDS)[number]["code"];

export function weekBrand(code: string | null | undefined) {
  return WEEK_BRANDS.find(b => b.code === code) ?? null;
}

/** A click: Akemi → Dunlopillo → Zanotti → Ergotex → not picked → Akemi. */
export function nextWeekBrand(code: string | null | undefined): WeekBrandCode | null {
  const at = WEEK_BRANDS.findIndex(b => b.code === code);
  if (at === -1) return WEEK_BRANDS[0].code;
  return at === WEEK_BRANDS.length - 1 ? null : WEEK_BRANDS[at + 1].code;
}

/** "1 week changed" / "3 weeks changed". */
export function weeksChangedText(n: number): string {
  return `${n} week${n === 1 ? "" : "s"} changed`;
}
