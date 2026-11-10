import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CrmData, CrmLeave, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "./people-book";
import { PhoneCalendar, PhoneLeaveAdd, PhonePeople } from "./PhoneLeaveCal";
import { PhoneTeamActivity } from "./PhoneTeamActivity";
import { CAL } from "./cal-look";
import { openLeaveSheetFor } from "./use-leave-cal";

vi.mock("@/app/(member)/member/crm-actions", () => ({ fetchCrmAssignedSince: vi.fn(async () => ({ ok: true, rows: [] })) }));

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs", extra: Partial<CrmPerson> = {}): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true, ...extra });
const people = [P("tl", "Stanley", null, "tl"), P("a", "Chea Huan", "tl"), P("b", "Hector", "tl", "rs", { login: false }), P("c", "Jason", "tl", "rs", { paused: true })];
const teams = [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }];
const L = (id: string, staffId: string, fromAt: string, toAt: string, reason: CrmLeave["reason"] = "Annual", note = ""): CrmLeave =>
  ({ id, staffId, from: fromAt.slice(0, 10), to: toAt.slice(0, 10), note, fromAt, toAt, reason }) as CrmLeave;
const data = {
  people, customers: [], visits: [], events: [], ftRules: [{ tlId: "tl", mode: "turns", days: [0, 1, 2, 3, 4], vals: { a: { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1 } } }], lockedStaff: [],
  leaves: [L("l1", "a", "2026-11-09T09:00", "2026-11-10T13:00")],
  settings: DEFAULT_CRM_SETTINGS, can: { viewAll: true, editAll: true, editOwn: true, manage: true }, upNextStaff: [],
} as unknown as CrmData;
const acts = { saveLeave: vi.fn(async () => true), removeLeave: vi.fn(async () => true), setPaused: vi.fn(async () => true), setDays: vi.fn(async () => true), setLocked: vi.fn(async () => true) };
const input = { book: peopleBook(data, teams, []), leaves: data.leaves!, appts: [{ who: "a", day: "2026-11-06", t: "11:00", cust: "Nur Aisyah", customerId: "x", visitId: "v1" }], now: "2026-11-06T18:00", canEdit: () => true, canLock: true, acts };
/** The CRM's shell, as CrmApp draws it: the sheets go in here, after the tab bar. */
const Shell = ({ children }: { children: React.ReactNode }) => <div data-revenue-app="" data-testid="shell">{children}<nav data-testid="tabbar">Insight Inbox</nav></div>;

beforeEach(() => { Object.values(acts).forEach(f => f.mockClear()); });

