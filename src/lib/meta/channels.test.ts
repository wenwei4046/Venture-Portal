/** Channels (CRM Desktop v2, README › 7): what Meta answers, read into words, and what we send it. */
import { describe, expect, it } from "vitest";
import { hoursBody, limitWords, messengerProfileBody, parseHours, parseMessengerProfile, parsePage, parseWaNumbers, parseWaProfile, postJson, qualityWords, templateBody } from "./channels";

describe("reading Meta", () => {
  it("a Page", () => {
    expect(parsePage({ name: "HOUZS Venture", followers_count: 12400, emails: ["a@b.my"], picture: { data: { url: "https://x/p.jpg" } } }, "1"))
      .toMatchObject({ id: "1", name: "HOUZS Venture", followers: 12400, email: "a@b.my", picture: "https://x/p.jpg", hours: null });
    expect(parsePage(null, "1")).toBeNull();
    expect(parsePage({ error: {} }, "1")).toBeNull();
  });
  it("the Messenger profile, both ice breaker shapes", () => {
    const p = parseMessengerProfile({ data: [{ greeting: [{ locale: "default", text: "Hi" }], ice_breakers: [{ call_to_actions: [{ question: "Price?" }] }, { question: "Where?" }],
      persistent_menu: [{ locale: "default", call_to_actions: [{ title: "Site", type: "web_url" }, { title: "Talk", type: "postback" }] }] }] });
    expect(p).toEqual({ greeting: "Hi", ice: ["Price?", "Where?"], menu: [{ title: "Site", type: "Link" }, { title: "Talk", type: "Reply" }] });
    expect(parseMessengerProfile({ data: [] })).toEqual({ greeting: "", ice: [], menu: [] });
    expect(parseMessengerProfile(null)).toBeNull();
  });
  it("WhatsApp numbers and profile", () => {
    expect(parseWaNumbers({ data: [{ id: 9, display_phone_number: "+60 12-345 6789", verified_name: "HOUZS", quality_rating: "GREEN", messaging_limit_tier: "TIER_1K" }] }))
      .toEqual([{ id: "9", number: "+60 12-345 6789", verifiedName: "HOUZS", quality: "GREEN", limit: "TIER_1K", nameStatus: "" }]);
    expect(parseWaProfile({ data: [{ about: "Hi", websites: ["https://h.my"], vertical: "RETAIL" }] })).toMatchObject({ about: "Hi", websites: ["https://h.my"], vertical: "RETAIL" });
    expect(parseWaProfile({ data: [] })).toBeNull();
    expect(qualityWords("GREEN")).toBe("High");
    expect(limitWords("TIER_1K")).toBe("1,000 / day");
    expect(limitWords("")).toBe("—");
  });
  it("opening hours both ways", () => {
    const days = parseHours({ mon_1_open: "10:00", mon_1_close: "21:00" });
    expect(days[0]).toEqual({ open: true, from: "10:00", to: "21:00" });
    expect(days[6].open).toBe(false);
    expect(hoursBody(days)).toEqual({ mon_1_open: "10:00", mon_1_close: "21:00" });
  });
});

describe("writing to Meta", () => {
  it("the Messenger profile keeps Meta's limits: 4 ice breakers, 5 menu items, 160 / 80 / 30 letters", () => {
    const b = messengerProfileBody({ greeting: "x".repeat(200), ice: ["a", " ", "b", "c", "d", "e"], menu: Array.from({ length: 7 }, (_, i) => ({ title: `Item ${i}`, type: "Reply" })) });
    expect(b.greeting[0].text).toHaveLength(160);
    expect(b.ice_breakers[0].call_to_actions.map(c => c.question)).toEqual(["a", "b", "c", "d"]);
    expect(b.persistent_menu[0].call_to_actions).toHaveLength(5);
  });
  it("a template names its placeholders with examples", () => {
    const t = templateBody({ name: "promo", category: "Marketing", language: "Bahasa Melayu", body: "Hi {{1}}, see {{2}}" });
    expect(t).toMatchObject({ name: "promo", category: "MARKETING", language: "ms" });
    expect(t.components[0].example?.body_text[0]).toEqual(["Aisyah", "example 2"]);
  });
  it("a refusal comes back in Meta's own words, and the token only in the header", async () => {
    let seen: RequestInit | undefined;
    const f = (async (_u: string, init?: RequestInit) => { seen = init; return new Response(JSON.stringify({ error: { message: "Invalid parameter" } }), { status: 400 }); }) as typeof fetch;
    const r = await postJson("https://graph.facebook.com/x", "SECRET", { a: 1 }, f);
    expect(r).toEqual({ ok: false, error: "Meta refused: Invalid parameter" });
    expect(String(seen?.body)).not.toContain("SECRET");
    expect((seen?.headers as Record<string, string>).Authorization).toBe("Bearer SECRET");
  });
});
