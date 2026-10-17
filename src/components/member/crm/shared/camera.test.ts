import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANDROID_CAMERA_ACCEPT, CAMERA_HELP, CAMERA_WAIT_MS, cameraOpenFor, closeInAppCamera, handToChat, inAppCameraWorks, openCamera, recClock, recordType, shotName,
} from "./camera";

// The camera button on Android: when the phone opens nothing (no camera, no chooser, no permission question — the owner,
// 2026-10-16), the chat says what to change; when the camera opens (the page goes to the background) it says nothing.
function input() {
  const el = document.createElement("input");
  el.id = "cam"; el.type = "file";
  // As the chat's screens draw it (sales/SalesScreens, panel/PanelScreens).
  el.accept = "image/*,video/*"; el.setAttribute("capture", "environment");
  el.click = vi.fn();
  document.body.appendChild(el);
  return el;
}
const ua = (s: string) => Object.defineProperty(navigator, "userAgent", { configurable: true, value: s });
afterEach(() => { document.body.innerHTML = ""; vi.useRealTimers(); delete (navigator as unknown as Record<string, unknown>).userAgent; });

describe("openCamera", () => {
  it("opens the input and, on Android, explains when nothing opened", () => {
    vi.useFakeTimers(); ua("Mozilla/5.0 (Linux; Android 14; SM-S918B)");
    const el = input(), warn = vi.fn();
    openCamera("cam", warn);
    expect(el.click).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(CAMERA_WAIT_MS);
    expect(warn).toHaveBeenCalledWith(CAMERA_HELP);
  });
  it("says nothing once the camera took the screen", () => {
    vi.useFakeTimers(); ua("Mozilla/5.0 (Linux; Android 14; SM-S918B)");
    input(); const warn = vi.fn();
    openCamera("cam", warn);
    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(CAMERA_WAIT_MS);
    expect(warn).not.toHaveBeenCalled();
  });
  it("never warns on an iPhone, whose own menu stays over the page", () => {
    vi.useFakeTimers(); ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)");
    input(); const warn = vi.fn();
    openCamera("cam", warn);
    vi.advanceTimersByTime(CAMERA_WAIT_MS);
    expect(warn).not.toHaveBeenCalled();
  });
  it("on Android asks for a photo only, so Chrome opens the camera, not the photo picker (the owner, 2026-10-17)", () => {
    ua("Mozilla/5.0 (Linux; Android 14; SM-S918B)");
    const el = input();
    const atClick: string[] = [];
    el.click = vi.fn(() => { atClick.push(el.accept); });
    openCamera("cam", vi.fn());
    // Set before the input opens; `capture` kept.
    expect([atClick, el.getAttribute("capture")]).toEqual([[ANDROID_CAMERA_ACCEPT], "environment"]);
    expect(ANDROID_CAMERA_ACCEPT).toBe("image/*");
  });
  it("an iPhone keeps photo or video", () => {
    ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)");
    const el = input();
    openCamera("cam", vi.fn());
    expect(el.accept).toBe("image/*,video/*");
  });
});

// The camera inside the app, as WhatsApp's (2026-10-17 — the owner: "一按相机就直接打开，拍照直接 capture … include with
// video as well"): where the browser lends its camera, the button opens the app's own camera screen, not the phone's.
describe("the camera inside the app", () => {
  const lend = () => Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
  afterEach(() => { closeInAppCamera(); delete (navigator as unknown as Record<string, unknown>).mediaDevices; });

  it("opens where the browser lends its camera — the phone's own camera is not asked", () => {
    lend();
    const el = input();
    expect(inAppCameraWorks()).toBe(true);
    openCamera("cam", vi.fn());
    expect(cameraOpenFor()).toBe("cam");
    expect(el.click).not.toHaveBeenCalled();
  });
  it("without one, the phone's camera as before", () => {
    const el = input();
    expect(inAppCameraWorks()).toBe(false);
    openCamera("cam", vi.fn());
    expect(cameraOpenFor()).toBeNull();
    expect(el.click).toHaveBeenCalledOnce();
  });
  it("records an MP4 where the phone makes one, else WebM", () => {
    expect(recordType(t => t.startsWith("video/mp4"))).toBe("video/mp4;codecs=avc1.42E01E,mp4a.40.2");
    expect(recordType(t => t === "video/mp4")).toBe("video/mp4");
    expect(recordType(t => t.startsWith("video/webm;codecs=vp"))).toBe("video/webm;codecs=vp9,opus");
    expect(recordType(() => false)).toBeNull();
    expect(recordType(() => { throw new Error("no"); })).toBeNull();
  });
  it("names what it took as a phone's camera does, and clocks a recording", () => {
    const at = new Date(2026, 9, 17, 18, 28, 6);
    expect(shotName("photo", "image/jpeg", at)).toBe("IMG_20261017_182806.jpg");
    expect(shotName("video", "video/mp4", at)).toBe("VID_20261017_182806.mp4");
    expect(shotName("video", "video/webm", at)).toBe("VID_20261017_182806.webm");
    expect([recClock(0), recClock(7.9), recClock(102)]).toEqual(["0:00", "0:07", "1:42"]);
  });
  it("hands what it took to the chat through the camera input, as the phone's camera would", () => {
    const el = input();
    const seen: string[] = [];
    el.addEventListener("change", () => seen.push([...(el.files ?? [])].map(f => f.name).join()));
    const ok = handToChat("cam", new File(["x"], "IMG_1.jpg", { type: "image/jpeg" }));
    expect(ok).toBe(typeof DataTransfer !== "undefined");
    if (ok) expect(seen).toEqual(["IMG_1.jpg"]);
    expect(handToChat("missing", new File(["x"], "a.jpg"))).toBe(false);
  });
});
