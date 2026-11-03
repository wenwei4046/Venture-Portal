/**
 * The owner, 2026-10-30: "我在msg 跑广告怎么都没显示出来？" — Insight was on Dream Crafter, so The Conts' leads were left out,
 * yet The Conts' ads (added from Meta, no lead in the brand) stood in the list with 0 leads. With a brand picked at the top,
 * an ad with no lead there is listed only when its Page is that brand's.
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { adsPerfVM } from "./adsperf";
import { inBrand } from "./insight";

const CONTS_PAGE = "102351059576534", DC_PAGE = "478652958664343";
const cust = (id: string, channel: "whatsapp" | "messenger", accountId: string, adId: string | null) => ({ id, name: id, phone: "", channel, accountId, adId, ad: adId ? "Skyline" : "", status: "new",
  assignedTo: null, teamId: null, createdAt: new Date(2026, 9, 29).toISOString(), lastCustomerAt: null, unread: 0, details: { type: "", size: "", loc: "", req: "", budget: "" }, messages: [] });
const data = {
  customers: [cust("a", "messenger", CONTS_PAGE, "AD-CONTS"), cust("b", "messenger", DC_PAGE, null)],
  adNames: { "AD-CONTS": { name: "Skyline", added: true, pageId: CONTS_PAGE }, "AD-DC": { name: "要住十年", added: true, pageId: DC_PAGE } },
  visits: [], events: [], adRules: [], can: { viewAll: true, manage: true, editAll: true },
} as unknown as CrmData;

function names(brand: string) {
  const ui: DeskUi = { ...initialDeskUi(), stage: "op", insSrc: brand };
  const ctx = { ui, data: inBrand(data, brand as never), now: new Date(2026, 9, 30), nameOf: (x: string) => x, act: {}, deskAct: {}, set: () => {}, patch: () => {} } as unknown as DeskCtx;
  return adsPerfVM(ctx).ap4.rows.map(r => r.name);
}

describe("Ads performance follows the brand picked at the top", () => {
  it("All: every ad", () => expect(names("all")).toEqual(expect.arrayContaining(["Skyline", "要住十年"])));
  it("Dream Crafter: no The Conts ad standing at 0", () => expect(names("dc")).not.toContain("Skyline"));
  it("The Conts: its Messenger ad with its lead", () => expect(names("conts")).toEqual(["Skyline"]));
});
