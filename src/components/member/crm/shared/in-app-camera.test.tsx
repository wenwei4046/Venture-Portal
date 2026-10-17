import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The camera inside the app, as WhatsApp's (2026-10-17 — the owner: "一按相机就直接打开，拍照直接 capture。而不是先跳去系统的
// camera，按 save、use 之后再跳回去 … include with video as well"). The phone's camera and its recorder stand in here
// (happy-dom has neither); what the screen takes, and where it goes, is what is checked.
const hand = vi.hoisted(() => ({ calls: [] as Array<[string, File]>, system: [] as string[] }));
vi.mock("./camera", async importOriginal => {
  const real = await importOriginal<typeof import("./camera")>();
  return {
    ...real,
    handToChat: (id: string, f: File) => { hand.calls.push([id, f]); return true; },
    openSystemCamera: (id: string) => { hand.system.push(id); },
  };
});

import { InAppCamera } from "./in-app-camera";
import { cameraOpenFor, closeInAppCamera, HOLD_MS, MIN_RECORD_MS, openInAppCamera } from "./camera";

type Track = { kind: string; stop: ReturnType<typeof vi.fn>; getCapabilities: () => Record<string, unknown>; getSettings: () => Record<string, unknown>; applyConstraints: ReturnType<typeof vi.fn> };
const tracks: Track[] = [];
const stream = (torch = false, zoom?: { min: number; max: number; step: number }) => {
  const v: Track = { kind: "video", stop: vi.fn(), getCapabilities: () => ({ ...(torch ? { torch: true } : {}), ...(zoom ? { zoom } : {}) }), getSettings: () => (zoom ? { zoom: zoom.min } : {}), applyConstraints: vi.fn(async () => undefined) };
  const a: Track = { kind: "audio", stop: vi.fn(), getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: vi.fn() };
  tracks.push(v, a);
  return { getTracks: () => [v, a], getVideoTracks: () => [v], getAudioTracks: () => [a] } as unknown as MediaStream;
};
const gum = vi.fn();
class FakeRecorder {
  static isTypeSupported = (t: string) => t === "video/mp4";
  static last: FakeRecorder | null = null;
  state = "inactive";
  mimeType: string;
  stream: MediaStream;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(s: MediaStream, o: { mimeType?: string }) { this.stream = s; this.mimeType = o.mimeType ?? ""; FakeRecorder.last = this; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["v"], { type: "video/mp4" }) }); this.onstop?.(); }
}

beforeEach(() => {
  vi.useFakeTimers();
  tracks.length = 0;
  hand.calls = [];
  hand.system = [];
  gum.mockReset().mockImplementation(async () => stream());
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: gum } });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn(async () => undefined) });
  // happy-dom takes only its own MediaStream here; the stand-in stream is shown to nothing.
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { configurable: true, get: () => null, set: () => undefined });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 1080 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 1920 });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ drawImage: vi.fn() }) });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", { configurable: true, value(cb: (b: Blob) => void, type: string) { cb(new Blob(["jpg"], { type })); } });
});
afterEach(() => {
  act(() => closeInAppCamera());
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (navigator as unknown as Record<string, unknown>).mediaDevices;
});

async function openIt() {
  render(<InAppCamera inputId="crm-pick-camera" galleryId="crm-pick-photo" warn={vi.fn()} />);
  await act(async () => { openInAppCamera("crm-pick-camera"); });
  await act(async () => { await Promise.resolve(); });
}
const shutter = () => screen.getByRole("button", { name: /Take photo|Record video|Stop recording/ });

