/**
 * The desktop chat's reply box keeps a message's lines (2026-11-10, the owner: "改，保留换行"). It was a single-line
 * input, which turns every pasted line break into a space — the ad copy sent that day reached the customer as one block.
 * Now a textarea: the draft goes out exactly as typed or pasted, Enter sends, Shift+Enter breaks a line, and an Enter
 * that only picks a word in a Chinese input method sends nothing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import type { DeskCtx } from "./ctx";
import { initialDeskUi } from "./ctx";
import { chatVM } from "./chat";

const NOW = new Date(2026, 10, 10, 15, 0);
const COPY = "还在考虑装修后要怎么出租？\n\n交给 The Conts，一站式帮你搞定！\n\n✅ 装修 + 出租\n✅ 家具家电配套";

function vmWith(draft: string) {
  const c = { id: "c1", name: "Ahmad Faiz", channel: "whatsapp", lastCustomerAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
    messages: [{ id: "m1", from: "them", text: "Hi", at: new Date(NOW.getTime() - 3_600_000).toISOString(), status: "read" }] };
  const data = { customers: [c], prefs: {}, hiddenMessages: [], starredMessages: [], quickReplies: [], recentEmoji: [], messengerBlocked: [],
    visits: [], events: [], autoReplies: { welcome: { text: "" }, after: { text: "" }, kws: [] }, settings: {} } as unknown as CrmData;
  const send = vi.fn(async () => true);
  const ctx = { ui: { ...initialDeskUi(), draft: { c1: draft } }, data, now: NOW, me: { id: "me", name: "Peter" }, nameOf: (x: string) => x,
    act: { send, loadTemplates: vi.fn(async () => []) }, deskAct: {}, set: () => {}, patch: () => {} } as unknown as DeskCtx;
  return { vm: chatVM(ctx, "c1"), send };
}
const key = (over: Record<string, unknown> = {}) => ({ key: "Enter", shiftKey: false, preventDefault: vi.fn(), ...over });

describe("the desktop reply box keeps its lines", () => {
  it("sends a pasted multi-line message with every line break", () => {
    const { vm, send } = vmWith(COPY);
    vm.draftKey(key());
    expect(send).toHaveBeenCalledWith("c1", COPY, null);
  });
  it("Shift+Enter breaks a line and sends nothing", () => {
    const { vm, send } = vmWith("line one");
    const e = key({ shiftKey: true });
    vm.draftKey(e);
    expect(send).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
  it("an Enter that picks a word in a Chinese input method sends nothing", () => {
    for (const nativeEvent of [{ isComposing: true }, { keyCode: 229 }]) {
      const { vm, send } = vmWith("zhuang");
      vm.draftKey(key({ nativeEvent }));
      expect(send).not.toHaveBeenCalled();
    }
  });
  it("the generated composer is a textarea, not a single-line input", () => {
    const src = readFileSync(join(__dirname, "..", "DeskApp.tsx"), "utf8");
    expect(src).toMatch(/<textarea data-draft="1" data-desk-draft="1" rows=\{1\}/);
    expect(src).not.toMatch(/<input data-draft="1" value=\{v\.draft\}[^>]*placeholder="Message"/);
  });
});
