import { afterEach, describe, expect, it, vi } from "vitest";
import { CAMERA_HELP, CAMERA_WAIT_MS, openCamera } from "./camera";

// The camera button on Android: when the phone opens nothing (no camera, no chooser, no permission question — the owner,
// 2026-10-16), the chat says what to change; when the camera opens (the page goes to the background) it says nothing.
function input() {
  const el = document.createElement("input");
  el.id = "cam"; el.type = "file";
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
});