describe("the camera inside the app", () => {
  it("opens on the back camera at once, its sound asked for with it", async () => {
    await openIt();
    expect(screen.getByRole("dialog", { name: "Camera" })).toBeInTheDocument();
    expect(gum).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: "environment" } }), audio: expect.anything() }));
  });

  it("a tap of the shutter is a photo, straight to the chat's preview — no Use photo step", async () => {
    await openIt();
    fireEvent.pointerDown(shutter(), { pointerId: 1 });
    fireEvent.pointerUp(shutter(), { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(hand.calls).toHaveLength(1);
    const [id, f] = hand.calls[0];
    expect([id, f.type, /^IMG_\d{8}_\d{6}\.jpg$/.test(f.name)]).toEqual(["crm-pick-camera", "image/jpeg", true]);
    expect(cameraOpenFor()).toBeNull();
    expect(tracks.every(t => t.stop.mock.calls.length > 0)).toBe(true);
  });

  it("holding the shutter records a video; letting go sends it on", async () => {
    await openIt();
    fireEvent.pointerDown(shutter(), { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(HOLD_MS + 10); });
    expect(FakeRecorder.last?.state).toBe("recording");
    expect(FakeRecorder.last?.mimeType).toBe("video/mp4");
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(MIN_RECORD_MS + 1000); });
    expect(screen.getByText("0:01")).toBeInTheDocument();
    fireEvent.pointerUp(shutter(), { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(hand.calls.map(([, f]) => [f.type, /^VID_\d{8}_\d{6}\.mp4$/.test(f.name)])).toEqual([["video/mp4", true]]);
  });

  it("a hold let go at once is no video", async () => {
    await openIt();
    fireEvent.pointerDown(shutter(), { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(HOLD_MS + 10); });
    fireEvent.pointerUp(shutter(), { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(hand.calls).toEqual([]);
  });

  it("on the Video side a tap starts and a tap stops", async () => {
    await openIt();
    fireEvent.click(screen.getByRole("radio", { name: "Video" }));
    fireEvent.pointerDown(shutter(), { pointerId: 1 });
    fireEvent.pointerUp(shutter(), { pointerId: 1 });
    expect(FakeRecorder.last?.state).toBe("recording");
    await act(async () => { vi.advanceTimersByTime(2000); });
    fireEvent.pointerDown(shutter(), { pointerId: 1 });
    fireEvent.pointerUp(shutter(), { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(hand.calls).toHaveLength(1);
  });

  it("the microphone refused: the camera still opens, for photos and silent videos", async () => {
    gum.mockReset().mockImplementationOnce(async () => { throw Object.assign(new Error("no mic"), { name: "NotAllowedError" }); }).mockImplementation(async () => stream());
    await openIt();
    expect(gum).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false }));
    expect(shutter()).not.toBeDisabled();
  });

  it("the camera refused: says so, and the phone's own camera is one tap away", async () => {
    gum.mockReset().mockImplementation(async () => { throw Object.assign(new Error("no"), { name: "NotAllowedError" }); });
    await openIt();
    expect(screen.getByText(/may not use the camera/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use the phone's camera" }));
    expect(hand.system).toEqual(["crm-pick-camera"]);
    expect(cameraOpenFor()).toBeNull();
  });

  it("the other camera, the flash where the phone has one, and close lets the camera go", async () => {
    gum.mockReset().mockImplementation(async () => stream(true));
    await openIt();
    fireEvent.click(screen.getByRole("button", { name: "Flash off" }));
    await act(async () => { await Promise.resolve(); });
    expect(tracks[0].applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));
    await act(async () => { await Promise.resolve(); });
    expect(gum).toHaveBeenLastCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: "user" } }) }));
    fireEvent.click(screen.getByRole("button", { name: "Close camera" }));
    expect(cameraOpenFor()).toBeNull();
    expect(tracks.every(t => t.stop.mock.calls.length > 0)).toBe(true);
  });

  it("behind another app the camera is let go, and taken again on coming back", async () => {
    await openIt();
    const calls = gum.mock.calls.length;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(tracks.every(t => t.stop.mock.calls.length > 0)).toBe(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
    expect(gum.mock.calls.length).toBe(calls + 1);
  });
});

