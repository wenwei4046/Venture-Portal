import { describe, expect, it } from "vitest";
import { byteRange, mediaKindOf, mediaLimit, mediaPath } from "./crm-media";
import { voiceMime, recTime } from "@/components/member/crm/shared/voice";
import { metaMediaUrl } from "@/lib/messenger/webhook";

describe("CRM photos, videos and voice notes", () => {
  it("knows what a picked file is sent as", () => {
    expect(mediaKindOf("image/jpeg")).toBe("image");
    expect(mediaKindOf("video/quicktime")).toBe("video");
    expect(mediaKindOf("audio/mp4")).toBe("audio");
    expect(mediaKindOf("application/pdf")).toBe("document");
  });

  it("holds each channel to its limit", () => {
    expect(mediaLimit("whatsapp", "image")).toBe(5 * 1024 * 1024);
    expect(mediaLimit("whatsapp", "video")).toBe(16 * 1024 * 1024);
    expect(mediaLimit("messenger", "video")).toBe(25 * 1024 * 1024);
  });

  it("puts a file in its customer's folder, with a safe name", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(mediaPath(id, "IMG_8396.JPEG", "image/jpeg", 1700000000000, 0.5)).toMatch(/^11111111-2222-3333-4444-555555555555\/1700000000000-[a-z0-9]+\.jpeg$/);
    expect(mediaPath(id, "voice", "audio/mp4", 1, 0)).toMatch(/\.m4a$/);
  });

  it("answers the part of a video Safari asks for", () => {
    expect(byteRange(null, 100)).toBeNull();
    expect(byteRange("bytes=0-1", 100)).toEqual({ start: 0, end: 1 });
    expect(byteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange("bytes=200-300", 100)).toBe("bad");
  });

  it("records voice notes in a format both channels play, when the browser can", () => {
    expect(voiceMime(t => t === "audio/mp4")).toBe("audio/mp4");
    expect(voiceMime(t => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(voiceMime(() => false)).toBeNull();
    expect(recTime(0, 67_400)).toBe("1:07");
  });

  it("keeps only Meta's own addresses for a Messenger attachment", () => {
    expect(metaMediaUrl("https://scontent.xx.fbcdn.net/v/t1.15752-9/a.jpg?x=1")).toBe("https://scontent.xx.fbcdn.net/v/t1.15752-9/a.jpg?x=1");
    expect(metaMediaUrl("https://evil.example.com/a.jpg")).toBeNull();
    expect(metaMediaUrl("http://scontent.xx.fbcdn.net/a.jpg")).toBeNull();
  });
});
