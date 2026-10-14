/**
 * Edit request → Update (2026-10-10, HR revamp 7b; the handoff's Waiting list
 * & replacements sheet): a waiting list or a replacement HR has not acted on
 * yet — Pending review or More info needed — is changed in the sheet and sent
 * again as a revision of itself. `member_prepare_request` takes a `submitted`
 * one back to draft and names what changed on its history ("Updated by the
 * member · phone number"); anything decided is locked and says so.
 *
 * Pure: the sheet, the app and the tests share it.
 */

import type { MemberRequest } from "./types";

export type EditableKind = "waiting" | "replacement";

export interface EditField {
  key: "newPerson" | "contact" | "start" | "effective" | "reason";
  label: string;
  type: "text" | "tel" | "date";
  /** A day, or "Any time ready" (2026-10-14) — the waiting list's start date. */
  anyTime?: boolean;
}

/** The handoff's three fields a member may change, by kind. */
export const EDIT_FIELDS: Readonly<Record<EditableKind, readonly EditField[]>> = {
  waiting: [
    { key: "newPerson", label: "New member name", type: "text" },
    { key: "contact", label: "Phone number", type: "tel" },
    { key: "start", label: "Preferred start date", type: "date", anyTime: true },
  ],
  replacement: [
    { key: "newPerson", label: "Replacement name", type: "text" },
    { key: "effective", label: "Planned effective date", type: "date" },
    { key: "reason", label: "Reason and arrangement", type: "text" },
  ],
};

const PENDING = new Set(["submitted", "needs_info"]);
const str = (v: unknown) => (typeof v === "string" ? v : "");

const editable = (kind: string): kind is EditableKind => kind === "waiting" || kind === "replacement";

/** Still with HR, untouched: the member may change it. */
export function canEditRequest(r: Pick<MemberRequest, "kind" | "status">): boolean {
  return editable(r.kind) && PENDING.has(r.status);
}

/** Why a decided one cannot be changed any more — the handoff's words; null while it can, and for a claim. */
export function lockedNote(r: Pick<MemberRequest, "kind" | "status">): string | null {
  if (!editable(r.kind) || PENDING.has(r.status) || r.status === "draft" || r.status === "withdrawn") return null;
  const how = r.status === "waiting" ? "accepted" : r.status === "scheduled" ? "approved" : "decided";
  return `This request has been ${how}, so it can no longer be edited. Ask HR if something needs to change.`;
}

/** What the fields open with: the request as it was sent. */
export function editValues(r: Pick<MemberRequest, "kind" | "detail">): Record<string, string> {
  if (!editable(r.kind)) return {};
  return Object.fromEntries(EDIT_FIELDS[r.kind].map(f => [f.key, str(r.detail[f.key])]));
}

/** The fields the member changed, in the form's order. */
export function editChanges(r: Pick<MemberRequest, "kind" | "detail">, values: Record<string, string>): EditField[] {
  if (!editable(r.kind)) return [];
  return EDIT_FIELDS[r.kind].filter(f => (values[f.key] ?? "").trim() !== str(r.detail[f.key]).trim());
}

/** What is missing before it can go, in the form's own words — or null. */
export function editProblem(r: Pick<MemberRequest, "kind" | "detail">, values: Record<string, string>): string | null {
  const v = (key: string) => (values[key] ?? "").trim();
  if (r.kind === "waiting") {
    if (!v("newPerson")) return "Enter the new member's full name.";
    if (!v("contact")) return "Enter a phone number.";
    if (!v("start")) return "Enter the preferred start date.";
    return null;
  }
  if (r.kind === "replacement") {
    if (!v("newPerson") && str(r.detail.replacementSource) !== "vacancy") return "Enter the replacement's name.";
    if (!v("effective")) return "Enter the planned effective date.";
    if (!v("reason")) return "Say why, and how the handover works.";
    return null;
  }
  return "Only a waiting list or a replacement can be edited here.";
}

/**
 * The revision `submitMemberRequest` sends: everything the request was sent
 * with — its sub-department, signature, HR's answers and signed form, the
 * replacement's member and arrangement — with the member's three fields in
 * place of theirs.
 */
export function revisionForm(r: Pick<MemberRequest, "id" | "kind" | "detail">, values: Record<string, string>): FormData {
  const d = r.detail;
  const v = (key: string) => (values[key] ?? str(d[key])).trim();
  const form = new FormData();
  form.set("kind", r.kind);
  form.set("requestId", r.id);
  form.set("subDepartmentId", str(d.subDepartmentId));
  if (r.kind === "waiting") {
    form.set("newPerson", v("newPerson"));
    form.set("contact", v("contact"));
    form.set("targetDepartmentId", str(d.subDepartmentId));
    form.set("start", v("start"));
    form.set("consent", "true");
    form.set("signature", str(d.signature));
    if (str(d.signatureImage)) form.set("signatureImage", str(d.signatureImage));
  } else {
    form.set("originalStaffId", str(d.originalStaffId));
    form.set("destination", str(d.destination));
    if (str(d.destination) === "transfer") form.set("targetDepartmentId", str(d.targetDepartmentId));
    form.set("replacementSource", str(d.replacementSource) || "new");
    if (str(d.waitingRequestId)) form.set("waitingRequestId", str(d.waitingRequestId));
    form.set("newPerson", v("newPerson"));
    form.set("effective", v("effective"));
    form.set("reason", v("reason"));
  }
  // HR's answers and the signed form ride along unchanged — a waiting list's
  // since 2026-10-10, a replacement's since 2026-10-11 (its own Form settings).
  if (typeof d.formVersion === "number") form.set("formVersion", String(d.formVersion));
  if (Array.isArray(d.answers)) form.set("answers", JSON.stringify(d.answers));
  if (str(d.signedFormName) && str(d.signedFormHash)) {
    form.set("signedFormName", str(d.signedFormName));
    form.set("signedFormHash", str(d.signedFormHash));
  }
  return form;
}
