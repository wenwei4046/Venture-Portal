import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrandWeeksAdminSnapshot } from "@/lib/member/brand-weeks-admin";
import MemberBrandWeeksAdmin from "./MemberBrandWeeksAdmin";

const actions = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock("@/app/(portal)/member-admin/brand-weeks-actions", () => ({ fetchBrandWeeksAdmin: actions.fetch, saveBrandWeeksAdmin: actions.save }));

const fair = "71709f7e-9f7c-4e28-80cf-ce21be336995";
const ir = "ff85d03e-59f6-4738-a4f2-09643c54f622";
const departments = [{ id: ir, name: "IR" }, { id: fair, name: "Fair" }];
const person = (id: string, name: string, extra: Partial<BrandWeeksAdminSnapshot["people"][number]> = {}) =>
  ({ id, name, title: "Revenue Specialist", hasLogin: false, savedAt: null, savedBy: null, savedBySelf: false, ...extra });
const row = (id: string, name: string, orders: number, sales: number, scoring: boolean, held = 0) => ({ id, name, sales, held, orders, scoring });

// September 2026 on 3 October: three weekends closed, the last open until 6 October.
const snapshot: BrandWeeksAdminSnapshot = {
  period: "2026-09", subDepartmentId: fair, asOf: "2026-10-03T15:00:00Z",
  weeks: [
    { week: "2026-09-04", closesOn: "2026-09-13", locked: true },
    { week: "2026-09-11", closesOn: "2026-09-20", locked: true },
    { week: "2026-09-18", closesOn: "2026-09-27", locked: true },
    { week: "2026-09-25", closesOn: "2026-10-06", locked: false },
  ],
  people: [
    person("james", "JAMES SEOW", { savedAt: "2026-10-03T06:00:00Z", savedBy: "HR Manager" }),
    person("kar", "KAR JUN"),
    person("lawrence", "LAWRENCE", { title: "Team Leader", hasLogin: true }),
  ],
  picks: { james: { "2026-09-25": "ZANOTTI" }, kar: { "2026-09-25": "DUNLOP" } },
  events: [
    { id: "f1|AKEMI", fairId: "f1", brand: "AKEMI", venue: "SUNWAY PYRAMID CONVENTION CENTRE", start: "2026-09-04", end: "2026-09-06",
      week: "2026-09-04", periodMonth: "2026-09", people: [row("lawrence", "LAWRENCE", 3, 12_000, true)] },
    // Two Akemi fairs in one weekend, the second all below the deposit.
    { id: "f3|AKEMI", fairId: "f3", brand: "AKEMI", venue: "IOI MALL PUTRAJAYA", start: "2026-09-16", end: "2026-09-20",
      week: "2026-09-18", periodMonth: "2026-09", people: [row("lawrence", "LAWRENCE", 5, 23_280, true)] },
    { id: "f5|AKEMI", fairId: "f5", brand: "AKEMI", venue: "MID VALLEY EXHIBITION CENTRE", start: "2026-09-18", end: "2026-09-20",
      week: "2026-09-18", periodMonth: "2026-09", people: [row("lawrence", "LAWRENCE", 0, 0, false, 4_300)] },
    { id: "f4|AKEMI", fairId: "f4", brand: "AKEMI", venue: "PENANG WATERFRONT CONVENTION CENTRE", start: "2026-09-25", end: "2026-09-27",
      week: "2026-09-25", periodMonth: "2026-09",
      people: [row("james", "JAMES SEOW", 5, 30_000, false), row("kar", "KAR JUN", 2, 9_000, false), row("lawrence", "LAWRENCE", 1, 4_000, false)] },
    { id: "f4|ZANOTTI", fairId: "f4", brand: "ZANOTTI", venue: "PENANG WATERFRONT CONVENTION CENTRE", start: "2026-09-25", end: "2026-09-27",
      week: "2026-09-25", periodMonth: "2026-09", people: [row("james", "JAMES SEOW", 2, 8_000, true), row("lawrence", "LAWRENCE", 1, 5_000, true)] },
  ],
};

const memberRow = (name: string) => screen.getByText(name).closest("tr")!;
const weekCell = (name: string, week: number) => within(memberRow(name)).getAllByRole("cell")[week];

beforeEach(() => {
  actions.fetch.mockReset().mockResolvedValue({ ok: true, data: structuredClone(snapshot) });
  actions.save.mockReset().mockResolvedValue({ ok: true, saved: 1 });
});
afterEach(cleanup);

