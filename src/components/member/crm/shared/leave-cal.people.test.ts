/**
 * The owner, 2026-11-09, on Assignment › Leave (it was People): "连续假期就连起来" — a leave of several days is one bar across
 * them, its words on the first day of each week only, as the Calendar draws it.
 */
import { describe, expect, it } from "vitest";
import type { CrmData, CrmLeave, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "./people-book";
import { leaveCalStart, leaveCalVM } from "./leave-cal";

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs"): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true });
const people = [P("tl", "Stanley", null, "tl"), P("a", "Chin Ying", "tl")];
const leave = { id: "L1", staffId: "a", fromAt: "2026-10-30T09:00", toAt: "2026-11-09T18:00", reason: "Other", note: "Trip", from: "2026-10-30", to: "2026-11-09" } as CrmLeave;
const d = { people, customers: [], visits: [], events: [], leaves: [leave], ftRules: [], lockedStaff: [], settings: DEFAULT_CRM_SETTINGS,
  can: { viewAll: true, editAll: true, editOwn: true, manage: true } } as unknown as CrmData;

describe("Assignment › Leave joins a leave's days", () => {
  it("one bar from Friday to Sunday, its words only where a week starts", () => {
    const now = "2026-11-09T10:00";
    const v = leaveCalVM({ mode: "people", book: peopleBook(d, [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }], []), leaves: [leave], appts: [], now,
      canEdit: () => true, canLock: true, ui: leaveCalStart(now, "people"), set: () => {}, flash: () => {},
      acts: { saveLeave: async () => true, removeLeave: async () => true, setPaused: async () => true, setDays: async () => true, setLocked: async () => true } });
    const chip = (day: string) => v.monthCells.find(c => c.day === day)!.chips[0];
    expect(chip("2026-10-30").label).toMatch(/^Chin/);          // the first day: its words, open to the right
    expect(chip("2026-10-30").mr).toBe("-7px");
    expect(chip("2026-10-31").label).toBe("");                  // inside the week: the bar runs on, no words
    expect(chip("2026-10-31").ml).toBe("-6px");
    expect(chip("2026-11-02").label).toMatch(/^Chin/);          // a new week (Monday): its words again
  });
});
