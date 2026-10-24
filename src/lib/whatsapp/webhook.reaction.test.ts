import { describe, expect, it } from "vitest";
import { parseDelivery } from "./webhook";

// A customer's 👌 on one of ours came in as a message of type "reaction" and was kept as an empty bubble (2026-10-24).
describe("a customer's reaction", () => {
  const delivery = (messages: unknown[]) => ({ entry: [{ changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "1438056256053876" }, contacts: [{ wa_id: "60123", profile: { name: "Jayden" } }], messages } }] }] });
  it("is set on the message it reacts to, not kept as a message", () => {
    const d = parseDelivery(delivery([{ id: "wamid.R", from: "60123", timestamp: "1792841526", type: "reaction", reaction: { emoji: "👌", message_id: "wamid.OURS" } }]));
    expect(d.messages).toEqual([]);
    expect(d.reactions).toEqual([{ target: "wamid.OURS", emoji: "👌" }]);
  });
  it("taken off is an empty emoji", () => {
    expect(parseDelivery(delivery([{ id: "wamid.R2", from: "60123", type: "reaction", reaction: { message_id: "wamid.OURS" } }])).reactions).toEqual([{ target: "wamid.OURS", emoji: "" }]);
  });
  it("a text still goes as a message", () => {
    const d = parseDelivery(delivery([{ id: "wamid.T", from: "60123", type: "text", text: { body: "ok" } }]));
    expect(d.messages.map(m => m.body)).toEqual(["ok"]);
    expect(d.reactions).toEqual([]);
  });
});
