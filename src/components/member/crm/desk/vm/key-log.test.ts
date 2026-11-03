/**
 * Showrooms › Key log (the owner, 2026-10-29): every visit whose key went out or came back on a photo, and every visit
 * still to mark at a showroom that hands its key over — with who and when.
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import { keyLogRows } from "./key-log";

const data = {
  rooms: [{ id: "kl", name: "Astrum Ampang", keys: true }, { id: "pj", name: "The Conts HQ" }],
  customers: [{ id: "c1", name: "Wah Leong", assignedTo: "ann" }, { id: "c2", name: "vivi", assignedTo: "ben" }, { id: "c3", name: "Cristal", assignedTo: "ann" }],
  visits: [
    { id: "v1", customerId: "c1", showroomId: "kl", start: "2026-10-28T06:00:00Z", state: "attended", keyOut: { path: "c1/a.jpg", at: "2026-10-28T05:40:00Z", by: "ann" }, keyBack: { path: "c1/b.jpg", at: "2026-10-28T07:10:00Z", by: "tla" } },
    { id: "v2", customerId: "c2", showroomId: "kl", start: "2026-10-30T03:00:00Z", state: "booked" },
    { id: "v3", customerId: "c3", showroomId: "pj", start: "2026-10-30T04:00:00Z", state: "booked" },
    { id: "v4", customerId: "c2", showroomId: "kl", start: "2026-10-29T03:00:00Z", state: "cancelled" },
  ],
} as unknown as CrmData;
const names: Record<string, string> = { ann: "Ann", ben: "Ben", tla: "Tina" };

describe("the key log", () => {
  it("lists key photos and visits to mark at a key showroom, newest first; nothing else", () => {
    const rows = keyLogRows({ data, nameOf: id => (id ? names[id] ?? "—" : "—") });
    expect(rows.map(r => [r.id, r.state, r.room, r.customer, r.owner])).toEqual([["v2", "none", "Astrum Ampang", "vivi", "Ben"], ["v1", "back", "Astrum Ampang", "Wah Leong", "Ann"]]);
    expect([rows[1].out?.by, rows[1].out?.path, rows[1].back?.by, rows[1].back?.path]).toEqual(["Ann", "c1/a.jpg", "Tina", "c1/b.jpg"]);
  });
});
