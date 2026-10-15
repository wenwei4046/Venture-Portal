import { describe, expect, it } from "vitest";
import { crop916, pickedOf } from "./pick";

describe("the camera's photo fills a 9:16 screen (2026-10-15)", () => {
  it("takes the middle 9:16 of a portrait 3:4 photo", () => {
    const c = crop916(3024, 4032)!;
    expect(c.y).toBe(0);
    expect(c.h).toBe(1);
    expect(c.w).toBeCloseTo((4032 * 9) / 16 / 3024, 6);
    expect(c.x).toBeCloseTo((1 - c.w) / 2, 6);
    expect((c.w * 3024) / (c.h * 4032)).toBeCloseTo(9 / 16, 6);
  });
  it("trims top and bottom of a photo taller than 9:16", () => {
    const c = crop916(1000, 2400)!;
    expect(c.w).toBe(1);
    expect((c.w * 1000) / (c.h * 2400)).toBeCloseTo(9 / 16, 6);
  });
  it("leaves a landscape photo, or one already 9:16, whole", () => {
    expect(crop916(4032, 3024)).toBeNull();
    expect(crop916(1080, 1920)).toBeNull();
  });
  it("marks only the camera's photos — never a video, never the photo library's", () => {
    const img = new File(["x"], "a.jpg", { type: "image/jpeg" }), vid = new File(["x"], "b.mp4", { type: "video/mp4" });
    expect(pickedOf([img, vid], { camera: true }).items.map(i => !!i.fill916)).toEqual([true, false]);
    expect(pickedOf([img]).items[0].fill916).toBeUndefined();
  });
});
