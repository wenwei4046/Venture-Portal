import { describe, expect, it } from "vitest";
import {
  airbnbCap, airbnbGroup, claimAmount, claimedFoodDays, claimedFoodMonths, fairDays, fairRegion, foodAmount, foodDayState, foodMonthOpensOn,
  foodMonthOver, foodOpenTo, isOutstation, monthOfWeek, nightsBetween, readClaimRates, readFoodWeeks, shiftDay, stayProblem, stayWindow, tapStayDay,
  type ClaimRates, type StayPick, transportOpenTo } from "./claim-rules";

const rates: ClaimRates = {
  base: "Klang Valley",
  perSpot: 50,
  perPaxNight: 65,
  groupMaxPax: 3,
  groupCapPerNight: null,
  regions: [
    { id: "kl", name: "KL", spots: 0, planeTicket: false },
    { id: "pg", name: "Penang", spots: 4, planeTicket: false },
    { id: "sb", name: "Sabah", spots: 6, planeTicket: false },
  ],
  fairs: {},
};

describe("claimAmount — the rate HR set, never a typed figure (2026-10-05)", () => {
  it("prices an outstation claim by the route's spots", () => {
    expect(claimAmount(rates, { type: "outstation", regionId: "pg" })).toBe(200);
    expect(claimAmount(rates, { type: "outstation", regionId: "sb" })).toBe(300);
  });

  it("pays nothing for a local fair or an unknown region", () => {
    expect(claimAmount(rates, { type: "outstation", regionId: "kl" })).toBe(0);
    expect(claimAmount(rates, { type: "outstation", regionId: "nowhere" })).toBe(0);
    expect(claimAmount(rates, { type: "outstation", regionId: null })).toBe(0);
  });

  // User 2026-10-12: "per pax max cap is this amount, not like per pax fix this amount".
  it("pays an Airbnb invoice up to the rate per person per night (每人每晚), never more", () => {
    expect(claimAmount(rates, { type: "airbnb", pax: 2, nights: 2, invoice: 300 })).toBe(260);
    expect(claimAmount(rates, { type: "airbnb", pax: 2, nights: 2, invoice: 180.4 })).toBe(180.4);
    expect(claimAmount(rates, { type: "airbnb", pax: 3, nights: 1, invoice: 195 })).toBe(195);
  });

  it("pays nothing until HR has set the rate, or with nobody, no night or no invoice total", () => {
    expect(claimAmount({ ...rates, perSpot: null }, { type: "outstation", regionId: "pg" })).toBe(0);
    expect(claimAmount({ ...rates, perPaxNight: null }, { type: "airbnb", pax: 2, nights: 2, invoice: 200 })).toBe(0);
    expect(claimAmount(rates, { type: "airbnb", pax: 0, nights: 2, invoice: 200 })).toBe(0);
    expect(claimAmount(rates, { type: "airbnb", pax: 2, nights: 0, invoice: 200 })).toBe(0);
    expect(claimAmount(rates, { type: "airbnb", pax: 2, nights: 2 })).toBe(0);
  });
});

// User 2026-10-06: Sabah and Sarawak are flown to — the ticket's price, with its invoice, no cap.
describe("a plane ticket", () => {
  const flying: ClaimRates = { ...rates, regions: rates.regions.map(r => (r.id === "sb" ? { ...r, planeTicket: true } : r)) };

  it("is the price typed from its invoice, not the region's spots", () => {
    expect(claimAmount(flying, { type: "outstation", regionId: "sb", ticket: 456.7 })).toBe(456.7);
    expect(claimAmount(flying, { type: "outstation", regionId: "sb", ticket: 1234.567 })).toBe(1234.57);
  });

  it("is nothing until a price is typed", () => {
    expect(claimAmount(flying, { type: "outstation", regionId: "sb" })).toBe(0);
    expect(claimAmount(flying, { type: "outstation", regionId: "sb", ticket: 0 })).toBe(0);
  });

  it("leaves the other regions on their spots", () => {
    expect(claimAmount(flying, { type: "outstation", regionId: "pg", ticket: 999 })).toBe(200);
  });
});

