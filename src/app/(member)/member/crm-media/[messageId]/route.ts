import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchWhatsAppMedia, goneAtMeta, inlineType, messengerMediaAddress, whatsAppMediaInfo } from "@/lib/whatsapp/media";

/**
 * GET /member/crm-media/<message id> — a photo, video, voice message or document in a chat, the customer's or ours. A
 * read-only file download (CLAUDE.md › Coding Conventions): the message is read under the member's OWN session, so row
 * level security decides whether they may see it; only then is the file reached.
 *
 * The file itself never passes through here when it need not (user 2026-10-13: a big PDF opened blank, voice notes and
 * pictures were slow — a function answers at most ~4.5 MB in one piece, and every view downloaded the whole file again):
 * - a file in our private bucket crm-media — what we sent, and since 2026-11-10 a customer's file kept on arrival
 *   (lib/member/crm-media-keep.ts) — → a redirect to a one-hour signed address, made under the member's own session
 *   (the bucket's read policy asks again); always asked first;
 * - a customer's Messenger attachment not kept → a redirect to Meta's own CDN address (already signed by Meta, Meta's hosts only);
 * - a customer's WhatsApp media not kept → streamed from Meta with the token (the token never reaches the browser), the
 *   range a video or voice note asks for passed on.
 * A file never changes, so the browser keeps it (private, an hour) and a chat opened again shows it at once.
 *
 * GONE AT META (2026-11-10): a customer's file we never kept whose source is gone — a WhatsApp media id older than 7 days,
 * Meta answering 404 / 400 for it, a Messenger address past its `oe=` — answers **410** with `X-Media-Gone: whatsapp |
 * messenger`, never cached. The chat asks HEAD on a file that failed to load (shared/media-gone.ts): HEAD decides the
 * same way but never downloads (for WhatsApp it asks Graph only whether the id is there), and a 410 stops the retries and
 * draws "no longer available".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEP = "private, max-age=3600";
const NO_STORE = { "Cache-Control": "private, no-store" };
const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE } });
const gone = (channel: "whatsapp" | "messenger") =>
  new Response(channel === "whatsapp" ? "WhatsApp keeps a customer's files 7 days." : "Messenger no longer has this file.",
    { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Media-Gone": channel, ...NO_STORE } });
const goTo = (url: string) => new Response(null, { status: 302, headers: { Location: url, "Cache-Control": KEEP, "Referrer-Policy": "no-referrer" } });

type Message = { media_id: string | null; media_path: string | null; media_url: string | null; media_mime: string | null; body: string | null; sent_at: string | null };
type Read = { message: Message; db: SupabaseClient } | { answer: Response };

async function readMessage(messageId: string): Promise<Read> {
  const user = await getMemberUser();
  if (!user?.is_active) return { answer: deny(401, "Sign in first.") };
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return { answer: deny(400, "Not a message.") };
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: message } = await db.from("crm_messages").select("media_id, media_path, media_url, media_mime, body, sent_at").eq("id", messageId).maybeSingle();
  // Not readable under the member's own session = not found, never a hint that it exists.
  if (!message || !(message.media_id || message.media_path || message.media_url)) return { answer: deny(404, "Not found.") };
  return { message: message as Message, db };
}

async function ourCopy(db: SupabaseClient, message: Message): Promise<Response> {
  // A file a browser could run (HTML, SVG …) is only ever a download, never shown in place.
  const download = inlineType(message.media_mime) ? undefined : (message.body || "file");
  const { data, error } = await db.storage.from("crm-media").createSignedUrl(message.media_path as string, 3600, download ? { download } : undefined);
  if (error || !data?.signedUrl) return deny(404, "Not found.");
  return goTo(data.signedUrl);
}

export async function GET(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const read = await readMessage((await params).messageId);
  if ("answer" in read) return read.answer;
  const { message, db } = read;

  if (message.media_path) return ourCopy(db, message);
  const lost = goneAtMeta(message);
  if (lost) return gone(lost);
  if (message.media_url) return goTo(messengerMediaAddress(message.media_url) as string);

  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  if (!token) return deny(503, "WhatsApp is not connected on this server.");
  const range = request.headers.get("range");
  const media = await fetchWhatsAppMedia(message.media_id as string, token, fetch, range);
  if (!media.ok) return media.status === 410 ? gone("whatsapp") : deny(media.status, media.error);
  const inline = inlineType(media.type);
  return new Response(media.body, {
    status: media.partial ? 206 : 200,
    headers: {
      "Content-Type": inline ? media.type : "application/octet-stream",
      "Content-Disposition": inline ? "inline" : "attachment",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": KEEP,
      "Accept-Ranges": "bytes",
      ...(media.length ? { "Content-Length": media.length } : {}),
      ...(media.range ? { "Content-Range": media.range } : {}),
    },
  });
}

/** The chat's question after a file failed to load: is it gone at Meta? Decided as GET, without downloading anything. */
export async function HEAD(_request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const read = await readMessage((await params).messageId);
  if ("answer" in read) return new Response(null, { status: read.answer.status, headers: NO_STORE });
  const { message } = read;
  if (message.media_path) return new Response(null, { status: 200, headers: NO_STORE });
  const lost = goneAtMeta(message);
  if (lost) return new Response(null, { status: 410, headers: { "X-Media-Gone": lost, ...NO_STORE } });
  if (message.media_url) return new Response(null, { status: 200, headers: NO_STORE });
  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  if (!token) return new Response(null, { status: 503, headers: NO_STORE });
  const info = await whatsAppMediaInfo(message.media_id as string, token);
  if (!info.ok) return new Response(null, { status: info.status, headers: info.status === 410 ? { "X-Media-Gone": "whatsapp", ...NO_STORE } : NO_STORE });
  return new Response(null, { status: 200, headers: NO_STORE });
}
