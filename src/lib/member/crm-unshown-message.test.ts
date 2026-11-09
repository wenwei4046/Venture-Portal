/**
 * The owner, 2026-11-09: Ly Loong's empty 10:06 "这个是客户打了 miss call 进来，可以一摸一样显示在 crm 中，业务能打回去". A
 * Messenger message handed over with nothing in it is a call: drawn as a missed call with Call back. On WhatsApp such a
 * message is named.
 */
import { describe, expect, it } from "vitest";
import { chatMessage } from "./crm-data";
import { mediaOf, mediaWord } from "@/components/member/crm/shared/chat-media";

const row = (p: Record<string, unknown>) => ({ id: "m1", contact_id: "c1", direction: "in", kind: "text", body: null, auto: false, sent_by: null, sent_at: "2026-11-09T02:06:55Z", ...p }) as never;
const who = { page: "102351059576534", psid: "28466574649687436", phone: "012-345 6789" };

describe("a customer's message handed over empty", () => {
  it("on Messenger is a missed call, with Call back to the conversation and their phone", () => {
    const m = chatMessage(row({}), "messenger", who);
    expect(m.text).toBe("");
    expect(m.call?.thread).toBe("https://business.facebook.com/latest/inbox/all?asset_id=102351059576534&mailbox_id=102351059576534&selected_item_id=28466574649687436&thread_type=FB_MESSAGE");
    expect(m.call?.phone).toBe("012-345 6789");
    expect(mediaOf(m, []).call).toEqual(m.call);
    expect(mediaWord(m)).toBe("📞 Missed call");
  });
  it("on WhatsApp is named", () => {
    expect(chatMessage(row({ body: "  " }), "whatsapp", who).text).toMatch(/WhatsApp does not pass on/);
    expect(chatMessage(row({ body: "  " }), "whatsapp", who).call).toBeUndefined();
  });
  it("leaves words, files and our own messages as they are", () => {
    expect(chatMessage(row({ body: "hi" }), "messenger", who).text).toBe("hi");
    expect(chatMessage(row({ kind: "image", media_url: "https://x" }), "messenger", who).call).toBeUndefined();
    expect(chatMessage(row({ direction: "out" }), "messenger", who).call).toBeUndefined();
  });
});
