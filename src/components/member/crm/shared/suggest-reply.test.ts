/** Suggested replies without AI (2026-10-29): the closest past answers, a visit or a sale first, the name put in. */
import { describe, expect, it } from "vitest";
import type { CrmChatMessage } from "@/lib/member/crm-data";
import { closeness, suggestReplies, waitingWords, wordsOf } from "./suggest-reply";

const msg = (from: "lead" | "me", text: string, auto = false): CrmChatMessage => ({ id: Math.random().toString(36), from, kind: "text", text, at: "2026-10-29T01:00:00Z", ...(auto ? { auto: true } : {}) });
const chat = (...m: CrmChatMessage[]) => ({ name: "Wah Leong", messages: m });

const EXAMPLES = [
  { q: "Setup 要多少钱？", a: "Hi {name}，我们的全包配套从 RM 9,999 起，请问你的单位是几房？", appt: true },
  { q: "价格多少", a: "Hi {name}，价格要看单位大小哦" },
  { q: "可以帮我出租吗", a: "可以的 {name}，我们有长租和短租方案" },
  { q: "Never mind", a: "OK no problem" },
];

describe("suggestReplies", () => {
  it("answers a price question with the past price answers, the one that booked a visit first, the name put in", () => {
    const s = suggestReplies(chat(msg("me", "Hello!", true), msg("lead", "几钱？配套")), EXAMPLES);
    expect(s[0].text).toBe("Hi Wah，我们的全包配套从 RM 9,999 起，请问你的单位是几房？");
    expect(s[0].why).toMatch(/booked a visit/);
    expect(s.map(x => x.text)).toContain("Hi Wah，价格要看单位大小哦");
    expect(s.some(x => x.text.includes("出租"))).toBe(false);
  });
  it("offers nothing once we have answered, and a quick reply that matches", () => {
    expect(suggestReplies(chat(msg("lead", "price?"), msg("me", "RM 9,999")), EXAMPLES)).toEqual([]);
    const s = suggestReplies(chat(msg("lead", "can rent out?")), [], [{ id: "1", shortcut: "rent", message: "Yes {name}, we rent it out for you" }]);
    expect(s).toEqual([{ text: "Yes Wah, we rent it out for you", why: "Quick reply /rent" }]);
  });
  it("reads the customer's words since our last reply, auto-replies skipped", () => {
    expect(waitingWords(chat(msg("me", "Hi"), msg("lead", "A"), msg("me", "auto", true), msg("lead", "B")))).toBe("A\nB");
  });
  it("gathers the many ways of asking a price into one topic", () => {
    expect(closeness(wordsOf("多少钱"), wordsOf("how much is it"))).toBeGreaterThan(0.25);
  });
});
