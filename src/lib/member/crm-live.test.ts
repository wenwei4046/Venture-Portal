import { describe, expect, it } from "vitest";
import {
  configFromRows, crmFromRows, leadFromRow, membersFromPeople, messageFromRow,
  type CrmContactRow, type CrmMessageRow, type CrmRows,
} from "./crm-live";

const contact = (extra: Partial<CrmContactRow> = {}): CrmContactRow => ({
  id: "c1", channel: "whatsapp", account_id: "PN1", external_id: "60123", name: "Tan Mei Ling", phone: "+60123",
  ad_source_id: "AD9", ad_headline: "Akemi Fair", status: "new", lost_reason: null, lost_note: null,
  previous_status: null, assigned_to: "ann", team_id: "tla", unread: 2, created_at: "2026-10-02T01:00:00Z", ...extra,
});
const message = (extra: Partial<CrmMessageRow> = {}): CrmMessageRow => ({
  id: "m1", contact_id: "c1", direction: "in", kind: "text", body: "Hi", auto: false, sent_by: null, sent_at: "2026-10-02T01:00:00Z", ...extra,
});

describe("a customer from the database", () => {
  it("keeps who, which ad, the team and what is unread", () => {
    const lead = leadFromRow(contact(), []);
    expect(lead).toMatchObject({ id: "c1", name: "Tan Mei Ling", phone: "+60123", adName: "Akemi Fair", pageName: "WhatsApp", status: "new", assignedTo: "ann", teamId: "tla", unread: 2 });
  });

  it("falls back to the number, then the ad id, when WhatsApp sends no name or headline", () => {
    expect(leadFromRow(contact({ name: " ", ad_headline: null }), []).name).toBe("+60123");
    expect(leadFromRow(contact({ ad_headline: null }), []).adName).toBe("Ad AD9");
    expect(leadFromRow(contact({ ad_headline: null, ad_source_id: null }), []).adName).toBe("WhatsApp enquiry");
  });

  it("has no team and no salesperson while it waits for the Boss or HOD", () => {
    const lead = leadFromRow(contact({ assigned_to: null, team_id: null }), []);
    expect("assignedTo" in lead || "teamId" in lead).toBe(false);
  });

  it("reads Lost with its reason, and an unknown reason as Other with the note", () => {
    expect(leadFromRow(contact({ status: "lost", lost_reason: "too_expensive" }), []).lost).toEqual({ reason: "too_expensive" });
    expect(leadFromRow(contact({ status: "lost", lost_reason: "moved", lost_note: "Moving overseas" }), []).lost).toEqual({ reason: "other", note: "Moving overseas" });
    expect(leadFromRow(contact({ status: "follow_up", lost_reason: "too_expensive", previous_status: "lost" }), []))
      .toMatchObject({ status: "follow_up", previous: { status: "lost" } });
  });

  it("carries only its own messages, oldest first", () => {
    const lead = leadFromRow(contact(), [
      message({ id: "b", sent_at: "2026-10-02T03:00:00Z" }), message({ id: "x", contact_id: "other" }), message({ id: "a", sent_at: "2026-10-02T02:00:00Z" }),
    ]);
    expect(lead.messages.map(m => m.id)).toEqual(["a", "b"]);
  });
});

describe("a message from the database", () => {
  it("is the customer's when it came in, ours when it went out", () => {
    expect(messageFromRow(message(), "ann")).toMatchObject({ from: "lead", text: "Hi" });
    expect(messageFromRow(message({ direction: "out", sent_by: "ann" }), "ann")).toEqual({ id: "m1", from: "me", text: "Hi", at: "2026-10-02T01:00:00Z" });
  });

  it("says who replied when it was not the customer's own salesperson", () => {
    expect(messageFromRow(message({ direction: "out", sent_by: "tla" }), "ann").by).toBe("tla");
    expect(messageFromRow(message({ direction: "out", sent_by: null, auto: true }), "ann")).toMatchObject({ auto: true });
    expect(messageFromRow(message({ direction: "out", sent_by: null, auto: true }), "ann").by).toBeUndefined();
  });

  it("shows a customer's photo, voice or document through our own route — never Meta's address", () => {
    expect(messageFromRow(message({ kind: "image", body: "This colour?", media_id: "123456" }), null)).toMatchObject({
      text: "This colour?", attachment: { kind: "image", url: "/member/crm-media/m1" },
    });
    expect(messageFromRow(message({ kind: "audio", body: null, media_id: "123456" }), null).attachment).toEqual({ kind: "audio", url: "/member/crm-media/m1" });
    expect(messageFromRow(message({ kind: "document", body: "quote.pdf", media_id: "123456" }), null).attachment).toEqual({ kind: "file", url: "/member/crm-media/m1", name: "quote.pdf" });
  });

  it("names media it cannot show yet, with the caption", () => {
    expect(messageFromRow(message({ kind: "image", body: null }), null).text).toBe("📷 Photo");
    expect(messageFromRow(message({ kind: "image", body: "This colour?" }), null).text).toBe("📷 Photo · This colour?");
  });
});

