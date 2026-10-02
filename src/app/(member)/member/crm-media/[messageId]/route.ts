import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchWhatsAppMedia, inlineType } from "@/lib/whatsapp/media";

/**
 * GET /member/crm-media/<message id> — a customer's photo, video, voice
 * message or document, for the chat. A read-only file download (CLAUDE.md ›
 * Coding Conventions): the message is read under the member's OWN session,
 * so row level security decides whether they may see it; only then does the
 * server fetch the file from Meta with the token. Nothing is cached.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  const user = await getMemberUser();
  if (!user?.is_active) return deny(401, "Sign in first.");
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return deny(400, "Not a message.");

  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: message } = await db.from("crm_messages").select("media_id").eq("id", messageId).maybeSingle();
  // Not readable under the member's own session = not found, never a hint that it exists.
  if (!message?.media_id) return deny(404, "Not found.");

  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  if (!token) return deny(503, "WhatsApp is not connected on this server.");
  const media = await fetchWhatsAppMedia(message.media_id, token);
  if (!media.ok) return deny(media.status, media.error);

  const inline = inlineType(media.type);
  return new Response(media.body, {
    headers: {
      // A file a browser could run (HTML, SVG …) is only ever a download, never shown in place.
      "Content-Type": inline ? media.type : "application/octet-stream",
      "Content-Disposition": inline ? "inline" : "attachment",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      ...(media.length ? { "Content-Length": media.length } : {}),
    },
  });
}
