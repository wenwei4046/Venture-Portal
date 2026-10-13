/**
 * Photos, videos and voice notes in the CRM's chats (2026-10-13). Pure rules shared by the browser (what a picked file
 * is, where it goes in the bucket) and the server (what each channel takes).
 */

export type CrmMediaKind = "image" | "video" | "audio" | "document";

/** What a file is sent as. iPhone videos are QuickTime (.mov), sent as video. */
export function mediaKindOf(mime: string): CrmMediaKind {
  if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(mime)) return "image";
  if (/^video\//i.test(mime)) return "video";
  if (/^audio\//i.test(mime)) return "audio";
  return "document";
}

/** Each channel's limit for a kind, in bytes (WhatsApp Cloud API: image 5 MB, video / audio 16 MB, document 100 MB;
 * Messenger 25 MB for any attachment). The bucket takes up to 25 MB. */
export function mediaLimit(channel: "whatsapp" | "messenger", kind: CrmMediaKind): number {
  const MB = 1024 * 1024;
  if (channel === "messenger") return 25 * MB;
  return kind === "image" ? 5 * MB : kind === "document" ? 25 * MB : 16 * MB;
}

/** A file's place in the bucket: "<customer id>/<time>-<random>.<ext>" — the folder is what the storage policy asks. */
export function mediaPath(contactId: string, name: string, mime: string, now = Date.now(), rand = Math.random()): string {
  const fromName = /\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1]?.toLowerCase();
  const fromMime: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm", "audio/mpeg": "mp3", "application/pdf": "pdf" };
  const ext = fromName ?? fromMime[mime.split(";")[0]] ?? "bin";
  return `${contactId}/${now}-${Math.floor(rand * 1e9).toString(36)}.${ext}`;
}
