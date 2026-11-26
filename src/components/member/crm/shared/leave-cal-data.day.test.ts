/**
 * The desktop Calendar's day list (the owner, 2026-11-27) names each appointment's room and how it stands — read from the
 * visits as the desktop's other visit lists read them (desk/vm/data.ts › visitStatus).
 */
import { describe, expect, it } from "vitest";
import type { CrmData, CrmPerson, CrmVisit } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import type { PanelActions } from "../panel/actions";
import { leaveCalData } from "./leave-cal-data";

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs"): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true });
const people = [P("tl", "Stanley", null, "tl"), P("a", "Chea Huan", "tl"), P("b", "Hector Lim", "tl")];
const V = (id: string, customerId: string, start: string, state: CrmVisit["state"], o: Partial<CrmVisit> = {}): CrmVisit =>
  ({ id, customerId, showroomId: "r1", start, minutes: 60, state, outcome: null, remindedAt: null, ...o });
const data = {
  people, events: [], ftRules: [], lockedStaff: [], leaves: [], settings: DEFAULT_CRM_SETTINGS, upNextStaff: [],
  can: { viewAll: true, editAll: true, editOwn: true, manage: true },
  rooms: [{ id: "r1", name: "Showroom KL" }, { id: "r2", name: "Online meeting" }],
  customers: [{ id: "c1", name: "Kim Lee", assignedTo: "a" }, { id: "c2", name: "Tan Mei", assignedTo: "b" }, { id: "c3", name: "Nobody's", assignedTo: null }],
  visits: [
    V("v1", "c1", "2026-11-28T06:00:00Z", "booked"), // Sat 14:00 at the office, to come
    V("v2", "c1", "2026-11-26T02:30:00Z", "booked", { showroomId: "r2", kind: "online" }), // past, not marked
    V("v3", "c2", "2026-11-20T03:00:00Z", "attended", { outcome: "won" }),
    V("v4", "c2", "2026-11-19T03:00:00Z", "no_show"),
    V("v5", "c2", "2026-11-18T03:00:00Z", "cancelled"),
    V("v6", "c3", "2026-11-18T03:00:00Z", "booked"),
  ],
} as unknown as CrmData;

describe("leaveCalData's appointments", () => {
  it("each with its room and how it stands; cancelled and unassigned ones are not on the calendar", () => {
    const x = leaveCalData({ data, me: people[0], now: new Date("2026-11-27T02:00:00Z"), act: {} as PanelActions,
      teams: [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }], directors: [] });
    expect(x.appts.map(a => [a.visitId, a.day, a.t, a.cust, a.where, a.status])).toEqual([
      ["v1", "2026-11-28", "14:00", "Kim Lee", "Showroom KL", "Booked"],
      ["v2", "2026-11-26", "10:30", "Kim Lee", "Online meeting", "To mark"],
      ["v3", "2026-11-20", "11:00", "Tan Mei", "Showroom KL", "Won"],
      ["v4", "2026-11-19", "11:00", "Tan Mei", "Showroom KL", "No show"],
    ]);
  });
});
