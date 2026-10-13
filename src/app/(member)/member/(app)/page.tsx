export const dynamic = "force-dynamic";
// The CRM sends a photo, video or PDF of up to 25 MB through this page's Server Actions (read back from the bucket, then
// to WhatsApp / Messenger): a minute, not the default, so a big file is not cut off (user 2026-10-13).
export const maxDuration = 60;
export const metadata = { title: "My Revenue · HOUZS Venture" };

/**
 * `/member`: the app's own screens. The layout draws them — Today, Insight,
 * Quote, Arena and Profile switch in the browser (`?page=…`) — so the page
 * itself adds nothing.
 */
export default function MemberPage() {
  return null;
}
