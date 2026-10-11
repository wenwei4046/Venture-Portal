import { describe, expect, it } from "vitest";
import type { MemberRequest } from "./types";
import { canEditRequest, editChanges, editProblem, editValues, lockedNote, revisionForm } from "./request-edit";

const HASH = "a".repeat(64);
const waiting = (over: Partial<MemberRequest> = {}): MemberRequest => ({
  id: "w1", kind: "waiting", title: "t", status: "submitted", createdAt: "2026-10-09T01:00:00Z", staffId: "jia",
  detail: {
    newPerson: "Amelia Tan", contact: "012-345 6789", start: "2026-11-03", signature: "Jia En", consent: true,
    formVersion: 2, answers: [{ id: "ic", label: "IC number", value: "900101" }], signedFormName: "form.pdf", signedFormHash: HASH,
    // What member_request_json merges in beside the request's own detail.
    subDepartmentId: "fair", department: "Fair", reservationExpiresAt: null, allocatedStaffId: null,
  },
  ...over,
});
const replacement = (over: Partial<MemberRequest> = {}): MemberRequest => ({
  id: "r1", kind: "replacement", title: "t", status: "needs_info", createdAt: "2026-10-09T01:00:00Z", staffId: "jia",
  detail: {
    originalStaffId: "yuny", destination: "transfer", targetDepartmentId: "ir", replacementSource: "waiting", waitingRequestId: "w9",
    newPerson: "Siti Aisyah", effective: "2026-11-01", reason: "Moving to IR", subDepartmentId: "fair",
  },
  ...over,
});

describe("Edit request → Update (HR revamp 7b)", () => {
  it("is open while HR has not acted on a waiting list or replacement — never a claim", () => {
    expect(canEditRequest(waiting())).toBe(true);
    expect(canEditRequest(replacement())).toBe(true);
    expect(canEditRequest(waiting({ status: "waiting" }))).toBe(false);
    expect(canEditRequest({ kind: "claim", status: "submitted" })).toBe(false);
  });

  it("says why a decided one is locked, in the handoff's words", () => {
    expect(lockedNote(waiting({ status: "waiting" }))).toBe("This request has been accepted, so it can no longer be edited. Ask HR if something needs to change.");
    expect(lockedNote(replacement({ status: "scheduled" }))).toBe("This request has been approved, so it can no longer be edited. Ask HR if something needs to change.");
    expect(lockedNote(replacement({ status: "rejected" }))).toContain("has been decided");
    expect(lockedNote(waiting())).toBeNull();
    expect(lockedNote(waiting({ status: "withdrawn" }))).toBeNull();
    expect(lockedNote({ kind: "claim", status: "approved" })).toBeNull();
  });

  it("opens on what was sent and knows what changed", () => {
    expect(editValues(waiting())).toEqual({ newPerson: "Amelia Tan", contact: "012-345 6789", start: "2026-11-03" });
    expect(editValues(replacement())).toEqual({ newPerson: "Siti Aisyah", effective: "2026-11-01", reason: "Moving to IR" });
    expect(editChanges(waiting(), { newPerson: "Amelia Tan ", contact: "011-222 3333", start: "2026-11-10" }).map(f => f.label))
      .toEqual(["Phone number", "Preferred start date"]);
    expect(editChanges(waiting(), editValues(waiting()))).toEqual([]);
  });

  it("refuses a blank field the way the form does", () => {
    expect(editProblem(waiting(), { newPerson: "A", contact: " ", start: "2026-11-01" })).toBe("Enter a phone number.");
    expect(editProblem(replacement(), { newPerson: "", effective: "2026-11-01", reason: "x" })).toBe("Enter the replacement's name.");
    expect(editProblem(replacement({ detail: { ...replacement().detail, replacementSource: "vacancy" } }), { newPerson: "", effective: "2026-11-01", reason: "x" })).toBeNull();
    expect(editProblem(replacement(), { newPerson: "B", effective: "2026-11-01", reason: "" })).toBe("Say why, and how the handover works.");
  });

  it("sends a waiting list again with everything it carried — signature, HR's answers, the signed form", () => {
    const form = revisionForm(waiting(), { newPerson: "Amelia Tan", contact: "011-222 3333", start: "2026-11-10" });
    expect(Object.fromEntries(form.entries())).toEqual({
      kind: "waiting", requestId: "w1", subDepartmentId: "fair", newPerson: "Amelia Tan", contact: "011-222 3333", targetDepartmentId: "fair",
      start: "2026-11-10", consent: "true", signature: "Jia En", formVersion: "2",
      answers: JSON.stringify([{ id: "ic", label: "IC number", value: "900101" }]), signedFormName: "form.pdf", signedFormHash: HASH,
    });
  });

  it("sends a replacement again with its member, arrangement and source", () => {
    const form = revisionForm(replacement(), { newPerson: "Siti Aisyah", effective: "2026-11-08", reason: "Moving to IR in November" });
    expect(Object.fromEntries(form.entries())).toEqual({
      kind: "replacement", requestId: "r1", subDepartmentId: "fair", originalStaffId: "yuny", destination: "transfer", targetDepartmentId: "ir",
      replacementSource: "waiting", waitingRequestId: "w9", newPerson: "Siti Aisyah", effective: "2026-11-08", reason: "Moving to IR in November",
    });
  });

  // Round 2's README 18.5 (2026-10-11): a replacement sent on HR's form keeps what came with it, or
  // member_prepare_request would refuse the update for a required answer it no longer carries.
  it("sends a replacement on HR's form again with its answers and signed form", () => {
    const sentOnForm = replacement({ detail: { ...replacement().detail, formVersion: 2, answers: [{ id: "q_handover", label: "Handover done?", value: "Yes" }],
      signedFormName: "handover.pdf", signedFormHash: HASH } });
    expect(Object.fromEntries(revisionForm(sentOnForm, {}).entries())).toMatchObject({
      kind: "replacement", formVersion: "2", answers: JSON.stringify([{ id: "q_handover", label: "Handover done?", value: "Yes" }]),
      signedFormName: "handover.pdf", signedFormHash: HASH,
    });
  });
});
