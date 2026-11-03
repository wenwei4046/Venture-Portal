import type { SupabaseClient } from "@supabase/supabase-js";
import { getMemberUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { metaAdPermalink } from "@/lib/member/crm-ad-names-meta";

/**
 * GET /member/crm-ad/<ad id> — opens the ad itself (2026-10-29, the owner: Ads Performance's ↗ opened the wrong ad). A
 * read-only redirect (CLAUDE.md › Coding Conventions): the ad must be one the member's own session can read in the CRM
 * (crm_ad_names, anybody in the CRM); Meta is asked with the server's token, which never leaves the server, for the ad's
 * own post (`metaAdPermalink`); else Ads Manager with the ad picked.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ adId: string }> }) {
  const { adId } = await params;
  const user = await getMemberUser();
  if (!user?.is_active) return deny(401, "Sign in first.");
  if (!/^\d{5,32}$/.test(adId)) return deny(400, "Not an ad.");
  const db = (await createClient()) as unknown as SupabaseClient;
  const seen = await db.from("crm_ad_names").select("ad_source_id").eq("ad_source_id", adId).maybeSingle();
  const lead = seen.data ? null : await db.from("crm_contacts").select("id").eq("ad_source_id", adId).limit(1).maybeSingle();
  if (!seen.data && !lead?.data) return deny(404, "Not found.");
  const token = process.env.META_SYSTEM_USER_TOKEN;
  const url = (token && (await metaAdPermalink(adId, token))) || `https://adsmanager.facebook.com/adsmanager/manage/ads?selected_ad_ids=${adId}`;
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
}
