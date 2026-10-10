/**
 * A waiting list's answers to HR's own questions (2026-10-10, HR revamp 7a):
 * the Revenue app draws the form Sales Groups › Form settings versions —
 * the four built-in questions are sent as they always were (newPerson,
 * contact, target, start), every other one rides in `detail.answers` as
 * {id, label, value} with `detail.formVersion`. The database refuses a
 * required one left blank (member_prepare_request, mig 20261010180000); the
 * form says so first, the handoff's way, and the server cleans what the
 * phone sends.
 *
 * Pure, so the form and the server share it and it is tested.
 */

import type { WaitingField, WaitingForm } from "@/lib/commission/waiting-form";

export interface WaitingAnswer {
  id: string;
  label: string;
  value: string;
}

/** HR's own questions, in the form's order — the built-ins are the form's fixed fields. */
export function ownQuestions(form: Pick<WaitingForm, "fields"> | null | undefined): WaitingField[] {
  return (form?.fields ?? []).filter(f => !f.builtin);
}

/** The answers to send: every question of HR's, blank ones included, in the form's order. */
export function answersFor(form: Pick<WaitingForm, "fields"> | null | undefined, values: Record<string, string>): WaitingAnswer[] {
  return ownQuestions(form).map(f => ({ id: f.id, label: f.label, value: (values[f.id] ?? "").trim() }));
}

/** The required questions left blank, in the form's order — the built-ins and HR's own alike. */
export function blankRequired(fields: readonly WaitingField[], values: Record<string, string>): WaitingField[] {
  return fields.filter(f => f.required && !(values[f.id] ?? "").trim());
}

/**
 * What the form says about them — the handoff's "Fill in new member name,
 * phone number." A label is lower-cased word by word except an acronym
 * ("IC number" stays), or null when nothing is blank.
 */
export function fillIn(blank: readonly Pick<WaitingField, "label">[]): string | null {
  if (!blank.length) return null;
  const lower = (label: string) => label.trim().split(/(\s+)/).map(w => (/^[A-Z0-9]{2,}\b/.test(w) ? w : w.toLowerCase())).join("");
  return `Fill in ${blank.map(f => lower(f.label)).join(", ")}.`;
}

const ID = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;

/**
 * What the phone sent, read on the server: JSON of at most 40 answers, each
 * with an id the form could have made (the one `member_save_waiting_form`
 * allows), its label and value trimmed and capped. Anything else is left out;
 * a value too long is refused.
 */
export function waitingAnswersFrom(raw: string): WaitingAnswer[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The form's answers could not be read. Try again.");
  }
  if (!Array.isArray(parsed)) throw new Error("The form's answers could not be read. Try again.");
  if (parsed.length > 40) throw new Error("The form has too many answers.");
  const out: WaitingAnswer[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    const id = typeof a.id === "string" ? a.id.trim() : "";
    if (!ID.test(id) || seen.has(id)) continue;
    const label = typeof a.label === "string" ? a.label.trim() : "";
    const value = typeof a.value === "string" ? a.value.trim() : "";
    if (label.length > 120) throw new Error("A question on the form is too long.");
    if (value.length > 500) throw new Error(`The answer to “${label || id}” is too long.`);
    seen.add(id);
    out.push({ id, label, value });
  }
  return out;
}

/** A request's own answers, as its detail keeps them — what a revision starts from. */
export function priorAnswers(detail: Record<string, unknown>): Record<string, string> {
  const list = Array.isArray(detail.answers) ? detail.answers : [];
  const out: Record<string, string> = {};
  for (const item of list) {
    const a = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    if (a && typeof a.id === "string" && typeof a.value === "string") out[a.id] = a.value;
  }
  return out;
}

/** "2 of 30 open" — the handoff's capacity line; "28 · no limit" when HR set none. */
export function capacityLine(d: { capacity: number | null; occupied: number } | undefined): string {
  if (!d) return "—";
  if (d.capacity === null) return `${d.occupied} · no limit`;
  return `${Math.max(d.capacity - d.occupied, 0)} of ${d.capacity} open`;
}
