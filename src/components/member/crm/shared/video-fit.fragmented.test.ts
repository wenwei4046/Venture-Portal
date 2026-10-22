import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A video the phone's browser recorded is a FRAGMENTED MP4 (2026-10-17: the two videos the owner filmed with the CRM's
// camera on Android came back 131053 — "No video stream found in given video file", "Media file scrutiny … failed"):
// its pictures sit in `moof` fragments after a `moov` that lists none, and fitVideo sent it as it was because it was
// "an MP4 of H.264 and AAC that fits". It is copied into a plain MP4 first now. mediabunny stands in for the copy; the
// boxes are real bytes.
const mb = vi.hoisted(() => {
  const state = { inits: [] as Record<string, unknown>[] };
  class Input {
    async getPrimaryVideoTrack() { return { codec: "avc", rotation: 0, displayWidth: 1080, displayHeight: 1920 }; }
    async getPrimaryAudioTrack() { return { codec: "aac" }; }
    async getFormat() { return { name: "MP4" }; }
    async computeDuration() { return 3.2; }
  }
  class BufferTarget { buffer: ArrayBuffer | null = new ArrayBuffer(32); }
  class Output { target: BufferTarget; constructor(o: { target: BufferTarget }) { this.target = o.target; } }
  const Conversion = {
    init: async (opts: Record<string, unknown>) => {
      state.inits.push(opts);
      return { isValid: true, utilizedTracks: [{ type: "video" }, { type: "audio" }], discardedTracks: [], execute: async () => undefined, onProgress: undefined };
    },
  };
  return {
    state,
    module: {
      Input, BufferTarget, Output, Conversion, BlobSource: class {}, Mp4OutputFormat: class {}, Quality: class { constructor(public o: unknown) {} },
      ALL_FORMATS: [], canEncodeAudio: async () => true,
    },
  };
});
vi.mock("mediabunny", () => mb.module);

import { fitVideo, isFragmentedMp4 } from "./video-fit";

const MB = 1024 * 1024;
/** One MP4 box: its size, its four letters, then `body` bytes of nothing. */
const box = (type: string, body = 0) => {
  const b = new Uint8Array(8 + body), v = new DataView(b.buffer);
  v.setUint32(0, 8 + body);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  return b;
};
/** A box whose size is written in the 64-bit field after its letters (size 1), as a big `mdat` is. */
const bigBox = (type: string, body: number) => {
  const b = new Uint8Array(16 + body), v = new DataView(b.buffer);
  v.setUint32(0, 1);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  v.setBigUint64(8, BigInt(16 + body));
  return b;
};
const mp4 = (...boxes: Uint8Array[]) => new File(boxes as BlobPart[], "VID_20261017_215220.mp4", { type: "video/mp4" });

beforeEach(() => { mb.state.inits = []; vi.stubGlobal("VideoEncoder", class {}); vi.stubGlobal("VideoDecoder", class {}); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("a fragmented MP4", () => {
  it("is told by a moof among the top-level boxes", async () => {
    // Chrome's recorder on Android: ftyp · moov (with mvex) · moof · mdat · moof · mdat (the refused 21:52:20 video).
    expect(await isFragmentedMp4(mp4(box("ftyp", 28), box("moov", 1200), box("moof", 1800), box("mdat", 4000), box("moof", 900), box("mdat", 2000)))).toBe(true);
    // A phone's own camera app: ftyp · moov · mdat, or ftyp · mdat · moov — a 64-bit mdat size read too.
    expect(await isFragmentedMp4(mp4(box("ftyp", 20), box("moov", 3000), box("mdat", 9000)))).toBe(false);
    expect(await isFragmentedMp4(mp4(box("ftyp", 20), bigBox("mdat", 9000), box("moov", 3000)))).toBe(false);
    expect(await isFragmentedMp4(mp4(box("ftyp", 20), bigBox("mdat", 9000), box("moof", 100), box("mdat", 100)))).toBe(true);
  });

  it("stops at what is not a box (nothing, or a size under a box's own header)", async () => {
    expect(await isFragmentedMp4(new File([new Uint8Array(64)], "x.mp4"))).toBe(false);
    expect(await isFragmentedMp4(new File([], "x.mp4"))).toBe(false);
  });

  it("is copied into a plain MP4 before it is sent — the picture and sound as they are", async () => {
    const f = mp4(box("ftyp", 28), box("moov", 1200), box("moof", 1800), box("mdat", 4000));
    const r = await fitVideo(f, 16 * MB, "WhatsApp");
    expect(r.ok).toBe(true);
    expect(r.ok && r.file).not.toBe(f);
    expect(r.ok && r.file.type).toBe("video/mp4");
    expect(mb.state.inits).toHaveLength(1);
    // A copy: nothing asked of the picture or the sound.
    expect(mb.state.inits[0].video).toBeUndefined();
    expect(mb.state.inits[0].audio).toBeUndefined();
  });

  it("a plain MP4 of H.264 and AAC that fits still goes as it is", async () => {
    const f = mp4(box("ftyp", 28), box("moov", 1200), box("mdat", 4000));
    expect(await fitVideo(f, 16 * MB, "WhatsApp")).toEqual({ ok: true, file: f });
    expect(mb.state.inits).toEqual([]);
  });
});
