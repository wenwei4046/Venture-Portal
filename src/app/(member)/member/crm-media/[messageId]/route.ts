import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchMessengerMedia, fetchWhatsAppMedia, inlineType } from "@/lib/whatsapp/media";
import { byteRange } from "@/lib/member/crm-media";

/**
 * GET /member/crm-media/<message id> — a photo, video, voice message or document in a chat, the customer's or ours. A
 * read-only file download (CLAUDE.md › Coding Conventions): the message is read under the member's OWN session, so row
 * level security decides whether they may see it; only then is the file fetched — from our private bucket crm-media
 * (what we sent; its own read policy asks again), from WhatsApp with its media id, or from Messenger's own CDN address.
 * Nothing is cached. A video asks in ranges (Safari plays nothing otherwise), so the file is answered in parts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const user = await getMemberUser();
  if (!user?.is_active) return deny(401, "Sign in first.");
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return deny(400, "Not a message.");

  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: message } = await db.from("crm_messages").select("media_id, media_path, media_url, media_mime").eq("id", messageId).maybeSingle();
  // Not readable under the member's own session = not found, never a hint that it exists.
  if (!message || !(message.media_id || message.media_path || message.media_url)) return deny(404, "Not found.");

  let bytes: ArrayBuffer, type: string;
  if (message.media_path) {
    const { data: file, error } = await db.storage.from("crm-media").download(message.media_path);
    if (error || !file) return deny(404, "Not found.");
    bytes = await file.arrayBuffer();
    type = message.media_mime || file.type || "application/octet-stream";
  } else {
    const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
    if (!token) return deny(503, "Meta is not connected on this server.");
    const media = message.media_id ? await fetchWhatsAppMedia(message.media_id, token) : await fetchMessengerMedia(message.media_url as string);
    if (!media.ok) return deny(media.status, media.error);
    bytes = await new Response(media.body).arrayBuffer();
    type = media.type;
  }

  const inline = inlineType(type);
  const base: Record<string, string> = {
    // A file a browser could run (HTML, SVG …) is only ever a download, never shown in place.
    "Content-Type": inline ? type : "application/octet-stream",
    "Content-Disposition": inline ? "inline" : "attachment",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };
  const range = byteRange(request.headers.get("range"), bytes.byteLength);
  if (range === "bad") return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${bytes.byteLength}` } });
  if (range) {
    return new Response(bytes.slice(range.start, range.end + 1), {
      status: 206, headers: { ...base, "Content-Range": `bytes ${range.start}-${range.end}/${bytes.byteLength}`, "Content-Length": String(range.end - range.start + 1) },
    });
  }
  return new Response(bytes, { headers: { ...base, "Content-Length": String(bytes.byteLength) } });
}
