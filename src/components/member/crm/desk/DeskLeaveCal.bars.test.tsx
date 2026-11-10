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
