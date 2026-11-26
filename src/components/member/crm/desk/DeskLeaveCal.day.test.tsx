/**
 * The owner (2026-11-27), on the desktop Calendar: "当我点那个 date 的时候，按理说应该是跳出来它的 appointment，不是一点就直接按
 * add leave" — a day clicked lists its appointments, each opening its details; and "book appointment 和 add leave … merge 成
 * 一个加号 button … drop down" — one + with a menu.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CrmData, CrmLeave, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "../shared/people-book";
import type { CalAppt } from "../shared/leave-cal";
import { DeskLeaveCalPage } from "./DeskLeaveCal";

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs"): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true });
const people = [P("tl", "Stanley", null, "tl"), P("a", "Chea Huan", "tl"), P("b", "Hector Lim", "tl")];
const teams = [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }];
const L = (id: string, staffId: string, fromAt: string, toAt: string): CrmLeave => ({ id, staffId, from: fromAt.slice(0, 10), to: toAt.slice(0, 10), note: "", fromAt, toAt, reason: "Annual" }) as CrmLeave;
const leaves = [L("l1", "b", "2026-11-23T09:00", "2026-11-25T18:00")];
const A = (visitId: string, who: string, day: string, t: string, cust: string, status: CalAppt["status"] = "Booked", where = "Showroom KL"): CalAppt =>
  ({ who, day, t, cust, customerId: `c-${visitId}`, visitId, status, where });
// Tue 24 Nov: five appointments (more than its cell shows) and Hector's leave; Thu 26 Nov: one.
const appts = [A("v1", "a", "2026-11-24", "14:00", "Kim Lee"), A("v2", "a", "2026-11-24", "10:30", "Nur Aisyah", "To mark"),
  { ...A("v3", "b", "2026-11-24", "16:15", "Tan Mei", "Booked", "Online meeting"),
    details: [{ k: "Meeting link", v: "https://meet.example.com/abc", href: "https://meet.example.com/abc" }, { k: "Remarks", v: "Bring the floor plan.\nAsks about the L-sofa." }] },
  A("v4", "a", "2026-11-24", "17:00", "Raj Kumar"), A("v5", "a", "2026-11-24", "18:00", "Siti Hawa"),
  { ...A("v6", "a", "2026-11-26", "15:15", "Ong Boon"), details: [{ k: "Remarks", v: "Call first" }] }];
const data = { people, customers: [], visits: [], events: [], ftRules: [], lockedStaff: [], leaves, settings: DEFAULT_CRM_SETTINGS,
  can: { viewAll: true, editAll: true, editOwn: true, manage: true } } as unknown as CrmData;
const acts = { saveLeave: vi.fn(async () => true), removeLeave: vi.fn(async () => true), setPaused: vi.fn(async () => true), setDays: vi.fn(async () => true),
  setLocked: vi.fn(async () => true), openAppt: vi.fn() };
const input = (o: Record<string, unknown> = {}) => ({ book: peopleBook(data, teams, []), leaves, appts, now: "2026-11-27T10:00", canEdit: () => true, canLock: true, acts, ...o });
const cell = (day: string) => document.querySelector<HTMLElement>(`[data-day='${day}']`)!;

beforeEach(() => { vi.clearAllMocks(); });

describe("the desktop Calendar: a day clicked lists it (the owner, 2026-11-27)", () => {
  it("lists its leave, then its appointments by time, with who · where and how each stands — not Add leave", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} />);
    fireEvent.click(cell("2026-11-24"));
    expect(screen.queryByRole("dialog", { name: "Add leave" })).toBeNull();
    const list = screen.getByRole("dialog", { name: "Tue, 24 Nov" });
    expect(within(list).getByText("5 appointments · 1 on leave")).toBeTruthy();
    const rows = [...list.querySelectorAll<HTMLElement>("[data-day-item]")];
    expect(rows.map(r => r.firstElementChild!.textContent)).toEqual(["All day", "10:30", "14:00", "16:15", "17:00", "18:00"]);
    expect(rows[0].textContent).toContain("Hector Lim · Annual");
    expect(rows[1].textContent).toBe("10:30Nur AisyahTo markChea Huan · Showroom KL");
    expect(rows[3].textContent).toBe("16:15Tan MeiBookedHector Lim · Online meeting");
    expect(cell("2026-11-24").dataset.open).toBe("true");
  });

  it("an appointment opens its details — its own answers under it, the customer's beside — and the list stays for the next one", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} />);
    fireEvent.click(cell("2026-11-24"));
    expect(document.querySelector("[data-appt-details]")).toBeNull();
    fireEvent.click(screen.getByText("Tan Mei"));
    expect(acts.openAppt).toHaveBeenCalledWith(appts[2]);
    const details = document.querySelector<HTMLElement>("[data-appt-details]")!;
    expect(details.closest("[data-sel]")!.textContent).toContain("Tan Mei");
    expect(within(details).getByText("Meeting link")).toBeTruthy();
    expect(within(details).getByRole("link").getAttribute("href")).toBe("https://meet.example.com/abc");
    expect(within(details).getByRole("link").getAttribute("target")).toBe("_blank");
    expect(within(details).getByText(/Bring the floor plan\.\s+Asks about the L-sofa\./).style.whiteSpace).toBe("pre-wrap");
    // The next one: the details move to it (Siti has no answers of her own, so none show).
    fireEvent.click(screen.getByText("Siti Hawa"));
    expect(acts.openAppt).toHaveBeenLastCalledWith(appts[4]);
    expect(document.querySelector("[data-appt-details]")).toBeNull();
    expect(document.querySelector("[data-sel]")!.textContent).toContain("Siti Hawa");
    expect(screen.getByRole("dialog", { name: "Tue, 24 Nov" })).toBeTruthy();
  });

  it("the cell's +N more opens the same list, every appointment in it", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} />);
    const more = cell("2026-11-24").querySelector<HTMLElement>("[data-more]")!;
    expect(more.textContent).toMatch(/^\+\d+ more$/);
    fireEvent.click(more);
    expect(within(screen.getByRole("dialog", { name: "Tue, 24 Nov" })).getAllByText(/Showroom KL|Online meeting/)).toHaveLength(5);
  });

  it("an appointment in a cell opens its details at once — beside, and in its day's list, picked", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} />);
    fireEvent.click(cell("2026-11-26").querySelector<HTMLElement>("[title^='15:15']")!);
    expect(acts.openAppt).toHaveBeenCalledWith(appts[5]);
    const list = screen.getByRole("dialog", { name: "Thu, 26 Nov" });
    expect(list.querySelector("[data-sel]")!.textContent).toContain("Ong Boon");
    expect(within(list.querySelector<HTMLElement>("[data-appt-details]")!).getByText("Call first")).toBeTruthy();
  });

  it("a leave in the list opens Edit leave, and the list closes", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} />);
    fireEvent.click(cell("2026-11-24"));
    fireEvent.click(screen.getByText("Hector Lim · Annual"));
    expect(screen.getByRole("dialog", { name: "Edit leave" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Tue, 24 Nov" })).toBeNull();
  });

  it("Esc, × and a press elsewhere close it; another day opens its own; a day with nothing says so", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} />);
    fireEvent.click(cell("2026-11-24"));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(cell("2026-11-24"));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(cell("2026-11-24"));
    fireEvent.pointerDown(cell("2026-11-10"));
    fireEvent.click(cell("2026-11-10"));
    expect(screen.queryByRole("dialog", { name: "Tue, 24 Nov" })).toBeNull();
    expect(within(screen.getByRole("dialog", { name: "Tue, 10 Nov" })).getByText("Nothing this day")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc closes the list alone — the CRM's own Esc (the pane beside, on the window) waits for the next one", () => {
    const crmEsc = vi.fn();
    window.addEventListener("keydown", crmEsc);
    try {
      render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} />);
      fireEvent.click(cell("2026-11-24"));
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(crmEsc).not.toHaveBeenCalled();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(crmEsc).toHaveBeenCalledTimes(1);
    } finally { window.removeEventListener("keydown", crmEsc); }
  });

  it("a press in the pane beside (the appointment's details) keeps the list", () => {
    render(<><aside data-testid="pane"><span>Customer info</span></aside><DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} /></>);
    fireEvent.click(cell("2026-11-24"));
    fireEvent.pointerDown(screen.getByText("Customer info"));
    expect(screen.getByRole("dialog", { name: "Tue, 24 Nov" })).toBeTruthy();
  });

  it("sits at its day: from the left on a weekday, from the right at the weekend; up in the lower weeks, down in the upper", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} />);
    fireEvent.click(cell("2026-11-24")); // Tuesday, the fifth of six weeks
    let list = document.querySelector<HTMLElement>("[data-day-list]")!;
    expect(list.style.left).toContain("1 * 100% / 7");
    expect(list.style.bottom).toBe("-6px");
    expect(list.style.maxHeight).toContain("5 * 100%");
    fireEvent.click(cell("2026-11-07")); // Saturday, the second week
    list = document.querySelector<HTMLElement>("[data-day-list]")!;
    expect(list.style.right).toContain("1 * 100% / 7");
    expect(list.style.top).toBe("-6px");
    expect(list.style.maxHeight).toContain("5 * 100%");
  });

  it("a month left closes it", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} />);
    fireEvent.click(cell("2026-11-24"));
    fireEvent.click(screen.getByLabelText("Next"));
    fireEvent.click(screen.getByLabelText("Previous"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("People (leave only) keeps Add leave on a day", () => {
    render(<DeskLeaveCalPage mode="people" title="Assignment" bare input={input()} />);
    fireEvent.click(cell("2026-11-10"));
    expect(screen.getByRole("dialog", { name: "Add leave" })).toBeTruthy();
  });
});

describe("the desktop Calendar's one + (the owner, 2026-11-27)", () => {
  it("one + top right opens Book appointment · Add leave; no Book appt or Add leave buttons of their own", () => {
    const bookAppt = vi.fn();
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input({ bookAppt })} />);
    expect(document.querySelectorAll("[data-cal-plus]")).toHaveLength(1);
    expect(screen.queryByText("Book appt")).toBeNull();
    expect(screen.queryByText("Add leave")).toBeNull();
    fireEvent.click(screen.getByLabelText("Add"));
    fireEvent.click(within(screen.getByRole("menu")).getByText("Book appointment"));
    expect(bookAppt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByLabelText("Add"));
    fireEvent.click(within(screen.getByRole("menu")).getByText("Add leave"));
    expect(screen.getByRole("dialog", { name: "Add leave" })).toBeTruthy();
  });

  it("a press elsewhere or Esc closes the menu", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input({ bookAppt: vi.fn() })} />);
    fireEvent.click(screen.getByLabelText("Add"));
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByLabelText("Add"));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("with only one way open the + does it at once; with none there is no +", () => {
    const bookAppt = vi.fn();
    const { unmount } = render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input({ bookAppt, canEdit: () => false, canLock: false })} />);
    fireEvent.click(screen.getByLabelText("Book appointment"));
    expect(bookAppt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    unmount();
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input()} />);
    fireEvent.click(screen.getByLabelText("Add leave"));
    expect(screen.getByRole("dialog", { name: "Add leave" })).toBeTruthy();
  });

  it("View as (no booking, no leave rights): no +", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={input({ canEdit: () => false, canLock: false })} />);
    expect(document.querySelector("[data-cal-plus]")).toBeNull();
  });

  it("People keeps its own Add leave button", () => {
    render(<DeskLeaveCalPage mode="people" title="Assignment" bare input={input()} />);
    expect(document.querySelector("[data-cal-plus]")).toBeNull();
    fireEvent.click(screen.getByText("Add leave"));
    expect(screen.getByRole("dialog", { name: "Add leave" })).toBeTruthy();
  });
});
