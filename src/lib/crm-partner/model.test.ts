/** A partner's booking link (2026-10-29): the showroom's rules as the database keeps them, on the office's day. */
import { describe, expect, it } from "vitest";
import { addDays, bookingProblem, dayClosed, DEFAULT_PARTNER_FORM, formFromRow, infoLabel, isPartnerCode, isPartnerRef, missingAnswer, pageFromRow, partnerRefusal, slotsOf, startOf, t12, timesOf, type PartnerRoom } from "./model";

const room: PartnerRoom = { id: "kl", name: "KL", address: "", slots: ["11:00", "14:00", "19:00@56"], cap: 2, weekly: [1], blocks: [] };

describe("the link's codes", () => {
  it("takes only the partner's code and a booking's reference", () => {
    expect(isPartnerCode("pc-AB2CD3EF")).toBe(true);
    expect(isPartnerCode("pc-AB0CD3EF")).toBe(false);
    expect(isPartnerCode("hv-AB2CD3EF")).toBe(false);
    expect(isPartnerRef(" tc-7kq3x9 ")).toBe(true);
    expect(isPartnerRef("TC-7KQ3X")).toBe(false);
  });
});

describe("the office's calendar", () => {
  it("steps days and writes a slot's instant in UTC+8", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(startOf("2026-11-02", "14:00")).toBe("2026-11-02T06:00:00.000Z");
    expect(t12("14:00")).toBe("2:00 pm");
    expect(t12("11:30")).toBe("11:30 am");
  });
  it("closes a weekly day off and a closure with no hours; a closure with hours takes those times only", () => {
    expect(dayClosed(room, "2026-11-02")).toBe(true); // Monday
    expect(timesOf(room, "2026-11-03")).toEqual(["11:00", "14:00"]); // Tuesday: 19:00 is Sat/Sun only (@56)
    expect(timesOf(room, "2026-11-07")).toEqual(["11:00", "14:00", "19:00"]);
    expect(timesOf({ ...room, blocks: [{ a: "2026-11-03" }] }, "2026-11-03")).toEqual([]);
    expect(timesOf({ ...room, blocks: [{ a: "2026-11-03", ranges: [{ f: "10:00", t: "12:00" }] }] }, "2026-11-03")).toEqual(["14:00"]);
    expect(timesOf({ ...room, blocks: [{ a: "2026-11-01", b: "2026-11-05", t1: "13:00", t2: "15:00" }] }, "2026-11-03")).toEqual(["11:00"]);
  });
  it("counts what is left of the limit, the booking being moved not against itself", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    const taken = { [startOf("2026-11-03", "11:00")]: 2, [startOf("2026-11-03", "14:00")]: 1 };
    const s = slotsOf(room, "2026-11-03", taken, now);
    expect(s.map(x => [x.time, x.left, x.full])).toEqual([["11:00", 0, true], ["14:00", 1, false]]);
    const moving = slotsOf(room, "2026-11-03", taken, now, { showroom: "kl", start: startOf("2026-11-03", "11:00") });
    expect(moving[0].left).toBe(1);
    expect(slotsOf(room, "2026-11-03", {}, new Date("2026-11-03T04:00:00Z")).map(x => x.past)).toEqual([true, false]);
  });
});

describe("the form", () => {
  it("asks for the slot, then a phone given must be a phone (names are the form's to require)", () => {
    const f = { room: "kl", start: "x", booker: "Jason", customer: "Mr Lim", customerPhone: "012-345 6789" };
    expect(bookingProblem(f)).toBeNull();
    expect(bookingProblem({ ...f, start: "" })).toBe("Pick a date and a time.");
    expect(bookingProblem({ ...f, booker: " ", customer: "", customerPhone: "" })).toBeNull();
    expect(bookingProblem({ ...f, customerPhone: "abc" })).toBe("Type the customer's phone number: at least 6 digits.");
  });
  it("reads the page closed unless the database says on, and shows only the functions' own refusals", () => {
    expect(pageFromRow(null)).toEqual({ on: false });
    expect(pageFromRow({ on: true, name: "The Conts", today: "2026-11-01", rooms: [{ id: "kl", name: "KL", slots: ["11:00"], cap: "2", weekly: [], blocks: [] }] }))
      .toEqual({ on: true, name: "The Conts", today: "2026-11-01", rooms: [{ id: "kl", name: "KL", address: "", slots: ["11:00"], cap: 2, weekly: [], blocks: [] }], form: DEFAULT_PARTNER_FORM });
    expect(partnerRefusal({ code: "22023", message: "That time is full at KL. Choose another." }, "x")).toBe("That time is full at KL. Choose another.");
    expect(partnerRefusal({ code: "42883", message: "function does not exist" }, "Try again.")).toBe("Try again.");
    expect(partnerRefusal({ code: "42501", message: "permission denied for function crm_partner_book" }, "Try again.")).toBe("Try again.");
  });
});

describe("moving a booking (the owner, 2026-10-29: a booking being changed read \"3 of 2 left\")", () => {
  it("never shows more places than the showroom has, even with a count read before the booking", () => {
    const now = new Date("2026-11-01T00:00:00Z"), at = startOf("2026-11-03", "14:00");
    expect(slotsOf(room, "2026-11-03", {}, now, { showroom: "kl", start: at })[1].left).toBe(2);
    expect(slotsOf(room, "2026-11-03", { [at]: 1 }, now, { showroom: "kl", start: at })[1].left).toBe(2);
    expect(slotsOf(room, "2026-11-03", { [at]: 2 }, now, { showroom: "kl", start: at })[1].left).toBe(1);
    expect(slotsOf(room, "2026-11-03", { [at]: 1 }, now)[1].left).toBe(1);
  });
});

describe("the booking form the CRM puts in use (2026-10-29)", () => {
  const saved = [{ id: "you", title: "You", fields: [{ id: "booker", label: "Your name", type: "Text", req: 1 }] },
    { id: "c", title: "Customer", fields: [{ id: "customer", label: "Customer name", type: "Text", req: 1 }, { id: "q1", label: "Car plate", type: "Text", req: 1 },
      { id: "kind", label: "Kind", type: "Choice", req: 0, opts: ["Condo", "Landed"] }] }];
  it("asks the saved questions, required only where marked — none put back", () => {
    const f = formFromRow(saved);
    expect(f.map(s => s.title)).toEqual(["You", "Customer"]);
    expect(f[0].fields.map(x => x.id)).toEqual(["booker"]);
    expect(f[1].fields.find(x => x.id === "kind")?.opts).toEqual(["Condo", "Landed"]);
    expect(formFromRow(null)).toBe(DEFAULT_PARTNER_FORM);
  });
  it("names a required question left empty as the database does, and labels an answer by the form", () => {
    const f = formFromRow(saved);
    expect(missingAnswer(f, {})).toBe("Fill in Your name.");
    expect(missingAnswer(f, { booker: "Jason", customer: "Mr Lim" })).toBe("Fill in Car plate.");
    expect(missingAnswer(f, { booker: "Jason", customer: "Mr Lim", q1: "WXY 1" })).toBeNull();
    expect(missingAnswer(formFromRow([{ title: "C", fields: [{ id: "customer", label: "Customer name", type: "Text", req: 0 }] }]), {})).toBeNull();
    expect(infoLabel(f, "q1")).toBe("Car plate");
    expect(infoLabel(f, "pax")).toBe("No. of people coming");
    expect(infoLabel(f, "zz")).toBe("zz");
  });
});
