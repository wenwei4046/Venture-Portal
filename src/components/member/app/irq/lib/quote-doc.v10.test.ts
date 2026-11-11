import { describe, expect, it } from "vitest";
import { COLUMNS, FONTS, billOn, defaultCustInfo, defaults, factsOff, fieldEditor, FIT_SCRIPT, moodRows, nameRooms, photoSizeOf, codeSizeOf, principalPictures, printsOwn, renderDoc, roomName, specText } from "./quote-doc";
import packagesJson from "../data/packages.json";
import catalogJson from "../data/catalog.json";

// IR Quote v10 (2026-11-09, the handoff `.design/ir-quote/design_handoff_ir_quote/README-v10.md`): the PHOTO column,
// Times New Roman with lining / tabular figures, and the style moodboard laid out by photo count.

const imgs = (k: number) => Array.from({ length: k }, (_, i) => `/files/ir-quote/config/u/p${i + 1}.jpg`);
const B = { size: 12.5 };

/** Each image row of a moodboard: how many photos stand in it, and its height. */
function rows(html: string) {
  return [...html.matchAll(/<tr style="break-inside:avoid;page-break-inside:avoid">([\s\S]*?)<\/tr>/g)].map(m => ({
    photos: (m[1].match(/<img /g) ?? []).length,
    height: Number((m[1].match(/height:(\d+)px">/) ?? [])[1]),
    cols: (m[1].match(/grid-template-columns:([^;]+);/) ?? [])[1],
    areas: (m[1].match(/grid-template-areas:([^;]+);/) ?? [])[1],
  }));
}

describe("the style moodboard's layout (moodRows)", () => {
  it("draws nothing without a photo", () => {
    expect(moodRows({ name: "Muji", note: "", imgs: [] }, 7, B)).toBe("");
    expect(moodRows({ name: "Muji", note: "", imgs: ["", null] }, 7, B)).toBe("");
  });

  it.each([
    [1, "1fr", "'a'", 300],
    [2, "1fr 1fr", "'a b'", 260],
    [3, "3fr 2fr", "'a b' 'a c'", 260],
    [4, "2fr 1fr 1fr", "'a b b' 'a c d'", 260],
    [5, "2fr 1fr 1fr", "'a b c' 'a d e'", 260],
  ])("lays %i photo(s) as one large photo with the rest beside it", (k, cols, areas, height) => {
    const r = rows(moodRows({ name: "Muji", note: "Classic", imgs: imgs(k) }, 7, B));
    expect(r).toEqual([{ photos: k, height, cols, areas }]);
  });

  it.each([
    [6, [3, 3]],
    [7, [3, 2, 2]],
    [8, [3, 3, 2]],
    [9, [3, 3, 3]],
    [10, [3, 3, 2, 2]],
    [11, [3, 3, 3, 2]],
    [12, [3, 3, 3, 3]],
  ])("lays %i photos in rows of three, never a lone photo", (k, sizes) => {
    const r = rows(moodRows({ name: "Muji", note: "Classic", imgs: imgs(k) }, 7, B));
    expect(r.map(x => x.photos)).toEqual(sizes);
    expect(r.map(x => x.height)).toEqual(sizes.map(s => (s === 3 ? 150 : 180)));
    expect(r.map(x => x.cols)).toEqual(sizes.map(s => `repeat(${s},1fr)`));
    expect(r.reduce((a, x) => a + x.photos, 0)).toBe(k);
  });

  it("shows twelve photos at most", () => {
    const html = moodRows({ name: "Muji", note: "", imgs: imgs(15) }, 7, B);
    expect((html.match(/<img /g) ?? []).length).toBe(12);
    expect(html).toContain("12 photos");
    expect(html).not.toContain("p13.jpg");
  });

  it("keeps every photo row whole across a PDF page and the header with its photos", () => {
    const html = moodRows({ name: "Muji", note: "", imgs: imgs(9) }, 7, B);
    expect(html.match(/break-inside:avoid;page-break-inside:avoid/g)).toHaveLength(3);
    expect(html).toContain('<tr style="break-after:avoid;page-break-after:avoid">');
  });

  it("titles it with the style and says the version and how many photos", () => {
    const html = moodRows({ name: "Muji Style", note: "Build in", imgs: imgs(1) }, 7, B);
    expect(html).toContain("STYLE PREVIEW · MUJI STYLE");
    expect(html).toContain("Build in · 1 photo<");
    // A room type with one version names none (2026-11-06): no stray "·".
    expect(moodRows({ name: "Muji", note: "", imgs: imgs(2) }, 7, B)).toContain(">2 photos<");
  });

  it("writes grid areas in single quotes, which the style attribute can hold", () => {
    expect(moodRows({ name: "M", note: "", imgs: imgs(4) }, 7, B)).not.toMatch(/grid-template-areas:[^;]*"/);
  });
});

type Col = { key: string; label: string; show: boolean; num: boolean; custom?: boolean; width?: number };
const tableOf = (c: ReturnType<typeof defaults>) => c.doc.blocks.find(b => b.type === "table") as unknown as { columns: Col[] };

describe("the quotation (renderDoc)", () => {
  const cfg = () => {
    const c = defaults(packagesJson, catalogJson);
    tableOf(c).columns.forEach(col => { col.show = true; });
    return c;
  };
  const q = (extra = {}) => ({
    facts: { att: "Tan Wei Ming" }, custRows: [], extra: {}, sigs: {}, discount: 0, saving: 0, total: 1000, adjust: [],
    cats: [{ name: "LIVING", rows: [
      { no: 1, item: "SOFA", desc: "", code: "235001", photo: "https://b2b.example/235001.jpg", qty: 1, unit: 1000, sum: 1000 },
      { no: 2, item: "RUG", desc: "", code: "", photo: "", qty: 1, unit: 0, sum: 0 },
    ] }],
    ...extra,
  });

  // The user, 2026-11-11: "Package saving 如果是这样的定义，就不需要了 … 总数对就可以了".
  it("prints no Package saving, whatever it is handed: the discount, then the total", () => {
    const html = renderDoc(cfg(), q({ saving: 724, discount: 500, total: 500 }));
    expect(html).not.toContain("Package saving");
    expect(html).toContain("Discount");
    expect(html).toContain("TOTAL (RM)");
  });

  it("has a PHOTO column after CODE/COLOUR", () => {
    const keys = COLUMNS.map(c => c.key);
    expect(keys.indexOf("photo")).toBe(keys.indexOf("code") + 1);
  });

  it("prints the photo (80 × 80 unless Quote settings says), centred, and an empty cell when there is none", () => {
    const html = renderDoc(cfg(), q());
    expect(html).toContain('<img src="https://b2b.example/235001.jpg" alt="" style="display:block;width:80px;height:80px;object-fit:contain;margin:0 auto">');
    expect(html).toContain("text-align:center\">PHOTO</td>");
    expect(html).toContain('width:88px;text-align:center;vertical-align:middle"></td>');
  });

  it("leaves the photos out of the Excel export", () => {
    const html = renderDoc(cfg(), q({ moodboard: { name: "Muji", note: "", imgs: imgs(3) } }), { excel: true });
    expect(html).not.toContain("PHOTO");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("STYLE PREVIEW");
  });

  it("is Times New Roman by default, its figures lining and tabular", () => {
    const c = cfg();
    expect(c.doc.font).toBe("Times");
    const html = renderDoc(c, q());
    expect(html).toContain(`font-family:${FONTS.Times};`);
    expect(FONTS.Times).toBe("'Times New Roman', Times, 'Noto Serif SC', serif");
    expect(html).toContain("font-variant-numeric:lining-nums tabular-nums");
  });

  it("puts the moodboard after the customer details, before \"We refer to our meeting\"", () => {
    const html = renderDoc(cfg(), q({ moodboard: { name: "Muji", note: "Classic", imgs: imgs(5) } }));
    const at = html.indexOf("STYLE PREVIEW · MUJI"), facts = html.indexOf("Tan Wei Ming"), intro = html.indexOf("We refer to our meeting");
    expect(facts).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(facts);
    expect(at).toBeLessThan(intro);
    expect(renderDoc(cfg(), q())).not.toContain("STYLE PREVIEW");
  });

  it("prints a line's remark under REMARKS", () => {
    const c = cfg();
    tableOf(c).columns.splice(5, 0, { key: "remark", label: "REMARKS", show: true, num: false, custom: true });
    const doc = q();
    (doc.cats[0].rows[0] as Record<string, unknown>).remark = "Left of the TV";
    expect(renderDoc(c, doc)).toContain(">Left of the TV</td>");
  });
});

// The user, 2026-11-09: Billing address shows only when ticked; sales upload no picture of their own; Times.
describe("Billing address, a switch the Principal turns on", () => {
  const withBill = (print?: boolean) => {
    const c = defaults(packagesJson, catalogJson) as ReturnType<typeof defaults> & { custInfo: ReturnType<typeof defaultCustInfo> };
    c.custInfo = defaultCustInfo();
    const bill = c.custInfo.own.find((o: { id: string }) => o.id === "bill") as Record<string, unknown>;
    if (print !== undefined) bill.print = print;
    return c;
  };
  const doc = (c: ReturnType<typeof defaults>) => renderDoc(c, { facts: { att: "A", bill: "1 Jalan Ampang" }, cats: [], custRows: [], total: 0 });

  it("is off until ticked — a setting saved before has no tick", () => {
    expect(billOn(withBill())).toBe(false);
    expect(doc(withBill())).not.toContain("BILLING ADDRESS");
    expect(factsOff(withBill()).has("bill")).toBe(true);
  });

  it("prints when ticked", () => {
    expect(billOn(withBill(true))).toBe(true);
    expect(doc(withBill(true))).toContain("1 Jalan Ampang");
  });

  it("leaves the other core details printing unless unticked", () => {
    expect(printsOwn({ id: "unit", core: true })).toBe(true);
    expect(printsOwn({ id: "unit", core: true, print: false })).toBe(false);
    expect(printsOwn({ id: "bill", core: true })).toBe(false);
    expect(printsOwn({ id: "cf-1", print: true })).toBe(true);
  });
});

describe("pictures are the Principal's", () => {
  const image = { id: "f1", type: "field", kind: "image", label: "Site plan", value: "/files/plan.jpg" };
  const table = { id: "f2", type: "field", kind: "table", label: "Rooms", columns: [{ id: "n", kind: "short" }, { id: "p", kind: "image" }], value: [{ n: "Living", p: "/files/living.jpg" }] };

  it("draws an image section with the Principal's picture and no upload", () => {
    const o = fieldEditor(image, "data:image/png;base64,SALES", () => {}, { upload: false });
    expect(o.img).toBe("/files/plan.jpg");
    expect(o.canUpload).toBe(false);
    expect(fieldEditor(image, "/files/other.jpg", () => {}).canUpload).toBe(true); // Quote Settings still uploads
  });

  it("locks a table's picture cells", () => {
    const o = fieldEditor(table, table.value, () => {}, { upload: false });
    expect((o.rows as unknown as { cells: unknown[] }[])[0].cells[1]).toMatchObject({ isImg: true, canUpload: false, cursor: "default", imgEmpty: "", img: "/files/living.jpg" });
  });

  it("prints the Principal's pictures whatever a draft kept", () => {
    const ex = principalPictures([image, table], { f1: "data:sales", f2: [{ n: "Living", p: "data:sales" }, { n: "Study", p: "data:sales" }], f3: "kept" });
    expect(ex.f1).toBeUndefined();
    expect(ex.f2).toEqual([{ n: "Living", p: "/files/living.jpg" }, { n: "Study", p: "" }]);
    expect(ex.f3).toBe("kept");
  });
});

// The user, 2026-11-09: a package's name keeps its room count and may carry text after it — Room types' Note.
describe("a room type's name", () => {
  it("is the room count, then the Note as typed", () => {
    expect(roomName({ beds: "3", baths: "1" })).toBe("3R 1R");
    expect(roomName({ beds: "3", baths: "1", note: " Type A " })).toBe("3R 1R Type A");
    expect(roomName({ beds: "2", baths: "2", note: "C 841 · D 853" })).toBe("2R 2R C 841 · D 853");
  });

  it("names every version of a room type on load, and leaves one with no room count alone", () => {
    const cfg = nameRooms({ packages: [
      { style: "classic", groupLabel: "1R 1R", spec: { beds: "1", baths: "1", note: "A/A1" } },
      { style: "build", groupLabel: "1R 1R", spec: { beds: "1", baths: "1", note: "A/A1" } },
      { style: "classic", groupLabel: "New package", layout: "NEW PACKAGE", name: "NEW PACKAGE CLASSIC", spec: { beds: "", baths: "" } },
    ] });
    expect(cfg.packages.map((p: { groupLabel: string; layout: string; name: string }) => [p.groupLabel, p.layout, p.name])).toEqual([
      ["1R 1R A/A1", "1R 1R A/A1", "1R 1R A/A1 CLASSIC"],
      ["1R 1R A/A1", "1R 1R A/A1", "1R 1R A/A1 BUILD IN"],
      ["New package", "NEW PACKAGE", "NEW PACKAGE CLASSIC"],
    ]);
  });

  it("no longer repeats Twin-Key in the unit line, the name carries it", () => {
    expect(specText({ beds: "3", baths: "2", note: "Twin-Key", sqft: "1,000" })).toBe("3 Bedrooms · 2 Bathrooms · 1,000 sq.ft.");
  });
});

// The user, 2026-11-06 and again 2026-11-09 (an iPhone: the address and "We refer to our meeting…" drawn huge, over
// each other): iOS inflated the document's text inside the iframe. The page turns that off.
describe("the quotation on an iPhone", () => {
  it("turns off iOS's text inflation", () => {
    const html = renderDoc(defaults(packagesJson, catalogJson), { facts: {}, cats: [], custRows: [], total: 0 });
    expect(html).toContain("html{-webkit-text-size-adjust:100%;text-size-adjust:100%}");
  });
});

// The user, 2026-11-09, circling the details block: "能把这些栏位是固定的，客户输入的资料，如果太多就自动缩小文字".
describe("the customer details", () => {
  const doc = (facts: Record<string, string>, opts = {}) => renderDoc(defaults(packagesJson, catalogJson), { facts, cats: [], custRows: [{ label: "Phone", value: "012-338 4471" }], total: 0 }, opts);

  it("stand in fixed columns of their own, labels on one line", () => {
    const html = doc({ att: "Tan Wei Ming" });
    expect(html).toContain('<table style="width:100%;table-layout:fixed;border-collapse:collapse"><colgroup><col style="width:17%"><col style="width:33%"><col style="width:17%"><col style="width:33%"></colgroup>');
    expect(html).toContain('white-space:nowrap;">ATTENTION :</td>'); // as Quote settings names it — the user sets its case
    expect(html).toContain('colspan="3"'); // PHONE : takes the rest of its row
  });

  // "怎么有大有小" — a guess by length shrank answers that fit; the page measures each and shrinks only what does not fit.
  it("measure each detail in the page, at A4 width, drawing smaller only what does not fit", () => {
    const html = doc({ att: "A".repeat(80) });
    expect(html).toContain(`style="text-align:left;font-size:12.5px;padding:2px 6px;vertical-align:top;overflow-wrap:anywhere;">${"A".repeat(80)}</td>`);
    expect(html.match(/data-fit=""/g)!.length).toBeGreaterThan(8);
    expect(html).toContain(FIT_SCRIPT + "</body>");
    expect(FIT_SCRIPT).toContain("de.style.width='748px'");
    expect(FIT_SCRIPT).toContain("m=s*.72");
  });

  it("keep the item table's columns in the Excel export", () => {
    expect(doc({ att: "Tan" }, { excel: true })).not.toContain("table-layout:fixed");
  });
});

// The user, 2026-11-09: "图片能不能大一点，并且我能只针对code/ colour 这边的资讯缩小文字吗？" — then "改在quote setting".
describe("Quote settings › Item table › Photo size and Code / colour text", () => {
  const withTable = (patch: Record<string, unknown>) => { const c = defaults(packagesJson, catalogJson); Object.assign(tableOf(c), patch); return c; };
  const q = () => ({ facts: {}, custRows: [], total: 0, cats: [{ name: "LIVING", rows: [{ no: 1, item: "SOFA", desc: "", code: "235001 / 114 BLACK", photo: "https://b2b.example/a.jpg", qty: 1, unit: 1, sum: 1 }] }] });

  it("draws the photo at 80px unless set, within 40–140", () => {
    expect(photoSizeOf({})).toBe(80);
    expect(photoSizeOf({ photoSize: 104 })).toBe(104);
    expect(photoSizeOf({ photoSize: 300 })).toBe(140);
    expect(renderDoc(withTable({}), q())).toContain("width:80px;height:80px;object-fit:contain");
    expect(renderDoc(withTable({ photoSize: 120 }), q())).toContain("width:128px;text-align:center");
  });

  it("sizes CODE/COLOUR's text alone, the table's size unless set", () => {
    expect(codeSizeOf({ size: 12 })).toBe(12);
    expect(codeSizeOf({ size: 12, codeSize: 9.5 })).toBe(9.5);
    const html = renderDoc(withTable({ codeSize: 9.5 }), q());
    expect(html).toContain('font-size:9.5px">235001 / 114 BLACK</td>');
    expect(html).toMatch(/font-size:12px;">SOFA<\/td>/); // the other columns keep the table's size
  });
});

// The user, 2026-11-09: "我是否可以更改的左右间距呢？感觉item 隔了很远才到qty" — a column may have a width of its own.
describe("Quote settings › Item table › a column's width", () => {
  it("prints a column at the % it is given, the rest sharing what is left", () => {
    const c = defaults(packagesJson, catalogJson);
    tableOf(c).columns.find(x => x.key === "item")!.width = 25;
    const html = renderDoc(c, { facts: {}, cats: [], custRows: [], total: 0 });
    expect(html).toContain('font-size:11px;;width:25%">ITEM</td>');
    expect(html).not.toContain(";width:" + "NaN");
    expect(renderDoc(defaults(packagesJson, catalogJson), { facts: {}, cats: [], custRows: [], total: 0 })).not.toMatch(/;width:\d+%">ITEM/);
  });
});

// The user, 2026-11-09: "quotation没有线，有点难看懂" — every cell of the item table framed.
describe("the item table's lines", () => {
  it("frames the head, every row's cells and every category", () => {
    const html = renderDoc(defaults(packagesJson, catalogJson), { facts: {}, custRows: [], total: 0, cats: [{ name: "LIVING", rows: [{ no: 1, item: "SOFA", desc: "", code: "1", qty: 1, unit: 1, sum: 1 }] }] });
    expect(html).toContain("padding:6px;border:1px solid #bbb;font-weight:bold");
    expect(html).toContain("border:1px solid #ccc;background:#F6F5F1\">LIVING</td>");
    expect(html).toMatch(/border:1px solid #ccc;font-size:12px;">SOFA<\/td>/);
    expect(html).not.toContain("border-bottom:1px solid #ddd;font-size:12px");
  });
});
