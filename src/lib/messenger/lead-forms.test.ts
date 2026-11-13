/**
 * Lead form ads (2026-10-30, the owner: "2种都做"): Meta's two payloads — a Messenger lead ad's referral with the
 * answers (or its "Lead summary" message) and an Instant Form's `leadgen` notice — read into the rows the ingest takes.
 * The payloads are Meta's own examples (developers.facebook.com, Lead Generation Ads in Messenger; Webhooks for leadgen).
 */
import { describe, expect, it } from "vitest";
import { parseMessengerDelivery, summaryAnswers } from "./webhook";
import { instantAdLink, instantLeadRow, messengerLeadRow, readInstantLead, withInstantAdLink } from "./lead-forms";

const PAGE = "102351059576534";
const page = (messaging: unknown[]) => ({ object: "page", entry: [{ id: PAGE, time: 1, messaging }] });

describe("a Messenger lead ad", () => {
  it("reads the referral's answers, complete or not, and does not take it for a message", () => {
    const d = parseMessengerDelivery(page([{ sender: { id: "5794982867201265" }, recipient: { id: PAGE }, timestamp: 1665424533,
      referral: { source: "ADS", type: "LEAD_COMPLETE", ad_id: "52621329088064", ads_context_data: { ad_title: "Skyline", post_id: "559217392549680" } },
      lead: { data: [{ question: "Are you interested?", answer: "Yes" }, { question: "Which area?", answer: "Cheras" }] } }]));
    expect(d.messages).toEqual([]);
    expect(d.leads).toHaveLength(1);
    expect(messengerLeadRow(d.leads![0])).toMatchObject({ kind: "messenger", pageId: PAGE, psid: "5794982867201265", complete: true,
      ad: { sourceId: "52621329088064", headline: "Skyline" }, answers: [{ q: "Are you interested?", a: "Yes" }, { q: "Which area?", a: "Cheras" }] });
    const half = parseMessengerDelivery(page([{ sender: { id: "1" }, timestamp: 1, referral: { source: "ADS", type: "LEAD_INCOMPLETE", ad_id: "9" } }]));
    expect(half.leads![0].complete).toBe(false);
  });
  it("reads the lead summary message as the answers, never as the customer's words", () => {
    const d = parseMessengerDelivery(page([{ sender: { id: "5794982867201265" }, recipient: { id: PAGE }, timestamp: 1661209328,
      message: { mid: "m_2OF0", text: "Lead summary:\nAre you interested in becoming a reseller?: Yes\nWhat city is your store located?: Menlo Park" },
      hop_context: { app_id: 498721317747541, metadata: "messenger_lead_gen_complete" } }]));
    expect(d.messages).toEqual([]);
    expect(d.leads![0].answers).toEqual([{ q: "Are you interested in becoming a reseller?", a: "Yes" }, { q: "What city is your store located?", a: "Menlo Park" }]);
    expect(summaryAnswers("Lead summary:\nTime: 10:30: soon")).toEqual([{ q: "Time: 10:30", a: "soon" }]);
  });
  it("a plain ad click (OPEN_THREAD) is still no lead", () => {
    const d = parseMessengerDelivery(page([{ sender: { id: "1" }, timestamp: 1, referral: { source: "ADS", type: "OPEN_THREAD", ad_id: "9" } }]));
    expect(d.leads).toBeUndefined();
  });
});

