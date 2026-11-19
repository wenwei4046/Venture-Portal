import { describe, expect, it } from "vitest";
import { customerMatches } from "./customer-pick";
import { askInvite } from "./won-files";
import { typesProblem } from "../desk/vm/appt-types";
import { DEFAULT_APPT_TYPES } from "@/lib/member/crm-data";

describe("Calendar › Book appt (2026-11-19)", () => {
  const siti = { name: "Siti Hajar", phone: "60134567788" };
  it("finds a customer by the words of their name or the digits of their phone", () => {
    expect(customerMatches(siti, "")).toBe(true);
    expect(customerMatches(siti, "hajar siti")).toBe(true);
    expect(customerMatches(siti, "siti lim")).toBe(false);
    expect(customerMatches(siti, "013-456 7788")).toBe(true);
    expect(customerMatches(siti, "+60134567788")).toBe(true);
    expect(customerMatches(siti, "4567788")).toBe(true);
    expect(customerMatches(siti, "999")).toBe(false);
  });
  it("sends the invitation when no screen is there to ask", async () => {
    expect(await askInvite("Siti")).toBe(true);
  });
  it("Phone sits right of Online and needs no Place question", () => {
    expect(DEFAULT_APPT_TYPES.map(t => t.id)).toEqual(["online", "phone", "other"]);
    expect(typesProblem(DEFAULT_APPT_TYPES)).toBe("");
    expect(typesProblem([{ id: "visit", label: "Visit", on: true, base: "place", fields: [] }])).toBe('"Visit" is at a place: give it a Place question.');
  });
});
