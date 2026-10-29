/**
 * The owner's list of 2026-10-29: Insight by brand, Ads Performance's set-up kept, a drag that passes a neighbour only past
 * its middle, and showroom remarks in bold.
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import { boldRuns, wrapBold } from "../shared/bold-text";
import { pastMiddle } from "./vm/adsperf";
import { inBrand } from "./vm/insight";
import { readPrefs } from "./nav";

describe("Insight by brand", () => {
  const d = {
    customers: [{ id: "a", channel: "whatsapp", accountId: "1438056256053876" }, { id: "b", channel: "messenger", accountId: "478652958664343" }],
    visits: [{ id: "v1", customerId: "a" }, { id: "v2", customerId: "b" }], events: [{ id: 1, customerId: "b" }],
  } as unknown as CrmData;
  it("all keeps everything; a brand keeps its customers and their visits and journey", () => {
    expect(inBrand(d, "all")).toBe(d);
    const conts = inBrand(d, "conts"), dc = inBrand(d, "dc");
    expect([conts.customers.map(c => c.id), conts.visits.map(v => v.id), conts.events.length]).toEqual([["a"], ["v1"], 0]);
    expect([dc.customers.map(c => c.id), dc.visits.map(v => v.id), dc.events.length]).toEqual([["b"], ["v2"], 1]);
  });
});

describe("Ads Performance's set-up is kept", () => {
  it("reads only the keys it keeps", () => {
    expect(readPrefs(JSON.stringify({ apSel: ["spend", "leads"], apW: { name: 300 }, tab: "inbox", insSrc: "dc" }))).toEqual({ apSel: ["spend", "leads"], apW: { name: 300 }, insSrc: "dc" });
    expect(readPrefs("not json")).toEqual({});
    expect(readPrefs(null)).toEqual({});
  });
});

describe("a drag passes a neighbour past its middle", () => {
  const box = { getBoundingClientRect: () => ({ left: 100, top: 0, width: 100, height: 20 }) };
  it("moving right: only past the middle; moving left: only before it", () => {
    expect(pastMiddle(0, 1, { clientX: 120, currentTarget: box }, "x")).toBe(false);
    expect(pastMiddle(0, 1, { clientX: 160, currentTarget: box }, "x")).toBe(true);
    expect(pastMiddle(2, 1, { clientX: 160, currentTarget: box }, "x")).toBe(false);
    expect(pastMiddle(2, 1, { clientX: 120, currentTarget: box }, "x")).toBe(true);
    expect(pastMiddle(1, 1, { clientX: 120, currentTarget: box }, "x")).toBe(false);
    expect(pastMiddle(null, 1, { clientX: 120, currentTarget: box }, "x")).toBe(false);
  });
});

describe("showroom remarks in bold", () => {
  it("B wraps the words picked, and again takes it off", () => {
    const w = wrapBold("Park at B2 lift", 8, 10);
    expect(w).toEqual({ value: "Park at **B2** lift", start: 10, end: 12 });
    expect(wrapBold(w.value, w.start, w.end).value).toBe("Park at B2 lift");
  });
  it("draws **words** bold and leaves the rest", () => {
    const out = boldRuns("Park at **B2** lift, **open") as { type: unknown; props: { children: unknown } }[];
    expect(out.filter(x => x.type === "b").map(x => x.props.children)).toEqual(["B2"]);
  });
});
