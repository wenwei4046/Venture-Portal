import { describe, expect, it } from "vitest";
import { keptSrc, photosAhead, readyPhotos } from "./media-cache";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const pic = (n: number) => ({ media: { kind: "image", url: `/member/crm-media/${id(n)}` } });

describe("photos fetched ahead of opening a chat (2026-10-14)", () => {
  it("takes each chat's newest photos, the newest chats first, and only our own addresses", () => {
    const chats = [
      { lastCustomerAt: "2026-10-14T09:00:00Z", messages: [pic(1), pic(2), { media: { kind: "video", url: `/member/crm-media/${id(3)}` } }] },
      { lastCustomerAt: "2026-10-14T10:00:00Z", messages: [pic(4), { media: null }, { media: { kind: "image", url: "https://cdn.example/x.jpg" } }] },
    ];
    expect(photosAhead(chats)).toEqual([`/member/crm-media/${id(4)}`, `/member/crm-media/${id(2)}`, `/member/crm-media/${id(1)}`]);
  });
  it("keeps to the last few of a chat and a most overall", () => {
    const chat = { lastCustomerAt: null, messages: [1, 2, 3, 4, 5, 6].map(pic) };
    expect(photosAhead([chat], 4).length).toBe(4);
    expect(photosAhead([chat, chat, chat], 4, 5).length).toBe(5);
  });
});

describe("the viewer draws the phone's copy (2026-10-15)", () => {
  it("has no copy for a photo never kept, and readies nothing that is not our own address", async () => {
    expect(keptSrc("/member/crm-media/00000000-0000-0000-0000-000000000001")).toBeUndefined();
    expect(await readyPhotos(["https://example.com/a.jpg"])).toBe(false);
  });
});
