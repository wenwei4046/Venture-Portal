import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import { appointmentsReport, breakdown, periodRange, salespeopleReport, sourcesReport, waitLabel } from "./reports";

// Reports (2026-10-23): Salespeople, Appointments & show-ups, Lead sources & status.
const now = new Date(2026, 9, 23, 12);
const msg = (from: "lead" | "me", at: string, auto = false) => ({ id: at, from, kind: "text", text: "", at, auto });
const cust = (id: string, who: string | null, createdAt: string, extra: Partial<CrmCustomer> = {}) =>
  ({ id, assignedTo: who, createdAt, status: "new", adId: null, ad: "", channel: "whatsapp", details: {}, messages: [], ...extra }) as unknown as CrmCustomer;
const visit = (customerId: string, state: string) => ({ customerId, state }) as unknown as CrmVisit;

describe("reports", () => {
  it("takes the period's days", () => {
    const [a, b] = periodRange("month", now);
    expect(new Date(a)).toEqual(new Date(2026, 9, 1));
    expect(new Date(b + 1)).toEqual(new Date(2026, 9, 24));
    expect(new Date(periodRange("week", now)[0])).toEqual(new Date(2026, 9, 19));
    const [la, lb] = periodRange("last", now);
    expect([new Date(la), new Date(lb + 1)]).toEqual([new Date(2026, 8, 1), new Date(2026, 9, 1)]);
  });

  it("counts each salesperson's leads, replies, first-reply wait, visits and outcomes; the total is everybody's", () => {
    const cs = [
      cust("a", "p1", "2026-10-05T02:00:00Z", { status: "won", messages: [msg("lead", "2026-10-05T02:00:00Z"), msg("me", "2026-10-05T02:00:30Z", true), msg("me", "2026-10-05T02:30:00Z")] as never }),
      cust("b", "p1", "2026-10-06T02:00:00Z", { messages: [msg("lead", "2026-10-06T02:00:00Z"), msg("me", "2026-10-06T03:30:00Z")] as never }),
      cust("c", "p2", "2026-10-07T02:00:00Z", { status: "lost", messages: [msg("lead", "2026-10-07T02:00:00Z")] as never }),
      cust("d", null, "2026-10-08T02:00:00Z"),
      cust("old", "p1", "2026-09-20T02:00:00Z"),
    ];
    const vs = [visit("a", "attended"), visit("b", "no_show"), visit("c", "cancelled")];
    const { rows, total } = salespeopleReport(cs, vs, periodRange("month", now), id => id.toUpperCase(), () => "Team X");
    expect(rows.map(r => r.name)).toEqual(["P1", "P2", "Not assigned yet"]);
    expect(rows[0]).toMatchObject({ leads: 2, replied: 2, replyRate: 1, firstReplyMin: 60, appt: 2, apptRate: 1, showed: 1, showRate: 0.5, won: 1, winRate: 0.5, lost: 0 });
    expect(rows[1]).toMatchObject({ leads: 1, replied: 0, firstReplyMin: null, appt: 0, lost: 1 });
    expect(total).toMatchObject({ leads: 4, won: 1, lost: 1, appt: 2 });
  });

  it("counts visits by outcome, with the show-up rate over the marked ones", () => {
    const at = new Date(2026, 9, 17, 14);
    const r = appointmentsReport([
      { at, room: "KL", rep: "P1", outcome: "Showed up" }, { at, room: "KL", rep: "P1", outcome: "Won" }, { at, room: "PJ", rep: "P2", outcome: "No show" },
      { at, room: "KL", rep: "P2", outcome: "Upcoming" }, { at, room: "KL", rep: "P2", outcome: "Cancelled" },
    ]);
    expect(r.figures).toEqual({ booked: 4, upcoming: 1, showed: 2, noShow: 1, toMark: 0, cancelled: 1, showRate: 2 / 3 });
    expect(r.byRoom[0]).toEqual({ label: "KL", n: 4, share: 0.8 });
    expect(r.byDow).toEqual([{ label: "Sat", n: 5, share: 1 }]);
    expect(r.byOutcome.map(x => x.label)).toEqual(["Upcoming", "Showed up", "Won", "No show", "Cancelled"]);
  });

  it("counts each customer once in the appointments figures (2026-10-27)", () => {
    const at = new Date(2026, 9, 17, 14);
    const r = appointmentsReport([
      { at, room: "KL", rep: "P1", outcome: "Showed up", who: "a" }, { at, room: "KL", rep: "P1", outcome: "Won", who: "a" },
      { at, room: "KL", rep: "P1", outcome: "No show", who: "b" }, { at, room: "KL", rep: "P1", outcome: "Showed up", who: "b" },
      { at, room: "KL", rep: "P2", outcome: "No show", who: "c" }, { at, room: "KL", rep: "P2", outcome: "Upcoming", who: "c" },
    ]);
    expect(r.figures).toEqual({ booked: 3, upcoming: 1, showed: 2, noShow: 1, toMark: 0, cancelled: 0, showRate: 2 / 3 });
    expect(r.byRoom[0].n).toBe(6);
  });

  it("splits the period's leads by channel, ad, status and loss reason", () => {
    const cs = [cust("a", "p1", "2026-10-05T02:00:00Z", { adId: "1", ad: "Skyline" }), cust("b", "p1", "2026-10-06T02:00:00Z", { status: "lost", lost: { reason: "too_expensive" } }),
      cust("c", "p1", "2026-10-07T02:00:00Z", { channel: "messenger", adId: "1", ad: "Skyline" })];
    const r = sourcesReport(cs, periodRange("month", now), c => (c.status === "lost" ? "Lost" : "New"), c => (c.channel === "whatsapp" ? "WhatsApp" : "Messenger"));
    expect(r.figures).toEqual({ leads: 3, fromAds: 2, won: 0, lost: 1 });
    expect(r.byAd.map(x => [x.label, x.n])).toEqual([["Skyline", 2], ["No ad", 1]]);
    expect(r.byStatus.map(x => x.label)).toEqual(["New", "Lost"]);
    expect(r.lostWhy).toEqual([{ label: "Too expensive", n: 1, share: 1 }]);
  });

  it("orders a breakdown by count, or by a given order", () => {
    expect(breakdown(["b", "a", "b"], x => x).map(p => p.label)).toEqual(["b", "a"]);
    expect(breakdown(["b", "a", "b"], x => x, ["a", "b"]).map(p => p.label)).toEqual(["a", "b"]);
    expect([waitLabel(45), waitLabel(190), waitLabel(60 * 52), waitLabel(null)]).toEqual(["45 min", "3 h 10 min", "2 d 4 h", "—"]);
  });
});
