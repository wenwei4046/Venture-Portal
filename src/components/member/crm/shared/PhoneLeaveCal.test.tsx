import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CrmData, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "./people-book";
import { PhoneCalendar, PhonePeople } from "./PhoneLeaveCal";
import { PhoneTeamActivity } from "./PhoneTeamActivity";

vi.mock("@/app/(member)/member/crm-actions", () => ({ fetchCrmAssignedSince: vi.fn(async () => ({ ok: true, rows: [] })) }));

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs", extra: Partial<CrmPerson> = {}): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true, ...extra });
const people = [P("tl", "Stanley", null, "tl"), P("a", "Chea Huan", "tl"), P("b", "Hector", "tl", "rs", { login: false }), P("c", "Jason", "tl", "rs", { paused: true })];
const teams = [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }];
const data = {
  people, customers: [], visits: [], events: [], ftRules: [{ tlId: "tl", mode: "turns", days: [0, 1, 2, 3, 4], vals: { a: { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1 } } }], lockedStaff: [],
  leaves: [{ id: "l1", staffId: "a", from: "2026-11-09", to: "2026-11-10", note: "", fromAt: "2026-11-09T09:00", toAt: "2026-11-10T13:00", reason: "Annual" }],
  settings: DEFAULT_CRM_SETTINGS, can: { viewAll: true, editAll: true, editOwn: true, manage: true }, upNextStaff: [],
} as unknown as CrmData;
const acts = { saveLeave: vi.fn(async () => true), removeLeave: vi.fn(async () => true), setPaused: vi.fn(async () => true), setDays: vi.fn(async () => true), setLocked: vi.fn(async () => true) };
const input = { book: peopleBook(data, teams, []), leaves: data.leaves!, appts: [{ who: "a", day: "2026-11-06", t: "11:00", cust: "Nur Aisyah", customerId: "x", visitId: "v1" }], now: "2026-11-06T18:00", canEdit: () => true, canLock: true, acts };

describe("the phone's Calendar, People and Team activity", () => {
  it("Calendar: the two layers, the month, the day's list", () => {
    render(<PhoneCalendar input={input} />);
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.getByText("Appointments")).toBeTruthy();
    expect(screen.getByText("November 2026")).toBeTruthy();
    expect(screen.getByText("Fri, 6 Nov")).toBeTruthy();
    expect(screen.getByText("Nur Aisyah")).toBeTruthy();
    fireEvent.click(screen.getByText("9"));
    expect(screen.getByText("Chea Huan · Annual")).toBeTruthy();
  });

  it("People: one line per person, its sheet with the days, Pause and Lock", () => {
    render(<PhonePeople input={input} />);
    expect(screen.getByText("Leads Mon–Fri")).toBeTruthy();
    expect(screen.getByText("No CRM login")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
    fireEvent.click(screen.getByText("Chea Huan"));
    expect(screen.getByText("Every week")).toBeTruthy();
    expect(screen.getByText("Lock")).toBeTruthy();
    fireEvent.click(screen.getByText("Sa"));
    expect(acts.setDays).toHaveBeenCalledWith("a", [0, 1, 2, 3, 4, 5]);
  });

  it("Team activity: the people and why somebody is out of turn", () => {
    render(<PhoneTeamActivity a={{ data, book: input.book, live: true, who: null, nameOf: id => people.find(p => p.id === id)?.name ?? "", roleOf: () => "", openChat: () => {} }} />);
    expect(screen.getByText("Team activity")).toBeTruthy();
    // Out of turn with no leads: folded under Not in turn at the bottom (the owner, 2026-11-09).
    expect(screen.queryByText("No CRM login")).toBeNull();
    fireEvent.click(screen.getByText("Not in turn"));
    expect(screen.getByText("No CRM login")).toBeTruthy();
    expect(screen.getAllByText("Came")).toHaveLength(2);
  });
});
