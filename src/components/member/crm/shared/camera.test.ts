import { afterEach, describe, expect, it, vi } from "vitest";
import { ANDROID_CAMERA_ACCEPT, CAMERA_HELP, CAMERA_WAIT_MS, openCamera } from "./camera";

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