// User 2026-10-06: up to HR's small group (3, RM 220 a night) the invoice's total is paid up to
// cap × nights — "2， claim 220*2=440". User 2026-10-12: a bigger group keys its invoice too, and is
// paid it up to RM 65 × people × nights — the rate a person a night is a cap as well.
describe("Airbnb: the invoice's total, up to a cap by head count", () => {
  const capped: ClaimRates = { ...rates, groupCapPerNight: 220 };

  it("pays one, two or three people their invoice, up to RM 220 × 2 nights", () => {
    for (const pax of [1, 2, 3]) {
      expect(airbnbCap(capped, pax, 2)).toBe(440);
      expect(claimAmount(capped, { type: "airbnb", pax, nights: 2, invoice: 500 })).toBe(440);
      expect(claimAmount(capped, { type: "airbnb", pax, nights: 2, invoice: 380.5 })).toBe(380.5);
    }
  });

  it("pays four people their invoice up to RM 65 × 4 × 2 nights — not RM 520 whatever it says", () => {
    expect(airbnbGroup(capped, 4)).toBe(false);
    expect(airbnbCap(capped, 4, 2)).toBe(520);
    expect(claimAmount(capped, { type: "airbnb", pax: 4, nights: 2, invoice: 999 })).toBe(520);
    expect(claimAmount(capped, { type: "airbnb", pax: 4, nights: 2, invoice: 480 })).toBe(480);
  });

  it("follows the head count HR sets", () => {
    const two: ClaimRates = { ...capped, groupMaxPax: 2 };
    expect(claimAmount(two, { type: "airbnb", pax: 2, nights: 2, invoice: 500 })).toBe(440);
    expect(claimAmount(two, { type: "airbnb", pax: 3, nights: 2, invoice: 500 })).toBe(390);
  });

  it("pays nothing until the invoice's total is typed, small group or not", () => {
    expect(claimAmount(capped, { type: "airbnb", pax: 2, nights: 2 })).toBe(0);
    expect(claimAmount(capped, { type: "airbnb", pax: 2, nights: 2, invoice: 0 })).toBe(0);
    expect(claimAmount(capped, { type: "airbnb", pax: 5, nights: 2 })).toBe(0);
  });

  it("caps everybody by the person while HR has set no small-group figure", () => {
    expect(airbnbGroup(rates, 3)).toBe(false);
    expect(claimAmount(rates, { type: "airbnb", pax: 3, nights: 2, invoice: 500 })).toBe(390);
    expect(claimAmount({ ...rates, groupCapPerNight: 0 }, { type: "airbnb", pax: 3, nights: 2, invoice: 500 })).toBe(390);
  });

  it("has no cap to say while it cannot be worked out", () => {
    expect(airbnbCap({ ...capped, perPaxNight: null }, 4, 2)).toBeNull();
    expect(airbnbCap(capped, 0, 2)).toBeNull();
    expect(airbnbCap(capped, 2, 0)).toBeNull();
  });
});

describe("Airbnb: an outstation fair only (user 2026-10-06)", () => {
  it("is outstation when the route has spots or is flown to", () => {
    expect(isOutstation({ id: "pg", name: "Penang", spots: 4, planeTicket: false })).toBe(true);
    expect(isOutstation({ id: "sb", name: "Sabah", spots: 0, planeTicket: true })).toBe(true);
    expect(isOutstation({ id: "kl", name: "KL", spots: 0, planeTicket: false })).toBe(false);
  });
});