describe("the phone's Calendar (v4 notes/19)", () => {
  it("one header row: the month, ‹ ›, + — no separate Calendar title", () => {
    render(<PhoneCalendar input={input} />);
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
    expect(screen.queryByText("Calendar")).toBeNull();
    expect(screen.getByLabelText("Previous month")).toBeTruthy();
    expect(screen.getByLabelText("Add leave")).toBeTruthy();
    expect(screen.getByText("Fri, 6 Nov")).toBeTruthy();
    expect(screen.getByText("Nur Aisyah")).toBeTruthy();
  });

  it("the layer chips are 32 px", () => {
    render(<PhoneCalendar input={input} />);
    expect(screen.getByText("Appointments").closest<HTMLElement>("[role=button]")!.style.height).toBe("32px");
  });

  it("a leave is ONE bar per week row across its days, with its words whole", () => {
    render(<PhoneCalendar input={input} />);
    const bars = [...document.querySelectorAll<HTMLElement>("[data-leave-bar]")];
    expect(bars).toHaveLength(1);
    expect(bars[0].textContent).toBe("Chea · Annual");
    expect(bars[0].style.position).toBe("absolute");
    expect(bars[0].style.width).toContain("2 * 100% / 7"); // Mon 9 and Tue 10
    expect(bars[0].style.left).toContain("0 * 100% / 7");
  });

  it("a leave across two weeks is a bar in each, each with its words; a one-day leave is two lines", () => {
    const leaves = [L("x", "a", "2026-11-13T09:00", "2026-11-17T18:00", "Other", "Trip"), L("y", "c", "2026-11-25T09:00", "2026-11-25T18:00", "Sick")];
    render(<PhoneCalendar input={{ ...input, leaves }} />);
    const bars = [...document.querySelectorAll<HTMLElement>("[data-leave-bar]")];
    expect(bars.map(b => b.textContent)).toEqual(["Chea · Trip", "Chea · Trip", "JasonSick"]);
    expect(bars[2].style.height).toBe("26px");
    expect(bars[2].children).toHaveLength(2);
    // The first week's bar is square at its end (it runs on), the second's at its start.
    expect(bars[0].style.borderRadius).toBe("4px 0px 0px 4px");
    expect(bars[1].style.borderRadius).toBe("0px 4px 4px 0px");
  });

  it("lanes never overlap: four leaves on one day — three bars, the fourth '+1'", () => {
    const leaves = ["a", "b", "c", "tl"].map((w, i) => L(`k${i}`, w, "2026-11-18T09:00", "2026-11-18T18:00"));
    render(<PhoneCalendar input={{ ...input, leaves }} />);
    const bars = [...document.querySelectorAll<HTMLElement>("[data-leave-bar]")];
    expect(bars).toHaveLength(3);
    expect(new Set(bars.map(b => b.style.top)).size).toBe(3);
    const day = document.querySelector<HTMLElement>("[data-day='2026-11-18']")!;
    expect(day.querySelector("[data-more]")!.textContent).toBe("+1");
  });

  it("appointments are a dot + time + first name; 72 px cells; outside the month white; lighter lines", () => {
    render(<PhoneCalendar input={input} />);
    const appt = document.querySelector<HTMLElement>("[data-appt]")!;
    expect(appt.textContent).toBe("11:00Chea");
    expect((appt.firstElementChild as HTMLElement).style.width).toBe("5px");
    const cell = document.querySelector<HTMLElement>("[data-day='2026-11-06']")!;
    expect(cell.style.minHeight).toBe("72px");
    const out = document.querySelector<HTMLElement>("[data-day='2026-10-26']")!;
    expect(out.style.background).toMatch(/^(#fff|rgb(255, 255, 255))$/);
    expect(CAL.grid).toBe("var(--crm-cal-grid)");
    expect(out.style.borderBottom).toContain("var(--crm-cal-grid)");
  });

  it("a tapped day lists below; its leave opens Edit leave", () => {
    render(<Shell><PhoneCalendar input={input} /></Shell>);
    fireEvent.click(document.querySelector<HTMLElement>("[data-day='2026-11-09']")!);
    expect(screen.getByText("Mon, 9 Nov")).toBeTruthy();
    fireEvent.click(screen.getByText("Chea Huan · Annual"));
    expect(screen.getByRole("dialog", { name: "Edit leave" })).toBeTruthy();
  });
});

describe("Assignment › Leave (v4 notes/18-A, frames 13d / 13e)", () => {
  it("a name opens Add leave with them set — the sheet above the tab bar", () => {
    render(<Shell><PhonePeople input={input} bare top={() => null} /></Shell>);
    fireEvent.click(screen.getByText("Jason"));
    const sheet = screen.getByRole("dialog", { name: "Add leave" });
    expect(within(sheet).getByText("Jason")).toBeTruthy();
    expect(within(sheet).getByText("Change")).toBeTruthy();
    // In the CRM's shell, after the tab bar, above it.
    expect(sheet.parentElement).toBe(screen.getByTestId("shell"));
    expect(Number(sheet.style.zIndex)).toBeGreaterThan(0);
    expect(sheet.compareDocumentPosition(screen.getByTestId("tabbar")) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(sheet.style.maxHeight).toBe("88%");
    expect(screen.queryByText("Every week")).toBeNull(); // no person sheet any more
  });

  it("a name with a leave opens Edit leave, with Remove", async () => {
    render(<Shell><PhonePeople input={input} bare top={() => null} /></Shell>);
    fireEvent.click(screen.getByText("Chea Huan"));
    const sheet = screen.getByRole("dialog", { name: "Edit leave" });
    expect(within(sheet).getByText("Mon, 9 Nov 2026")).toBeTruthy();
    expect(within(sheet).getByText("Tue, 10 Nov 2026")).toBeTruthy();
    fireEvent.click(within(sheet).getByText("Remove leave"));
    await waitFor(() => expect(acts.removeLeave).toHaveBeenCalledWith("l1"));
  });

  it("+ Leave (the page's) opens Add leave on the first person; Change picks another; Save leave saves", async () => {
    render(<Shell><PhoneLeaveAdd /><PhonePeople input={input} bare top={() => null} /></Shell>);
    fireEvent.click(screen.getByLabelText("Add leave"));
    let sheet = screen.getByRole("dialog", { name: "Add leave" });
    expect(within(sheet).getByText("Stanley")).toBeTruthy(); // the first person they may edit
    fireEvent.click(within(sheet).getByText("Change"));
    sheet = screen.getByRole("dialog", { name: "Add leave" });
    fireEvent.change(within(sheet).getByLabelText("Search people"), { target: { value: "jas" } });
    expect(within(sheet).queryByText("Chea Huan")).toBeNull();
    expect(within(sheet).queryByText("Stanley")).toBeNull();
    fireEvent.click(within(sheet).getByText("Jason"));
    sheet = screen.getByRole("dialog", { name: "Add leave" });
    expect(within(sheet).getByText("Jason")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("radio", { name: "Sick" }));
    fireEvent.change(within(sheet).getByLabelText("To date"), { target: { value: "2026-11-07" } });
    fireEvent.click(within(sheet).getByText("Save leave"));
    await waitFor(() => expect(acts.saveLeave).toHaveBeenCalledWith({ id: null, staffId: "c", fromAt: "2026-11-06T09:00", toAt: "2026-11-07T18:00", reason: "Sick", note: "" }));
  });

  it("the desktop's Up next can open the sheet with the person set", () => {
    render(<Shell><PhonePeople input={input} bare top={() => null} /></Shell>);
    expect(openLeaveSheetFor("c")).toBe(true);
  });
});

describe("the phone's Team activity", () => {
  it("the people and why somebody is out of turn", () => {
    render(<PhoneTeamActivity a={{ data, book: input.book, live: true, who: null, nameOf: id => people.find(p => p.id === id)?.name ?? "", roleOf: () => "", openChat: () => {} }} />);
    // Out of turn with no leads: folded under Not in turn at the bottom (the owner, 2026-11-09).
    expect(screen.queryByText("No CRM login")).toBeNull();
    fireEvent.click(screen.getByText("Not in turn"));
    expect(screen.getByText("No CRM login")).toBeTruthy();
    expect(screen.getAllByText("Came")).toHaveLength(2);
  });
});
