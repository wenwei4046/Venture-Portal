import type { MemberProduct, QuoteLine } from "./types";

export type ProductCategory =
  | "mattress"
  | "bed_frame"
  | "sofa"
  | "pillow"
  | "protector"
  | "accessory"
  | "other";

/** Keep legacy catalogue values valid while presenting the member UI in English. */
export function categoryKey(raw: string): ProductCategory {
  const value = raw.trim().toLowerCase().replace(/[_-]/g, " ");
  if (["床垫", "mattress", "mattresses", "bed", "beds"].includes(value))
    return "mattress";
  if (
    [
      "床架",
      "赠品床架",
      "bed frame",
      "bed frames",
      "bedframe",
      "frame",
      "frames",
      "gift frame",
    ].includes(value)
  )
    return "bed_frame";
  if (["沙发", "sofa", "sofas"].includes(value)) return "sofa";
  if (["枕头", "pillow", "pillows"].includes(value)) return "pillow";
  if (
    [
      "床垫保护套",
      "保护套",
      "protector",
      "protectors",
      "mattress protector",
    ].includes(value)
  )
    return "protector";
  if (
    ["配件", "赠品", "accessory", "accessories", "free gift", "gift"].includes(
      value,
    )
  )
    return "accessory";
  return "other";
}

export function categoryLabel(raw: string): string {
  const labels: Record<ProductCategory, string> = {
    mattress: "Mattress",
    bed_frame: "Bed frame",
    sofa: "Sofa",
    pillow: "Pillow",
    protector: "Protector",
    accessory: "Accessory",
    other: "Other",
  };
  return labels[categoryKey(raw)];
}

/** Accessory placement follows the product category, independently of gift eligibility. */
export function isAccessoryProduct(
  product: Pick<MemberProduct, "category">,
): boolean {
  return ["pillow", "protector", "accessory", "other"].includes(
    categoryKey(product.category),
  );
}

/**
 * A rider carries no brand: bed frames and accessories (user 2026-09-12). It
 * joins any cart, its cost counts in the one margin, and the mattress or
 * sofa in the cart decides which brand's rules judge that margin.
 */
export function isRider(product: Pick<MemberProduct, "brand">): boolean {
  return !product.brand;
}

/** The ERP's fabric tiers, cheapest first. */
export const TIERS = ["PRICE_1", "PRICE_2", "PRICE_3"] as const;

export function tierLabel(tier: string): string {
  const index = (TIERS as readonly string[]).indexOf(tier);
  return index >= 0 ? `Tier ${index + 1}` : tier;
}

/** Seat heights sort numerically (24, 26 … or 60cm, 75cm), so "26" never follows "60cm". */
export function compareHeights(a: string, b: string): number {
  const x = parseFloat(a),
    y = parseFloat(b);
  if (Number.isFinite(x) && Number.isFinite(y) && x !== y) return x - y;
  return a.localeCompare(b);
}

/** Only public web images or same-origin file paths may enter the image element. */
export function productImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  const value = raw.trim();
  if (/^\/(?!\/)/.test(value) && !/[\\\u0000-\u0020]/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function sizeKey(size: string): string {
  return size
    .trim()
    .toLowerCase()
    .replace(/\s+size$/, "")
    .replace(/[\s_-]+/g, " ");
}

/**
 * A multi-product cart may contain several sizes; a fitted gift needs one
 * match. A branded gift must ride a paid product of its own brand; a rider
 * gift (no brand) may ride any paid product.
 */
export function isCompatibleGift(
  gift: MemberProduct,
  paidProducts: MemberProduct[],
): boolean {
  if (!gift.gift) return false;
  const pool = gift.brand
    ? paidProducts.filter((product) => product.brand === gift.brand)
    : paidProducts;
  if (!pool.length) return false;
  const size = sizeKey(gift.size);
  return (
    ["", "standard", "universal", "one size"].includes(size) ||
    pool.some((product) => sizeKey(product.size) === size)
  );
}

/** The same SKU can be purchased and offered as a gift in separate cart lines. */
export function quoteLineKey(line: Pick<QuoteLine, "productId" | "gift">): string {
  return JSON.stringify([line.productId, line.gift]);
}

/** Merge repeated additions by SKU and role, retaining every chosen quantity. */
export function addCartLines(
  current: QuoteLine[],
  additions: QuoteLine[],
  products: MemberProduct[],
): QuoteLine[] {
  const merged = new Map<string, QuoteLine>();
  const quantities = new Map<string, number>();
  const brands = new Set<string>();
  for (const line of [...current, ...additions]) {
    const product = products.find((item) => item.id === line.productId);
    if (!product || !product.available)
      throw new Error(
        "This product is unavailable. Please select another item.",
      );
    if (typeof line.gift !== "boolean" || (line.gift && !product.gift))
      throw new Error(
        "The product or free gift category has changed. Please select it again.",
      );
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 100
    )
      throw new Error("Choose a quantity from 1 to 100.");
    // Riders (bed frames, accessories) carry no brand and join any cart.
    if (product.brand) brands.add(product.brand);
    if (brands.size > 1)
      throw new Error("Use products from the same brand in each quote.");
    const totalQuantity = (quantities.get(line.productId) ?? 0) + line.quantity;
    if (totalQuantity > 100)
      throw new Error("Each product is limited to 100 units per quote.");
    quantities.set(line.productId, totalQuantity);
    const key = quoteLineKey(line);
    const quantity = (merged.get(key)?.quantity ?? 0) + line.quantity;
    merged.set(key, { ...line, quantity });
    if (merged.size > 30)
      throw new Error("A quote can contain up to 30 product lines.");
  }
  return [...merged.values()];
}

/** Removing a bed also removes fitted gifts that no longer match another paid item. */
export function pruneIncompatibleGifts(
  lines: QuoteLine[],
  products: MemberProduct[],
): QuoteLine[] {
  const paid = lines
    .filter((line) => !line.gift)
    .flatMap((line) => {
      const product = products.find((item) => item.id === line.productId);
      return product ? [product] : [];
    });
  return lines.filter((line) => {
    if (!line.gift) return true;
    const product = products.find((item) => item.id === line.productId);
    return !!product && isCompatibleGift(product, paid);
  });
}
