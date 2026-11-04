import { describe, expect, it } from "vitest";
import { parseMessengerDelivery, sharedBody } from "./webhook";

const page = (messaging: unknown[]) => ({ object: "page", entry: [{ id: "PAGE1", time: 1, messaging }] });

describe("a shared reel, post or link (2026-11-04: a reel came in as a blank bubble)", () => {
  it("says what was shared, its title and its address", () => {
    // Meta's delivery as it came, from a click-to-Messenger ad.
    const d = parseMessengerDelivery(page([{ sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: 1793804575581,
      message: { mid: "m_reel", referral: { type: "OPEN_THREAD", ad_id: "52621331215064", source: "ADS", ads_context_data: { ad_title: "Astrum Ampang", post_id: "1008213362321092" } },
        attachments: [{ type: "reel", payload: { url: "https://www.facebook.com/reel/1369059845138249?fs=e&s=m", title: "মনের কথা গুলো🥰", reel_video_id: 1369059845138249 } }] } }]));
    expect(d.messages[0]).toMatchObject({ kind: "other", body: "Shared a reel: মনের কথা গুলো🥰\nhttps://www.facebook.com/reel/1369059845138249?fs=e&s=m" });
    expect(d.messages[0].ad?.sourceId).toBe("52621331215064");
  });

  it("names each kind, and leaves out a missing title or a non-https address", () => {
    expect(sharedBody({ type: "ig_reel", payload: { url: "https://instagram.com/r/1" } })).toBe("Shared a reel\nhttps://instagram.com/r/1");
    expect(sharedBody({ type: "share", payload: { url: "javascript:alert(1)", title: "Sofa" } })).toBe("Shared a post: Sofa");
    expect(sharedBody({ type: "fallback", title: "A link" })).toBe("Shared a link: A link");
    expect(sharedBody({ type: "image", payload: { url: "https://x.fbcdn.net/a.jpg" } })).toBeNull();
    expect(sharedBody(undefined)).toBeNull();
  });
});
