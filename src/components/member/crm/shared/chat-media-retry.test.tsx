/** A chat's photo that could not be fetched tries again by itself, with no broken-picture icon (the owner, 2026-10-15). */
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatImg, RETRY_MS, retrySrc } from "./chat-media-parts";

vi.mock("./media-cache", () => ({ useKeptSrc: (src: string) => ({ src, kept: false }), keepImage: () => {}, keepPoster: () => {} }));

afterEach(() => vi.useRealTimers());

describe("retrySrc", () => {
  it("asks our own route afresh, never a local copy", () => {
    expect(retrySrc("/member/crm-media/1", 0)).toBe("/member/crm-media/1");
    expect(retrySrc("/member/crm-media/1", 2)).toBe("/member/crm-media/1?r=2");
    expect(retrySrc("/member/crm-media/1?x=1", 1)).toBe("/member/crm-media/1?x=1&r=1");
    expect(retrySrc("blob:http://x/abc", 3)).toBe("blob:http://x/abc");
  });
});

describe("ChatImg", () => {
  it("hides a failed photo and asks again after a moment", () => {
    vi.useFakeTimers();
    const { container } = render(<ChatImg src="/member/crm-media/9" />);
    const img = () => container.querySelector("img")!;
    expect(img().getAttribute("src")).toBe("/member/crm-media/9");
    fireEvent.error(img());
    expect(img().style.visibility).toBe("hidden");
    expect(img().getAttribute("alt")).toBe("");
    act(() => { vi.advanceTimersByTime(RETRY_MS[0]); });
    expect(img().getAttribute("src")).toBe("/member/crm-media/9?r=1");
    fireEvent.load(img());
    expect(img().style.visibility).toBe("");
    expect(img().getAttribute("alt")).toBe("Photo");
  });
});
