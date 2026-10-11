import { describe, expect, it } from "vitest";
import { isReadNotif, unreadNotifs, type SalesNotif } from "./notifs";

const n = (id: string, time: number, pending = false): SalesNotif =>
  ({ id, kind: pending ? "share" : "status", from: "Ann", ini: "A", lead: "Ahmad", text: "", at: "", time, ok: true, pending });
const T = new Date("2026-10-10T10:00:00Z").getTime();

describe("notifications read one by one (rev 1010 §6)", () => {
  it("an update is read once its id is kept, or when older than the last Mark all as read", () => {
    const read = { notifRead: ["e1"], notifsSeenAt: new Date(T).toISOString() };
    expect(isReadNotif(n("e1", T + 5000), read)).toBe(true);
    expect(isReadNotif(n("e2", T - 5000), read)).toBe(true);
    expect(isReadNotif(n("e3", T + 5000), read)).toBe(false);
  });

  it("an invitation stays unread until answered — Mark all does not touch it", () => {
    const read = { notifRead: ["i1"], notifsSeenAt: new Date(T + 60_000).toISOString() };
    expect(isReadNotif(n("i1", T, true), read)).toBe(false);
    expect(unreadNotifs([n("i1", T, true), n("e1", T)], read)).toBe(1);
  });

  it("nothing read yet: everything counts", () => {
    expect(unreadNotifs([n("a", T), n("b", T)], { notifRead: [], notifsSeenAt: null })).toBe(2);
  });
});
