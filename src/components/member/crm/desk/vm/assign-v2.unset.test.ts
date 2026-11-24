/**
 * Ad split's "Not set up" is the split alone (2026-11-24 — the owner: DC's four ads split 75 / 25 but never named read
 * "Not set up", "4 not set up"; "Yes, change it"). A missing name says "Not named yet" on its row, as the phone's list does.
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { assignPageVM } from "./assign";
import { assignV2VM } from "./assign-v2";
import { DIRECTOR_SPLIT_KEY } from "./tokens";

const customer = (id: string, adId: string, ad = adId) => ({ id, name: id, phone: "", channel: "whatsapp", adId, ad, adHeadline: "Dream Crafter Design", status: "new",
  assignedTo: null, teamId: null, createdAt: new Date(2026, 10, 23).toISOString(), lastCustomerAt: null, unread: 0,
  details: { type: "", size: "", loc: "", req: "", budget: "" }, messages: [] });

const rule = (adId: string) => ({ adId, label: adId, mode: "split" as const, pm: "pct" as const, pp: {}, startedAt: "2026-11-24T00:00:00Z",
  split: { tlA: 75, tlB: 25, [DIRECTOR_SPLIT_KEY]: 0 }, tm: { tlA: "pct" as const, tlB: "pct" as const, [DIRECTOR_SPLIT_KEY]: "pct" as const } });

function list(adRules: CrmData["adRules"], adNames: CrmData["adNames"]) {
  let ui: DeskUi = { ...initialDeskUi(), stage: "op", adSt: "all" };
  const data = {
    customers: [customer("c1", "AD1"), customer("c2", "AD2", "Named ad"), customer("c3", "AD3", "No split")],
    adRules, events: [], ftRules: [], visits: [], adNames, can: { viewAll: true, manage: true, editAll: true },
  } as unknown as CrmData;
  const ctx = {
    ui, data, now: new Date(2026, 10, 24), nameOf: (id: string) => id, act: {}, deskAct: {}, hist: [],
    teams: [{ id: "tlA", name: "Team A", people: [{ id: "a1", name: "ANN" }] }, { id: "tlB", name: "Team B", people: [{ id: "b1", name: "BEN" }] }],
    directors: [{ id: "d1", name: "PETER" }],
    set: (f: (u: DeskUi) => DeskUi) => { ui = f(ui); }, patch: (p: Partial<DeskUi>) => { ui = { ...ui, ...p }; },
  } as unknown as DeskCtx;
  const as = assignPageVM(ctx, "Ads to teams");
  return assignV2VM(ctx, "Ads to teams", as, { sheetW: 360, isAdsOp: true, isFtOp: false, isMwtOp: false, sheetMode: false, perfW: 320 }).adList4;
}

describe("Ad split: Not set up is the split alone", () => {
  // AD1 split, no name (DC's case) · AD2 split and named · AD3 named, no split.
  const names = { AD2: { name: "Named ad", source: "manual" }, AD3: { name: "No split", source: "manual" } } as unknown as CrmData["adNames"];
  const l = list([rule("AD1"), rule("AD2")], names);
  const row = (name: string) => l.rows.find(r => r.name === name)!;

  it("an ad split but never named is set up, and still says Not named yet", () => {
    const unnamed = l.rows.find(r => r.nameless)!;
    expect(unnamed.name).toBe("Not named yet");
    expect(unnamed.set).toBe(true);
  });
  it("a named ad with no split is not set up; a named, split one is", () => {
    expect(row("No split").set).toBe(false);
    expect(row("Named ad").set).toBe(true);
  });
  it("the head counts only the ads with no split", () => {
    expect(l.unsetN).toBe(1);
  });
});
