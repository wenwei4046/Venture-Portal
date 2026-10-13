import { describe, expect, it } from "vitest";
import { fitSize, jpegName, prepareImage } from "./image-prep";

describe("a photo made ready before it is sent", () => {
  it("keeps a photo that fits and brings a big one down to the long side", () => {
    expect(fitSize(1200, 800, 1600)).toEqual({ w: 1200, h: 800 });
    expect(fitSize(4032, 3024, 1600)).toEqual({ w: 1600, h: 1200 });
    expect(fitSize(3024, 4032, 4096)).toEqual({ w: 3024, h: 4032 });
  });
  it("names the JPEG after the photo", () => {
    expect(jpegName("IMG_8396.HEIC")).toBe("IMG_8396.jpg");
    expect(jpegName("photo")).toBe("photo.jpg");
  });
  it("sends a video or a file as it is", async () => {
    const v = new File(["x"], "a.mov", { type: "video/quicktime" });
    expect(await prepareImage(v, false)).toBe(v);
  });
});
