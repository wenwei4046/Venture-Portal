import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchWhatsAppMedia, inlineType, messengerMediaAddress } from "@/lib/whatsapp/media";

/**
 * GET /member/crm-media/<message id> — a photo, video, voice message or document in a chat, the customer's or ours. A
 * read-only file download (CLAUDE.md › Coding Conventions): the message is read under the member's OWN session, so row
 * level security decides whether they may see it; only then is the file reached.
 *
 * The file itself never passes through here when it need not (user 2026-10-13: a big PDF opened blank, voice notes and
 * pictures were slow — a function answers at most ~4.5 MB in one piece, and every view downloaded the whole file again):
 * - what we sent, in our private bucket crm-media → a redirect to a one-hour signed address, made under the member's
 *   own session (the bucket's read policy asks again);
 * - a customer's Messenger attachment → a redirect to Meta's own CDN address (already signed by Meta, Meta's hosts only);
 * - a customer's WhatsApp media → streamed from Meta with the token (the token never reaches the browser), the range a
 *   video or voice note asks for passed on.
 * A file never changes, so the browser keeps it (private, an hour) and a chat opened again shows it at once.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEP = "private, max-age=3600";
const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
const goTo = (url: string) => new Response(null, { status: 302, headers: { Location: url, "Cache-Control": KEEP, "Referrer-Policy": "no-referrer" } });

export async function GET(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const user = await getMemberUser();
  if (!user?.is_active) return deny(401, "Sign in first.");
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return deny(400, "Not a message.");

  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: message } = await db.from("crm_messages").select("media_id, media_path, media_url, media_mime, body").eq("id", messageId).maybeSingle();
  // Not readable under the member's own session = not found, never a hint that it exists.
  if (!message || !(message.media_id || message.media_path || message.media_url)) return deny(404, "Not found.");

  if (message.media_path) {
    // A file a browser could run (HTML, SVG …) is only ever a download, never shown in place.
    const download = inlineType(message.media_mime) ? undefined : (message.body || "file");
    const { data, error } = await db.storage.from("crm-media").createSignedUrl(message.media_path, 3600, download ? { download } : undefined);
    if (error || !data?.signedUrl) return deny(404, "Not found.");
    return goTo(data.signedUrl);
  }
  if (message.media_url) {
    const address = messengerMediaAddress(message.media_url);
    return address ? goTo(address) : deny(404, "Messenger no longer has this file.");
  }

  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  if (!token) return deny(503, "WhatsApp is not connected on this server.");
  const range = request.headers.get("range");
  const media = await fetchWhatsAppMedia(message.media_id as string, token, fetch, range);
  if (!media.ok) return deny(media.status, media.error);
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
