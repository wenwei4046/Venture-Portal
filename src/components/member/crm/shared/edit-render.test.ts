import { describe, expect, it } from "vitest";
import { clampCrop, FULL, isEdited, noEdits, turnedSize } from "./edit-render";
import { finalFile } from "./pick";

describe("the preview's editor (2026-10-14)", () => {
  it("knows an untouched photo from an edited one", () => {
    expect(isEdited(undefined)).toBe(false);
    expect(isEdited(noEdits())).toBe(false);
    expect(isEdited({ ...noEdits(), turn: 1 })).toBe(true);
    expect(isEdited({ ...noEdits(), crop: { x: 0.1, y: 0, w: 0.9, h: 1 } })).toBe(true);
    expect(isEdited({ ...noEdits(), labels: [{ id: "a", kind: "sticker", text: "😀", color: "#000", x: 0.5, y: 0.5, size: 0.16 }] })).toBe(true);
  });
  it("swaps the sides of a quarter-turned photo", () => {
    expect(turnedSize(800, 600, 1)).toEqual({ w: 600, h: 800 });
    expect(turnedSize(800, 600, 2)).toEqual({ w: 800, h: 600 });
  });
  it("keeps a crop inside the picture and never smaller than a sliver", () => {
    expect(clampCrop({ x: 0.9, y: -0.2, w: 0.5, h: 0.5 })).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(clampCrop({ x: 0.2, y: 0.2, w: 0.01, h: 2 })).toEqual({ x: 0.2, y: 0, w: 0.08, h: 1 });
    expect(clampCrop(FULL)).toEqual(FULL);
  });
  it("sends a video untouched unless it was trimmed or muted", async () => {
    const v = new File(["x"], "a.mp4", { type: "video/mp4" });
    expect(await finalFile({ file: v, url: "", video: true, seconds: 10, cut: { start: 0, end: 10, mute: false } }, true)).toBe(v);
    expect(await finalFile({ file: v, url: "", video: true, seconds: 10, cut: { start: 2, end: 10, mute: false } }, true)).toBe(v); // same file, marked to be cut
  });
});
