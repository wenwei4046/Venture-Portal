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
  /** A scheduled replacement: the day it runs (mig 20261010170000). */
  effectiveOn?: string | null;
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
      effectiveOn: text(f.effectiveOn),
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
          // HR's own questions, as the form asked them (Sales Groups › Form settings, 2026-10-10).
          ...waitingAnswers(d).map(a => [a.label, a.value] as [string, string]),
          ["Signed form", str(d.signedFormName) ? `${str(d.signedFormName)} · black & white record` : "Paper form on file"],
          ["Form version", Number.isInteger(d.formVersion) && Number(d.formVersion) > 0 ? `v${d.formVersion}` : ""],
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

/** A waiting list's answers to HR's own questions, as `detail.answers` keeps them. */
function waitingAnswers(d: Record<string, unknown>): { label: string; value: string }[] {
  if (!Array.isArray(d.answers)) return [];
  return d.answers.flatMap(a => {
    const x = a && typeof a === "object" ? (a as Record<string, unknown>) : null;
    return x && str(x.label) && str(x.value) ? [{ label: str(x.label), value: str(x.value) }] : [];
  });
}

/** A waiting list sent with its signed application form — Member services opens it (`signed_form`). */
export function hasSignedForm(r: Pick<MemberRequest, "kind" | "detail">): boolean {
  return r.kind === "waiting" && !!str(r.detail.signedFormName) && /^[0-9a-f]{64}$/.test(str(r.detail.signedFormHash));
}

/** What HR does next, as the section under the facts names it. */
export function requestStep(r: MemberRequest): string {
  if (r.kind === "waiting") return isOpen(r) ? "Accept onto the waiting list" : "On the waiting list";
  if (r.kind === "replacement") {
    if (choosesReplacement(r)) return "Approve and choose the replacement";
    if (r.status === "scheduled") return "Scheduled";
    return r.status === "executed" ? "Completed" : "Decided";
  }
  return isOpen(r) ? "Decide the claim" : "Decided";
}

/** The line under the step. */
export function requestCaption(r: MemberRequest, sub: string | null, facts?: RequestFacts): string {
  if (r.kind === "waiting" && isOpen(r)) {
    return `Accepting puts the applicant at the end of ${sub ?? "the sub-department"}'s waiting list. The department was chosen when the request was submitted.`;
  }
  if (r.kind === "claim" && isOpen(r)) return "Approving names where the money comes from.";
  if (r.kind === "replacement" && choosesReplacement(r)) {
    const original = facts?.original ?? "the original member";
    const leaves = {
      resignation: `${original} is deactivated`,
      member_exit: `${original} leaves ${sub ?? "the sub-department"}`,
      transfer: `${original} moves to ${facts?.target ?? "the receiving sub-department"}`,
    }[arrangementOf(r)];
    return `Pick who takes the seat from People Management (Revenue · ${sub ?? "—"}), and the date. On that date the system replaces them: ${leaves} and the new person is added.`;
  }
  return "";
}

/** A waiting-list acceptance goes on the record even when HR adds nothing. */
export const ACCEPT_NOTE = "Accepted onto the waiting list.";

/**
 * The audit history, oldest first, one step per move (the trigger's echo
 * folded). A replacement's steps in the handoff's words: "Approved · replaced
 * by Ryan Tan on 13 Oct 2026", "Replaced automatically" by the System,
 * "Taken off the schedule".
 */
export function requestHistory(facts: RequestFacts | undefined, kind?: string, detail?: Record<string, unknown>) {
  const steps = historyOf(facts?.events ?? []);
  if (kind === "waiting" && detail && str(detail.signedFormName)) {
    // The handoff's sending step says what came with it: "Signed form attached: …".
    const sent = steps.map(e => e.to === "submitted" && !e.note).lastIndexOf(true);
    if (sent >= 0) steps[sent] = { ...steps[sent], note: `Signed form attached: ${str(detail.signedFormName)}` };
  }
  if (kind !== "replacement") return steps;
  const current = steps.map(e => e.to).lastIndexOf("scheduled");
  return steps.map((e, i) => {
    const before = steps[i - 1]?.to;
    if (e.to === "scheduled") {
      const what =
        i === current && facts?.effectiveOn
          ? `Approved · ${facts.successor ? `replaced by ${facts.successor}` : "seat released"} on ${dayLabel(facts.effectiveOn)}`
          : "Approved · scheduled";
      return { ...e, what, note: e.note && /^Approved to run on /.test(e.note) ? null : e.note };
    }
    if (e.to === "executed") return { ...e, what: "Replaced automatically", by: e.by ?? "System" };
    if (e.to === "submitted" && before === "scheduled") {
      return { ...e, what: "Taken off the schedule", note: e.note === "Taken off the schedule." ? null : e.note };
    }
    return e;
  });
}

// ── A replacement: who takes the seat, and when ─────────────────────────────

export type Arrangement = "resignation" | "member_exit" | "transfer";