// User 2026-10-12: "比如原本是 18 到 20 号 … 17 号 check-in … 21 号 check-out。这个 17 到 21 号就是
// maximum 他们可以定的日期范围" — the window replaces the old most-7-nights rule.
describe("Airbnb: a stay from the day before the fair to the day after", () => {
  const fair = stayWindow({ start: "2026-09-18", end: "2026-09-20" }, "2026-09-18");

  it("opens the day before the fair for check-in and the day after it for check-out", () => {
    expect(fair).toEqual({ start: "2026-09-18", end: "2026-09-20", first: "2026-09-17", last: "2026-09-21" });
    expect(stayWindow({ start: "2026-09-30", end: "2026-10-02" }, "2026-10-02")).toMatchObject({ first: "2026-09-29", last: "2026-10-03" });
  });

  it("takes a fair with no days of its own as its weekend, Friday to Sunday", () => {
    expect(stayWindow({ start: null, end: null }, "2026-09-25")).toEqual({ start: "2026-09-25", end: "2026-09-27", first: "2026-09-24", last: "2026-09-28" });
  });

  it("takes the whole window, and any stay inside it with a night of the fair", () => {
    expect(stayProblem("2026-09-17", "2026-09-21", fair, "18–20 Sep")).toBeNull(); // 4 nights, all of it
    expect(stayProblem("2026-09-18", "2026-09-20", fair, "18–20 Sep")).toBeNull();
    expect(stayProblem("2026-09-20", "2026-09-21", fair, "18–20 Sep")).toBeNull(); // the last night
  });

  it("a long fair's window holds more than seven nights — it is the limit now", () => {
    const week = stayWindow({ start: "2026-10-05", end: "2026-10-11" }, "2026-10-09");
    expect(nightsBetween(week.first, week.last)).toBe(8);
    expect(stayProblem(week.first, week.last, week, "5–11 Oct")).toBeNull();
  });

  it("refuses a night before the window or after it, and only the night before the fair", () => {
    const outside = "Check in from 17 Sep and check out by 21 Sep: the day before the fair to the day after.";
    expect(stayProblem("2026-09-16", "2026-09-19", fair, "18–20 Sep")).toBe(outside);
    expect(stayProblem("2026-09-18", "2026-09-22", fair, "18–20 Sep")).toBe(outside);
    expect(stayProblem("2026-09-17", "2026-09-18", fair, "18–20 Sep")).toBe("The stay must cover the fair's days (18–20 Sep).");
  });

  it("says nothing until both dates are in", () => {
    expect(stayProblem("", "2026-09-21", fair, "18–20 Sep")).toBeNull();
    expect(stayProblem("2026-09-17", "", fair, "18–20 Sep")).toBeNull();
  });
});

