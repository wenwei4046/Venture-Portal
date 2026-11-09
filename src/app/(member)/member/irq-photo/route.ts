import { getMemberUser } from "@/lib/auth";
import { isPrincipalAccount } from "@/lib/view-as";
import { b2bPhotoUrl, filesPhoto } from "@/components/member/app/irq/lib/b2b-photo";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /member/irq-photo?u=<a b2b product photo's address> — the photo, from this origin (IR Quote, 2026-11-09). The phone
 * makes the quotation's PDF itself (the user: "分享出去是文字，不是pdf; 下载成pdf 也是没有的") by drawing the page, and a
 * browser may draw only pictures its own origin hands it: b2b (mm.hinlim.com) sends no CORS header. A read-only file
 * download (CLAUDE.md › Coding Conventions): a signed-in Revenue app member only, and only b2b's product photos —
 * `b2bPhotoUrl` refuses any other address, so this is never a way to fetch the rest of the internet.
 * `?f=/files/<bucket>/<path>`: a company photo (Quote settings' styles), signed under the caller's OWN session exactly as
 * /files signs it — the bucket's policy decides — and its bytes handed over here, because /files' redirect to R2 carries
 * no CORS header and the PDF drew it blank (the user, 2026-11-09: "手机分享和下载的pdf 没有图片").
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
const SHOWN = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX = 5 * 1024 * 1024;

export async function GET(request: Request) {
  const user = await getMemberUser();
  if (!user?.is_active) return deny(401, "Sign in first.");
  if (!user.permissions.includes("member_portal") && !isPrincipalAccount(user)) return deny(403, "Not open to this account.");
  const q = new URL(request.url).searchParams;
  let url = b2bPhotoUrl(q.get("u"));
  const own = url ? null : filesPhoto(q.get("f"));
  if (own) {
    const db = await createClient();
    const { data, error } = await db.storage.from(own.bucket).createSignedUrl(own.name, 300);
    if (error || !data?.signedUrl) { console.warn("[irq-photo] not signed", own.bucket, error?.message); return deny(404, "Not found."); }
    url = data.signedUrl;
  }
  if (!url) return deny(400, "Not a b2b product photo.");
  let res: Response;
  try {
    res = await fetch(url, { redirect: own ? "follow" : "error", signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    console.warn("[irq-photo] fetch failed", own ? "files" : "b2b", e instanceof Error ? e.message : String(e)); // the photo's address is not logged
    return deny(502, "b2b did not answer.");
  }
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!res.ok || !SHOWN.has(type)) { console.warn("[irq-photo] refused", own ? "files" : "b2b", res.status, type); return deny(404, "Not found."); }
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX) return deny(413, "Too large.");
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
      "Content-Length": String(body.byteLength),
    },
  });
}
