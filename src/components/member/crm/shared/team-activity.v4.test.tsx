/**
 * v4 notes/14b (frame 8e): Team activity's order, top 5 + "Show N more", one time format, and its colours.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { CrmCustomer, CrmData, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "./people-book";
import { ACT_TOP_DESK, ACT_TOP_PHONE, activityOrder, activityVM, fmt, foldTop, STRIP_LATE, type ActivityUi, type AssignedRow } from "./team-activity";
import { PhoneTeamActivityView } from "./PhoneTeamActivity";

vi.mock("@/app/(member)/member/crm-actions", () => ({ fetchCrmAssignedSince: vi.fn(async () => ({ ok: true, rows: [] })) }));

describe("fmt — one time format for Avg and Wait (README › Time format)", () => {
  it("4m · 1h 05m · 9h 45m · 1d 3h", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(0)).toBe("0m");
    expect(fmt(4)).toBe("4m");
    expect(fmt(59)).toBe("59m");
    expect(fmt(65)).toBe("1h 05m");
    expect(fmt(585)).toBe("9h 45m");
    expect(fmt(1439)).toBe("23h 59m");
    expect(fmt(1440 + 180)).toBe("1d 3h");
  });
});

const N = (name: string, leads: number, avg: number | null, extra: Partial<{ waitMax: number; appt: number; show: number }> = {}) =>
  ({ name, nums: { leads, avg, waitMax: 0, appt: 0, show: 0, ...extra } });

describe("activityOrder — leads high → low, ties by the shorter Avg, then name; 0 leads always last", () => {
  it("the default order", () => {
    const rows = [N("Zed", 0, null), N("Bo", 5, 7), N("Al", 5, 5), N("Cy", 6, 4), N("Di", 4, 72), N("Ed", 4, null), N("Ab", 0, null)];
    expect(activityOrder(rows, null).map(r => r.name)).toEqual(["Cy", "Al", "Bo", "Di", "Ed", "Ab", "Zed"]);
  });
  it("a tapped header overrides the order, but 0-lead people stay last", () => {
    const rows = [N("Zed", 0, null, { appt: 9 }), N("Bo", 5, 7, { appt: 1 }), N("Al", 2, 5, { appt: 3 })];
    expect(activityOrder(rows, { k: "appt", d: -1 }).map(r => r.name)).toEqual(["Al", "Bo", "Zed"]);
    expect(activityOrder(rows, { k: "appt", d: 1 }).map(r => r.name)).toEqual(["Bo", "Al", "Zed"]);
  });
});

describe("foldTop — the top N, the rest behind Show N more", () => {
  it("phone 5, desktop 6; none folded when N or fewer, or opened", () => {
    expect([ACT_TOP_PHONE, ACT_TOP_DESK]).toEqual([5, 6]);
    expect(foldTop([1, 2, 3, 4, 5, 6, 7], 5, false)).toEqual({ shown: [1, 2, 3, 4, 5], more: 2 });
    expect(foldTop([1, 2, 3, 4, 5], 5, false)).toEqual({ shown: [1, 2, 3, 4, 5], more: 0 });
    expect(foldTop([1, 2, 3, 4, 5, 6, 7], 5, true).more).toBe(0);
    expect(foldTop([1, 2, 3, 4, 5, 6, 7], 6, false).more).toBe(1);
  });
});

// Eight people in one team; a, b, c… get leads 6, 5, 5, 4, 4, 1, 0, 0.
const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs"): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true });
const people = [P("tl", "Stanley", null, "tl"), ...["Aina", "Hafiz", "Mei", "Dan", "Siti", "Kumar", "Lim", "Ng"].map((n, i) => P(`p${i}`, n, "tl"))];
const teams = [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }];
const at = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00+08:00`).toISOString();
const LEADS = [6, 5, 5, 4, 4, 1, 0, 0];
const customers: CrmCustomer[] = [], rows: AssignedRow[] = [];
LEADS.forEach((n, i) => {
  for (let k = 0; k < n; k++) {
    const id = `c${i}-${k}`, got = at(`0${1 + k}:00`);
    // Hafiz's first lead waits since 01:00 (17 h by 18:00: late); every other lead answered in (i + 2) minutes.
    const late = i === 1 && k === 0;
    const reply = new Date(new Date(got).getTime() + (i + 2) * 60_000).toISOString();
    customers.push({ id, name: `Cust ${id}`, ad: "Raya", status: "new", messages: [{ id: `${id}m`, kind: "text", text: "", from: "lead", at: got }, ...(late ? [] : [{ id: `${id}r`, kind: "text", text: "", from: "me", at: reply }])] } as unknown as CrmCustomer);
    rows.push({ contact_id: id, actor: null, data: { to: `p${i}` }, at: got });
  }
});
const data = { people, customers, visits: [], events: [], leaves: [], ftRules: [], lockedStaff: [], settings: DEFAULT_CRM_SETTINGS,
  can: { viewAll: true, editAll: true, editOwn: true, manage: true } } as unknown as CrmData;
const ui = (p: Partial<ActivityUi> = {}): ActivityUi => ({ team: "all", who: null, menu: false, per: "Today", from: "2026-11-01", to: "2026-11-06", open: {}, lead: null, sort: null, pMenu: false, pOpen: {}, pLead: null, ...p });
const vm = (u: Partial<ActivityUi> = {}, set: (p: unknown) => void = () => {}) => activityVM({ data, book: peopleBook(data, teams, []), rows, now: new Date(at("18:00")), ui: ui(u), set: set as never,
  nameOf: id => people.find(p => p.id === id)?.name ?? "", roleOf: () => "", openChat: () => {} });

describe("the phone's Activity (8e)", () => {
  it("rows in the default order, 0-lead people last and not greyed", () => {
    const v = vm();
    // Hafiz and Mei both 5: Hafiz's Avg (3m) is shorter than Mei's (4m). The team leader has none yet.
    expect(v.pRows.map(r => r.name)).toEqual(["Aina", "Hafiz", "Mei", "Dan", "Siti", "Kumar", "Lim", "Ng", "Stanley"]);
    const lim = v.pRows.find(r => r.name === "Lim")!;
    expect(lim.rowFg).toBe("var(--crm-ink)");
    expect(lim.op).toBe(1);
  });

  it("the top 5, then Show 4 more; a tap shows them all", () => {
    let more = false;
    const { rerender } = render(<PhoneTeamActivityView v={vm({ more })} />);
    const names = () => [...document.querySelectorAll("[data-act-row]")].map(r => r.getAttribute("data-act-row"));
    expect(names()).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    expect(screen.getByText(/Show 4 more/)).toBeTruthy();
    more = true;
    rerender(<PhoneTeamActivityView v={vm({ more })} />);
    expect(names()).toHaveLength(9);
    expect(screen.queryByText(/Show 4 more/)).toBeNull();
    expect(screen.getByText("Show less")).toBeTruthy();
  });

  it("Show N more asks the view model to open", () => {
    const set = vi.fn();
    render(<PhoneTeamActivityView v={vm({}, set)} />);
    fireEvent.click(screen.getByText(/Show 4 more/));
    expect(set).toHaveBeenCalled();
    const arg = set.mock.calls[0][0] as (u: ActivityUi) => Partial<ActivityUi>;
    expect(arg(ui())).toEqual({ more: true });
  });

  it("one time format; a late wait in oxblood, others faint; the strip's Waiting #FFB38A when any is late", () => {
    render(<PhoneTeamActivityView v={vm()} />);
    const hafiz = document.querySelector("[data-act-row='p1']")!;
    const wait = hafiz.querySelector<HTMLElement>("[data-col='wait']")!;
    expect(wait.textContent).toBe("17h 00m");
    expect(wait.style.color).toBe("var(--crm-oxblood)");
    expect(wait.style.textAlign).toBe("center");
    const aina = document.querySelector("[data-act-row='p0']")!;
    expect(aina.querySelector<HTMLElement>("[data-col='wait']")!.textContent).toBe("—");
    expect(aina.querySelector<HTMLElement>("[data-col='wait']")!.style.color).toBe("var(--crm-faint)");
    expect(aina.querySelector<HTMLElement>("[data-col='avg']")!.textContent).toBe("2m");
    const strip = document.querySelector<HTMLElement>("[data-act-strip]")!;
    expect(strip.style.background).toBe("var(--crm-ink)");
    const waiting = within(strip).getByText("Waiting").previousElementSibling as HTMLElement;
    expect(STRIP_LATE).toBe("var(--crm-strip-late)");
    expect(waiting.style.color).toBe("var(--crm-strip-late)");
    expect(within(strip).getByText("Came")).toBeTruthy();
    expect(within(strip).getByText("Avg")).toBeTruthy();
    expect(screen.queryByText("Team activity")).toBeNull(); // no title: the switch says Activity
  });

  it("one filter row: people, ad, period and the clock; Custom opens a calendar where days can be picked", () => {
    const set = vi.fn();
    render(<PhoneTeamActivityView v={vm({}, set)} />);
    const row = document.querySelector<HTMLElement>("[data-act-filters]")!;
    expect(within(row).getByLabelText("People: Everyone")).toBeTruthy();
    expect(within(row).getByLabelText("Ad: All ads")).toBeTruthy();
    expect(within(row).getByText("18:00")).toBeTruthy();
    fireEvent.click(within(row).getByLabelText("Period: Today"));
    fireEvent.click(screen.getByRole("option", { name: "Custom" }));
    expect(set).toHaveBeenCalledWith({ per: "Custom" });
    const dlg = screen.getByRole("dialog", { name: "Pick dates" });
    expect(dlg).toBeTruthy();
  });
});