describe("Member services › Brand weeks", () => {
  it("opens on Fair's month: every week with the day it closes, and what each member's week is", async () => {
    render(<MemberBrandWeeksAdmin departments={departments} />);
    expect(await screen.findByRole("table", { name: /Brand weeks, / })).toBeInTheDocument();
    expect(actions.fetch).toHaveBeenCalledWith(fair, expect.stringMatching(/^\d{4}-\d{2}$/));
    const head = screen.getAllByRole("columnheader").map(th => th.textContent);
    expect(head).toEqual(["Member", "Week 14–6 SepClosed 13 Sep", "Week 211–13 SepClosed 20 Sep", "Week 318–20 SepClosed 27 Sep", "Week 425–27 SepOpen until 6 Oct"]);
    // Closed and nobody picked: auto-located at the booth with the most bills.
    expect(weekCell("LAWRENCE", 1)).toHaveTextContent("Auto-located · AKEMI");
    expect(weekCell("LAWRENCE", 1)).toHaveTextContent("AKEMI 3");
    // Open and nobody picked: unconfirmed.
    expect(weekCell("LAWRENCE", 4)).toHaveTextContent("Unconfirmed · ZANOTTI");
    // Picked, with every booth written at that week, most bills first.
    expect(weekCell("JAMES SEOW", 4)).toHaveTextContent("Picked");
    expect(within(weekCell("JAMES SEOW", 4)).getByText("ZANOTTI 2")).toHaveAttribute("data-scoring", "true");
    expect(within(weekCell("JAMES SEOW", 4)).getByText("AKEMI 5")).not.toHaveAttribute("data-scoring");
    // A pick with no booth of its brand that week scores nowhere, and says so.
    expect(weekCell("KAR JUN", 4)).toHaveTextContent("No DUNLOP booth this week — no place scores");
    expect(weekCell("JAMES SEOW", 1)).toHaveTextContent("No bills");
    // One brand at two fairs names each place; bills still below the deposit read "held".
    expect(within(weekCell("LAWRENCE", 3)).getByText("AKEMI 5 · IOI MALL")).toHaveAttribute("data-scoring", "true");
    expect(within(weekCell("LAWRENCE", 3)).getByText("AKEMI held · MID VALLEY"))
      .toHaveAttribute("title", "AKEMI · MID VALLEY EXHIBITION CENTRE — 0 bills, RM 0.00 · RM 4,300.00 held below the deposit");
    expect(within(memberRow("JAMES SEOW")).getByText("No member login")).toBeInTheDocument();
    expect(within(memberRow("JAMES SEOW")).getByText("Saved 3 Oct · HR Manager")).toBeInTheDocument();
    expect(within(memberRow("LAWRENCE")).queryByText("No member login")).not.toBeInTheDocument();
    expect(screen.getByText(/2 of 12 weeks picked/)).toBeInTheDocument();
  });

  it("saves only the members changed — a closed week too — and reads the month again", async () => {
    render(<MemberBrandWeeksAdmin departments={departments} />);
    const lawrenceWeek1 = await screen.findByRole("combobox", { name: "Brand for LAWRENCE, week 1" });
    expect(lawrenceWeek1).toBeEnabled();
    fireEvent.change(lawrenceWeek1, { target: { value: "ZANOTTI" } });
    expect(weekCell("LAWRENCE", 1)).toHaveTextContent("Changed · not saved yet");
    expect(weekCell("LAWRENCE", 1)).toHaveAttribute("data-changed", "true");
    expect(screen.getByText(/1 change not saved/)).toBeInTheDocument();
    // Switching month or department would drop the change.
    expect(screen.getByLabelText("Month")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Department" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save 1 change" }));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith(fair, "2026-09", { lawrence: { "2026-09-04": "ZANOTTI" } }));
    expect(await screen.findByRole("status", { name: "Brand weeks save status" })).toHaveTextContent("LAWRENCE’s brand weeks are saved.");
    await waitFor(() => expect(actions.fetch).toHaveBeenCalledTimes(2));
  });

  it("clears a pick and discards a change", async () => {
    render(<MemberBrandWeeksAdmin departments={departments} />);
    const james = await screen.findByRole("combobox", { name: "Brand for JAMES SEOW, week 4" });
    fireEvent.change(james, { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Brand for KAR JUN, week 4" }), { target: { value: "AKEMI" } });
    expect(screen.getByText(/2 changes not saved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("combobox", { name: "Brand for JAMES SEOW, week 4" })).toHaveValue("ZANOTTI");
    expect(screen.getByRole("combobox", { name: "Brand for KAR JUN, week 4" })).toHaveValue("DUNLOP");
    fireEvent.change(screen.getByRole("combobox", { name: "Brand for JAMES SEOW, week 4" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 change" }));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith(fair, "2026-09", { james: {} }));
  });

  it("keeps the change and shows why when the save is refused", async () => {
    actions.save.mockResolvedValue({ ok: false, error: "Brand weeks need HR request management access" });
    render(<MemberBrandWeeksAdmin departments={departments} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Brand for LAWRENCE, week 4" }), { target: { value: "AKEMI" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 1 change" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Brand weeks need HR request management access");
    expect(screen.getByRole("combobox", { name: "Brand for LAWRENCE, week 4" })).toHaveValue("AKEMI");
    expect(actions.fetch).toHaveBeenCalledTimes(1);
  });

  it("reads another department when one is chosen, and says when the month cannot be read", async () => {
    render(<MemberBrandWeeksAdmin departments={departments} />);
    await screen.findByRole("table", { name: /Brand weeks, / });
    actions.fetch.mockResolvedValueOnce({ ok: false, error: "Choose a department with an active commission scheme" });
    fireEvent.change(screen.getByRole("combobox", { name: "Department" }), { target: { value: ir } });
    await waitFor(() => expect(actions.fetch).toHaveBeenLastCalledWith(ir, expect.stringMatching(/^\d{4}-\d{2}$/)));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a department with an active commission scheme");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