describe("the people and the settings", () => {
  const people = [
    { id: "tla", name: "Kelvin Lee", role: "tl" as const, uplineId: "hod", fullTime: false },
    { id: "taa", name: "Farah Aziz", role: "ta" as const, uplineId: "tla", fullTime: false },
    { id: "ann", name: "Ann", role: "rs" as const, uplineId: "taa", fullTime: true },
  ];

  it("starts the line at the viewer: an upline they cannot see is left out", () => {
    const members = membersFromPeople(people);
    expect(members.find(m => m.id === "tla")).toEqual({ id: "tla", name: "Kelvin Lee", role: "tl", teamName: "Kelvin's team" });
    expect(members.find(m => m.id === "ann")).toEqual({ id: "ann", name: "Ann", role: "rs", uplineId: "taa", fullTime: true });
  });

  it("reads the team settings and the ad rules", () => {
    const config = configFromRows(
      [{ ad_source_id: "AD1", ad_label: "Sofa Clearance", tl_ids: ["tla"] }, { ad_source_id: "AD2", ad_label: null, tl_ids: [] },
        { ad_source_id: "AD3", ad_label: null, tl_ids: ["tla", "tlb"], shares: { tla: 70, tlb: 30 } }],
      [{ tl_id: "tla", team_share: 60, percent_days: [1, 2, 9], weekend_full_time: false, ratios: { ann: 100 }, edited_by: "hod", edited_at: "2026-10-02T05:00:00Z" }],
    );
    expect(config).toEqual({
      rules: [{ adId: "AD1", adName: "Sofa Clearance", tlIds: ["tla"] }, { adId: "AD3", adName: "Ad AD3", tlIds: ["tla", "tlb"], shares: { tla: 70, tlb: 30 } }],
      // A day that is not Mon–Thu is dropped.
      teams: { tla: { percentDays: [1, 2], weekendFullTime: false, ratios: { ann: 100 }, editedBy: { memberId: "hod", at: "2026-10-02T05:00:00Z" } } },
    });
  });

  it("has no viewer when the person has no CRM role", () => {
    const rows: CrmRows = { people: { me: "zed", role: null, people: [] }, contacts: [], messages: [], appointments: [], rules: [], teams: [], showrooms: [] };
    expect(crmFromRows(rows)).toMatchObject({ viewerId: null, setup: "no_role" });
    expect(crmFromRows({ ...rows, people: { me: null, role: null, people: [] } })).toMatchObject({ viewerId: null, setup: "not_linked" });
    expect(crmFromRows({ ...rows, people: { me: "ann", role: "rs", people } })).toMatchObject({ viewerId: "ann", setup: null });
  });

  it("lists the showrooms in the list's order, closed ones kept", () => {
    const rows: CrmRows = { people: { me: "ann", role: "rs", people: [] }, contacts: [], messages: [], appointments: [], rules: [], teams: [],
      showrooms: [{ id: "x", name: "Penang Showroom", active: false, sort_order: 2 }, { id: "kl", name: "Kuala Lumpur Showroom", active: true, sort_order: 1 }] };
    expect(crmFromRows(rows).showrooms).toEqual([{ id: "kl", name: "Kuala Lumpur Showroom", active: true }, { id: "x", name: "Penang Showroom", active: false }]);
  });
});
