import { afterEach, describe, expect, it, vi } from "vitest";
import { openIrqPreview } from "./open-preview";

afterEach(() => vi.restoreAllMocks());

describe("Quote settings' Preview", () => {
  it("opens the same tab each time and brings it forward", () => {
    const focus = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue({ focus } as unknown as Window);
    expect(openIrqPreview("/member?page=quote&irqPreview=1")).toBe(true);
    expect(open).toHaveBeenCalledWith("/member?page=quote&irqPreview=1", "irq-preview");
    expect(focus).toHaveBeenCalledOnce();
  });

  it("says so when the browser blocks the tab", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(openIrqPreview("/member?page=quote&irqPreview=1")).toBe(false);
  });
});
