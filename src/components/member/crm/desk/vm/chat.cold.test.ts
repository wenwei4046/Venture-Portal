/**
 * CRM v4 notes/09 and 11 on the desktop chat: the + menu's fifth row is Auto replies again (one's saved replies, as before
 * 2026-10-29 — Suggest reply is gone), Cold template in its place past WhatsApp's window; and in that window-shut case the
 * warning row stands over the composer, Send is grey and sends nothing, the draft is kept.
 */
import { describe, expect, it, vi } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { chatVM } from "./chat";

const NOW = new Date(2026, 10, 10, 12, 0);
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const customer = (channel: "whatsapp" | "messenger", lastH: number) => ({
  id: "c1", name: "Ahmad Faiz", channel, lastCustomerAt: hoursAgo(lastH),
  messages: [{ id: "m1", from: "them", text: "How much for delivery?", at: hoursAgo(lastH), status: "read" }],
});

function vmFor(c: ReturnType<typeof customer>, over: Partial<CrmData> = {}, ui: Partial<DeskUi> = {}) {
  const data = {
    customers: [c], prefs: {}, hiddenMessages: [], starredMessages: [], quickReplies: [], recentEmoji: [], messengerBlocked: [], visits: [], events: [],
    autoReplies: { welcome: { text: "Hi! Thanks for reaching out." }, after: { text: "" }, kws: [] }, settings: { suggestTemplate: true }, ...over,
  } as unknown as CrmData;
  const send = vi.fn(async () => true), loadTemplates = vi.fn(async () => []);
  const ctx = { ui: { ...initialDeskUi(), draft: { c1: "Ok I can arrange delivery on Saturday" }, ...ui }, data, now: NOW, me: { id: "me", name: "Peter" }, nameOf: (x: string) => x,
    act: { send, loadTemplates, sendTemplate: vi.fn() }, deskAct: {}, set: () => {}, patch: () => {} } as unknown as DeskCtx;
  return { vm: chatVM(ctx, "c1"), send, loadTemplates };
}

describe("the desktop chat past WhatsApp's window (notes/11)", () => {
  it("shows the warning row with the first name, a grey Send that sends nothing, the draft kept", () => {
    const { vm, send } = vmFor(customer("whatsapp", 30));
    expect(vm.waShut).toBe(true);
    expect(vm.warnText).toBe("WhatsApp won’t deliver this. After 24 h only a template reaches Ahmad.");
    expect(vm.warnBtn).toBe(true);
    expect(vm.sendBg).toBe("var(--crm-faint-2)");
    expect(vm.sendCls).toBeUndefined();
    vm.send();
    vm.draftKey({ key: "Enter", shiftKey: false, preventDefault: () => {} });
    expect(send).not.toHaveBeenCalled();
    expect(vm.draft).toBe("Ok I can arrange delivery on Saturday");
    expect(vm.chatPadB).toBe("20px 28px 168px");
    expect(vm.replyBottom).toBe("144px");
  });
  it("its Template button opens the templates", async () => {
    const { vm, loadTemplates } = vmFor(customer("whatsapp", 30));
    vm.openTpl();
    await Promise.resolve();
    expect(loadTemplates).toHaveBeenCalledOnce();
  });
  it("Suggest a template off: the row without its button, and no Cold template in the + menu", () => {
    const { vm } = vmFor(customer("whatsapp", 30), { settings: { suggestTemplate: false } } as Partial<CrmData>);
    expect(vm.waShut).toBe(true);
    expect(vm.warnBtn).toBe(false);
    expect(vm.attachOpts.map(o => o.label)).toEqual(["Camera", "Photos", "Document", "Quick replies", "Auto replies"]);
  });
  it("inside the window, and on Messenger, nothing changes", () => {
    for (const c of [customer("whatsapp", 2), customer("messenger", 30)]) {
      const { vm, send } = vmFor(c);
      expect(vm.waShut).toBe(false);
      expect(vm.sendBg).toBe("var(--crm-rust)");
      vm.send();
      expect(send).toHaveBeenCalledOnce();
    }
  });
});

describe("the desktop + menu (notes/09)", () => {
  it("is Auto replies inside the window, listing one's saved replies — no Suggest reply", () => {
    const { vm } = vmFor(customer("whatsapp", 2));
    expect(vm.attachOpts.map(o => o.label)).toEqual(["Camera", "Photos", "Document", "Quick replies", "Auto replies"]);
    const auto = vmFor(customer("whatsapp", 2), {}, { attachOpen: true, attachView: "auto" }).vm;
    expect(auto.attachOpts.map(o => o.label)).toEqual(["Back", "Welcome"]);
  });
  it("is Cold template past WhatsApp's window", () => {
    const { vm } = vmFor(customer("whatsapp", 30));
    expect(vm.attachOpts[4].label).toBe("Cold template");
    expect(vm.attachOpts[4].bg).toBe("var(--crm-rust)");
  });
});

describe("the desktop chat on Messenger past 7 days (the owner, 2026-11-10)", () => {
  it("the warning row in Messenger's words, no Template button, no Cold template, Send grey", () => {
    const { vm, send } = vmFor(customer("messenger", 8 * 24));
    expect(vm.waShut).toBe(true);
    expect(vm.warnText).toBe("Messenger won’t deliver this. After 7 days only a new message from Ahmad reopens the chat.");
    expect(vm.warnBtn).toBe(false);
    expect(vm.attachOpts.map(o => o.label)).not.toContain("Cold template");
    vm.send();
    expect(send).not.toHaveBeenCalled();
  });
});
