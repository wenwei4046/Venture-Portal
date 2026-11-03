/**
 * The owner, 2026-10-30: a reply past Messenger's 24-hour window showed "Not sent" — "真的完全不显示。过后等 human agent
 * 好了之后再恢复". Hidden until HUMAN_AGENT_APPROVED; any other refusal still says so.
 */
import { describe, expect, it } from "vitest";
import { quietFailure } from "./chat";

const PAST = "More than 24 hours since the customer’s last message — Messenger does not allow a reply now.";
describe("a reply past the 24-hour window says nothing", () => {
  it("hidden until Human Agent is approved", () => {
    expect(quietFailure("failed", PAST, false)).toBe(true);
    expect(quietFailure("failed", PAST, true)).toBe(false);
  });
  it("another refusal, or a message that went, is not hidden", () => {
    expect(quietFailure("failed", "131053 Media upload error", false)).toBe(false);
    expect(quietFailure("failed", null, false)).toBe(false);
    expect(quietFailure("read", PAST, false)).toBe(false);
  });
});
