import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A picked video in the editor, full screen as WhatsApp's (2026-10-17 — the owner, WhatsApp's editor beside ours: "Why
// is not full screen? Like this"; ours sat small under the trim bar with the browser's controls over it). The film
// strip is drawn by shared/film-strip.ts (tested there); here it hands its tiles at once.
const strip = vi.hoisted(() => ({ tiles: [] as string[] }));
vi.mock("./film-strip", async importOriginal => {
  const real = await importOriginal<typeof import("./film-strip")>();
  return {
    ...real,
    filmStrip: async (_url: string, n: number, tile: (i: number, src: string) => void) => {
      strip.tiles.slice(0, n).forEach((src, i) => tile(i, src));
      return strip.tiles.length >= n;
    },
  };
});

import { PickEditor } from "./pick-editor";
import { noEdits, type PhotoEdits } from "./edit-render";
import { pickVM, type Picked, type PickedItem } from "./pick";

const play = vi.fn(async () => undefined), pause = vi.fn();
let latest: Picked | null = null;
beforeEach(() => {
  strip.tiles = [];
  latest = null;
  play.mockClear(); pause.mockClear();
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1080 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 1920 });
  // The screen the editor fills: a phone's 412 × 800.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 412 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 800 });
  vi.stubGlobal("ResizeObserver", class { constructor(private cb: () => void) {} observe() { this.cb(); } disconnect() { /* nothing kept */ } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Editor({ item }: { item: Partial<PickedItem> }) {
  const [p, setP] = useState<Picked | null>({ hd: false, at: 0, caption: "", items: [{ file: new File(["v".repeat(1000)], "VID_1.mp4", { type: "video/mp4" }), url: "blob:video-1", video: true, ...item }] });
  const pk = pickVM(p, n => { latest = n; setP(n); }, async () => undefined);
  return pk ? <PickEditor pk={pk} /> : null;
}
const videoEl = () => document.querySelector<HTMLVideoElement>("[data-editor-video]")!;
/** The stand-in video's clock and whether it plays, as the browser would report them. */
function clockOn(v: HTMLVideoElement, at = 0) {
  const s = { t: at, paused: true };
  Object.defineProperty(v, "currentTime", { configurable: true, get: () => s.t, set: (x: number) => { s.t = x; } });
  Object.defineProperty(v, "paused", { configurable: true, get: () => s.paused });
  return s;
}

describe("a picked video in the editor", () => {
  it("fills the screen at its middle, with no browser controls over it", () => {
    render(<Editor item={{ seconds: 10 }} />);
    const v = videoEl();
    expect(v.hasAttribute("controls")).toBe(false);
    expect(v.style.position).toBe("absolute");
    expect(v.style.width).toBe("100%");
    expect(v.style.height).toBe("100%");
    expect(v.style.objectFit).toBe("contain");
    expect(v.style.maxHeight).toBe("");
    expect((v.parentElement as HTMLElement).style.paddingTop).toBe("");
  });

  it("plays at a tap of Play and pauses at a tap on the video; Play shows only while it is paused", () => {
    render(<Editor item={{ seconds: 10 }} />);
    const v = videoEl(), s = clockOn(v);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
    s.paused = false;
    fireEvent.play(v);
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    fireEvent.click(v);
    expect(pause).toHaveBeenCalledTimes(1);
    s.paused = true;
    fireEvent.pause(v);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("plays the kept part from its start, and loops back there at its end", () => {
    render(<Editor item={{ seconds: 10, cut: { start: 2, end: 6, mute: false } }} />);
    const v = videoEl(), s = clockOn(v, 8);
    fireEvent.click(v);
    expect(s.t).toBe(2);
    s.paused = false;
    s.t = 6.3;
    fireEvent.timeUpdate(v);
    expect(s.t).toBe(2);
    expect((document.querySelector("[data-play-line]") as HTMLElement).style.left).toBe("20%");
  });

  it("draws its trim bar as a film strip of the video's frames", async () => {
    strip.tiles = Array.from({ length: 10 }, (_, i) => `data:image/jpeg;tile=${i}`);
    render(<Editor item={{ seconds: 10 }} />);
    await act(async () => { await Promise.resolve(); });
    const imgs = [...document.querySelectorAll<HTMLImageElement>("[data-trim-bar] img")];
    expect(imgs.map(i => i.getAttribute("src"))).toEqual(strip.tiles);
  });

  it("reads a WebM the phone recorded to its end for its length, then shows the kept part's first picture", async () => {
    render(<Editor item={{}} />);
    const v = videoEl(), s = clockOn(v);
    let length = Infinity;
    Object.defineProperty(v, "duration", { configurable: true, get: () => length });
    fireEvent.loadedMetadata(v);
    expect(s.t).toBe(1e101);
    length = 3.2;
    await act(async () => { v.dispatchEvent(new Event("durationchange")); await Promise.resolve(); });
    expect(latest?.items[0]).toMatchObject({ seconds: 3.2, cut: { start: 0, end: 3.2, mute: false } });
    expect(s.t).toBe(0.001);
  });

  it("pauses on a trim handle and shows the frame where it is let go", () => {
    render(<Editor item={{ seconds: 10 }} />);
    const v = videoEl(), s = clockOn(v), bar = document.querySelector<HTMLElement>("[data-trim-bar]")!;
    bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 48, right: 400, bottom: 48, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(bar.querySelector<HTMLElement>("[data-trim-handle='end']")!, { pointerId: 1 });
    fireEvent.pointerMove(bar, { pointerId: 1, clientX: 200 });
    expect(pause).toHaveBeenCalled();
    expect(s.t).toBe(5);
    expect(latest?.items[0].cut).toEqual({ start: 0, end: 5, mute: false });
  });

  it("shows what was drawn over the picture where the picture stands", () => {
    const edits: PhotoEdits = { ...noEdits(), labels: [{ id: "t", kind: "text", text: "Hi", color: "#FFFFFF", x: 0.5, y: 0.5, size: 0.1 }] };
    render(<Editor item={{ seconds: 10, edits }} />);
    fireEvent.loadedMetadata(videoEl());
    const over = screen.getByText("Hi").parentElement as HTMLElement;
    // 1080 × 1920 contained in 412 × 800: 412 × 732, 34 px from the top.
    expect([over.style.left, over.style.top, over.style.width, over.style.height]).toEqual(["0px", "34px", "412px", "732px"]);
  });
});
