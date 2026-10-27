import { describe, expect, it } from "vitest";
import { chatMessage, type CrmMessageRowX } from "./crm-data";
import { parseDelivery } from "../whatsapp/webhook";

// A customer's document sent with words (the owner, 2026-10-27: "when customer send document, then attach with typing. it
// can view all"): the card is named by the file, the words are the message, shown in full under it.
const row = (extra: Partial<CrmMessageRowX>) => ({ id: "m1", contact_id: "c1", direction: "in", kind: "document", body: null, media_id: "x",
  media_mime: "application/pdf", status: "received", error: null, auto: false, sent_by: null, sent_at: "2026-10-26T03:09:45Z", ...extra }) as CrmMessageRowX;

describe("a document's own name beside its caption", () => {
  it("names the card by the file and keeps the caption as the words", () => {
    const m = chatMessage(row({ body: "I am still not fully clear on the refurbishment…", media_name: "SA-GRR.docx" }));
    expect(m.media?.name).toBe("SA-GRR.docx");
    expect(m.text).toBe("I am still not fully clear on the refurbishment…");
  });
  it("a document with no caption has no words, and WhatsApp's lone ￼ is none", () => {
    expect(chatMessage(row({ body: "RA.pdf", media_name: "RA.pdf" })).text).toBe("");
    expect(chatMessage(row({ body: "￼", media_name: "BALCONY.pdf" })).text).toBe("");
  });
  it("one kept before names were (no media_name) reads as before", () => {
    const m = chatMessage(row({ body: "RA _1_.pdf" }));
    expect([m.media?.name, m.text]).toEqual(["RA _1_.pdf", "RA _1_.pdf"]);
  });
  it("the webhook hands each document's filename apart", () => {
    const d = parseDelivery({ entry: [{ changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "p" }, contacts: [{ wa_id: "60", profile: { name: "J" } }],
      messages: [{ id: "wamid.1", from: "60", timestamp: "1", type: "document", document: { id: "d", caption: "Please read", filename: "SA-GRR.docx" } },
        { id: "wamid.2", from: "60", timestamp: "1", type: "text", text: { body: "hi" } }] } }] }] });
    expect(d.names).toEqual([{ id: "wamid.1", name: "SA-GRR.docx" }]);
    expect(d.messages[0].body).toBe("Please read");
  });
});