// Zoom (the same evening — the owner: "the camera and video cannot zoom in, suppose for video when long press then move
// upwards it will zoom in").
describe("the camera's zoom", () => {
  const settle = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };
  const surface = () => document.querySelector("[data-camera-surface]")!;
  const shown = () => document.querySelector("[data-in-app-camera] video")!.getAttribute("style") ?? "";
  const pinchTo2 = () => {
    fireEvent.pointerDown(surface(), { pointerId: 11, clientX: 100, clientY: 400 });
    fireEvent.pointerDown(surface(), { pointerId: 12, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(surface(), { pointerId: 12, clientX: 300, clientY: 400 });
    fireEvent.pointerUp(surface(), { pointerId: 11 });
    fireEvent.pointerUp(surface(), { pointerId: 12 });
  };

  it("the held shutter slid up zooms the camera's own lens in, and slid down back out", async () => {
    gum.mockReset().mockImplementation(async () => stream(false, { min: 1, max: 8, step: 0.1 }));
    await openIt();
    fireEvent.pointerDown(shutter(), { pointerId: 1, clientY: 700 });
    await act(async () => { vi.advanceTimersByTime(HOLD_MS + 10); });
    fireEvent.pointerMove(shutter(), { pointerId: 1, clientY: 700 - window.innerHeight * 0.45 });
    await settle();
    expect(tracks[0].applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ zoom: 8 }] });
    expect(screen.getByRole("button", { name: /Zoom 8.0×/ })).toBeInTheDocument();
    // The lens zooms; the picture on screen is not scaled again.
    expect(shown()).toContain("scale(1)");
    fireEvent.pointerMove(shutter(), { pointerId: 1, clientY: 700 });
    await settle();
    expect(tracks[0].applyConstraints).toHaveBeenLastCalledWith({ advanced: [{ zoom: 1 }] });
    expect(screen.queryByRole("button", { name: /^Zoom/ })).toBeNull();
  });

  it("two fingers pinch the app's own zoom: the picture larger, the photo cropped to its middle", async () => {
    const draw = vi.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ drawImage: draw }) });
    await openIt();
    pinchTo2();
    expect(screen.getByRole("button", { name: /Zoom 2.0×/ })).toBeInTheDocument();
    expect(shown()).toContain("scale(2)");
    fireEvent.pointerDown(shutter(), { pointerId: 3 });
    fireEvent.pointerUp(shutter(), { pointerId: 3 });
    expect(draw).toHaveBeenCalledWith(expect.anything(), 270, 480, 540, 960, 0, 0, 1080, 1920);
  });

  it("a video with the app's own zoom is filmed from a canvas drawn with the crop, the camera's sound with it", async () => {
    const picture = { kind: "video", stop: vi.fn() };
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", { configurable: true, value: () => ({ getVideoTracks: () => [picture], getTracks: () => [picture] }) });
    class FakeMediaStream { constructor(public tracks: unknown[]) {} getTracks() { return this.tracks; } }
    vi.stubGlobal("MediaStream", FakeMediaStream);
    await openIt();
    fireEvent.pointerDown(shutter(), { pointerId: 1, clientY: 700 });
    await act(async () => { vi.advanceTimersByTime(HOLD_MS + 10); });
    expect((FakeRecorder.last?.stream as unknown as FakeMediaStream).tracks).toEqual([picture, tracks[1]]);
    fireEvent.pointerMove(shutter(), { pointerId: 1, clientY: 700 - window.innerHeight * 0.225 });
    expect(screen.getByRole("button", { name: /Zoom 2.5×/ })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(MIN_RECORD_MS + 100); });
    fireEvent.pointerUp(shutter(), { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(picture.stop).toHaveBeenCalled();
    expect(hand.calls).toHaveLength(1);
  });

  it("on the Video side, pressed while recording and slid, it zooms — no tap that stops", async () => {
    await openIt();
    fireEvent.click(screen.getByRole("radio", { name: "Video" }));
    fireEvent.pointerDown(shutter(), { pointerId: 1, clientY: 700 });
    fireEvent.pointerUp(shutter(), { pointerId: 1, clientY: 700 });
    expect(FakeRecorder.last?.state).toBe("recording");
    fireEvent.pointerDown(shutter(), { pointerId: 2, clientY: 700 });
    fireEvent.pointerMove(shutter(), { pointerId: 2, clientY: 700 - window.innerHeight * 0.45 });
    fireEvent.pointerUp(shutter(), { pointerId: 2 });
    expect(FakeRecorder.last?.state).toBe("recording");
    expect(screen.getByRole("button", { name: /Zoom 4.0×/ })).toBeInTheDocument();
  });

  it("a tap on the zoom takes it back to 1×", async () => {
    await openIt();
    pinchTo2();
    fireEvent.click(screen.getByRole("button", { name: /Zoom 2.0×/ }));
    expect(screen.queryByRole("button", { name: /^Zoom/ })).toBeNull();
    expect(shown()).toContain("scale(1)");
  });
});