/** What happens to the original member, the older words folded into the three the system runs. */
export function arrangementOf(r: Pick<MemberRequest, "detail">): Arrangement {
  const d = str(r.detail.destination);
  if (d === "member_exit" || d === "department_exit") return "member_exit";
  if (d === "transfer") return "transfer";
  return "resignation";
}

/** Still to be approved with a successor and a date (`approved` is the old flow's half-way). */
export function choosesReplacement(r: MemberRequest): boolean {
  return r.kind === "replacement" && (isOpen(r) || r.status === "approved");
}

export interface SeatOption {
  /** "" releases the seat. */
  id: string;
  label: string;
  meta: string;
}

export const RELEASE_SEAT: SeatOption = { id: "", label: "No replacement · release the seat", meta: "" };

/**
 * Replaced by · from People Management: releasing the seat, then everybody
 * active in the original member's department but them, each with their title
 * — those who lead in this sub-department first (the handoff's list opens on
 * its Team Leaders), then the rest, each by name.
 */
export function seatOptions(r: MemberRequest, data: Pick<AdminMemberData, "candidates" | "titles" | "uplines">): SeatOption[] {
  const originalId = str(r.detail.originalStaffId);
  const sub = str(r.detail.subDepartmentId);
  const department = data.candidates.find(c => c.id === originalId)?.departmentId ?? null;
  const titles = new Map(data.titles.map(t => [t.id, t.name]));
  const leads = new Set(data.uplines.filter(u => u.subDepartmentId === sub).map(u => u.id));
  const people = data.candidates
    .filter(c => c.id !== originalId && (department === null || c.departmentId === department))
    .sort((a, b) => Number(leads.has(b.id)) - Number(leads.has(a.id)) || a.name.localeCompare(b.name))
    .map(c => ({ id: c.id, label: c.name, meta: (c.titleId && titles.get(c.titleId)) || "" }));
  return [RELEASE_SEAT, ...people];
}

/** Who the choice starts on: the person the member named, if they are on the roster; else the seat released. */
export function defaultSeat(r: MemberRequest, options: readonly SeatOption[]): string {
  if (str(r.detail.replacementSource) === "vacancy") return "";
  const named = str(r.detail.newPerson).toLowerCase();
  return (named && options.find(o => o.id !== "" && o.label.trim().toLowerCase() === named)?.id) || "";
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The date the choice starts on: the member's planned date, else today. */
export function defaultEffective(r: MemberRequest, today: string): string {
  const planned = str(r.detail.effective);
  return ISO_DAY.test(planned) ? planned : today;
}

/** The line beside the date. */
export function effectiveWhen(date: string, today: string): string {
  return date <= today
    ? "That date has come, so the change happens as soon as you approve."
    : `Scheduled — the system replaces them on ${dayLabel(date)}.`;
}

export function approveLabel(date: string): string {
  return `Approve · replace on ${dayLabel(date)}`;
}

/** What a successful approval says: replaced at once, or scheduled. */
export function approvedText(
  r: MemberRequest,
  facts: RequestFacts | undefined,
  successor: string | null,
  sub: string | null,
  date: string,
  ran: boolean,
): string {
  if (!ran) return `Scheduled for ${dayLabel(date)} — the system replaces them then`;
  const original = facts?.original ?? "the original member";
  const leaves = {
    resignation: `${original} deactivated`,
    member_exit: `${original} left ${sub ?? "the sub-department"}`,
    transfer: `${original} moved to ${facts?.target ?? "the receiving sub-department"}`,
  }[arrangementOf(r)];
  return `Replaced — ${leaves}${successor ? `, ${successor} added to ${sub ?? "the sub-department"}` : ""}`;
}

/** A scheduled replacement's notice: what the system does, and on which day. */
export function scheduledNotice(r: MemberRequest, facts: RequestFacts | undefined, sub: string | null): string {
  const original = facts?.original ?? "the original member";
  const where = sub ?? "the sub-department";
  const does = {
    resignation: `deactivates ${original}`,
    member_exit: `takes ${original} off ${where}`,
    transfer: `moves ${original} to ${facts?.target ?? "the receiving sub-department"}`,
  }[arrangementOf(r)];
  const day = facts?.effectiveOn ? dayLabel(facts.effectiveOn) : "the effective date";
  return `On ${day} the system ${does}${facts?.successor ? ` and adds ${facts.successor} to ${where}` : " and releases the seat"}.`;
}

/** The hourly run's refusal, as it wrote it on the request — or null. */
export function runFailure(note: string | null | undefined): string | null {
  return note && note.startsWith("Could not run on ") ? note : null;
}

/** Why the approval cannot be sent as it is — or null. */
export function replacementRefusal(input: { requestId: string; successorId: string | null; effective: string }): string | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.requestId)) return "This request could not be found. Reload the page.";
  if (input.successorId !== null && !uuid.test(input.successorId)) return "Choose who takes the seat again.";
  if (!ISO_DAY.test(input.effective) || Number.isNaN(Date.parse(`${input.effective}T00:00:00Z`))) return "Choose the effective date.";
  return null;
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
