"use client";

import { useEffect, useState } from "react";

/**
 * A chat's photos, and each video's first frame, kept on the phone once seen (the owner, 2026-10-14: "當我衝進 apps，都會看
 * 到這樣 loading 的畫面（之前的文件/圖片/影片）要過幾秒才呈現出來 … 我看到的還是上次的畫面"). Every open fetched them again
 * through our route and its redirect; now the next open draws them from the phone at once. What is kept is only what the
 * chat already showed this person, in the browser's Cache Storage (`crm-media-v1`, at most 300 files, a photo up to 4 MB
 * — never a video itself), and /login forgets it with the app's other kept reads (`forgetMedia`), so a phone handed to
 * somebody else keeps nobody's chats. public/sw.js still caches nothing.
 */
const NAME = "crm-media-v1", MAX = 300, MAX_BYTES = 4 * 1024 * 1024;
const mem = new Map<string, string>();
const ok = () => typeof window !== "undefined" && typeof caches !== "undefined";
/** Only our own media addresses are kept (a message's file, stable for good). */
export const keepable = (url: string) => /^\/member\/crm-media\/[0-9a-f-]{36}(?:#poster)?$/i.test(url.replace(/#t=[\d.]+$/, ""));
const keyOf = (url: string) => url.replace(/#t=[\d.]+$/, "");

async function read(key: string): Promise<string | null> {
  if (mem.has(key)) return mem.get(key)!;
  if (!ok()) return null;
  try {
    const hit = await (await caches.open(NAME)).match(new URL(key, location.origin).toString());
    if (!hit) return null;
    const u = URL.createObjectURL(await hit.blob());
    mem.set(key, u);
    return u;
  } catch { return null; }
}

async function write(key: string, blob: Blob) {
  if (!ok() || blob.size > MAX_BYTES || !blob.size) return;
  try {
    const c = await caches.open(NAME);
    await c.put(new URL(key, location.origin).toString(), new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream" } }));
    const keys = await c.keys();
    if (keys.length > MAX) await Promise.all(keys.slice(0, keys.length - MAX).map(k => c.delete(k)));
    if (!mem.has(key)) mem.set(key, URL.createObjectURL(blob));
  } catch { /* shown, just not kept */ }
}

/** Keeps a photo the chat just showed: read again from the browser's own HTTP cache, then put away. */
export function keepImage(url: string) {
  const key = keyOf(url);
  if (!keepable(key) || mem.has(key)) return;
  void fetch(url, { credentials: "same-origin" }).then(r => (r.ok ? r.blob() : null)).then(b => { if (b && b.type.startsWith("image/")) void write(key, b); }).catch(() => {});
}

/**
 * Photos fetched BEFORE anybody opens their chat (the owner, 2026-10-14: a customer's last photo "點進去會空白幾秒，才顯出
 * 畫面"): a customer's WhatsApp photo is fetched from Meta through our route the first time it is shown, which takes
 * seconds; now, as each read lands, every chat's newest photos not yet on the phone are fetched quietly in the
 * background, two at a time, and kept — so opening the chat draws them from the phone at once. Each address is tried
 * once a session (`tried`), so the 5 s re-reads add only what is new.
 */
const tried = new Set<string>();
let queue: string[] = [], running = 0;
function pump() {
  while (running < 2 && queue.length) {
    const key = queue.shift()!;
    running++;
    void read(key)
      .then(hit => (hit ? null : fetch(key, { credentials: "same-origin" }).then(r => (r.ok ? r.blob() : null))))
      .then(b => { if (b && b.type.startsWith("image/")) return write(key, b); })
      .catch(() => {})
      .finally(() => { running--; pump(); });
  }
}
/** The newest photos to fetch ahead: per chat its last `perChat`, the newest chats first, `max` at most. */
export function photosAhead(chats: { lastCustomerAt?: string | null; messages: { media?: { kind: string; url: string } | null }[] }[], perChat = 4, max = 40): string[] {
  const out: string[] = [];
  const byNew = [...chats].sort((a, b) => (b.lastCustomerAt ?? "").localeCompare(a.lastCustomerAt ?? ""));
  for (const c of byNew) {
    const urls = c.messages.filter(m => m.media?.kind === "image").slice(-perChat).map(m => keyOf(m.media!.url)).filter(keepable);
    for (const u of urls.reverse()) { if (out.length >= max) return out; out.push(u); }
  }
  return out;
}
export function warmPhotos(urls: string[]) {
  if (!ok()) return;
  const fresh = urls.filter(u => !tried.has(u) && !mem.has(u));
  fresh.forEach(u => tried.add(u));
  if (!fresh.length) return;
  queue = [...fresh, ...queue];
  pump();
}

/** Keeps a video's first frame, drawn from the playing element (a CDN that refuses CORS leaves nothing kept). */
export function keepPoster(url: string, video: HTMLVideoElement) {
  const key = keyOf(url) + "#poster";
  if (!keepable(key) || mem.has(key) || !video.videoWidth) return;
  try {
    const c = document.createElement("canvas");
    const k = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
    c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
    c.toBlob(b => { if (b) void write(key, b); }, "image/jpeg", 0.7);
  } catch { /* a tainted frame: nothing kept */ }
}

/**
 * The address to draw: the phone's copy when there is one (at once if already read this session), else the network's.
 * `src` is null only for the moment the phone is asked — the box keeps its size, so nothing moves.
 */
export function useKeptSrc(url: string, poster = false): { src: string | null; kept: boolean } {
  const key = keyOf(url) + (poster ? "#poster" : "");
  const [s, setS] = useState<{ src: string | null; kept: boolean }>(() => {
    const hit = mem.get(key);
    return hit ? { src: hit, kept: true } : { src: keepable(key) && ok() ? null : poster ? null : url, kept: false };
  });
  useEffect(() => {
    let on = true;
    const hit = mem.get(key);
    if (hit) { setS({ src: hit, kept: true }); return; }
    if (!keepable(key) || !ok()) { setS({ src: poster ? null : url, kept: false }); return; }
    void read(key).then(u => { if (on) setS(u ? { src: u, kept: true } : { src: poster ? null : url, kept: false }); });
    return () => { on = false; };
  }, [key, url, poster]);
  return s;
}

/** /login forgets the kept media with every other kept read. */
export async function forgetMedia() {
  mem.forEach(u => URL.revokeObjectURL(u));
  mem.clear(); tried.clear(); queue = [];
  try { if (ok()) await caches.delete(NAME); } catch { /* nothing kept */ }
}

/**
 * What this phone just sent is kept under the message's own address at once — a photo as it went, a video's first frame
 * drawn from the phone's copy — so the next open shows it from the phone too, with nothing to fetch.
 */
export function keepSent(messageId: string, file: File) {
  const key = `/member/crm-media/${messageId}`;
  if (!keepable(key)) return;
  if (file.type.startsWith("image/")) { void write(key, file); return; }
  if (!file.type.startsWith("video/") || typeof document === "undefined") return;
  const v = document.createElement("video"), u = URL.createObjectURL(file);
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = u;
  const done = () => { URL.revokeObjectURL(u); v.removeAttribute("src"); };
  v.onloadeddata = () => { v.currentTime = Math.min(0.1, v.duration || 0.1); };
  v.onseeked = () => { keepPoster(key, v); setTimeout(done, 500); };
  v.onerror = done;
  setTimeout(done, 10_000);
}
