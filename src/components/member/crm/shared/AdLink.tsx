/**
 * A Customer info value that opens the ad the customer came from — Meta's link to it (`ad_source_url`), in a new tab, so
 * the salesperson sees the video or picture the customer saw before replying (the owner, 2026-10-15: "在 customer info
 * 新增一個是廣告的鏈接…業務可以看到他們影片的內容進行相應的回復"). Anything else is shown as it was.
 */
export function InfoValue({ v, href }: { v: string; href?: string | null }) {
  if (!href) return <>{v}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" title="Open the ad"
      style={{ color: "#BD4A19", textDecoration: "underline", textUnderlineOffset: "2px", cursor: "pointer" }}>{v} ↗</a>
  );
}

/** Meta's ad link, only when it is a web address. */
export const adHref = (url: string | null | undefined) => (url && /^https:\/\//.test(url) ? url : null);

/** The ad as the screens name it: its kind, then its headline — "Video ad · Chat with us" (the owner, 2026-10-15). */
export const adKindLabel = (c: { adId: string | null; adMedia?: "video" | "image" | null }) =>
  !c.adId ? "" : c.adMedia === "video" ? "Video ad" : c.adMedia === "image" ? "Image ad" : "Ad";
