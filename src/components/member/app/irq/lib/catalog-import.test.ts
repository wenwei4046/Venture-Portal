import { afterEach, describe, expect, it, vi } from "vitest";
import { BOOKMARKLET_BODY, diff, nextCatalogSort, productSlug, sortCatalog } from "./catalog-import";

// The price grabber takes each product's full name, colours and OPTION group from b2b's own product page
// (2026-11-06, the user: "我们根据b2b他的原始分类去做就行"; "他有的东西我们才放，不要自行添加"). Pages as b2b drew them that day.
const SITE = "https://www.b2bfurnituresupply.com";
const option = (slug: string) => `<li><a class="thumbnail" href="${SITE}/${slug}"><img src="x-115x100.jpg"></a></li>`;
const productPage = (name: string, colours: string[], options: string[]) => `<html><body>
  <h1 class="product-name">${name}
    ${colours.map(c => `<span><img src="c.jpg" alt="${c}" title="${c}"></span>`).join("")}
  </h1>
  ${options.length ? `<div class="product_variants"><h3>OPTION</h3><ul>${options.map(option).join("")}</ul></div>` : ""}
</body></html>`;
const card = (url: string, name: string, code: string, price: number) => `<div class="product-thumb">
  <a href="${url}"><img src="https://mm.hinlim.com/cache/b2bfs/product/${code}/${code}-550x500.jpg" alt="${name}" title="${name}"></a>
  <h4 class="product-name"><a href="${url}">${name}</a></h4><p>RM${price}.00</p></div>`;

