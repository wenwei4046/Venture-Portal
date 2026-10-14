import { describe, expect, it } from "vitest";
import { galleryOf, mediaOf, NO_MEDIA } from "./chat-media";
import { docLabel, mediaHeight, rememberShape } from "./viewer";

describe("a chat's photos, videos and documents (2026-10-14)", () => {
  const msgs = [
    { id: "a", media: { kind: "image" as const, url: "/m/a" } },
    { id: "b" },
    { id: "c", media: { kind: "file" as const, url: "/m/c", name: "DC Shoplot Proposal_ 8 Oct.pdf", mime: "application/pdf" } },
    { id: "d", media: { kind: "video" as const, url: "/m/d" } },
    { id: "e", media: { kind: "audio" as const, url: "/m/e" } },
  ];

  it("steps left / right through the photos and videos only, oldest first", () => {
    expect(galleryOf(msgs)).toEqual([{ kind: "image", url: "/m/a" }, { kind: "video", url: "/m/d" }]);
  });

  it("names a document by its file and type, and frames it tightly", () => {
    const m = mediaOf(msgs[2], galleryOf(msgs));
    expect(m.docName).toBe("DC Shoplot Proposal_ 8 Oct.pdf");
    expect(m.docType).toBe("PDF");
    expect(m.pad).toBe("3px 3px 5px");
    expect(typeof m.view).toBe("function");
    expect(docLabel("ASTRUM STANDARD.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("XLSX");
    expect(docLabel(undefined, undefined)).toBe("FILE");
  });

  it("keeps a voice note and plain text in the usual bubble", () => {
    expect(mediaOf(msgs[4], []).pad).toBe("10px 13px");
    expect(mediaOf(msgs[4], []).view).toBeUndefined();
    expect(mediaOf(msgs[1], [])).toBe(NO_MEDIA);
  });

  it("draws a photo's box at its own shape once seen, so the chat does not jump while it loads", () => {
    expect(mediaHeight("/m/new")).toBe("300px");
    rememberShape("/m/new", 1600, 1200);
    expect(mediaHeight("/m/new")).toBe("180px");
    rememberShape("/m/tall", 600, 3000);
    expect(mediaHeight("/m/tall")).toBe("320px");
    expect(mediaOf(msgs[3], []).vidSrc).toBe("/m/d#t=0.1");
  });
});
