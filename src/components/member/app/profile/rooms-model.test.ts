import { describe, expect, it } from "vitest";
import type { Booking, RoomsPeople } from "@/lib/rooms/model";
import {
  blockAt, bookingFacts, bookingOfForm, clampOf, dayBookings, dayChips, deptOptions, formProblem, newForm, paxNote, sheetDay, shortRoom, slotOfPress,
  suggestions, TIMES, toneOf, totalOf, whoLine, withFromTime, type RoomsForm,
} from "./rooms-model";

// Book a room in the Revenue app (2026-10-11): the handoff's roomVals(), on what the database answers.
const PEOPLE: RoomsPeople = {
  me: { staffId: "kj", name: "Kar Jun", departmentId: "rev", department: "Revenue", subDepartmentId: "fair" },
  account: "Kar Jun",
  canBook: false,
  canManage: false,
  people: [
    { id: "kj", name: "Kar Jun", departmentId: "rev", department: "Revenue", title: "Team Assistant" },
    { id: "st", name: "Stanley", departmentId: "rev", department: "Revenue", title: "Team Leader" },
    { id: "gl", name: "Grace Lim", departmentId: "hr", department: "HR", title: "HR Manager" },
  ],
  departments: [{ id: "fin", name: "Finance" }, { id: "hr", name: "HR" }, { id: "rev", name: "Revenue" }, { id: "mkt", name: "Marketing" }],
  subDepartments: [{ id: "fair", name: "Fair", departmentId: "rev" }, { id: "ir", name: "IR", departmentId: "rev" }],
};

function booking(over: Partial<Booking>): Booking {
  return {
    id: "b1", ref: "BK-1", room: "r1", roomName: "Meeting Room 1", day: "2026-10-10", from: 540, to: 600, title: "Fair weekly sync", source: "portal",
    departmentId: "rev", department: "Revenue", subDepartment: "Fair", bookedBy: "Chea Huan", bookedByStaff: "ch", onBehalfBy: null, mine: false, canChange: false,
    internal: [], guests: [], pax: 6, guestCompany: null, guestDepartment: null, guestCode: null, cancelled: false, events: [], ...over,
  };
}

const form = (over: Partial<RoomsForm> = {}): RoomsForm =>
  ({ title: "Customer follow-up", dept: "sub:fair", room: "r1", from: "600", to: "660", att: ["kj"], pax: 1, q: "", ...over });

describe("the page", () => {
  it("draws seven days from today, today first, the picked one on", () => {
    const chips = dayChips("2026-10-10", "2026-10-12");
    expect(chips.map(c => `${c.wd} ${c.n}`)).toEqual(["Today 10", "Sun 11", "Mon 12", "Tue 13", "Wed 14", "Thu 15", "Fri 16"]);
    expect(chips.filter(c => c.on).map(c => c.day)).toEqual(["2026-10-12"]);
  });

  it("titles the book sheet with en-GB's day and the portal's three-letter month", () => {
    expect(sheetDay("2026-10-10")).toBe("Sat 10 Oct");
    expect(sheetDay("2026-09-07")).toBe("Mon 7 Sep");
  });

  it("colours own meetings orange, a guest's light orange, the rest of HQ slate", () => {
    expect(toneOf({ source: "portal", mine: true })).toBe("mine");
    expect(toneOf({ source: "guest", mine: false })).toBe("guest");
    expect(toneOf({ source: "app", mine: false })).toBe("other");
  });

  it("says who a meeting is for and how many: the subsidiary for a guest booking", () => {
    expect(whoLine(booking({}))).toBe("Chea Huan · 6 pax");
    expect(whoLine(booking({ source: "guest", guestCompany: "HOUZS Interior Sdn Bhd", bookedBy: "Wong Mei Yee", pax: 5 }))).toBe("HOUZS Interior Sdn Bhd · 5 pax");
    expect(whoLine(booking({ onBehalfBy: "Grace Lim" }))).toBe("Grace Lim (for Chea Huan) · 6 pax");
    expect(bookingFacts(booking({ onBehalfBy: "Grace Lim" }), "Meeting Room 1").facts[1]).toEqual({ l: "Booked by", v: "Grace Lim (for Chea Huan)" });
  });

  it("lists a room's meetings of the day, earliest first, a cancelled one gone", () => {
    const list = [booking({ id: "late", from: 840, to: 900 }), booking({ id: "early" }), booking({ id: "gone", cancelled: true }), booking({ id: "other", room: "r2" }), booking({ id: "tomorrow", day: "2026-10-11" })];
    expect(dayBookings(list, "r1", "2026-10-10").map(b => b.id)).toEqual(["early", "late"]);
  });

  it("puts a block 64px an hour from 08:00, its title on 1, 3 or 5 lines", () => {
    expect(blockAt(540, 600)).toEqual({ top: 65, height: 62 });
    expect(blockAt(480, 510)).toEqual({ top: 1, height: 30 });
    expect([clampOf(540, 570), clampOf(540, 600), clampOf(540, 630)]).toEqual([1, 3, 5]);
  });

  it("books the half hour a press lands on, never later than 19:30", () => {
    expect(slotOfPress(0, 768)).toBe(480);
    expect(slotOfPress(64 * 1.5 + 5, 768)).toBe(570);
    expect(slotOfPress(767, 768)).toBe(1170);
  });

  it("shortens the timeline's room heads", () => {
    expect(shortRoom("Meeting Room 3")).toBe("Room 3");
    expect(shortRoom("Board room")).toBe("Board room");
  });

  it("opens a meeting on when, the room, who booked it, where from and how many", () => {
    expect(bookingFacts(booking({}), "Meeting Room 1")).toEqual({
      when: "Sat 10 Oct · 09:00–10:00",
      facts: [{ l: "Room", v: "Meeting Room 1" }, { l: "Booked by", v: "Chea Huan" }, { l: "From", v: "Revenue" }, { l: "People", v: "6 pax" }],
    });
    expect(bookingFacts(booking({ source: "guest", guestCompany: "Akemi Retail Sdn Bhd", department: null }), "Meeting Room 3").facts[2]).toEqual({ l: "From", v: "Akemi Retail Sdn Bhd" });
  });
});

