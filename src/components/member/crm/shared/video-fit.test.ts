import { describe, expect, it } from "vitest";
import { videoPlan } from "./video-fit";
import { fileNameFor } from "./viewer";

const MB = 1024 * 1024;

describe("a video made to fit WhatsApp's 16 MB (2026-10-14)", () => {
  it("gives a short video a good bitrate and a long one a smaller picture", () => {
    expect(videoPlan(16 * MB * 0.95, 20)).toEqual({ bps: 4_000_000, side: 1280 });
    const min = videoPlan(16 * MB * 0.95, 120)!;
    expect(min.side).toBe(640);
    expect(min.bps).toBeGreaterThan(250_000);
    expect(min.bps).toBeLessThan(900_000);
  });
  it("refuses one too long to fit at a watchable quality", () => {
    expect(videoPlan(16 * MB, 600)).toBeNull();
    expect(videoPlan(16 * MB, 0)).toBeNull();
  });
});

describe("a saved file's name", () => {
  it("keeps a document's own name and names a photo or video by its type", () => {
    expect(fileNameFor({ kind: "file", url: "/m/1", name: "DC Shoplot Proposal_ 8 Oct.pdf" }, "application/pdf")).toBe("DC Shoplot Proposal_ 8 Oct.pdf");
    expect(fileNameFor({ kind: "image", url: "/m/2" }, "image/jpeg", 5)).toBe("photo-5.jpg");
    expect(fileNameFor({ kind: "video", url: "/m/3" }, "video/mp4", 5)).toBe("video-5.mp4");
  });
});
