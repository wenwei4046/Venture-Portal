/**
 * The owner (2026-11-10): nothing in a calendar overlaps — the desktop's month draws each leave as ONE bar per week row
 * across its days (as the phone, v4 notes/19 §3), in the CRM's one calendar look (cal-look.ts).
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { CrmData, CrmLeave, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "../shared/people-book";
import { DeskLeaveCalPage } from "./DeskLeaveCal";

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs"): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true });
const people = [P("tl", "Stanley", null, "tl"), P("a", "Chea Huan", "tl"), P("b", "Hector", "tl")];
const L = (id: string, staffId: string, fromAt: string, toAt: string): CrmLeave => ({ id, staffId, from: fromAt.slice(0, 10), to: toAt.slice(0, 10), note: "", fromAt, toAt, reason: "Annual" }) as CrmLeave;
const leaves = [L("l1", "a", "2026-11-13T09:00", "2026-11-17T18:00"), L("l2", "b", "2026-11-13T09:00", "2026-11-13T18:00")];
const data = { people, customers: [], visits: [], events: [], ftRules: [], lockedStaff: [], leaves, settings: DEFAULT_CRM_SETTINGS,
  can: { viewAll: true, editAll: true, editOwn: true, manage: true } } as unknown as CrmData;
const acts = { saveLeave: vi.fn(async () => true), removeLeave: vi.fn(async () => true), setPaused: vi.fn(async () => true), setDays: vi.fn(async () => true), setLocked: vi.fn(async () => true) };

describe("the desktop Calendar's month", () => {
  it("each leave one bar per week row, in its own lane — never one cell's chip, never over another", () => {
    render(<DeskLeaveCalPage mode="calendar" title="Calendar" input={{ book: peopleBook(data, [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }], []), leaves, appts: [], now: "2026-11-06T18:00", canEdit: () => true, canLock: true, acts }} />);
    const bars = [...document.querySelectorAll<HTMLElement>("[data-leave-bar]")];
    // Chea: Fri 13 – Sun 15 (first week), Mon 16 – Tue 17 (the next); Hector: Fri 13 alone.
    expect(bars.map(b => b.textContent)).toEqual(["Chea · Annual", "Hector · Annual", "Chea · Annual"]);
    expect(bars[0].style.width).toContain("3 * 100% / 7");
    expect(bars[0].style.top).not.toBe(bars[1].style.top);
    expect(bars[2].style.left).toContain("0 * 100% / 7");
  });
});

describe("a day no leave crosses keeps no room for the week's bars (the owner, 2026-11-10: \"不要 20:00 上面的空格\")", () => {
  it("Wednesday's appointment sits right under its number while a leave runs Fri – Sun that week", async () => {
    const { leaveCalVM, leaveCalStart } = await import("../shared/leave-cal");
    const appt = { who: "a", day: "2026-11-11", t: "20:00", cust: "Kim", customerId: "c1", visitId: "v1" };
    const v = leaveCalVM({ book: peopleBook(data, [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }], []), leaves, appts: [appt],
      now: "2026-11-06T18:00", canEdit: () => true, canLock: true, acts, mode: "calendar", ui: { ...leaveCalStart("2026-11-06T18:00", "calendar"), month: "2026-11" },
      set: () => {}, flash: () => {} } as never);
    const week = v.weeks.find(w => w.days.some(d => d.day === "2026-11-11"))!;
    const wed = week.days.find(d => d.day === "2026-11-11")!, fri = week.days.find(d => d.day === "2026-11-13")!;
    expect(week.bars.length).toBeGreaterThan(0);
    expect(wed.used).toBe(0);
    expect(wed.appts.map(a => a.t)).toEqual(["20:00"]);
    expect(fri.used).toBeGreaterThan(0);
    expect(week.dDays.find(d => d.day === "2026-11-11")!.dLanes).toBe(0);
  });
});
