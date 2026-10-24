import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { customBookVM, Phone4aBookMode } from "./custom-book";
import { DEFAULT_APPT_TYPES } from "@/lib/member/crm-data";

// Book visit's Showroom · Online · Other sits in sheets that are scrolling flex columns (Mine's chat, the Team chat, the
// desktop's Appointment sheet). Since the appointment types (2026-10-24) it scrolls sideways, and a scroller's automatic
// minimum height in a flex column is 0: a sheet taller than the screen squeezed it to its padding, a thin line under the
// title (the owner's Android, 2026-10-24). It keeps its own height.
describe("Book visit › the type bar", () => {
  const m = customBookVM({ b: {}, put: () => {}, changing: false, now: new Date("2026-10-24T02:00:00Z"), types: DEFAULT_APPT_TYPES, save: async () => true, done: () => {} });

  it("never shrinks in the sheet's column", () => {
    render(<Phone4aBookMode m={m} />);
    const bar = screen.getByRole("button", { name: "Showroom" }).parentElement!;
    expect(bar.style.flexShrink).toBe("0");
    expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(["Showroom", "Online", "Other"]);
  });
});
