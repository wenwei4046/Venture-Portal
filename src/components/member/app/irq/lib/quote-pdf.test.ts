import { describe, expect, it } from "vitest";
import { b2bPhotoUrl, filesPhoto, viaThisOrigin } from "./b2b-photo";
import { inlineImages, jpegsToPdf, NO_PICTURE, paginate } from "./quote-pdf";

// IR Quote (2026-11-09 — the user, on an iPhone: "分享出去是文字，不是pdf; 下载成pdf 也是没有的"; "手机直接生成"): the phone
// makes the quotation's PDF itself, b2b's photos coming through this origin.
describe("b2b's photos through this origin", () => {
  it("passes b2b's product photos only", () => {
    expect(b2bPhotoUrl("https://mm.hinlim.com/cache/b2bfs/product/336103/336103-550x500.jpg")).toBe("https://mm.hinlim.com/cache/b2bfs/product/336103/336103-550x500.jpg");
    for (const bad of [
      "http://mm.hinlim.com/cache/b2bfs/product/1.jpg", "https://evil.com/cache/b2bfs/a.jpg", "https://mm.hinlim.com.evil.com/cache/b2bfs/a.jpg",
      "https://mm.hinlim.com/admin", "https://mm.hinlim.com/cache/b2bfs/../../etc", "https://mm.hinlim.com/cache/b2bfs/%2e%2e/x",
      "https://user:pw@mm.hinlim.com/cache/b2bfs/a.jpg", "https://mm.hinlim.com/cache/b2bfs/a.jpg?x=1", "/files/a.jpg", "", null,
    ]) expect(b2bPhotoUrl(bad), String(bad)).toBeNull();
  });

  it("sends a b2b photo through /member/irq-photo and leaves the rest", () => {
    expect(viaThisOrigin("https://mm.hinlim.com/cache/b2bfs/p/1.jpg")).toBe("/member/irq-photo?u=" + encodeURIComponent("https://mm.hinlim.com/cache/b2bfs/p/1.jpg"));
    expect(viaThisOrigin("data:image/png;base64,AA")).toBe("data:image/png;base64,AA");
  });

  // 2026-11-09 "手机分享和下载的pdf 没有图片": a style photo is /files/…, whose redirect to R2 has no CORS header.
  it("sends a company photo (/files/…) through /member/irq-photo too, and only a clean bucket path", () => {
    expect(viaThisOrigin("/files/ir-quote/config/u/a.jpg")).toBe("/member/irq-photo?f=" + encodeURIComponent("/files/ir-quote/config/u/a.jpg"));
    expect(filesPhoto("/files/ir-quote/config/u/a%20b.jpg")).toEqual({ bucket: "ir-quote", name: "config/u/a b.jpg" });
    for (const bad of ["/files/ir-quote/../x.jpg", "/files/ir-quote/a/%2e%2e/b", "/files/IR/a.jpg", "/files/ir-quote/a.jpg?x=1", "/files/ir-quote//a.jpg", "/files/ir-quote/%00a", "https://x.com/files/ir-quote/a.jpg", "", null])
      expect(filesPhoto(bad), String(bad)).toBeNull();
  });
});

describe("the PDF's pictures, carried inside it", () => {
  it("replaces each picture by its own bytes, fetching an address once, and leaves one it cannot fetch an empty box", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<img src="/a"><img src="/a"><img src="/b"><img src="/gone"><img src="data:image/png;base64,AA">';
    const asked: string[] = [];
    await inlineImages(root, async src => { asked.push(src); if (src === "/gone") throw new Error("404"); return new Blob([src], { type: src === "/b" ? "text/html" : "image/jpeg" }); });
    const srcs = Array.from(root.querySelectorAll("img")).map(i => i.getAttribute("src"));
    expect(asked.sort()).toEqual(["/a", "/b", "/gone"]);
    expect(srcs[0]).toMatch(/^data:image\/jpeg;base64,/);
    expect(srcs[1]).toBe(srcs[0]);
    expect(srcs.slice(2)).toEqual([NO_PICTURE, NO_PICTURE, "data:image/png;base64,AA"]); // not a picture, not found: an empty box; already inside
  });

  it("draws a page with pictures twice, Safari's first drawing being blank", async () => {
    const src = (await import("node:fs")).readFileSync("src/components/member/app/irq/lib/quote-pdf.ts", "utf8");
    expect(src).toMatch(/if \(page\.querySelector\("img"\)\) await toJpeg\(page, opts\);\s+const url = await toJpeg\(page, opts\);/);
    expect(src).toMatch(/await inlineImages\(src\);/);
  });
});

describe("the PDF's pages", () => {
  it("cuts between rows, never through one; a row taller than a page stands alone", () => {
    expect(paginate([300, 300, 300, 300], 1017)).toEqual([[0, 1, 2], [3]]);
    expect(paginate([100, 2000, 100], 1017)).toEqual([[0], [1], [2]]);
    expect(paginate([], 1017)).toEqual([]);
  });

  it("writes one page per picture, A4, the picture edge to edge", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = await jpegsToPdf([{ bytes: jpeg, w: 2, h: 3 }, { bytes: jpeg, w: 2, h: 3 }]).text();
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf).toContain("/Type /Pages /Count 2 /Kids [3 0 R 6 0 R]");
    expect(pdf).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(pdf).toContain("/Width 2 /Height 3 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 4");
    // the cross-reference table points at each object where it starts
    const xref = pdf.slice(pdf.indexOf("xref\n")).split("\n").slice(3, 11).map(l => parseInt(l, 10));
    xref.forEach((at, i) => expect(pdf.slice(at, at + 12), `object ${i + 1}`).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});

// The user, 2026-11-09, the PDF's photos all the TV cabinet's: "为什么显示的图片不一样？是bug吗？". Every b2b photo is
// /member/irq-photo?u=…, and html-to-image keys its picture cache on the address before "?" unless told otherwise.
describe("the PDF's pictures", () => {
  it("keep every photo apart (html-to-image's cache keyed on the whole address)", async () => {
    const src = (await import("node:fs")).readFileSync("src/components/member/app/irq/lib/quote-pdf.ts", "utf8");
    expect(src).toMatch(/const opts = \{[^}]*includeQueryParams: true/);
  });
});

// The user, 2026-11-09: "新增电器；是否可以在哪个位置可以让我control加什么类型" — sections, one Customize tab each.
describe("the quote's sections", async () => {
  const { sectionsOf, sectionOfCat, goodsSection } = await import("./quote-doc");
  it("are Furniture and Services until Quote settings adds more", () => {
    expect(sectionsOf({}).map((s: { id: string; label: string; goods: boolean }) => [s.id, s.label, s.goods])).toEqual([["furn", "Furniture", true], ["serv", "Services", false]]);
    const cfg = { sections: [...sectionsOf({}), { id: "sec-e", label: "Electrical", goods: true }] };
    expect(sectionsOf(cfg).map((s: { head: string }) => s.head)).toEqual(["FURNITURE & APPLIANCES", "SERVICES & FITTINGS", "ELECTRICAL"]);
    expect(goodsSection(cfg, "sec-e")).toBe(true);
  });
  it("put a category in the section it names, else by its rows", () => {
    const cfg = { sections: [...sectionsOf({}), { id: "sec-e", label: "Electrical", goods: true }] };
    expect(sectionOfCat(cfg, { section: "sec-e", items: [] })).toBe("sec-e");
    expect(sectionOfCat(cfg, { section: "gone", items: [{ kind: "sofa" }] })).toBe("furn"); // a section deleted since
    expect(sectionOfCat(cfg, { items: [{}] })).toBe("serv");
  });
});
