import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A video's sound is made AAC on the way out (2026-10-17): the app's own camera records WebM with Opus sound where the
// phone makes no MP4 (shared/in-app-camera.tsx), and WhatsApp plays AAC alone. mediabunny stands in here: what matters
// is what each conversion is asked for.
const mb = vi.hoisted(() => {
  const state = { video: { codec: "avc", rotation: 0, displayWidth: 1080, displayHeight: 1920 } as Record<string, unknown>, sound: { codec: "aac" } as Record<string, unknown> | null, format: "MP4", aac: true, inits: [] as Record<string, unknown>[] };
  class Input {
    async getPrimaryVideoTrack() { return state.video; }
    async getPrimaryAudioTrack() { return state.sound; }
    async getFormat() { return { name: state.format }; }
    async computeDuration() { return 10; }
  }
  class BufferTarget { buffer: ArrayBuffer | null = new ArrayBuffer(16); }
  class Output { target: BufferTarget; constructor(o: { target: BufferTarget }) { this.target = o.target; } }
  const Conversion = {
    init: async (opts: Record<string, unknown>) => {
      state.inits.push(opts);
      return { isValid: true, utilizedTracks: [{ type: "video" }], discardedTracks: [], execute: async () => undefined, onProgress: undefined };
    },
  };
  return {
    state,
    module: {
      Input, BufferTarget, Output, Conversion, BlobSource: class {}, Mp4OutputFormat: class {}, Quality: class { constructor(public o: unknown) {} },
      ALL_FORMATS: [], canEncodeAudio: async (codec: string) => codec === "aac" && state.aac,
    },
  };
});
vi.mock("mediabunny", () => mb.module);

import { fitVideo } from "./video-fit";

const MB = 1024 * 1024;
const file = (type: string) => new File([new Uint8Array(2 * MB)], type.includes("mp4") ? "VID_1.mp4" : "VID_1.webm", { type });
beforeEach(() => {
  Object.assign(mb.state, { video: { codec: "avc", rotation: 0, displayWidth: 1080, displayHeight: 1920 }, sound: { codec: "aac" }, format: "MP4", aac: true, inits: [] });
  vi.stubGlobal("VideoEncoder", class {});
  vi.stubGlobal("VideoDecoder", class {});
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("the sound of a video sent to WhatsApp", () => {
  it("an MP4 of H.264 and AAC that fits goes as it is", async () => {
    const f = file("video/mp4");
    const r = await fitVideo(f, 16 * MB, "WhatsApp");
    expect(r).toEqual({ ok: true, file: f });
    expect(mb.state.inits).toEqual([]);
  });

  it("an MP4 of H.264 with Opus sound is copied with its sound made AAC", async () => {
    mb.state.sound = { codec: "opus" };
    const r = await fitVideo(file("video/mp4"), 16 * MB, "WhatsApp");
    expect(r.ok).toBe(true);
    expect(mb.state.inits).toHaveLength(1);
    expect(mb.state.inits[0].audio).toEqual({ codec: "aac", bitrate: 160_000 });
    expect(mb.state.inits[0].video).toBeUndefined();
  });

  it("the camera's WebM (VP8 and Opus) is encoded again: H.264 picture, AAC sound", async () => {
    Object.assign(mb.state, { video: { codec: "vp8", rotation: 0, displayWidth: 1080, displayHeight: 1920 }, sound: { codec: "opus" }, format: "WebM" });
    const r = await fitVideo(file("video/webm"), 16 * MB, "WhatsApp");
    expect(r.ok).toBe(true);
    const last = mb.state.inits.at(-1)!;
    expect(last.audio).toEqual({ codec: "aac", bitrate: 160_000 });
    expect(last.video).toMatchObject({ codec: "avc", forceTranscode: true });
    expect(r.ok && r.file.type).toBe("video/mp4");
  });

  it("a phone that cannot make AAC sends the sound as it is; a muted video has none to make", async () => {
    Object.assign(mb.state, { sound: { codec: "opus" }, aac: false });
    const f = file("video/mp4");
    expect(await fitVideo(f, 16 * MB, "WhatsApp")).toEqual({ ok: true, file: f });
    mb.state.sound = null;
    mb.state.aac = true;
    expect(await fitVideo(f, 16 * MB, "WhatsApp")).toEqual({ ok: true, file: f });
  });
});
