/** A chat's photo that could not be fetched tries again by itself, with no broken-picture icon (the owner, 2026-10-15). */
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatImg, ChatVideo, RETRY_MS, retrySrc } from "./chat-media-parts";

// Nothing kept on the phone: a photo is drawn from its address, a video has no picture kept.
vi.mock("./media-cache", () => ({ useKeptSrc: (src: string, poster?: boolean) => ({ src: poster ? null : src, kept: false }), keepImage: () => {}, keepPoster: () => {} }));

afterEach(() => vi.useRealTimers());

describe("retrySrc", () => {
  it("asks our own route afresh, never a local copy", () => {
    expect(retrySrc("/member/crm-media/1", 0)).toBe("/member/crm-media/1");
    expect(retrySrc("/member/crm-media/1", 2)).toBe("/member/crm-media/1?r=2");
    expect(retrySrc("/member/crm-media/1?x=1", 1)).toBe("/member/crm-media/1?x=1&r=1");
    expect(retrySrc("blob:http://x/abc", 3)).toBe("blob:http://x/abc");
  });

  it("puts the try's number before a video's #t= (after it, it was part of the fragment and never asked)", () => {
    expect(retrySrc("/member/crm-media/1#t=0.1", 2)).toBe("/member/crm-media/1?r=2#t=0.1");
    expect(retrySrc("/member/crm-media/1?x=1#t=0.1", 1)).toBe("/member/crm-media/1?x=1&r=1#t=0.1");
  });
});

// 2026-10-17 — the owner, on an iPhone: "all video after send, before press in the video play, is show black view".
describe("ChatVideo", () => {
  it("with no picture kept, still at its start once its length is known, is asked for a moment in — an iPhone draws it", () => {
    const { container } = render(<ChatVideo src="blob:http://x/sent" base="blob:http://x/sent" />);
    const v = container.querySelector("video")!;
    let t = 0;
    Object.defineProperty(v, "currentTime", { configurable: true, get: () => t, set: (x: number) => { t = x; } });
    Object.defineProperty(v, "duration", { configurable: true, get: () => 4.2 });
    fireEvent.loadedMetadata(v);
    expect(t).toBe(0.1);
  });

  it("one already a moment in (its #t= taken) is left where it is", () => {
    const { container } = render(<ChatVideo src="/member/crm-media/5#t=0.1" base="/member/crm-media/5" />);
    const v = container.querySelector("video")!;
    let t = 0.1;
    Object.defineProperty(v, "currentTime", { configurable: true, get: () => t, set: (x: number) => { t = x + 100; } });
    Object.defineProperty(v, "duration", { configurable: true, get: () => 4.2 });
    fireEvent.loadedMetadata(v);
    expect(t).toBe(0.1);
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
