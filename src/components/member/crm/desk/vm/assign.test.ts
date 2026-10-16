/**
 * Ads to teams: opening an ad by ANY way — its card, "needs attention", or the first ad opened when the page opens —
 * loads its SAVED split (the owner, 2026-10-16: Revenue Director set to 100% came back as 25% each, because the
 * automatic first-ad open set only the ad and the editor drew the default split).
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { assignPageVM } from "./assign";
import { DIRECTOR_SPLIT_KEY } from "./tokens";

function harness(rule: CrmData["adRules"][number] | null) {
  let ui: DeskUi = { ...initialDeskUi(), stage: "op" };
  const data = {
    customers: [{ id: "c1", name: "Kenny", phone: "", channel: "whatsapp", adId: "AD1", ad: "Video Ads-15/10", status: "new", assignedTo: null, teamId: null,
      createdAt: new Date(2026, 9, 15).toISOString(), lastCustomerAt: null, unread: 0, details: { type: "", size: "", loc: "", req: "", budget: "" }, messages: [] }],
    adRules: rule ? [rule] : [], events: [], ftRules: [], visits: [], adNames: [], can: { viewAll: true, manage: true, editAll: true },
  } as unknown as CrmData;
  const ctx = () => ({
    ui, data, now: new Date(2026, 9, 16), nameOf: (id: string) => id, act: {}, deskAct: {},
    teams: [{ id: "tlA", name: "Team A", people: [{ id: "a1", name: "ANN" }] }, { id: "tlB", name: "Team B", people: [{ id: "b1", name: "BEN" }] }],
    directors: [{ id: "d1", name: "PETER" }],
    set: (f: (u: DeskUi) => DeskUi) => { ui = f(ui); }, patch: (p: Partial<DeskUi>) => { ui = { ...ui, ...p }; },
  }) as unknown as DeskCtx;
  return { vm: () => assignPageVM(ctx(), "Ads to teams"), ui: () => ui };
}

const directorAll = { adId: "AD1", label: "Video Ads-15/10", mode: "split" as const, pm: "pct" as const, pp: { d1: 100 }, startedAt: "2026-10-16T00:00:00Z",
  split: { tlA: 0, tlB: 0, [DIRECTOR_SPLIT_KEY]: 100 }, tm: { tlA: "pct" as const, tlB: "pct" as const, [DIRECTOR_SPLIT_KEY]: "pct" as const } };

describe("opening an ad loads its saved split", () => {
  it("opened by id (the first ad when Ads to teams opens, or needs attention): Revenue Director 100%, not 25% each", () => {
    const h = harness(directorAll);
    h.vm().openAdById("AD1");
    expect(h.ui().ad).toBe("AD1");
    const split = h.vm().adSplit.map(r => [r.name, r.pct]);
    expect(split).toEqual([["Team A", 0], ["Team B", 0], ["Revenue Director", 100]]);
  });
  it("its card opens the same way", () => {
    const h = harness(directorAll);
    h.vm().adCards[0].open();
    expect(h.vm().adSplit.find(r => r.name === "Revenue Director")?.pct).toBe(100);
  });
  it("an ad with no rule opens on the default, evenly", () => {
    const h = harness(null);
    h.vm().openAdById("AD1");
    expect(h.ui().adMode).toBe("team");
    expect(h.vm().adSplit.map(r => r.pct).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(99);
  });
});
