/**
 * The owner, 2026-11-09: "客户发的 attachment 又看不到了". Ly Loong's message came from Messenger as its id alone, and Meta's
 * own API holds nothing for it — so it is named, never drawn as an empty bubble.
 */
import { describe, expect, it } from "vitest";
import { chatMessage } from "./crm-data";

const row = (p: Record<string, unknown>) => ({ id: "m1", contact_id: "c1", direction: "in", kind: "text", body: null, auto: false, sent_by: null, sent_at: "2026-11-09T02:06:55Z", ...p }) as never;

describe("a customer's message handed over empty", () => {
  it("is named, by its channel", () => {
    expect(chatMessage(row({}), "messenger").text).toMatch(/Messenger does not pass on/);
    expect(chatMessage(row({ body: "  " }), "whatsapp").text).toMatch(/WhatsApp does not pass on/);
  });
  it("leaves words, files and our own messages as they are", () => {
    expect(chatMessage(row({ body: "hi" }), "messenger").text).toBe("hi");
    expect(chatMessage(row({ kind: "image", media_url: "https://x" }), "messenger").text).toBe("");
    expect(chatMessage(row({ direction: "out" }), "messenger").text).toBe("");
  });
});
