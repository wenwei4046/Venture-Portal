import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filmStrip, lengthOf } from "./film-strip";

// The trim bar's film strip, as WhatsApp's (2026-10-17 — the owner, WhatsApp's editor beside ours: "Why is not full
// screen? Like this"). A video stands in as the browser hands one to a page: loaded, then each seek landing a moment
// later — its picture shown only then (`shown`), the last seek clearing `seeking` — and a WebM a phone recorded telling
// its length only once read to its end.
class FakeVideo extends EventTarget {
  muted = false; playsInline = false; preload = ""; seeking = false;
  videoWidth = 1080; videoHeight = 1920;
  duration: number;
  seeks: number[] = [];
  shown = 0;
  private t = 0;
  private id = 0;
  constructor(private real: number, known: boolean, private opts: { fail?: boolean; staleSeek?: boolean } = {}) {
    super();
    this.duration = known ? real : Infinity;
  }
  set src(_: string) { setTimeout(() => this.dispatchEvent(new Event(this.opts.fail ? "error" : "loadeddata")), 0); }
  get currentTime() { return this.t; }
  set currentTime(v: number) {
    const id = ++this.id, past = v > this.real;
    this.seeks.push(v); this.seeking = true; this.t = Math.min(v, this.real);
    const land = () => { this.shown = Math.min(v, this.real); if (id === this.id) this.seeking = false; this.dispatchEvent(new Event("seeked")); };
    if (past && !Number.isFinite(this.duration)) {
      setTimeout(() => { this.duration = this.real; this.dispatchEvent(new Event("durationchange")); }, 0);
      // The read-through's own seek lands late, while the strip's first seek is still on its way.
      setTimeout(land, this.opts.staleSeek ? 5 : 0);
      return;
    }
    setTimeout(land, this.opts.staleSeek ? 10 : 0);
  }
  removeAttribute() { /* the stand-in loads nothing */ }
  load() { /* the stand-in loads nothing */ }
}

let video: FakeVideo;
let drawn: number[];
beforeEach(() => {
  drawn = [];
  const make = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag === "video") return video as unknown as HTMLVideoElement;
    if (tag === "canvas") {
      return {
        width: 0, height: 0,
        getContext: () => ({ drawImage: (v: FakeVideo) => drawn.push(v.shown) }),
        toDataURL: (type: string) => `data:${type};frame=${drawn[drawn.length - 1]}`,
      } as unknown as HTMLCanvasElement;
    }
    return make(tag);
  }) as typeof document.createElement);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const strip = async (n: number, stopAfter = Infinity) => {
  const tiles: Array<[number, string]> = [];
  const ok = await filmStrip("blob:video", n, (i, src) => tiles.push([i, src]), () => tiles.length >= stopAfter);
  return { ok, tiles };
};

describe("the film strip", () => {
  it("draws one frame from the middle of each share of the video, in order, as small JPEGs", async () => {
    video = new FakeVideo(10, true);
    const { ok, tiles } = await strip(4);
    expect(ok).toBe(true);
    expect(drawn).toEqual([1.25, 3.75, 6.25, 8.75]);
    expect(tiles.map(([i]) => i)).toEqual([0, 1, 2, 3]);
    expect(tiles[2][1]).toBe("data:image/jpeg;frame=6.25");
    expect(video.muted).toBe(true);
  });

  it("reads a WebM the phone recorded to its end for its length first (Chrome's recorder writes none)", async () => {
    video = new FakeVideo(8, false);
    const { ok } = await strip(2);
    expect(ok).toBe(true);
    expect(video.seeks[0]).toBe(1e101);
    expect(drawn).toEqual([2, 6]);
  });

  it("takes no picture from a seek that is not the last one asked for", async () => {
    video = new FakeVideo(8, false, { staleSeek: true });
    const { ok } = await strip(2);
    expect(ok).toBe(true);
    expect(drawn).toEqual([2, 6]);
  });

  it("stops when the editor no longer wants it", async () => {
    video = new FakeVideo(10, true);
    const { ok, tiles } = await strip(4, 1);
    expect(ok).toBe(false);
    expect(tiles).toHaveLength(1);
    expect(video.seeks).toHaveLength(1);
  });

  it("gives no strip for a video the browser cannot read", async () => {
    video = new FakeVideo(10, true, { fail: true });
    const { ok, tiles } = await strip(4);
    expect(ok).toBe(false);
    expect(tiles).toEqual([]);
  });
});

describe("a video's length", () => {
  it("is the video's own when it knows it, with no seek", async () => {
    video = new FakeVideo(12.5, true);
    await expect(lengthOf(video as unknown as HTMLVideoElement)).resolves.toBe(12.5);
    expect(video.seeks).toEqual([]);
  });

  it("is 0 when the browser never tells it", async () => {
    vi.useFakeTimers();
    const silent = { duration: Infinity, currentTime: 0, addEventListener() { /* never told */ }, removeEventListener() { /* nothing kept */ } };
    const told = lengthOf(silent as unknown as HTMLVideoElement);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(told).resolves.toBe(0);
  });
});
