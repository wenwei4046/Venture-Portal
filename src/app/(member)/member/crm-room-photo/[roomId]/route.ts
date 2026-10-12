import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /member/crm-room-photo/<showroom id> — a showroom's photo (CRM Desktop rev 1, B4). A read-only file download
 * (CLAUDE.md › Coding Conventions): the showroom is read under the member's OWN session and the file fetched from the
 * private bucket crm-showrooms under it too, whose policy lets in anybody in the CRM. One address per showroom, so the
 * CRM's 5-second read does not fetch it again; the address carries ?v=<the photo's name>, which a new photo changes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
const SHOWN = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(_request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const user = await getMemberUser();
  if (!user?.is_active) return deny(401, "Sign in first.");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(roomId)) return deny(400, "Not a showroom.");

  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: room } = await db.from("crm_showrooms").select("photo_path").eq("id", roomId).maybeSingle();
  if (!room?.photo_path) return deny(404, "Not found.");
  const { data: file, error } = await db.storage.from("crm-showrooms").download(room.photo_path as string);
  if (error || !file) return deny(404, "Not found.");
  const type = SHOWN.has(file.type) ? file.type : "application/octet-stream";
  return new Response(file.stream(), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": SHOWN.has(file.type) ? "inline" : "attachment",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(file.size),
    },
  });
}
