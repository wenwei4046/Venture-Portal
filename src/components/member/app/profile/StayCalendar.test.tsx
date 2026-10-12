import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stayWindow } from "@/lib/member/claim-rules";
import StayCalendar, { calendarTitle, calendarWeeks } from "./StayCalendar";

afterEach(cleanup);

// User 2026-10-12: one calendar for an Airbnb stay, opened on the brand week, from the day before the
// fair to the day after — 18–20 Sep opens Thu 17 to Mon 21 Sep.
describe("the stay calendar", () => {
  it("lays the range out in weeks, Monday first, with the days around it", () => {
    expect(calendarWeeks({ first: "2026-09-17", last: "2026-09-21" })).toEqual([
      ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"],
      ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"],
    ]);
    // A Friday-to-Sunday fair across a month's end: one week, 28 Sep to 4 Oct.
    expect(calendarWeeks(stayWindow({ start: "2026-09-30", end: "2026-10-02" }, "2026-10-02"))).toEqual([
      ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
    ]);
  });

  it("names the months the range touches", () => {
    expect(calendarTitle({ first: "2026-09-17", last: "2026-09-21" })).toBe("Sep 2026");
    expect(calendarTitle({ first: "2026-09-29", last: "2026-10-03" })).toBe("Sep – Oct 2026");
    expect(calendarTitle({ first: "2026-12-31", last: "2027-01-04" })).toBe("Dec 2026 – Jan 2027");
  });

  it("taps only the range, marks the fair's days and draws the stay between its ends", () => {
    const onPick = vi.fn();
    render(<StayCalendar range={stayWindow({ start: "2026-09-18", end: "2026-09-20" }, "2026-09-18")} checkIn="2026-09-17" checkOut="2026-09-20" tone="red" onPick={onPick} />);
    const day = (name: string) => screen.getByRole("button", { name });
    expect(day("Wed, 16 Sep")).toBeDisabled();
    expect(day("Tue, 22 Sep")).toBeDisabled();
    expect(day("Thu, 17 Sep, check-in")).toHaveAttribute("data-band", "in");
    expect(day("Fri, 18 Sep, fair day")).toHaveAttribute("data-band", "mid");
    expect(day("Sun, 20 Sep, check-out, fair day")).toHaveAttribute("data-band", "out");
    expect(day("Mon, 21 Sep")).not.toHaveAttribute("data-band");
    expect(day("Mon, 21 Sep")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(day("Mon, 21 Sep"));
    expect(onPick).toHaveBeenLastCalledWith({ checkIn: "2026-09-17", checkOut: "2026-09-21" });
    fireEvent.click(day("Wed, 16 Sep"));
    expect(onPick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onPick).toHaveBeenLastCalledWith({ checkIn: "", checkOut: "" });
  });
});