const K2 = "k23007-235001236106-traverese-2-seater-l-shape-sofa-set";
const K4A = "k23002-231321235001236106-traverese-4-seater-l-shape-sofa-set";
const K4B = "k23005-231321235001236106-traverese-4-seater-l-shape-sofa-set";
const ALONE = "999001-solo-side-table-101";
const PAGES: Record<string, string> = {
  [K2]: productPage("235001/236106 TRAVERESE 2 SEATER L SHAPE SOFA SET", ["114 BLACK", "6480 WHITE", " 114 BLACK"], [K4A]),
  [K4A]: productPage("231321/235001/236106 TRAVERESE 4 SEATER L SHAPE SOFA SET", ["114 BLACK", "6480 WHITE"], [K4B]),
  [K4B]: productPage("231321/235001/236106 TRAVERESE 4 SEATER L SHAPE SOFA SET", ["114 BLACK", "6480 WHITE"], []),
  [ALONE]: productPage("SOLO SIDE TABLE 101", [], []),
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

async function grab() {
  document.body.innerHTML = [
    card(`${SITE}/living-room/sofa/${K2}`, "235001/236106 TRAVERESE 2 SEATER L SHAPE SOFA SET", "K23007", 2028),
    card(`${SITE}/living-room/sofa/${K4A}`, "231321/235001/236106 TRAVERESE 4 SEATER L SHAPE SO...", "K23002", 2574),
    card(`${SITE}/living-room/sofa/${K4B}`, "231321/235001/236106 TRAVERESE 4 SEATER L SHAPE SO...", "K23005", 2574),
    card(`${SITE}/living-room/sofa/${ALONE}`, "SOLO SIDE TABLE 101", "999001", 100),
  ].join("");
  vi.stubGlobal("fetch", vi.fn(async (u: string) => ({ text: async () => PAGES[productSlug(u)] ?? "<html></html>" })));
  // The bookmark's own code, run on the page as a browser runs it.
  new Function(decodeURIComponent(BOOKMARKLET_BODY.replace(/%(?![0-9A-Fa-f]{2})/g, "%25")))();
  await vi.waitFor(() => { if (!/items, \d+ with a price/.test(document.body.textContent || "")) throw new Error("still reading"); });
  let copied = "";
  vi.stubGlobal("navigator", { clipboard: { writeText: async (s: string) => { copied = s; } } });
  [...document.querySelectorAll("button")].find(b => /Copy/.test(b.textContent || ""))!.click();
  await vi.waitFor(() => { if (!copied) throw new Error("not copied"); });
  return JSON.parse(copied.slice("IRQ1:".length)).items as Record<string, unknown>[];
}

describe("the price grabber reads b2b's product pages", () => {
  it("takes the full name, not the list page's cut one, and b2b's colours once each", async () => {
    const items = await grab();
    const four = items.find(x => productSlug(x.url) === K4A)!;
    expect(four.name).toBe("TRAVERESE 4 SEATER L SHAPE SOFA SET");
    expect(four.truncated).toBe(false);
    expect(four.color).toBe("114 BLACK, 6480 WHITE");
    expect(four.code).toBe("231321/235001/236106");
    expect(four.price).toBe(2574);
  });

  it("puts everything b2b's OPTION lists link into one group, and leaves a colour b2b does not show empty", async () => {
    const items = await grab();
    const of = (slug: string) => items.find(x => productSlug(x.url) === slug)!;
    expect(of(K2).group).toBeTruthy();
    expect(of(K4A).group).toBe(of(K2).group);
    expect(of(K4B).group).toBe(of(K2).group);
    expect(of(ALONE).group).toBe(ALONE);
    expect(of(ALONE).color).toBe("");
  });
});

describe("the Catalogue's column heads", () => {
  const kinds = { sofa: { label: "Sofa" }, bed: { label: "Bed frame" } };
  const rows = [
    { id: "a", code: "233213", name: "CIVIC", kind: "sofa", cost: 2803 },
    { id: "b", code: "PC151-01", name: "ASTON", kind: "bed", cost: null, paused: true },
    { id: "c", code: "132055", name: "baja", kind: "sofa", cost: 405.5 },
  ];
  const ids = (key: string, dir: number) => sortCatalog(rows, { key, dir }, kinds).map((r: { id: string }) => r.id).join("");
  it("sorts each column, each way", () => {
    expect(ids("code", 1)).toBe("cab");
    expect(ids("name", 1)).toBe("bca");
    expect(ids("name", -1)).toBe("acb");
    expect(ids("kind", 1)).toBe("bac");
    expect(ids("show", 1)).toBe("acb");
  });
  it("keeps an item with no price last, either way", () => {
    expect(ids("cost", 1)).toBe("cab");
    expect(ids("cost", -1)).toBe("acb");
  });
  it("goes A to Z, Z to A, then back to the catalogue's own order, leaving the catalogue as it was", () => {
    expect(nextCatalogSort(null, "name")).toEqual({ key: "name", dir: 1 });
    expect(nextCatalogSort({ key: "name", dir: 1 }, "name")).toEqual({ key: "name", dir: -1 });
    expect(nextCatalogSort({ key: "name", dir: -1 }, "name")).toBeNull();
    expect(nextCatalogSort({ key: "name", dir: -1 }, "cost")).toEqual({ key: "cost", dir: 1 });
    expect(sortCatalog(rows, null, kinds)).toBe(rows);
    sortCatalog(rows, { key: "name", dir: 1 }, kinds);
    expect(rows.map(r => r.id).join("")).toBe("abc");
  });
});

describe("diff", () => {
  const row = (id: string, slug: string, path = "living-room/sofa") => ({ id, code: "231321/235001/236106", name: "TRAVERESE 4 SEATER L SHAPE SO", cost: 2574, url: `${SITE}/${path}/${slug}` });
  it("finds b2b's own product, though two products share a code", () => {
    const [a, b] = [row("a", K4A), row("b", K4B)];
    const [r] = diff([a, b], [{ slug: K4B, url: b.url, code: b.code, name: "TRAVERESE 4 SEATER L SHAPE SOFA SET", price: 2574 }]);
    expect(r.cur).toBe(b);
    expect(r.what).toContain("name");
  });
  it("finds a product listed under a collection by its own address", () => {
    const a = row("a", K4A, "collection/fyndfurniture_/hachi");
    const [r] = diff([a], [{ slug: K4A, url: `${SITE}/living-room/sofa/${K4A}`, code: a.code, name: a.name, price: 2574 }]);
    expect(r.cur).toBe(a);
  });
  it("never takes a set for one of its parts", () => {
    const part = { id: "p", code: "231321", name: "TRAVERESE 1 SEATER SOFA", cost: 900, url: `${SITE}/living-room/sofa/231321-traverese-1-seater-sofa-114-6480` };
    const [r] = diff([part], [{ slug: K4A, url: `${SITE}/living-room/sofa/${K4A}`, code: "231321/235001", name: "TRAVERESE 3 SEATER SOFA SET", price: 2000 }]);
    expect(r.cur).toBeNull();
    expect(r.status).toBe("new");
  });
});
