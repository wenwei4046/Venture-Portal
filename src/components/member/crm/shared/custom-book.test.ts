import { describe, expect, it, vi } from "vitest";
import { customBookVM, customPrefill } from "./custom-book";
import { visitCardText } from "@/lib/member/crm-maps";
import { visitFromRow, virtualRoom } from "@/lib/member/crm-data";

const now = new Date("2026-10-24T02:00:00Z"); // 10:00 am in the office
const vm = (b: Parameters<typeof customBookVM>[0]["b"], save = vi.fn(async () => true)) =>
  customBookVM({ b, put: () => {}, changing: false, now, save, done: () => {} });

describe("Book visit › Online · Other (2026-10-24)", () => {
  it("needs a date and a time; Other needs its place", () => {
    expect(vm({ mode: "online" }).ready).toBe(false);
    expect(vm({ mode: "online", cDate: "2026-10-25" }).label).toBe("Pick a date and a time");
    expect(vm({ mode: "online", cDate: "2026-10-25", cTime: "15:30" }).ready).toBe(true);
    expect(vm({ mode: "other", cDate: "2026-10-25", cTime: "15:30" }).label).toBe("Add the place");
    expect(vm({ mode: "other", cDate: "2026-10-25", cTime: "15:30", place: "Starbucks Mid Valley" }).ready).toBe(true);
  });
  it("refuses a bad link and a time gone by", () => {
    expect(vm({ mode: "online", cDate: "2026-10-25", cTime: "15:30", link: "meet.google.com/x" }).label).toBe("The link must start with https://");
    expect(vm({ mode: "online", cDate: "2026-10-24", cTime: "09:00" }).label).toBe("That time has passed");
  });
  it("saves the office's time with its link, place and remarks", async () => {
    const save = vi.fn(async () => true);
    vm({ mode: "online", cDate: "2026-10-25", cTime: "15:30", link: " https://zoom.us/j/1 ", remarks: " Zoom ok " }, save).confirm!();
    await Promise.resolve();
    expect(save).toHaveBeenCalledWith({ kind: "online", start: "2026-10-25T07:30:00.000Z", link: "https://zoom.us/j/1", place: undefined, remarks: "Zoom ok" });
  });
  it("a visit being changed opens on what it is", () => {
    expect(customPrefill({ start: "2026-10-25T07:30:00Z", kind: "other", place: "Unit 3A", remarks: "Bring catalogue" }))
      .toEqual({ mode: "other", cDate: "2026-10-25", cTime: "15:30", link: "", place: "Unit 3A", remarks: "Bring catalogue" });
    expect(customPrefill({ start: "2026-10-25T07:30:00Z" })).toEqual({});
  });
  it("such a visit is named by a room made for it, never a showroom", () => {
    const v = visitFromRow({ id: "a1", contact_id: "c1", showroom: "Online meeting", start_at: "2026-10-25T07:30:00Z", minutes: 60, state: "booked", kind: "online", meeting_link: "https://zoom.us/j/1" });
    expect(v).toMatchObject({ showroomId: "visit:a1", kind: "online", link: "https://zoom.us/j/1" });
    expect(virtualRoom(v)).toMatchObject({ id: "visit:a1", name: "Online meeting", active: false, virtual: true });
  });
  it("the customer's card names it and carries the link", () => {
    const t = visitCardText({ kind: "Confirmed", start: "2026-10-25T07:30:00Z", room: "Online meeting", addr: "", mode: "online", link: "https://zoom.us/j/1" }, true);
    expect(t).toContain("*Your online meeting is confirmed*");
    expect(t).toContain("🔗 *Meeting link:* https://zoom.us/j/1");
    const o = visitCardText({ kind: "Confirmed", start: "2026-10-25T07:30:00Z", room: "Unit 3A", addr: "Unit 3A", mode: "other" }, false);
    expect(o).toContain("Your appointment is confirmed");
    expect(o).not.toContain("Address:");
  });
});
