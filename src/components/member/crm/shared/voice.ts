/**
 * Voice notes (2026-10-13; the user: "语音没有功能"). Tap the mic → the phone records (it asks for the microphone the first
 * time); the composer shows the time with Cancel and Send. One recording at a time, held here, outside React state.
 *
 * The format: what WhatsApp and Messenger both play. iPhone Safari records MP4 / AAC, which both take; a browser that
 * can only record WebM (older Android Chrome) is still sent — WhatsApp then refuses it as a voice note and the server
 * sends it as a file, so the customer still gets it.
 */
const PREFERRED = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let stream: MediaStream | null = null;

export function voiceMime(isSupported: (t: string) => boolean = t => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)): string | null {
  return PREFERRED.find(t => { try { return isSupported(t); } catch { return false; } }) ?? null;
}

export const canRecord = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

/** Start recording; null when it started, else why not (in words for the toast). */
export async function startVoice(): Promise<string | null> {
  if (recorder) return null;
  if (!canRecord()) return "This browser cannot record voice notes.";
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    // Android (2026-10-24, the owner: "android allow 不到microphone" — the site's settings listed Camera and no Microphone):
    // once the phone has refused the browser the microphone it never asks again, so the way is the phone's own settings.
    const android = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
    if (android && (e as { name?: string })?.name === "NotAllowedError") return "Android has blocked the microphone: open Settings › Apps › Chrome (or Venture) › Permissions › Microphone › Allow, then try again.";
    if ((e as { name?: string })?.name === "NotFoundError") return "No microphone was found on this device.";
    return "Allow the microphone for this site to record a voice note.";
  }
  const mime = voiceMime();
  chunks = [];
  recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.start(250);
  return null;
}

function release() {
  stream?.getTracks().forEach(t => t.stop());
  stream = null; recorder = null;
}

/** Stop and hand back the recording as a file (null when nothing was recorded). */
export function stopVoice(): Promise<File | null> {
  const r = recorder;
  if (!r) return Promise.resolve(null);
  return new Promise(resolve => {
    r.onstop = () => {
      const type = (r.mimeType || chunks[0]?.type || "audio/mp4").split(";")[0];
      const ext = type === "audio/ogg" ? "ogg" : type === "audio/webm" ? "webm" : "m4a";
      const blob = new Blob(chunks, { type });
      chunks = [];
      release();
      resolve(blob.size ? new File([blob], `Voice note ${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.${ext}`, { type }) : null);
    };
    r.stop();
  });
}

export function cancelVoice() {
  if (!recorder) return;
  recorder.onstop = null;
  try { recorder.stop(); } catch { /* already stopped */ }
  chunks = [];
  release();
}

/** "0:07" */
export const recTime = (since: number, now = Date.now()) => {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