describe("the book sheet", () => {
  it("offers Revenue's sub-departments, then HQ's other departments in the legend's order", () => {
    expect(deptOptions(PEOPLE)).toEqual([
      { v: "sub:fair", l: "Revenue · Fair" }, { v: "sub:ir", l: "Revenue · IR" },
      { v: "dept:hr", l: "HR" }, { v: "dept:fin", l: "Finance" }, { v: "dept:mkt", l: "Marketing" },
    ]);
  });

  it("starts with the member attending, from their own sub-department, on the room and half hour pressed", () => {
    expect(newForm(PEOPLE, "r2", 570)).toEqual({ title: "", dept: "sub:fair", room: "r2", from: "570", to: "630", att: ["kj"], pax: 1, q: "" });
    expect(newForm(PEOPLE)).toMatchObject({ room: "", from: "", to: "" });
    expect(newForm(PEOPLE, "r1", 1170).to).toBe("1200");
    // An account with no staff record books with nobody named yet.
    expect(newForm({ ...PEOPLE, me: null }).att).toEqual([]);
  });

  it("moves the end with the start only when it would no longer be after it", () => {
    expect(withFromTime(form({ from: "600", to: "720" }), "630")).toMatchObject({ from: "630", to: "720" });
    expect(withFromTime(form({ from: "600", to: "660" }), "690")).toMatchObject({ from: "690", to: "750" });
    expect(withFromTime(form({ from: "600", to: "" }), "1170")).toMatchObject({ to: "1200" });
  });

  it("counts the people: never under the named, the rest as more", () => {
    expect(totalOf({ att: ["a", "b"], pax: 1 })).toBe(2);
    expect(paxNote({ att: ["a", "b"], pax: 5 })).toBe("2 named + 3 more");
    expect(paxNote({ att: ["a"], pax: 1 })).toBe("1 named");
    expect(TIMES[0]).toEqual({ v: "480", l: "08:00" });
    expect(TIMES[TIMES.length - 1]).toEqual({ v: "1200", l: "20:00" });
  });

  it("suggests colleagues by name, not those already attending, six at most", () => {
    expect(suggestions({ att: ["kj"], q: "" }, PEOPLE)).toEqual([]);
    expect(suggestions({ att: ["kj"], q: "an" }, PEOPLE)).toEqual([{ id: "st", name: "Stanley" }]);
  });

  it("refuses as the handoff does: the fields first, then the time, then a clash", () => {
    const taken = [booking({ room: "r1", from: 630, to: 690, title: "Payroll check" })];
    expect(formProblem(form({ title: " " }), "2026-10-10", [])).toBe("Add a title, department, room and time.");
    expect(formProblem(form({ room: "" }), "2026-10-10", [])).toBe("Add a title, department, room and time.");
    expect(formProblem(form({ from: "660", to: "600" }), "2026-10-10", [])).toBe("End must be after start.");
    expect(formProblem(form(), "2026-10-10", taken)).toBe("Taken 10:30–11:30 · Payroll check");
    expect(formProblem(form(), "2026-10-11", taken)).toBeNull();
    expect(formProblem(form(), "2026-10-10", [{ ...taken[0], cancelled: true }])).toBeNull();
  });

  it("books a sub-department or a department, the time in minutes and the headcount", () => {
    expect(bookingOfForm(form({ title: "  Customer follow-up ", pax: 4 }), "2026-10-10")).toEqual({
      room: "r1", day: "2026-10-10", from: 600, to: 660, title: "Customer follow-up", department: null, subDepartment: "fair", internal: ["kj"], pax: 4,
    });
    expect(bookingOfForm(form({ dept: "dept:hr" }), "2026-10-10")).toMatchObject({ department: "hr", subDepartment: null });
  });
});
