/**
 * Lead form ads (2026-10-30, the owner: "2种都做"): Meta's two payloads — a Messenger lead ad's referral with the
 * answers (or its "Lead summary" message) and an Instant Form's `leadgen` notice — read into the rows the ingest takes.
 * The payloads are Meta's own examples (developers.facebook.com, Lead Generation Ads in Messenger; Webhooks for leadgen).
 */
import { describe, expect, it } from "vitest";
import { parseMessengerDelivery, summaryAnswers } from "./webhook";
import { instantLeadRow, messengerLeadRow, readInstantLead } from "./lead-forms";

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
  it("leaves a Messenger lead ad's lead (inbox_url) to its chat, and finds a phone asked in a whole sentence", () => {
    const ref = parseMessengerDelivery(notice).instant![0];
    expect(instantLeadRow(ref, { field_data: [{ name: "inbox_url", values: ["https://business.facebook.com/x"] }, { name: "full_name", values: ["A"] }] }))
      .toMatchObject({ error: "from a Messenger lead ad — taken by its chat" });
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
