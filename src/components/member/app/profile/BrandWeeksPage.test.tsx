import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { ArenaBrandWeek } from "@/lib/member/arena-history";
import BrandWeeksPage from "./BrandWeeksPage";
import { brandWeeksVM } from "./brand-weeks-model";

const week = (over: Partial<ArenaBrandWeek>): ArenaBrandWeek => ({
  staffId: "me", week: "2026-10-02", source: "erp", brand: "ZANOTTI", fairId: "f1", venue: "MID VALLEY", organizer: "BIGHOME",
  start: "2026-10-02", end: "2026-10-04", booths: 1, ...over,
});

/** ANTHONY's three months as the read carries them on Monday 12 Oct 2026 (the user's screenshot). */
const snap = {
  period: "2026-10", selfId: "me",
  history: { events: [], weeks: [
    week({ week: "2026-09-04", source: "auto", brand: "AKEMI", venue: "SUNWAY PYRAMID CONVENTION CENTRE", organizer: "MYHOME", start: "2026-09-04", end: "2026-09-06", booths: null }),
    week({}),
    week({ week: "2026-10-09", venue: "IOIGECC", organizer: "HOMELOVE", start: "2026-10-09", end: "2026-10-11", booths: 2 }),
    // Listed ahead by the ERP — a later weekend, never shown (the user: "but not future").
    week({ week: "2026-10-30", brand: "AKEMI", venue: "PENANG WATERFRONT CONVENTION CENTRE", start: "2026-10-30", end: "2026-11-01" }),
  ] },
} as unknown as MemberArenaSnapshot;

const page = (viewing = false) =>
  render(<BrandWeeksPage months={brandWeeksVM(snap, "2026-10-12", "me")} viewing={viewing} onBack={() => {}} />);

afterEach(cleanup);

describe("My brand weeks — a month to a fold (2026-10-12)", () => {
  it("opens on this month, with the months before a tap away", () => {
    page();
    const oct = screen.getByRole("button", { name: /October 2026/ });
    const sep = screen.getByRole("button", { name: /September 2026/ });
    expect(oct).toHaveAttribute("aria-expanded", "true");
    expect(sep).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /August 2026/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("SUNWAY PYRAMID CONVENTION CENTRE")).not.toBeInTheDocument();

    fireEvent.click(sep);
    expect(sep).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("region", { name: "September 2026" })).getByText("SUNWAY PYRAMID CONVENTION CENTRE")).toBeInTheDocument();

    fireEvent.click(oct);
    expect(oct).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("IOIGECC")).not.toBeInTheDocument();
  });

  it("says each month's fairs on its fold", () => {
    page();
    expect(within(screen.getByRole("button", { name: /October 2026/ })).getByText("2 fairs")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /September 2026/ })).getByText("1 fair")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /August 2026/ })).getByText("No fair")).toBeInTheDocument();
  });

  it("names only the brand, the venue and the organizer of a weekend — and nothing after this week", () => {
    page();
    const october = screen.getByRole("region", { name: "October 2026" });
    expect(within(october).getAllByRole("term").map(t => t.textContent)).toEqual(["Brand", "Venue", "Organizer", "Brand", "Venue", "Organizer"]);
    expect(within(october).getAllByRole("definition").map(d => d.textContent)).toEqual(["Zanotti", "MID VALLEY", "BIGHOME", "Zanotti", "IOIGECC", "HOMELOVE"]);
    expect(within(october).getByText("Not assigned yet")).toBeInTheDocument();
    expect(within(october).getAllByText("This week")).toHaveLength(1);
    expect(within(october).getAllByText(/^W\d$/).map(b => b.textContent)).toEqual(["W1", "W2", "W3"]);
    // No ERP wording, and the weekends still to come are not there at all.
    expect(screen.queryByText(/Sales Attending yet|From the ERP|listed at|Auto-located/)).not.toBeInTheDocument();
    expect(screen.queryByText("PENANG WATERFRONT CONVENTION CENTRE")).not.toBeInTheDocument();
    expect(screen.queryByText("23–25 Oct")).not.toBeInTheDocument();
  });

  it("reads as the member's own to the Principal viewing them", () => {
    page(true);
    expect(screen.getByRole("heading", { name: "Member brand weeks" })).toBeInTheDocument();
    expect(screen.getByText(/Where this member works each fair weekend/)).toBeInTheDocument();
  });

  it("waits for the read, and says so", () => {
    render(<BrandWeeksPage months={null} viewing={false} onBack={() => {}} />);
    expect(screen.getByText("Loading your fair weekends…")).toBeInTheDocument();
  });
});
