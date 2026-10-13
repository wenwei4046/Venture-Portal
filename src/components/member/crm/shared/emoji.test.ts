import { describe, expect, it } from "vitest";
import { CHAT_EMOJIS, withEmoji } from "./emoji";

describe("the emoji sheet", () => {
  it("adds an emoji at the end of the reply, a space after a word", () => {
    expect(withEmoji("", "👍")).toBe("👍");
    expect(withEmoji("Thanks", "🙏")).toBe("Thanks 🙏");
    expect(withEmoji("Thanks ", "🙏")).toBe("Thanks 🙏");
    expect(withEmoji("👍", "👍")).toBe("👍👍");
  });
  it("offers a full sheet of them, each once", () => {
    expect(CHAT_EMOJIS.length).toBe(64);
    expect(new Set(CHAT_EMOJIS).size).toBe(CHAT_EMOJIS.length);
  });
});
