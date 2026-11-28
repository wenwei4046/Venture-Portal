/**
 * The reply mark in the chats (the owner, 2026-11-28: "同时能不能直接在聊天室做这个记号"): a customer sent a template is
 * Won, else Appt (a visit not cancelled), else Replied / No reply after the first template; never sent one, no mark. The
 * Inbox filter's Replied / No reply follow the reply alone, as Overview counts them.
 */
import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import { bookedIds, NOREPLY_PICK, REPLIED_PICK, replyGroups, replyPickOk, replyStateOf, replyTag } from "./reply-groups";

const at = (h: number) => new Date(2026, 10, 20, h).toISOString();
const tpl = (h: number) => ({ id: `t${h}`, from: "me", kind: "template", text: "", at: at(h) });
const said = (h: number) => ({ id: `s${h}`, from: "lead", kind: "text", text: "", at: at(h) });
const cust = (id: string, messages: unknown[], status = "follow") => ({ id, name: id, status, messages }) as unknown as CrmCustomer;
const visits = [{ id: "v1", customerId: "appt", state: "booked" }, { id: "v2", customerId: "gone", state: "cancelled" }] as unknown as CrmVisit[];
const booked = bookedIds(visits);

const C = {
  none: cust("none", [said(9)]), // the form only, no template yet
  noreply: cust("noreply", [said(9), tpl(10)]),
  replied: cust("replied", [said(9), tpl(10), said(11)]),
  appt: cust("appt", [said(9), tpl(10), said(11)]),
  won: cust("won", [said(9), tpl(10), said(11)], "won"),
  gone: cust("gone", [said(9), tpl(10)]), // a cancelled visit is no appointment
};

describe("an ad with no template (Messenger, Click-to-WhatsApp)", () => {
  const me = (h: number, auto = false) => ({ id: `m${h}`, from: "me", kind: "text", text: "", at: at(h), ...(auto ? { auto: true } : {}) });
  it("counts from our first message that is not an auto-reply", () => {
    const answered = cust("answered", [said(9), me(10), said(11)]);
    const waiting = cust("waiting", [said(9), me(10, true), me(12), said(11)]); // wrote before our first real reply
    const autoOnly = cust("autoOnly", [said(9), me(10, true), said(11)]);
    expect([answered, waiting, autoOnly].map(c => replyStateOf(c, booked))).toEqual(["replied", "noreply", null]);
  });
  it("a template still wins over an earlier message", () => {
    expect(replyStateOf(cust("t", [said(9), me(10), said(11), tpl(12)]), booked)).toBe("noreply");
  });
});

describe("the reply mark", () => {
  it("is Won, Appt, Replied or No reply for a customer sent a template — none otherwise", () => {
    expect(Object.fromEntries(Object.entries(C).map(([k, c]) => [k, replyStateOf(c, booked)]))).toEqual({
      none: null, noreply: "noreply", replied: "replied", appt: "appt", won: "won", gone: "noreply" });
  });
  it("is an Inbox row's tag in its colour", () => {
    expect(replyTag(C.noreply, booked)).toEqual([{ t: "No reply", c: "var(--crm-noreply)" }]);
    expect(replyTag(C.won, booked)).toEqual([{ t: "Won", c: "var(--crm-rust)" }]);
    expect(replyTag(C.none, booked)).toEqual([]);
  });
  it("filters by the reply alone, as Overview's groups count it", () => {
    const all = Object.values(C);
    const g = replyGroups(all, visits);
    expect(all.filter(c => replyPickOk(REPLIED_PICK, c)).map(c => c.id)).toEqual(g.replied);
    expect(all.filter(c => replyPickOk(NOREPLY_PICK, c)).map(c => c.id)).toEqual(g.noReply);
    expect(g).toEqual({ replied: ["replied", "appt", "won"], noReply: ["noreply", "gone"], appt: ["appt"], won: ["won"] });
  });
});
