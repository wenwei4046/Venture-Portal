import { afterEach, describe, expect, it, vi } from "vitest";
import { configureIrqStorage, irqStorage, preloadIrqStorage } from "./storage";
import { draftDiff } from "./useIrqBoot";

// IR Quote (2026-11-05): the prototype's localStorage, kept on the server.

describe("irqStorage", () => {
  afterEach(() => vi.useRealTimers());

  it("answers what the server handed it, at once", () => {
    preloadIrqStorage({ "irq.config.v1": '{"v":1}', "irq.preview.v1": null });
    expect(irqStorage.getItem("irq.config.v1")).toBe('{"v":1}');
    expect(irqStorage.getItem("irq.preview.v1")).toBeNull();
  });

  it("keeps a write in memory and sends it behind it — the draft once the typing pauses", async () => {
    vi.useFakeTimers();
    const sent: [string, string | null][] = [];
    configureIrqStorage(async (k, v) => { sent.push([k, v]); }, () => {});
    irqStorage.setItem("irq.preview.v1", "a", 600);
    irqStorage.setItem("irq.preview.v1", "b", 600);
    expect(irqStorage.getItem("irq.preview.v1")).toBe("b");
    expect(sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(600);
    expect(sent).toEqual([["irq.preview.v1", "b"]]);
  });

  it("sends what is still waiting when the page is left", () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    configureIrqStorage(async (k, v) => { sent.push(`${k}=${v}`); }, () => {});
    irqStorage.setItem("irq.preview.v1", "c", 600);
    irqStorage.flush();
    expect(sent).toEqual(["irq.preview.v1=c"]);
  });

  it("says when the server refused", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    configureIrqStorage(async () => { throw new Error("Only somebody who may edit the Product List may change the quotation settings."); }, onError);
    irqStorage.setItem("irq.config.v1", "{}");
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith("irq.config.v1", expect.any(Error));
  });
});

describe("draftDiff", () => {
  const kept = new Map([["d1", JSON.stringify({ id: "d1", total: 100 })], ["d2", JSON.stringify({ id: "d2", total: 200 })]]);

  it("sends a new draft and a changed one, nothing else", () => {
    const { put, drop } = draftDiff(kept, [{ id: "d1", total: 150 } as never, { id: "d2", total: 200 } as never, { id: "d3", total: 1 } as never]);
    expect(put.map(p => p.id)).toEqual(["d1", "d3"]);
    expect(drop).toEqual([]);
  });

  it("deletes a draft the list no longer has", () => {
    const { put, drop } = draftDiff(kept, [{ id: "d2", total: 200 } as never]);
    expect(put).toEqual([]);
    expect(drop).toEqual(["d1"]);
  });
});
