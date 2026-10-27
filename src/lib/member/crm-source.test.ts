import { describe, expect, it } from "vitest";
import { adPageInSource, inSource, sourceOf } from "./crm-source";

const wa = (accountId: string | null) => ({ channel: "whatsapp" as const, accountId });
const ms = (accountId: string | null) => ({ channel: "messenger" as const, accountId });

describe("where an enquiry came from (2026-10-27)", () => {
  it("names the brand by the number or Page written to", () => {
    expect(sourceOf(wa("1438056256053876")).label).toBe("The Conts · WhatsApp");
    expect(sourceOf(ms("102351059576534")).label).toBe("The Conts · Messenger");
    expect(sourceOf(wa("1422533724269131")).label).toBe("DC · WhatsApp");
    expect(sourceOf(ms("478652958664343")).label).toBe("DC · Messenger");
    expect(sourceOf(wa(null)).label).toBe("WhatsApp");
  });
  it("filters by brand or by brand and channel", () => {
    expect(inSource(wa("1422533724269131"), "dc")).toBe(true);
    expect(inSource(wa("1422533724269131"), "dc:messenger")).toBe(false);
    expect(inSource(ms("102351059576534"), "conts:messenger")).toBe(true);
    expect(inSource(wa(null), "conts")).toBe(false);
    expect(inSource(wa(null), "all")).toBe(true);
  });
  it("places an ad with no lead by its Page", () => {
    expect(adPageInSource("478652958664343", "dc:whatsapp")).toBe(true);
    expect(adPageInSource("478652958664343", "conts")).toBe(false);
    expect(adPageInSource(null, "dc")).toBe(false);
  });
});
