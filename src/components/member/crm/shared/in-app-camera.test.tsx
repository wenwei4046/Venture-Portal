import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

type Track = { kind: string; stop: ReturnType<typeof vi.fn>; getCapabilities: () => Record<string, unknown>; applyConstraints: ReturnType<typeof vi.fn> };
const tracks: Track[] = [];
const stream = (torch = false) => {
  const v: Track = { kind: "video", stop: vi.fn(), getCapabilities: () => (torch ? { torch: true } : {}), applyConstraints: vi.fn(async () => undefined) };
  const a: Track = { kind: "audio", stop: vi.fn(), getCapabilities: () => ({}), applyConstraints: vi.fn() };
  tracks.push(v, a);
  return { getTracks: () => [v, a], getVideoTracks: () => [v], getAudioTracks: () => [a] } as unknown as MediaStream;
};
const gum = vi.fn();
class FakeRecorder {
  static isTypeSupported = (t: string) => t === "video/mp4";
  static last: FakeRecorder | null = null;
  state = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_s: MediaStream, o: { mimeType?: string }) { this.mimeType = o.mimeType ?? ""; FakeRecorder.last = this; }
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