describe("tapStayDay — tap the days you stayed (user 2026-10-12)", () => {
  const tap = (...days: string[]) => days.reduce<StayPick>((pick, day) => tapStayDay(pick, `2026-09-${day}`), { checkIn: "", checkOut: "" });
  const stay = (checkIn: string, checkOut = "") => ({ checkIn: checkIn && `2026-09-${checkIn}`, checkOut: checkOut && `2026-09-${checkOut}` });

  it("25, 26, 27 — or just 25 and 27 — is in on the 25th, out on the 27th", () => {
    expect(tap("25")).toEqual(stay("25"));
    expect(tap("25", "26", "27")).toEqual(stay("25", "27"));
    expect(tap("25", "27")).toEqual(stay("25", "27"));
    expect(tap("27", "25")).toEqual(stay("25", "27"));
  });

  it("a day before or after the stay stretches it there", () => {
    expect(tap("25", "27", "24")).toEqual(stay("24", "27"));
    expect(tap("25", "27", "28")).toEqual(stay("25", "28"));
  });

  it("its first or last day taps off; a day inside ends it there", () => {
    expect(tap("24", "28", "28")).toEqual(stay("24", "27"));
    expect(tap("24", "28", "24")).toEqual(stay("25", "28"));
    expect(tap("24", "28", "26")).toEqual(stay("24", "26"));
    expect(tap("25", "26", "26")).toEqual(stay("25"));
    expect(tap("25", "26", "25")).toEqual(stay("26"));
    expect(tap("25", "25")).toEqual(stay(""));
  });

  it("counts across a month's end", () => {
    expect(shiftDay("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(tapStayDay({ checkIn: "2026-09-30", checkOut: "2026-10-02" }, "2026-10-02")).toEqual({ checkIn: "2026-09-30", checkOut: "2026-10-01" });
  });
});

describe("fairRegion — the region is the one HR set for the fair's venue", () => {
  const withFairs: ClaimRates = { ...rates, fairs: { f1: { venue: "PENANG WATERFRONT CONVENTION CENTRE", regionId: "pg" }, f2: { venue: "MVEC SOUTHKEY", regionId: null } } };

  it("finds the venue's region", () => {
    expect(fairRegion(withFairs, "f1")).toEqual({ venue: "PENANG WATERFRONT CONVENTION CENTRE", region: rates.regions[1] });
  });

  it("says when HR has not set one, and knows nothing of an unknown fair", () => {
    expect(fairRegion(withFairs, "f2")).toEqual({ venue: "MVEC SOUTHKEY", region: null });
    expect(fairRegion(withFairs, "f9")).toEqual({ venue: null, region: null });
    expect(fairRegion(withFairs, null)).toEqual({ venue: null, region: null });
  });
});

describe("nightsBetween", () => {
  it("counts the nights of a stay", () => {
    expect(nightsBetween("2026-09-04", "2026-09-06")).toBe(2);
    expect(nightsBetween("2026-09-30", "2026-10-01")).toBe(1);
  });
  it("is null for a missing or backwards date", () => {
    expect(nightsBetween("", "2026-09-06")).toBeNull();
    expect(nightsBetween("2026-09-06", "2026-09-04")).toBeNull();
  });
});

describe("readClaimRates", () => {
  it("reads the settings the database sends, numbers as text included", () => {
    expect(readClaimRates({
      base: "Klang Valley", perSpot: "50.00", perPaxNight: 65, groupMaxPax: 2, groupCapPerNight: "220.00",
      regions: [{ id: "a", name: "Penang", spots: 4 }, { id: "b", name: "Sabah", spots: 6, planeTicket: true }],
      fairs: [{ fairId: "f1", venue: "PENANG WATERFRONT CONVENTION CENTRE", regionId: "a" }, { fairId: "f2", venue: "MVEC SOUTHKEY", regionId: null }],
    })).toEqual({
      base: "Klang Valley", perSpot: 50, perPaxNight: 65, groupMaxPax: 2, groupCapPerNight: 220,
      regions: [{ id: "a", name: "Penang", spots: 4, planeTicket: false }, { id: "b", name: "Sabah", spots: 6, planeTicket: true }],
      fairs: { f1: { venue: "PENANG WATERFRONT CONVENTION CENTRE", regionId: "a" }, f2: { venue: "MVEC SOUTHKEY", regionId: null } },
      food: { subDepartmentId: null, perDay: null, titles: [] },
    });
  });
  it("reads the food claim HR set (2026-10-13)", () => {
    expect(readClaimRates({ food: { subDepartmentId: "fair", perDay: "20.00", titles: ["Team Leader", "", 3, "Revenue Specialist"] } }).food)
      .toEqual({ subDepartmentId: "fair", perDay: 20, titles: ["Team Leader", "Revenue Specialist"] });
    expect(readClaimRates({ food: { perDay: -1, titles: "Team Leader" } }).food).toEqual({ subDepartmentId: null, perDay: null, titles: [] });
  });
  it("treats anything malformed as not set", () => {
    expect(readClaimRates(null)).toEqual({ base: "Klang Valley", perSpot: null, perPaxNight: null, groupMaxPax: 3, groupCapPerNight: null, regions: [], fairs: {},
      food: { subDepartmentId: null, perDay: null, titles: [] } });
    expect(readClaimRates({ groupMaxPax: 0 }).groupMaxPax).toBe(3);
    expect(readClaimRates({ groupMaxPax: 2.5 }).groupMaxPax).toBe(3);
    expect(readClaimRates({ perSpot: -5, regions: [{ id: 1, name: "x", spots: 2 }, { id: "b", name: "Ipoh", spots: 1.5 }] }).regions).toEqual([]);
    expect(readClaimRates({ fairs: [{ fairId: 3, venue: "x" }, { venue: "no id" }] }).fairs).toEqual({});
  });
});

// The food claim (2026-10-13 — the user: a rate a day, the titles HR picks, the days of the brand week the
// member worked; "this food claim is only for fair sub-department").
describe("the food claim", () => {
  const FAIR = "71709f7e-9f7c-4e28-80cf-ce21be336995";
  const food = (over: Partial<NonNullable<ClaimRates["food"]>> = {}) => ({ food: { subDepartmentId: FAIR, perDay: 20, titles: ["Team Leader"], ...over } });

  it("is open in Fair, with a rate, to a title HR ticked — and to nobody else", () => {
    expect(foodOpenTo(food(), FAIR, "Team Leader")).toBe(true);
    expect(foodOpenTo(food(), FAIR, " team leader ")).toBe(true);
    expect(foodOpenTo(food(), FAIR, "Revenue Specialist")).toBe(false);
    expect(foodOpenTo(food(), "ir-sub", "Team Leader")).toBe(false);
    expect(foodOpenTo(food({ perDay: null }), FAIR, "Team Leader")).toBe(false);
    expect(foodOpenTo(food({ perDay: 0 }), FAIR, "Team Leader")).toBe(false);
    expect(foodOpenTo(food({ subDepartmentId: null }), FAIR, "Team Leader")).toBe(false);
    expect(foodOpenTo({}, FAIR, "Team Leader")).toBe(false);
    expect(foodOpenTo(null, FAIR, "Team Leader")).toBe(false);
    expect(foodOpenTo(food(), FAIR, "")).toBe(false);
  });

  it("offers the fair's own days, else its weekend Friday to Sunday", () => {
    expect(fairDays({ start: "2026-10-09", end: "2026-10-11" }, "2026-10-09")).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(fairDays({ start: "2026-10-30", end: "2026-11-01" }, "2026-10-30")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(fairDays({ start: null, end: null }, "2026-10-16")).toEqual(["2026-10-16", "2026-10-17", "2026-10-18"]);
    // Ends before it starts: read as its weekend.
    expect(fairDays({ start: "2026-10-11", end: "2026-10-09" }, "2026-10-09")).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);
  });

  it("holds back a day already claimed, and a day still to come", () => {
    const claimed = new Set(["2026-10-09"]);
    expect(foodDayState("2026-10-09", "2026-10-13", claimed)).toBe("claimed");
    expect(foodDayState("2026-10-10", "2026-10-13", claimed)).toBe("open");
    expect(foodDayState("2026-10-13", "2026-10-13", claimed)).toBe("open");
    expect(foodDayState("2026-10-14", "2026-10-13", claimed)).toBe("ahead");
  });

  it("pays the rate a day for each day", () => {
    expect(foodAmount(20, 3)).toBe(60);
    expect(foodAmount(12.5, 3)).toBe(37.5);
    expect(foodAmount(null, 3)).toBe(0);
    expect(foodAmount(20, 0)).toBe(0);
  });

  it("counts the days a member's live food claims hold — not a draft's, a cancelled or a rejected one's, nor the one sent back", () => {
    const claim = (id: string, status: string, days: unknown, claimType = "food") => ({ id, kind: "claim", status, detail: { claimType, days } });
    const requests = [
      claim("a", "submitted", ["2026-10-09", "2026-10-10"]),
      claim("b", "paid", ["2026-10-03"]),
      claim("c", "withdrawn", ["2026-10-11"]),
      claim("d", "rejected", ["2026-10-04"]),
      claim("e", "draft", ["2026-10-05"]),
      claim("f", "needs_info", ["2026-10-17"]),
      claim("g", "submitted", ["2026-10-18"], "airbnb"),
      { id: "h", kind: "waiting", status: "submitted", detail: { days: ["2026-10-19"] } },
      claim("i", "approved", "2026-10-20"),
    ];
    expect([...claimedFoodDays(requests)].sort()).toEqual(["2026-10-03", "2026-10-09", "2026-10-10", "2026-10-17"]);
    expect([...claimedFoodDays(requests, "f")].sort()).toEqual(["2026-10-03", "2026-10-09", "2026-10-10"]);
  });
});

// A food claim is a month (2026-10-13 — "they will submit by total month, for every pax, dont by week submit").
describe("the food claim's month", () => {
  it("is the month of each weekend's Friday, claimed from the 1st of the next", () => {
    expect(monthOfWeek("2026-10-30")).toBe("2026-10");
    expect(foodMonthOpensOn("2026-10")).toBe("2026-11-01");
    expect(foodMonthOpensOn("2026-12")).toBe("2027-01-01");
    expect(foodMonthOver("2026-10", "2026-10-31")).toBe(false);
    expect(foodMonthOver("2026-10", "2026-11-01")).toBe(true);
    expect(foodMonthOver("2026-09", "2026-10-13")).toBe(true);
  });

  it("knows the months a member's live food claims hold, with their numbers", () => {
    const claim = (id: string, status: string, month: string, requestNo: string | null = null) => ({ id, kind: "claim", status, requestNo, detail: { claimType: "food", month } });
    const held = claimedFoodMonths([
      claim("a", "submitted", "2026-09", "RQ-2610-004"), claim("b", "withdrawn", "2026-08"), claim("c", "rejected", "2026-07"),
      claim("d", "paid", "2026-06", "RQ-2607-001"), claim("e", "needs_info", "2026-05"),
      { id: "f", kind: "claim", status: "submitted", requestNo: null, detail: { claimType: "airbnb", month: "2026-04" } },
    ]);
    expect([...held.entries()]).toEqual([["2026-09", "RQ-2610-004"], ["2026-06", "RQ-2607-001"], ["2026-05", null]]);
    expect(claimedFoodMonths([claim("e", "needs_info", "2026-05")], "e").size).toBe(0);
  });

  it("reads the weekends sent strictly: of the month, each once, real days", () => {
    expect(readFoodWeeks([{ week: "2026-09-18", days: ["2026-09-20", "2026-09-18", "2026-09-18"] }, { week: "2026-09-11", days: ["2026-09-11"] }], "2026-09"))
      .toEqual([{ week: "2026-09-11", days: ["2026-09-11"] }, { week: "2026-09-18", days: ["2026-09-18", "2026-09-20"] }]);
    for (const bad of [null, [], "x", [{ week: "2026-10-02", days: ["2026-10-02"] }], [{ week: "2026-09-11", days: [] }], [{ week: "2026-09-11", days: ["2026-09-31"] }],
      [{ week: "2026-09-11", days: ["11 Sep"] }], [{ week: "2026-09-11", days: ["2026-09-11"] }, { week: "2026-09-11", days: ["2026-09-12"] }],
      Array.from({ length: 7 }, (_, i) => ({ week: `2026-09-0${i + 1}`, days: [`2026-09-0${i + 1}`] }))]) {
      expect(readFoodWeeks(bad, "2026-09")).toBeNull();
    }
  });
});

// Who may send a transport claim (2026-10-20): the titles HR ticked under Member services › Transport claim's ⋯.
describe("transportOpenTo", () => {
  it("is open to a title HR ticked, whatever its case or spaces", () => {
    const rates = { transport: { titles: ["Team Leader", "Revenue Specialist"] } };
    expect(transportOpenTo(rates, "Team Leader")).toBe(true);
    expect(transportOpenTo(rates, "  revenue specialist ")).toBe(true);
    expect(transportOpenTo(rates, "Team Assistant")).toBe(false);
    expect(transportOpenTo(rates, null)).toBe(false);
    expect(transportOpenTo({ transport: { titles: [] } }, "Team Leader")).toBe(false);
  });

  it("is open while the rates are not read, or were read before the list existed — the database asks again", () => {
    expect(transportOpenTo(null, "Team Assistant")).toBe(true);
    expect(transportOpenTo({}, "Team Assistant")).toBe(true);
  });

  it("is read from the database's answer, and absent from an older one", () => {
    expect(readClaimRates({ transport: { titles: ["Team Leader", "", 3] } }).transport).toEqual({ titles: ["Team Leader"] });
    expect(readClaimRates({}).transport).toBeUndefined();
    expect(readClaimRates({ transport: "x" }).transport).toBeUndefined();
  });
});
