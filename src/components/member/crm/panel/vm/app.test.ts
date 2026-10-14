import { describe, expect, it, vi } from "vitest";
import { crmDemoData } from "@/lib/member/crm-demo-data";
import { personOf } from "../../shared/people";
import { initialPanelUi, type PanelUi } from "../ui";
import { panelAppVM } from "./app";
import { teamsOf, type PanelCtx } from "./common";

// The Control panel's root view model, as CrmApp builds its context, on the demo's data seen by the Principal.
const ctxWith = (ui: Partial<PanelUi>): PanelCtx => {
  const data = crmDemoData("a1", "boss");
  const me = personOf(data.viewerId, data.people)!;
  const teams = teamsOf(data);
  const act = new Proxy({}, { get: () => () => Promise.resolve(true) }) as PanelCtx["act"];
  return {
    data, me, now: new Date("2026-10-11T12:00:00+08:00"), live: false, ui: { ...initialPanelUi(), ...ui }, set: () => {}, patch: () => {}, act,
    nameOf: id => personOf(id, data.people)?.name ?? "—", teams, directors: data.people.filter(p => p.role === "hod"),
    teamOfStaff: id => teams.find(t => t.id === id || t.people.some(p => p.id === id)), openCrmOf: () => {}, exitApp: () => {}, slotCounts: {},
  };
};

describe("the Control panel's view model", () => {
  // 2026-10-11: reading the chat's toast with no chat open threw and took the whole Revenue app down.
  it("draws with no chat open, and shows the panel's toast", () => {
    const v = panelAppVM(ctxWith({ toast: "Saved" }));
    expect(v.toast).toBe("Saved");
  });

  it("with a chat open, the toast shows once — in the chat, not again on the panel", () => {
    const lead = crmDemoData("a1", "boss").customers[0].id;
    const v = panelAppVM(ctxWith({ tab: "inbox", lead, toast: "Visit booked for Tan Mei Ling" }));
    expect(v.ld.toast).toBe("Visit booked for Tan Mei Ling");
    expect(v.toast).toBe("");
  });
});

// The Team chat's composer is Mine's (2026-10-15, "all need same"), on the panel's own state — which, like Mine's, keeps
// each chat's words and reply to itself (the review: words typed for one customer were in the next chat's box, and Send
// would have sent them there).
describe("the Team chat's composer", () => {
  const customers = crmDemoData("a1", "boss").customers;
  const lim = customers.find(c => c.name === "Lim Wei Jie")!.id, tan = customers.find(c => c.name === "Tan Mei Ling")!.id;

  it("a chat's words and the message it answers are its own", () => {
    const ui: Partial<PanelUi> = { tab: "inbox", pDrafts: { [lim]: "See you Sunday" }, pReply: { chat: lim, msgId: "m5", who: "Lim Wei Jie", text: "Can we change to Sunday 11am?" } };
    const inLim = panelAppVM(ctxWith({ ...ui, lead: lim })).ld.lx.cmp, inTan = panelAppVM(ctxWith({ ...ui, lead: tan })).ld.lx.cmp;
    expect(inLim.draft).toBe("See you Sunday");
    expect(inLim.reply).toEqual({ who: "Lim Wei Jie", text: "Can we change to Sunday 11am?" });
    expect(inTan.draft).toBe("");
    expect(inTan.reply).toBeNull();
  });

  it("Recents are CrmApp's list, shared with Mine's chat: a pick keeps it there and saves it", () => {
    const keep = vi.fn(), save = vi.fn();
    const act = new Proxy({}, { get: (_t, k) => (k === "saveRecentEmoji" ? save : () => Promise.resolve(true)) }) as PanelCtx["act"];
    const cmp = panelAppVM({ ...ctxWith({ tab: "inbox", lead: lim }), act, recents: { list: ["🛏️"], keep } }).ld.lx.cmp;
    expect(cmp.recents).toEqual(["🛏️"]);
    cmp.saveRecents(["😀", "🛏️"]);
    expect(keep).toHaveBeenCalledWith(["😀", "🛏️"]);
    expect(save).toHaveBeenCalledWith(["😀", "🛏️"]);
  });
});
