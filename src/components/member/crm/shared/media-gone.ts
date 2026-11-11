import { useEffect, useState } from "react";

/**
 * A customer's file Meta no longer serves and we never kept (2026-11-10 — WhatsApp keeps a customer's media id 7 days,
 * Messenger's address dies in weeks; from that day every customer file is copied into crm-media on arrival, so this is
 * what came before). The chat draws a quiet "no longer available" tile instead of a black box that retries for ever.
 *
 * Two ways a file is known gone, both kept here by its address (our own `/member/crm-media/<id>`, without `?r=` / `#t=`):
 * - the chat's data says so (`media.gone`, lib/member/crm-data.ts › chatMessage → `markGone` in mediaOf);
 * - a file that failed to load is asked once with HEAD (`askGone`): the route answers 410 + `X-Media-Gone` for a file
 *   gone at Meta, without downloading anything.
 */
export type GoneChannel = "whatsapp" | "messenger";
type MediaKind = "image" | "video" | "audio" | "file";

const gone = new Map<string, GoneChannel>();
const asking = new Map<string, Promise<GoneChannel | null>>();
const listeners = new Set<() => void>();

const OURS = "/member/crm-media/";
/** The file's own address: a retry's `?r=n` and a video's `#t=0.1` left off. */
export const baseOf = (src: string) => src.split(/[?#]/)[0];

export function markGone(url: string, channel: GoneChannel) {
  const key = baseOf(url);
  if (gone.get(key) === channel) return;
  gone.set(key, channel);
  listeners.forEach(l => l());
}

export const goneOf = (src: string | null | undefined): GoneChannel | null => (src ? gone.get(baseOf(src)) ?? null : null);

/** Asks our route once per address whether a file that failed to load is gone at Meta (410). Anything else: not gone. */
export function askGone(src: string, fetchImpl: typeof fetch = fetch): Promise<GoneChannel | null> {
  const key = baseOf(src);
  if (!key.startsWith(OURS)) return Promise.resolve(null);
  const known = gone.get(key);
  if (known) return Promise.resolve(known);
  let q = asking.get(key);
  if (!q) {
    q = fetchImpl(key, { method: "HEAD", cache: "no-store", redirect: "manual", credentials: "same-origin" })
      .then(r => {
        if (r.status !== 410) { asking.delete(key); return null; }
        const ch: GoneChannel = r.headers.get("x-media-gone") === "messenger" ? "messenger" : "whatsapp";
        markGone(key, ch);
        return ch;
      })
      .catch(() => { asking.delete(key); return null; });
    asking.set(key, q);
  }
  return q;
}

/** The chat's view of one file: gone or not, and `check()` to ask after it failed to load. */
export function useGone(src: string): { gone: GoneChannel | null; check: () => void } {
  const [g, setG] = useState<GoneChannel | null>(() => goneOf(src));
  useEffect(() => {
    const update = () => setG(goneOf(src));
    update();
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, [src]);
  return { gone: g, check: () => { void askGone(src); } };
}

// Named as the customer's (2026-11-11): two "Voice message no longer available" tiles were read as our own sent notes.
const NOUN: Record<MediaKind, string> = { image: "Customer's photo", video: "Customer's video", audio: "Customer's voice message", file: "Customer's file" };

/** The tile's two lines: "Customer's photo no longer available" · "WhatsApp keeps a customer's files 7 days". */
export function goneWords(kind: MediaKind, channel: GoneChannel): { title: string; why: string } {
  return {
    title: `${NOUN[kind]} no longer available`,
    why: channel === "whatsapp" ? "WhatsApp keeps a customer's files 7 days" : "Messenger's link to it has expired",
  };
}

/** For tests: forget every verdict. */
export function forgetGone() { gone.clear(); asking.clear(); }
