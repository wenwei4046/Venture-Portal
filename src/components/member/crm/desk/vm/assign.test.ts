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

function harness(rule: CrmData["adRules"][number] | null, opts: { act?: Record<string, unknown>; rules?: CrmData["adRules"]; adNames?: CrmData["adNames"] } = {}) {
  let ui: DeskUi = { ...initialDeskUi(), stage: "op" };
  const data = {
    customers: [{ id: "c1", name: "Kenny", phone: "", channel: "whatsapp", adId: "AD1", ad: "Video Ads-15/10", status: "new", assignedTo: null, teamId: null,
      createdAt: new Date(2026, 9, 15).toISOString(), lastCustomerAt: null, unread: 0, details: { type: "", size: "", loc: "", req: "", budget: "" }, messages: [] }],
    adRules: opts.rules ?? (rule ? [rule] : []), events: [], ftRules: [], visits: [], adNames: opts.adNames ?? [], can: { viewAll: true, manage: true, editAll: true },
  } as unknown as CrmData;
  const ctx = () => ({
    ui, data, now: new Date(2026, 9, 16), nameOf: (id: string) => id, act: opts.act ?? {}, deskAct: {},
    teams: [{ id: "tlA", name: "Team A", people: [{ id: "a1", name: "ANN" }] }, { id: "tlB", name: "Team B", people: [{ id: "b1", name: "BEN" }] }],
    directors: [{ id: "d1", name: "PETER" }],
    set: (f: (u: DeskUi) => DeskUi) => { ui = f(ui); }, patch: (p: Partial<DeskUi>) => { ui = { ...ui, ...p }; },
  }) as unknown as DeskCtx;
  return { vm: () => assignPageVM(ctx(), "Ads to teams"), ui: () => ui };
}

/** Lets the save's promise and its .then run. */
const flush = () => new Promise(r => setTimeout(r, 0));

const directorAll = { adId: "AD1", label: "Video Ads-15/10", mode: "split" as const, pm: "pct" as const, pp: { d1: 100 }, startedAt: "2026-10-16T00:00:00Z",
  split: { tlA: 0, tlB: 0, [DIRECTOR_SPLIT_KEY]: 100 }, tm: { tlA: "pct" as const, tlB: "pct" as const, [DIRECTOR_SPLIT_KEY]: "pct" as const } };

describe("opening an ad loads its saved split", () => {
  it("opened by id (the first ad when Ads to teams opens, or needs attention): Revenue Director 100%, not 25% each", () => {
    const h = harness(directorAll);
    h.vm().openAdById("AD1");
    expect(h.ui().ad).toBe("AD1");
    const split = h.vm().adSplit.map(r => [r.name, r.pct]);
    // The Revenue Director first, above the teams (the owner, 2026-10-16).
    expect(split).toEqual([["Revenue Director", 100], ["Team A", 0], ["Team B", 0]]);
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
  // The owner's screenshot, 2026-10-24: after a refresh the open ad came back (it is part of the place) without its draft, so
  // the editor drew 17 · 17 · 17 · 17 · 16 · 16 — and Save would have written it.
  it("an ad a refresh or Back brought back loads its saved split again, and only the numbers change", () => {
    const h = harness(directorAll);
    h.vm().openAdById("AD1");
    const placed = { ...initialDeskUi(), stage: "op" as const, tab: h.ui().tab, ad: "AD1" }; // what withSavedPlace lays over a fresh desk
    Object.assign(h.ui(), placed, { adDraftFor: undefined, split: null });
    expect(h.vm().adSplit.find(r => r.name === "Revenue Director")?.pct).not.toBe(100);
    const v = h.vm();
    expect(v.adDraftWant).toBe("AD1|rule");
    expect(h.ui().adDraftFor).not.toBe(v.adDraftWant); // what DeskScreens checks before reloading
    v.reloadAdDraft("AD1");
    expect(h.ui().adDraftFor).toBe("AD1|rule");
    expect(h.vm().adSplit.find(r => r.name === "Revenue Director")?.pct).toBe(100);
    expect(h.ui().stage).toBe("op");
  });
});

// "Save and apply to all" means calculate together (the owner, 2026-10-24) — one crm_save_ads_together for every ad listed.
describe("Save and apply to all", () => {
  const split = { adId: "AD1", label: "Video Ads-15/10", mode: "split" as const, pm: "pct" as const, pp: { a1: 100, b1: 100 }, startedAt: "2026-10-16T00:00:00Z",
    split: { tlA: 60, tlB: 40, [DIRECTOR_SPLIT_KEY]: 0 }, tm: { tlA: "pct" as const, tlB: "pct" as const, [DIRECTOR_SPLIT_KEY]: "pct" as const }, together: true };
  it("is the button's words, and saves this setting on every ad in the list — whatever status the list shows — counted together", async () => {
    const calls: unknown[][] = [];
    const act = { saveAdsTogether: async (...a: unknown[]) => { calls.push(a); return { saved: 2, dealt: 0 }; } };
    // AD2: added before its first lead (crm_add_ad) and never running — the Running filter hides it, the save does not.
    const h = harness(split, { act, adNames: { AD2: { name: "Second", source: "manual", added: true, status: "PAUSED", statusAt: "2026-10-16T00:00:00Z" } } as unknown as CrmData["adNames"] });
    h.vm().openAdById("AD1");
    Object.assign(h.ui(), { adSt: "Running" });
    const v = h.vm();
    expect(v.applyLabel).toBe("Save and apply to all");
    v.applyAll();
    await flush();
    expect(calls).toHaveLength(1);
    const [ads, rule] = calls[0] as [{ id: string }[], { mode: string; split: Record<string, number> }];
    expect(ads.map(a => a.id).sort()).toEqual(["AD1", "AD2"]);
    expect(rule.mode).toBe("split");
    expect(rule.split.tlA).toBe(60);
    expect(h.ui().toast).toBe("Applied to all 2 ads · counted together");
  });
  it("Save on its own: a together ad saved with a change says it now counts on its own", async () => {
    const act = { saveAdRule: async () => ({ dealt: 0, together: false }) };
    const h = harness(split, { act });
    h.vm().openAdById("AD1");
    h.vm().saveAd();
    await flush();
    expect(h.ui().toast).toBe("Saved · Video Ads-15/10 · counted on its own");
  });
});
