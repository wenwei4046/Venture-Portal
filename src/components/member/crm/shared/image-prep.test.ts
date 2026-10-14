import { describe, expect, it } from "vitest";
import { fitSize, jpegFacts, jpegName, orientTransform, prepareImage } from "./image-prep";

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

describe("a camera photo is turned upright by its EXIF (2026-10-14: sideways on WhatsApp's computer app)", () => {
  // FFD8 · APP1 "Exif" (one IFD entry: Orientation) · SOF0 (height 3000, width 4000) · SOS
  const jpeg = (le: boolean, o: number) => {
    const tiff = le
      ? [0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, o, 0, 0, 0, 0, 0, 0, 0]
      : [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0];
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const sof = [8, 0x0b, 0xb8, 0x0f, 0xa0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, app1.length + 2, ...app1, 0xff, 0xc0, 0, sof.length + 2, ...sof, 0xff, 0xda, 0, 2]).buffer;
  };
  it("reads the orientation and the stored size, either byte order", () => {
    expect(jpegFacts(jpeg(false, 6))).toEqual({ orientation: 6, w: 4000, h: 3000 });
    expect(jpegFacts(jpeg(true, 3))).toEqual({ orientation: 3, w: 4000, h: 3000 });
    expect(jpegFacts(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual({ orientation: 1, w: 0, h: 0 });
  });
  it("turns a sideways photo the right way (6 = a quarter turn clockwise)", () => {
    const [a, b, c, d, e, f] = orientTransform(6, 300, 400);
    const at = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
    // the stored top-left corner lands at the upright top-right, the stored bottom-left (0, 300) at the top-left
    expect(at(0, 0)).toEqual([300, 0]);
    expect(at(0, 300)).toEqual([0, 0]);
    expect(orientTransform(1, 10, 10)).toEqual([1, 0, 0, 1, 0, 0]);
  });
});
