// 2026-11-16 (the owner, of Steven Yee — booked on Messenger while its window was shut, the customer never told: "要做，在
// 聊天里留记录"): a visit booked / moved / cancelled with no card of ours around it says so in the chat.
import { describe, expect, it } from "vitest";
import type { CrmCard, CrmEvent } from "@/lib/member/crm-data";
import { untoldText, untoldVisits } from "./visit-untold";

const ev = (id: number, kind: CrmEvent["kind"], at: string, start?: string) => ({ id, kind, customerId: "c1", actor: "p", owner: null, data: start ? { start } : {}, at }) as unknown as CrmEvent;
const card = { kind: "Confirmed", start: "2026-11-22T04:00:00Z", room: "Astrum Ampang", addr: "x" } as CrmCard;

describe("a visit the customer was not told of", () => {
  it("is a booking, move or cancellation with no visit card of ours within a minute before to ten minutes after", () => {
    const events = [
      ev(1, "appt_booked", "2026-11-14T15:41:54Z", "2026-11-22T04:00:00Z"), // Steven Yee: no card
      ev(2, "appt_changed", "2026-11-15T03:00:00Z", "2026-11-23T04:00:00Z"), // its card 20 s later: told
      ev(3, "status", "2026-11-14T15:41:54Z"), // not a visit
      { ...ev(4, "appt_booked", "2026-11-14T15:41:54Z"), customerId: "c2" }, // another customer's
    ];
    const msgs = [{ from: "me", at: "2026-11-15T03:00:20Z", card }, { from: "me", at: "2026-11-15T08:07:14Z" }];
    const out = untoldVisits("c1", msgs, events);
    expect(out).toEqual([{ at: "2026-11-14T15:41:54Z", label: "Visit booked", start: "2026-11-22T04:00:00Z" }]);
    expect(untoldText(out[0])).toBe("Visit booked for Sun 22 Nov, 12:00 pm · the customer was not sent the visit card");
  });
  it("is told when the card went", () => {
    expect(untoldVisits("c1", [{ from: "me", at: "2026-11-14T15:42:30Z", card }], [ev(1, "appt_booked", "2026-11-14T15:41:54Z")])).toEqual([]);
  });
});