// An iPhone's zoom went in jerks (2026-10-17 — the owner: "用 Apple 进行 zoom in 的时候一卡一卡的"): a page gets no lens zoom
// there, so every step is the app's own, and each move of the finger drew the whole camera screen again — while
// recording, beside a canvas drawn at every repaint of the screen.
describe("the app's own zoom stays smooth", () => {
  it("the finger moves the picture at every step; the screen is drawn again only when the pill's words change", async () => {
    let commits = 0;
    render(<Profiler id="camera" onRender={() => { commits++; }}><InAppCamera inputId="crm-pick-camera" galleryId="crm-pick-photo" warn={vi.fn()} /></Profiler>);
    await act(async () => { openInAppCamera("crm-pick-camera"); });
    await act(async () => { await Promise.resolve(); });
    const surface = document.querySelector("[data-camera-surface]")!;
    const scale = () => /scale\(([\d.]+)\)/.exec(document.querySelector("[data-in-app-camera] video")!.getAttribute("style") ?? "")?.[1];
    fireEvent.pointerDown(surface, { pointerId: 11, clientX: 100, clientY: 400 });
    fireEvent.pointerDown(surface, { pointerId: 12, clientX: 200, clientY: 400 });
    fireEvent.pointerMove(surface, { pointerId: 12, clientX: 300, clientY: 400 });
    expect(screen.getByRole("button", { name: /Zoom 2.0×/ })).toBeInTheDocument();
    // 2.00× → 2.04× in ten moves: the picture follows each in hundredths, the pill stays "2.0×" — no screen drawn again.
    const before = commits, seen: string[] = [];
    for (let i = 1; i <= 10; i++) {
      fireEvent.pointerMove(surface, { pointerId: 12, clientX: 300 + i * 0.4, clientY: 400 });
      seen.push(scale() ?? "");
    }
    expect(seen).toEqual(["2", "2.01", "2.01", "2.02", "2.02", "2.02", "2.03", "2.03", "2.04", "2.04"]);
    expect(screen.getByRole("button", { name: /Zoom 2.0×/ })).toBeInTheDocument();
    expect(commits - before).toBe(0);
  });

  it("a video filmed through the canvas is drawn once for each picture the camera sends", async () => {
    const picture = { kind: "video", stop: vi.fn() };
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", { configurable: true, value: () => ({ getVideoTracks: () => [picture], getTracks: () => [picture] }) });
    class FakeMediaStream { constructor(public tracks: unknown[]) {} getTracks() { return this.tracks; } }
    vi.stubGlobal("MediaStream", FakeMediaStream);
    const frames: Array<() => void> = [];
    const cancel = vi.fn();
    Object.defineProperty(HTMLVideoElement.prototype, "requestVideoFrameCallback", { configurable: true, value: (cb: () => void) => frames.push(cb) });
    Object.defineProperty(HTMLVideoElement.prototype, "cancelVideoFrameCallback", { configurable: true, value: cancel });
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const draw = vi.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ drawImage: draw }) });
    await openIt();
    fireEvent.pointerDown(shutter(), { pointerId: 1, clientY: 700 });
    await act(async () => { vi.advanceTimersByTime(HOLD_MS + 10); });
    expect(draw).toHaveBeenCalledTimes(1);
    // Two pictures from the camera, two drawings — none at the screen's own repaints.
    frames.shift()!(); frames.shift()!();
    expect(draw).toHaveBeenCalledTimes(3);
    expect(raf.mock.calls.length).toBe(0);
    await act(async () => { vi.advanceTimersByTime(MIN_RECORD_MS + 100); });
    fireEvent.pointerUp(shutter(), { pointerId: 1 });
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(cancel).toHaveBeenCalled();
    expect(picture.stop).toHaveBeenCalled();
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>).requestVideoFrameCallback;
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>).cancelVideoFrameCallback;
  });
});
