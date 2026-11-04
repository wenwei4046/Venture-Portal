/**
 * The owner, 2026-11-04, circling Customer info's "‹ Leads · all customers" over an Inbox chat: "点击后返回到聊天室".
 * Customer info opened from the chat goes back to that chat; opened from Leads, back to Leads.
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { clistVM } from "./insight";

const data = { customers: [], visits: [], events: [], adRules: [], adNames: {}, can: { viewAll: true, manage: true, editAll: true } } as unknown as CrmData;

function vmFor(ui: Partial<DeskUi>) {
  const patches: Partial<DeskUi>[] = [];
  const ctx = { ui: { ...initialDeskUi(), stage: "op", ...ui }, data, now: new Date(2026, 10, 4), nameOf: (x: string) => x,
    act: {}, deskAct: {}, set: () => {}, patch: (p: Partial<DeskUi>) => patches.push(p) } as unknown as DeskCtx;
  return { vm: clistVM(ctx), patches };
}

describe("Customer info's back", () => {
  it("opened from the chat: back to that chat", () => {
    const { vm, patches } = vmFor({ kind: "info", infoId: "kate", chat: "kate", infoFromChat: true });
    expect(vm.infoBack).toBe(true);
    expect(vm.infoBackLabel).toBe("Back to chat");
    vm.backToList();
    expect(patches[0]).toMatchObject({ kind: "chat", infoFromChat: false });
    expect(patches[0]).not.toHaveProperty("infoId");
  });
  it("opened from Leads: back to Leads", () => {
    const { vm, patches } = vmFor({ kind: "info", infoId: "kate", chat: "other", infoFromChat: false });
    expect(vm.infoBackLabel).toBe("Leads · all customers");
    vm.backToList();
    expect(patches[0]).toMatchObject({ kind: "clist", infoId: null });
  });
});
