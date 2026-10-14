import { describe, expect, it } from "vitest";
import { albumsOf, galleryOf, mediaOf, NO_MEDIA } from "./chat-media";
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

  it("keeps a voice note snug (2026-10-14) and plain text in the usual bubble", () => {
    expect(mediaOf(msgs[4], []).pad).toBe("6px 9px 5px");
    expect(mediaOf(msgs[4], []).view).toBeUndefined();
    expect(mediaOf(msgs[1], [])).toEqual(NO_MEDIA);
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

describe("photos sent together are one album, as on WhatsApp", () => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 14, 2, 0, s)).toISOString();
  const pic = (id: string, s: number, from: "me" | "lead" = "me", text = "") => ({ id, from, at: at(s), text, media: { kind: "image" as const, url: "/m/" + id } });
  it("groups four or more in a row from the same side, the first carrying them", () => {
    const { lead, hidden } = albumsOf([pic("a", 0), pic("b", 5), pic("c", 9), pic("d", 20), pic("e", 30)]);
    expect([...lead.keys()]).toEqual(["a"]);
    expect([...hidden]).toEqual(["b", "c", "d", "e"]);
    const m = mediaOf(pic("a", 0), [], lead.get("a"));
    expect(m.album.length).toBe(4);
    expect(m.albumMore).toBe(1);
    expect(m.img).toBe("");
  });
  it("leaves three, a caption, the other side or a long pause as they are", () => {
    expect(albumsOf([pic("a", 0), pic("b", 1), pic("c", 2)]).lead.size).toBe(0);
    expect(albumsOf([pic("a", 0), pic("b", 1), pic("c", 2, "me", "look"), pic("d", 3)]).lead.size).toBe(0);
    expect(albumsOf([pic("a", 0), pic("b", 1), pic("c", 2, "lead"), pic("d", 3)]).lead.size).toBe(0);
    expect(albumsOf([pic("a", 0), pic("b", 1), pic("c", 2), pic("d", 500)]).lead.size).toBe(0);
    // 16:11:12 – 16:11:21 four photos, then a video at 16:13:09: the album is the four; the video stands alone.
    const vid = { id: "v", from: "me" as const, at: new Date(Date.UTC(2026, 9, 14, 2, 0, 9 + 108)).toISOString(), text: "", media: { kind: "video" as const, url: "/m/v" } };
    const r = albumsOf([pic("a", 0), pic("b", 3), pic("c", 6), pic("d", 9), vid]);
    expect(r.lead.get("a")?.length).toBe(4);
    expect(r.hidden.has("v")).toBe(false);
  });
  it("draws a PDF as its card and a voice note as a voice bubble", () => {
    expect(mediaOf({ id: "p", media: { kind: "file", url: "/m/p", name: "x.pdf", mime: "application/pdf" } }, []).isPdf).toBe(true);
    expect(mediaOf({ id: "v", from: "me", media: { kind: "audio", url: "/m/v" } }, []).voiceMine).toBe(true);
  });
});

describe("a voice note's speed (2026-10-14)", () => {
  it("goes 1× → 1.25× → 1.5× → 2× and round again", async () => {
    const { nextSpeed, speedLabel } = await import("./voice-note");
    expect([1, 1.25, 1.5, 2].map(nextSpeed)).toEqual([1.25, 1.5, 2, 1]);
    expect(speedLabel(1.25)).toBe("1.25×");
    expect(mediaOf({ id: "v", media: { kind: "audio", url: "/m/v" } }, []).pad).toBe("6px 9px 5px");
  });
});

describe("the + sheet's auto replies (2026-10-14)", () => {
  it("lists the saved auto replies that have words", async () => {
    const { autoChoices } = await import("./attach-sheet");
    expect(autoChoices({ welcome: { text: "Hi, thanks!" }, after: { text: "" }, kws: [{ words: "price", text: "Our prices…" }, { words: "x", text: " " }] }))
      .toEqual([{ label: "Welcome", text: "Hi, thanks!" }, { label: "Keyword · price", text: "Our prices…" }]);
    expect(autoChoices(null)).toEqual([]);
  });
});