describe("an Instant Form lead", () => {
  const notice = { object: "page", entry: [{ id: Number(PAGE), time: 1438292065, changes: [{ field: "leadgen",
    value: { leadgen_id: 123123123123, page_id: Number(PAGE), form_id: 12312312312, adgroup_id: 1, ad_id: 52621329088064, created_time: 1440120384 } }] }] };
  it("takes the notice's lead id", () => {
    const d = parseMessengerDelivery(notice);
    expect(d.instant).toEqual([{ pageId: PAGE, leadId: "123123123123", formId: "12312312312", adId: "52621329088064", createdAt: new Date(1440120384000).toISOString() }]);
    expect(d.messages).toEqual([]);
  });
  it("picks out the phone and the name, and keeps every answer under a readable question", () => {
    const row = instantLeadRow(parseMessengerDelivery(notice).instant![0], { created_time: "2026-10-30T02:00:00+0000", field_data: [
      { name: "full_name", values: ["Joe Example"] }, { name: "phone_number", values: ["+60 12-345 6789"] }, { name: "unit_location", values: ["Mont Kiara"] }] });
    expect(row).toMatchObject({ kind: "instant", name: "Joe Example", phone: "+60 12-345 6789", waAccount: "1438056256053876",
      ad: { sourceId: "52621329088064" }, answers: [{ q: "Full name", a: "Joe Example" }, { q: "Phone number", a: "+60 12-345 6789" }, { q: "Unit location", a: "Mont Kiara" }] });
  });
  it("takes a form carrying inbox_url (every new Instant Form) without it, and finds a phone asked in a whole sentence", () => {
    const ref = parseMessengerDelivery(notice).instant![0];
    expect(instantLeadRow(ref, { field_data: [{ name: "full_name", values: ["A"] }, { name: "whatsapp_number", values: ["+60123456789"] },
      { name: "inbox_url", values: ["<test lead: dummy data for inbox_url>"] }] }))
      .toMatchObject({ kind: "instant", name: "A", phone: "+60123456789", answers: [{ q: "Full name", a: "A" }, { q: "Whatsapp number", a: "+60123456789" }] });
    expect(instantLeadRow(ref, { field_data: [{ name: "sounds_good,_{{user_first_name}}._what_is_the_best_phone_number_to_reach_you_on?", values: ["0123456789"] }] }))
      .toMatchObject({ phone: "0123456789" });
  });
  it("says why when Meta will not let it be read (no leads_retrieval)", async () => {
    const ref = parseMessengerDelivery(notice).instant![0];
    const refused = (async () => new Response(JSON.stringify({ error: { message: "(#200) Requires leads_retrieval permission" } }), { status: 403 })) as unknown as typeof fetch;
    expect(await readInstantLead(ref, "page-token", refused)).toEqual({ kind: "instant", pageId: PAGE, leadId: "123123123123", error: "(#200) Requires leads_retrieval permission" });
    expect(await readInstantLead(ref, null)).toMatchObject({ error: "no Page token" });
  });
});

// 2026-11-13, the owner: "为什么customer info又看不到新上的2支广告的链接了" — the two were Instant Form leads, which kept only
// the ad's id. The answers are Meta's for those two ads that day (system user's and Page's tokens).
describe("an Instant Form lead's ad link", () => {
  const meta = (answers: Record<string, unknown>) => (async (url: string | URL) => {
    const u = String(url);
    const key = Object.keys(answers).find(k => u.includes(k));
    return key ? new Response(JSON.stringify(answers[key]), { status: 200 }) : new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  const IMAGE = meta({ "52625308746464?fields=creative": { creative: { effective_object_story_id: "102351059576534_1022474350894993", object_type: "SHARE" } },
    "102351059576534_1022474350894993?fields=permalink_url": { permalink_url: "https://www.facebook.com/1022331100909318/posts/1022474350894993" } });
  const VIDEO = meta({ "52625304217664?fields=creative": { creative: { effective_object_story_id: "102351059576534_1022459437563151", object_type: "VIDEO", video_id: "2448042485687291" } },
    "102351059576534_1022459437563151?fields=permalink_url": { permalink_url: "https://www.facebook.com/reel/2448042485687291/" } });

  it("opens an image ad at <page>/posts/<post>, never its permalink", async () => {
    expect(await instantAdLink("52625308746464", "sys", "page", IMAGE)).toEqual({ sourceUrl: "https://www.facebook.com/102351059576534/posts/1022474350894993", media: "image" });
  });
  it("opens a video ad as its reel; without the Page's token, at the post", async () => {
    expect(await instantAdLink("52625304217664", "sys", "page", VIDEO)).toEqual({ sourceUrl: "https://www.facebook.com/reel/2448042485687291/", media: "video" });
    expect(await instantAdLink("52625304217664", "sys", null, VIDEO)).toEqual({ sourceUrl: "https://www.facebook.com/102351059576534/posts/1022459437563151", media: "video" });
  });
  it("gives nothing when Meta will not say, or there is no ad or token", async () => {
    expect(await instantAdLink("52625304217664", "sys", "page", meta({}))).toBeNull();
    expect(await instantAdLink(null, "sys", "page", IMAGE)).toBeNull();
    expect(await instantAdLink("52625308746464", undefined, "page", IMAGE)).toBeNull();
  });
  it("puts the link on the row, leaving an unreadable lead alone", async () => {
    const ref = { pageId: PAGE, leadId: "1014002851749611", formId: null, adId: "52625308746464", createdAt: "2026-11-13T11:16:00.000Z" };
    const row = instantLeadRow(ref, { field_data: [{ name: "whatsapp_number", values: ["+60123456789"] }] });
    expect(await withInstantAdLink(row, "sys", "page", IMAGE)).toMatchObject({ ad: { sourceId: "52625308746464", headline: null,
      sourceUrl: "https://www.facebook.com/102351059576534/posts/1022474350894993", media: "image" } });
    const err = { kind: "instant" as const, pageId: PAGE, leadId: "1", error: "no Page token" };
    expect(await withInstantAdLink(err, "sys", "page", IMAGE)).toBe(err);
  });
});
