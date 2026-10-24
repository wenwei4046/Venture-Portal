import { describe, expect, it, vi } from "vitest";
import { customBookVM, customPrefill } from "./custom-book";
import { visitCardText } from "@/lib/member/crm-maps";
import { apptTypesFrom, apptValues, DEFAULT_APPT_TYPES, visitFromRow, virtualRoom, type ApptType } from "@/lib/member/crm-data";
import { typesProblem } from "../desk/vm/appt-types";

const now = new Date("2026-10-24T02:00:00Z"); // 10:00 am in the office
const SITE: ApptType = { id: "site", label: "Site visit", on: true, base: "place", fields: [{ id: "unit", label: "Unit", kind: "place" }, { id: "size", label: "Size", kind: "choice", options: ["Studio", "2R"], required: true }] };
const TYPES = [...DEFAULT_APPT_TYPES, SITE];
const vm = (b: Parameters<typeof customBookVM>[0]["b"], save = vi.fn(async () => true)) =>
  customBookVM({ b, put: () => {}, changing: false, now, types: TYPES, save, done: () => {} });

describe("Book visit › appointment types (2026-10-24)", () => {
  it("offers Showroom and every type switched on", () => {
    expect(vm({}).tabs.map(t => t.label)).toEqual(["Showroom", "Online", "Other", "Site visit"]);
    expect(customBookVM({ b: {}, put: () => {}, changing: false, now, types: [{ ...SITE, on: false }], save: vi.fn(), done: () => {} }).tabs.map(t => t.label)).toEqual(["Showroom"]);
  });
  it("needs a date and a time, the place and every required question", () => {
    expect(vm({ mode: "online" }).label).toBe("Pick a date and a time");
    expect(vm({ mode: "online", cDate: "2026-10-25", cTime: "15:30" }).ready).toBe(true);
    expect(vm({ mode: "other", cDate: "2026-10-25", cTime: "15:30" }).label).toBe("Fill in Place");
    expect(vm({ mode: "site", cDate: "2026-10-25", cTime: "15:30", answers: { unit: "3A" } }).label).toBe("Fill in Size");
    expect(vm({ mode: "site", cDate: "2026-10-25", cTime: "15:30", answers: { unit: "3A", size: "2R" } }).ready).toBe(true);
  });
  it("refuses a bad link and a time gone by", () => {
    expect(vm({ mode: "online", cDate: "2026-10-25", cTime: "15:30", answers: { link: "meet.google.com/x" } }).label).toBe("Meeting link: the link must start with https://");
    expect(vm({ mode: "online", cDate: "2026-10-24", cTime: "09:00" }).label).toBe("That time has passed");
  });
  it("saves the office's time, the type and its answers", async () => {
    const save = vi.fn(async () => true);
    vm({ mode: "online", cDate: "2026-10-25", cTime: "15:30", answers: { link: " https://zoom.us/j/1 ", remarks: " Zoom ok ", junk: "x" } }, save).confirm!();
    await Promise.resolve();
    expect(save).toHaveBeenCalledWith({ type: DEFAULT_APPT_TYPES[0], start: "2026-10-25T07:30:00.000Z", answers: { link: "https://zoom.us/j/1", remarks: "Zoom ok" } });
  });
  it("a visit being changed opens on its type and answers", () => {
    expect(customPrefill({ start: "2026-10-25T07:30:00Z", kind: "other", typeId: "site", answers: { unit: "3A", size: "2R" } }))
      .toEqual({ mode: "site", cDate: "2026-10-25", cTime: "15:30", answers: { unit: "3A", size: "2R" } });
    // Booked before types: its link / place / remarks become the answers.
    expect(customPrefill({ start: "2026-10-25T07:30:00Z", kind: "other", place: "Unit 3A", remarks: "Bring catalogue" }))
      .toEqual({ mode: "other", cDate: "2026-10-25", cTime: "15:30", answers: { place: "Unit 3A", remarks: "Bring catalogue" } });
    expect(customPrefill({ start: "2026-10-25T07:30:00Z" })).toEqual({});
  });
  it("what a type keeps, as the database works it out", () => {
    expect(apptValues(SITE, { unit: "3A", size: "2R" })).toEqual({ kind: "other", name: "3A", place: "3A" });
    expect(apptValues(DEFAULT_APPT_TYPES[0], { link: "https://zoom.us/j/1", remarks: "ok" })).toEqual({ kind: "online", name: "Online", link: "https://zoom.us/j/1", remarks: "ok" });
  });
  it("such a visit is named by a room made for it, never a showroom", () => {
    const v = visitFromRow({ id: "a1", contact_id: "c1", showroom: "Online", start_at: "2026-10-25T07:30:00Z", minutes: 60, state: "booked", kind: "online", meeting_link: "https://zoom.us/j/1", type_id: "online" });
    expect(v).toMatchObject({ showroomId: "visit:a1", kind: "online", typeId: "online", link: "https://zoom.us/j/1" });
    expect(virtualRoom(v)).toMatchObject({ id: "visit:a1", name: "Online", active: false, virtual: true });
  });
  it("the editor refuses what the database would", () => {
    expect(typesProblem(TYPES)).toBe("");
    expect(typesProblem([{ ...SITE, fields: [] }])).toBe('"Site visit" is at a place: give it a Place question.');
    expect(typesProblem([{ ...SITE, label: " " }])).toBe("Name each appointment type.");
    expect(apptTypesFrom(null)).toBe(DEFAULT_APPT_TYPES);
  });
  it("the customer's card names it and carries the link", () => {
    const t = visitCardText({ kind: "Confirmed", start: "2026-10-25T07:30:00Z", room: "Online meeting", addr: "", mode: "online", link: "https://zoom.us/j/1" }, true);
    expect(t).toContain("*Your online meeting is confirmed*");
    expect(t).toContain("🔗 *Meeting link:* https://zoom.us/j/1");
  });
});
