import { describe, expect, it } from "vitest";
import { BUILTIN_FIELDS, type WaitingField } from "@/lib/commission/waiting-form";
import { answersFor, blankRequired, capacityLine, fillIn, ownQuestions, priorAnswers, waitingAnswersFrom } from "./waiting-answers";

// The handoff's sample form: the four built-ins, then HR's own three.
const fields: WaitingField[] = [
  ...BUILTIN_FIELDS,
  { id: "ic", label: "IC number", type: "text", required: true, placeholder: "e.g. 900101-14-5678" },
  { id: "heard", label: "How did they hear about us", type: "dropdown", required: false, options: ["Referral", "Roadshow"] },
  { id: "transport", label: "Has own transport", type: "yesno", required: false },
];
const form = { fields };

describe("a waiting list's answers to HR's own questions (2026-10-10)", () => {
  it("are HR's questions only, in the form's order", () => {
    expect(ownQuestions(form).map(f => f.id)).toEqual(["ic", "heard", "transport"]);
    expect(ownQuestions(null)).toEqual([]);
  });

  it("are sent for every question of HR's, trimmed, blank ones included", () => {
    expect(answersFor(form, { ic: " 900101-14-5678 ", heard: "Referral", newPerson: "Amelia Tan" })).toEqual([
      { id: "ic", label: "IC number", value: "900101-14-5678" },
      { id: "heard", label: "How did they hear about us", value: "Referral" },
      { id: "transport", label: "Has own transport", value: "" },
    ]);
  });

  it("finds the required ones left blank, the built-ins included", () => {
    expect(blankRequired(fields, { newPerson: "Amelia Tan", contact: "  ", target: "fair" }).map(f => f.id)).toEqual(["contact", "start", "ic"]);
    expect(blankRequired(fields, { newPerson: "A", contact: "1", target: "fair", start: "2026-11-01", ic: "9" })).toEqual([]);
  });

  it("says so the handoff's way, keeping an acronym", () => {
    expect(fillIn(blankRequired(fields, { target: "fair" }))).toBe("Fill in new member name, phone number, preferred start date, IC number.");
    expect(fillIn([{ label: "Has Own Transport" }])).toBe("Fill in has own transport.");
    expect(fillIn([])).toBeNull();
  });

  it("are read on the server: what the form could have sent, capped", () => {
    expect(waitingAnswersFrom("")).toEqual([]);
    expect(waitingAnswersFrom(JSON.stringify([
      { id: "ic", label: " IC number ", value: " 900101 " },
      { id: "ic", label: "Again", value: "dropped" },
      { id: "1bad", label: "Bad id", value: "dropped" },
      { id: "q-x", label: "A dash is not an id the form makes", value: "dropped" },
      "not an answer",
      { id: "heard", label: "How", value: 7 },
    ]))).toEqual([{ id: "ic", label: "IC number", value: "900101" }, { id: "heard", label: "How", value: "" }]);
    expect(() => waitingAnswersFrom("{oops")).toThrow("The form's answers could not be read. Try again.");
    expect(() => waitingAnswersFrom("{}")).toThrow("The form's answers could not be read. Try again.");
    expect(() => waitingAnswersFrom(JSON.stringify(Array.from({ length: 41 }, (_, i) => ({ id: `q${i}`, label: "Q", value: "" }))))).toThrow("The form has too many answers.");
    expect(() => waitingAnswersFrom(JSON.stringify([{ id: "ic", label: "IC number", value: "x".repeat(501) }]))).toThrow("The answer to “IC number” is too long.");
    expect(() => waitingAnswersFrom(JSON.stringify([{ id: "ic", label: "x".repeat(121), value: "" }]))).toThrow("A question on the form is too long.");
  });

  it("come back to a revision from the request's detail", () => {
    expect(priorAnswers({ answers: [{ id: "ic", label: "IC number", value: "900101" }, { id: 3 }, null] })).toEqual({ ic: "900101" });
    expect(priorAnswers({})).toEqual({});
  });

  it("read the capacity the handoff's way", () => {
    expect(capacityLine({ capacity: 30, occupied: 28 })).toBe("2 of 30 open");
    expect(capacityLine({ capacity: 25, occupied: 28 })).toBe("0 of 25 open");
    expect(capacityLine({ capacity: null, occupied: 4 })).toBe("4 · no limit");
    expect(capacityLine(undefined)).toBe("—");
  });
});
