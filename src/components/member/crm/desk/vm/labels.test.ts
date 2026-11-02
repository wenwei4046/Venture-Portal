import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LABELS, type CrmLabel } from "@/lib/member/crm-data";
import type { DeskCtx } from "./ctx";
import { deskLabelsVM, labelsOn } from "./labels";

// Labels on the desktop (2026-11-02): one's own list, as the phone's Mine — saved the first time one is used.
const L = (id: string, name: string, color = "#BD4A19"): CrmLabel => ({ id, name, color });
const ctxOf = (labels: CrmLabel[], customerLabels: Record<string, string[]> = {}, ui: Record<string, unknown> = {}) => {
  const saved = labels.length ? labels : DEFAULT_LABELS.map((l, i) => L(`s${i}`, l.name, l.color));
  const act = {
    saveLabels: vi.fn(async (list: { name: string; color: string }[]) => list.map((l, i) => saved.find(s => s.name === l.name) ?? L(`n${i}`, l.name, l.color))),
    setLabel: vi.fn(async () => {}),
  };
  const patch = vi.fn();
  return { ctx: { ui, set: vi.fn(), patch, data: { labels, customerLabels }, act } as unknown as DeskCtx, act, patch };
};
const cust = { id: "c1" } as DeskCtx["data"]["customers"][number];

describe("desktop labels", () => {
  it("lists a customer's labels in the list's order", () => {
    expect(labelsOn({ labels: [L("a", "Hot"), L("b", "VIP")], customerLabels: { c1: ["b", "a"] } }, "c1").map(l => l.name)).toEqual(["Hot", "VIP"]);
  });
  it("starts on the phone's four, unsaved, and saves them the first time one is put on", async () => {
    const { ctx, act } = ctxOf([]);
    const v = deskLabelsVM(ctx, cust);
    expect(v.items.map(i => i.name)).toEqual(DEFAULT_LABELS.map(l => l.name));
    await v.items[1].toggle();
    expect(act.saveLabels).toHaveBeenCalledTimes(1);
    expect(act.setLabel).toHaveBeenCalledWith("c1", "s1", true);
  });
  it("ticks what the customer carries and takes it off", async () => {
    const { ctx, act } = ctxOf([L("a", "Hot"), L("b", "VIP")], { c1: ["b"] });
    const v = deskLabelsVM(ctx, cust);
    expect(v.items.map(i => i.on)).toEqual([false, true]);
    await v.items[1].toggle();
    expect(act.saveLabels).not.toHaveBeenCalled();
    expect(act.setLabel).toHaveBeenCalledWith("c1", "b", false);
  });
  it("adds a new label and puts it on; never a name already there", async () => {
    const { ctx, act, patch } = ctxOf([L("a", "Hot")], {}, { labNew: "  Condo " });
    const v = deskLabelsVM(ctx, cust);
    expect(v.canAdd).toBe(true);
    await v.add();
    expect(act.saveLabels).toHaveBeenCalledWith([{ id: "a", name: "Hot", color: "#BD4A19" }, { name: "Condo", color: expect.any(String) }]);
    expect(act.setLabel).toHaveBeenCalledWith("c1", "n1", true);
    expect(patch).toHaveBeenCalledWith({ labNew: "" });
    expect(deskLabelsVM(ctxOf([L("a", "Hot")], {}, { labNew: "hot" }).ctx, cust).canAdd).toBe(false);
  });
  it("deletes a label by saving the list without it", async () => {
    const { ctx, act } = ctxOf([L("a", "Hot"), L("b", "VIP")]);
    await deskLabelsVM(ctx, cust).items[0].remove();
    expect(act.saveLabels).toHaveBeenCalledWith([{ id: "b", name: "VIP", color: "#BD4A19" }]);
  });
});
