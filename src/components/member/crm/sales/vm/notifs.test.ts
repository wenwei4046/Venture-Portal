import { describe, expect, it } from "vitest";
import { isReadNotif, salesNotifs, unreadNotifs, type SalesNotif } from "./notifs";

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

describe("visits tomorrow and chats waiting for a reply (2026-10-14)", () => {
  const now = new Date(2026, 9, 14, 15, 0);
  const at = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const cust = (id: string, over: Record<string, unknown> = {}) => ({
    id, name: id.toUpperCase(), channel: "whatsapp", status: "follow_up", assignedTo: "s1", unread: 1, ad: "", messages: [], lastCustomerAt: null, ...over,
  });
  const ctxOf = (customers: unknown[], visits: unknown[]) => ({
    data: { invites: [], events: [], people: [{ id: "s1", role: "rs", uplineId: null }], customers, visits },
    owner: { id: "s1" }, now, nameOf: () => "",
  }) as unknown as Parameters<typeof salesNotifs>[0];

  it("tells the salesperson of their own visit tomorrow, and says once the reminder went", () => {
    const tmr = new Date(2026, 9, 15, 14, 0).toISOString(), later = new Date(2026, 9, 16, 14, 0).toISOString();
    const list = salesNotifs(ctxOf([cust("a"), cust("b", { assignedTo: "s2" })], [
      { id: "v1", customerId: "a", start: tmr, state: "booked", remindedAt: null },
      { id: "v2", customerId: "a", start: later, state: "booked", remindedAt: null },
      { id: "v3", customerId: "b", start: tmr, state: "booked", remindedAt: null },
    ]));
    const appt = list.filter(x => x.tone === "appt");
    expect(appt.map(x => x.visitId)).toEqual(["v1"]);
    expect(appt[0].text).toMatch(/^Visit tomorrow, .* · send the customer a reminder$/);
    const sent = salesNotifs(ctxOf([cust("a")], [{ id: "v1", customerId: "a", start: tmr, state: "booked", remindedAt: now.toISOString() }]));
    expect(sent.find(x => x.tone === "appt")?.text).toMatch(/reminder sent$/);
  });

  it("names the 3 h · 6 h · 9 h line a waiting chat crossed, a new notice for each line", () => {
    const msg = (h: number) => [{ id: "m", from: "lead", kind: "text", text: "hi", at: at(h) }];
    const one = (h: number) => salesNotifs(ctxOf([cust("a", { messages: msg(h), lastCustomerAt: at(h) })], [])).filter(x => x.tone === "wait");
    expect(one(1)).toEqual([]);
    expect(one(4)[0].text).toBe("Waiting for your reply · 3 h");
    expect(one(7)[0].text).toBe("Urgent · waiting 6 h for your reply");
    expect(one(10)[0].text).toBe("Overdue · waiting 10 h for your reply");
    expect(one(4)[0].id).not.toBe(one(7)[0].id);
  });
});
