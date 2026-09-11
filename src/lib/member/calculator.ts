import type {
  MemberBand,
  MemberProduct,
  QuoteInput,
  QuoteResult,
} from "./types";
import { categoryKey, isAccessoryProduct, isCompatibleGift, quoteLineKey } from "./catalog";

/** Decimal money enters the engine as integer cents; tier comparisons use unrounded ratios. */
export function cents(raw: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) return null;
  const [whole, fraction = ""] = raw.trim().split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(value) && value <= 99999999900 ? value : null;
}

/** Binds a calculation to its inputs; contains no costs and is not an authorization token. */
function quoteInputKey(input: QuoteInput): string {
  const lines = input.lines
    .map((line) => [quoteLineKey(line), line.quantity] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify([
    "quote-input-v2",
    input.schemeId,
    lines,
    cents(input.price),
    cents(input.delivery || "0"),
  ]);
}

function productVersions(products: MemberProduct[]): string {
  return products
    .map((product) => `${product.id}:${product.version}`)
    .sort()
    .join("|");
}

export function bandFor(margin: number | null, bands: MemberBand[]) {
  if (margin === null)
    return { label: "Cost pending", tone: "neutral" as const, multiplier: 1 };
  const penalty = bands
    .filter((b) => b.kind === "penalty" && margin <= b.threshold + 1e-10)
    .sort((a, b) => (a.multiplier ?? 1) - (b.multiplier ?? 1))[0];
  const cleared = bands
    .filter((b) => b.kind !== "penalty" && margin + 1e-10 >= b.threshold)
    .sort((a, b) => b.threshold - a.threshold)[0];
  if (penalty)
    return {
      label: `Commission ×${penalty.multiplier ?? 1}`,
      tone: "danger" as const,
      multiplier: penalty.multiplier ?? 1,
    };
  if (margin < 0)
    return { label: "Below cost", tone: "danger" as const, multiplier: 1 };
  return {
    label: cleared
      ? cleared.kind === "incentive"
        ? `${cleared.key} threshold`
        : `${cleared.key} range`
      : "Below reference range",
    tone:
      cleared?.kind === "incentive" ? ("good" as const) : ("warning" as const),
    multiplier: 1,
  };
}
export function calculateQuote(
  input: QuoteInput,
  products: MemberProduct[],
  allBands: MemberBand[],
): QuoteResult {
  const invalid = (error: string): QuoteResult => ({
    valid: false,
    error,
    price: 0,
    delivery: 0,
    margin: null,
    label: "Unable to calculate",
    tone: "neutral",
    multiplier: 1,
    nextPrice: null,
    nextThreshold: null,
    boundary: null,
    version: "",
    inputKey: "",
    suggestions: [],
  });
  const price = cents(input.price),
    delivery = cents(input.delivery || "0");
  if (price === null || price <= 0)
    return invalid(
      "Enter a selling price greater than 0, with up to two decimal places.",
    );
  if (delivery === null)
    return invalid(
      "Enter non-negative additional charges, with up to two decimal places.",
    );
  if (!input.lines.length || !input.lines.some((l) => !l.gift))
    return invalid("Add a product to your cart first.");
  if (input.lines.length > 30)
    return invalid("A quote can contain up to 30 product lines.");
  if (
    new Set(input.lines.map(quoteLineKey)).size !==
    input.lines.length
  )
    return invalid(
      "Duplicate product lines are not allowed. Adjust the quantity in the existing line.",
    );
  const selected = input.lines.map((line) => ({
    line,
    product: products.find((p) => p.id === line.productId),
  }));
  if (
    selected.some(
      ({ line, product }) =>
        !product ||
        !product.available ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 100,
    )
  )
    return invalid(
      "A product is unavailable or its quantity is invalid. Please select it again.",
    );
  if (
    selected.some(
      ({ line, product }) =>
        typeof line.gift !== "boolean" || (line.gift && !product!.gift),
    )
  )
    return invalid(
      "The product or free gift category has changed. Please select it again.",
    );
  const quantityByProduct = new Map<string, number>();
  const giftQuantityByProduct = new Map<string, number>();
  for (const { line } of selected) {
    const quantity = (quantityByProduct.get(line.productId) ?? 0) + line.quantity;
    if (quantity > 100)
      return invalid("Each product is limited to 100 units per quote.");
    quantityByProduct.set(line.productId, quantity);
    if (line.gift) giftQuantityByProduct.set(line.productId, line.quantity);
  }
  if (new Set(selected.map(({ product }) => product!.brand)).size !== 1)
    return invalid("Use products from the same brand in each quote.");
  const paidProducts = selected
    .filter(({ line }) => !line.gift)
    .map(({ product }) => product!);
  if (selected.some(({ line, product }) => line.gift && !isCompatibleGift(product!, paidProducts)))
    return invalid(
      "A free gift size does not match any product in this cart. Please select a matching size.",
    );
  if (
    selected.some(
      ({ product }) =>
        product!.cost == null ||
        !Number.isFinite(product!.cost) ||
        product!.cost! < 0,
    )
  )
    return invalid(
      "Product cost is pending a Principal update. Margin cannot be confirmed yet.",
    );
  const brand = selected[0].product!.brand,
    bands = allBands.filter((b) => b.brand === brand);
  if (!bands.length)
    return invalid(
      "Margin thresholds have not been configured for this brand.",
    );
  const cost = selected.reduce(
    (sum, { line, product }) =>
      sum + Math.round(product!.cost! * 100) * line.quantity,
    0,
  );
  if (!Number.isSafeInteger(cost))
    return invalid("The cart amount is outside the supported range.");
  const margin = ((price - cost) / price) * 100,
    band = bandFor(margin, bands);
  const next = bands
    .filter((b) => b.kind === "incentive" && b.threshold > margin + 1e-10)
    .sort((a, b) => a.threshold - b.threshold)[0];
  // A displayed percentage may round up to a threshold while still being below it.
  const boundary =
    next && Number(margin.toFixed(2)) >= next.threshold
      ? `Actual margin is just below ${next.threshold}%. Add RM ${((Math.ceil(cost / (1 - next.threshold / 100) - 1e-7) - price) / 100).toFixed(2)} to reach it.`
      : null;
  const target = bands
    .filter((b) => b.kind === "incentive" && margin + 1e-10 >= b.threshold)
    .sort((a, b) => b.threshold - a.threshold)[0];
  const suggestions = target
    ? products
        .filter(
          (p) =>
            p.brand === brand &&
            p.gift &&
            p.available &&
            p.cost != null &&
            p.cost! >= 0 &&
            isAccessoryProduct(p) &&
            categoryKey(p.category) === "pillow" &&
            isCompatibleGift(p, paidProducts),
        )
        .map((p) => ({
          productId: p.id,
          name: p.name,
          margin: ((price - cost - Math.round(p.cost! * 100)) / price) * 100,
          label: target.key,
        }))
        .filter(
          (s) =>
            s.margin + 1e-10 >= target.threshold &&
            (giftQuantityByProduct.get(s.productId) ?? 0) < 4 &&
            (quantityByProduct.get(s.productId) ?? 0) < 100 &&
            (giftQuantityByProduct.has(s.productId) || input.lines.length < 30),
        )
        .slice(0, 2)
    : [];
  return {
    valid: true,
    price: price / 100,
    delivery: delivery / 100,
    margin,
    ...band,
    nextPrice: next
      ? Math.ceil(cost / (1 - next.threshold / 100) - 1e-7) / 100
      : null,
    nextThreshold: next?.threshold ?? null,
    boundary,
    version: productVersions(selected.map(({ product }) => product!)),
    inputKey: quoteInputKey(input),
    suggestions,
  };
}
export function customerQuote(
  input: QuoteInput,
  products: MemberProduct[],
  result: QuoteResult,
) {
  if (!result.valid) throw new Error("The quote has not been confirmed.");
  if (
    result.inputKey !== quoteInputKey(input) ||
    Math.round(result.price * 100) !== cents(input.price) ||
    Math.round(result.delivery * 100) !== cents(input.delivery || "0")
  )
    throw new Error("The quote has changed. Recalculate and confirm it again.");
  const selected = input.lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product || !product.available)
      throw new Error("A product is no longer available.");
    return product;
  });
  if (result.version !== productVersions(selected))
    throw new Error(
      "Product details have changed. Recalculate and confirm the quote again.",
    );
  const lines = input.lines.map((l, index) => {
    const p = selected[index];
    return `${l.gift ? "Free gift" : "Product"} · ${p.brand} ${p.name} / ${p.size}${p.color ? " / " + p.color : ""} × ${l.quantity}`;
  });
  return [
    "HOUZS VENTURE · Product quotation",
    ...lines,
    `Selling price: RM ${result.price.toFixed(2)}`,
    `Additional charges: RM ${result.delivery.toFixed(2)}`,
    `Total: RM ${(result.price + result.delivery).toFixed(2)}`,
    "Tax and other service charges: as stated in the confirmed order terms.",
    "Availability, delivery date and quote validity: subject to the final confirmed order.",
  ].join("\n");
}
