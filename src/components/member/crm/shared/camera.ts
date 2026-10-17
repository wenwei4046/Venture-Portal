/**
 * The chat's camera button: the phone's own camera through the hidden file input (`capture`). On Android, when the phone
 * opens nothing — no camera, no chooser, no permission question (the owner, 2026-10-16: "android 沒有跳出授權相機的選項") —
 * the page stays on screen, so after a moment the chat says why and what to change. The usual reason: the browser itself
 * (Chrome, or Samsung Internet) has no camera permission in Android's settings, and Android no longer asks once it was
 * refused. The CRM's own permissions have nothing to do with it. An iPhone shows its own menu over the page, so it is not
 * watched there.
 *
 * On Android the button asks for a photo only (2026-10-17 — the owner: "我按 camera 的时候，它其实并没有帮我开 camera，
 * 它跳出来反而是 select photo"): Chrome opens the camera straight away only when every accepted type is one kind
 * (Chromium's SelectFileDialog: captureImage() is `capture` and image types only), so "image/*,video/*" went to the
 * photo picker. A video is picked from the gallery; an iPhone keeps its own menu (photo or video).
 */
export const CAMERA_HELP = "The camera didn't open. In Android Settings › Apps › Chrome (or Samsung Internet) › Permissions, allow Camera, then try again.";
export const CAMERA_WAIT_MS = 1500;
export const ANDROID_CAMERA_ACCEPT = "image/*";

export function openCamera(inputId: string, warn: (text: string) => void): void {
  const input = typeof document !== "undefined" ? document.getElementById(inputId) as HTMLInputElement | null : null;
  if (!input) return;
  const android = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  if (android) {
    input.accept = ANDROID_CAMERA_ACCEPT;
    let left = false;
    const away = () => { left = true; };
    document.addEventListener("visibilitychange", away, { once: true });
    window.addEventListener("blur", away, { once: true });
    input.addEventListener("change", away, { once: true });
    setTimeout(() => {
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("blur", away);
      input.removeEventListener("change", away);
      if (!left && document.visibilityState === "visible") warn(CAMERA_HELP);
    }, CAMERA_WAIT_MS);
  }
  input.click();
}
