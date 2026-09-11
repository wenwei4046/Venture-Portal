/* Product photos are optional until the Principal catalogue is connected. */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { calculateMemberQuote } from "@/app/(member)/member/actions";
import { calculateQuote, customerQuote } from "@/lib/member/calculator";
import { pushMemberRoute } from "@/lib/member/navigation";
import {
  addCartLines,
  categoryKey,
  categoryLabel,
  isAccessoryProduct,
  isCompatibleGift,
  productImageUrl,
  pruneIncompatibleGifts,
  quoteLineKey,
} from "@/lib/member/catalog";
import type {
  MemberData,
  MemberProduct,
  QuoteInput,
  QuoteLine,
  QuoteResult,
} from "@/lib/member/types";
import s from "./member.module.css";
import catalogStyles from "./MemberQuoteCatalog.module.css";
import SwipeCartRow from "./SwipeCartRow";
import QuantityStepper from "./QuantityStepper";

type BuilderProps = {
  data: MemberData;
  input: QuoteInput;
  setInput: (value: QuoteInput | ((q: QuoteInput) => QuoteInput)) => void;
  online: boolean;
  notify: (message: string) => void;
  openDialog: (dialog: { title: string; content: ReactNode }) => void;
  closeDialog: () => void;
  productSelection?: { id: string; key: number } | null;
};
type BundleDraft = { productId: string; quantity: number; gifts: QuoteLine[] };
type Family = {
  key: string;
  name: string;
  brand: string;
  category: string;
  section: string;
  gift: boolean;
  products: MemberProduct[];
};
const money = (value: number) =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(
    value,
  );
const sizeOrder = ["Queen", "King", "Super Single", "Single"];
const sectionOrder = ["mattress", "bed_frame", "accessory", "sofa"];

function Symbol({
  name,
  size = 20,
}: {
  name:
    | "cart"
    | "plus"
    | "arrow"
    | "back"
    | "gift"
    | "remove"
    | "erase"
    | "check";
  size?: number;
}) {
  const paths = {
    cart: "M3 3h2l3 12h10l3-9H6M9 20h.01M18 20h.01",
    plus: "M12 5v14M5 12h14",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    back: "M19 12H5m6-6-6 6 6 6",
    gift: "M3 8h18v4H3V8Zm2 4v9h14v-9M12 8v13m0-13C5 8 4 2 8 2c3 0 4 6 4 6Zm0 0c7 0 8-6 4-6-3 0-4 6-4 6Z",
    remove: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
    erase: "M9 4h13v16H9L1 12l8-8Zm4 5 6 6m-6 0 6-6",
    check: "m5 12 4 4L19 6",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

/** A neutral illustration reserves the photo area without inventing product photography. */
function ProductVisual({
  product,
  small = false,
}: {
  product: MemberProduct;
  small?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = productImageUrl(product.imageUrl);
  const kind = categoryKey(product.category);
  const sofa = kind === "sofa",
    pillow = kind === "pillow",
    protector = kind === "protector";
  return (
    <div className={`${s.productVisual} ${small ? s.productVisualSmall : ""}`}>
      {url && failed !== url ? (
        <img
          src={url}
          alt={`${product.name}${product.color ? ` in ${product.color}` : ""}`}
          loading="lazy"
          onError={() => setFailed(url)}
        />
      ) : (
        <>
          <svg
            viewBox="0 0 480 270"
            aria-hidden="true"
            className={s.productDrawing}
          >
            <path d="M0 222h480" stroke="#c5b7a3" strokeWidth="1" />
            <ellipse
              cx="244"
              cy="229"
              rx={pillow ? "112" : "176"}
              ry="12"
              fill="#c7b9a6"
              opacity=".32"
            />
            {pillow ? (
              <>
                <path
                  d="M127 113q110-33 226 0l-13 87q-99 25-203 0Z"
                  fill="#faf6ee"
                  stroke="#c9bdad"
                  strokeWidth="2"
                />
                <path
                  d="M146 124q85-21 187 0l-10 65q-86 18-167 0Z"
                  fill="none"
                  stroke="#dfd5c6"
                />
              </>
            ) : sofa ? (
              <>
                <rect
                  x="87"
                  y="97"
                  width="306"
                  height="110"
                  rx="28"
                  fill="#aa9380"
                />
                <rect
                  x="104"
                  y="112"
                  width="130"
                  height="64"
                  rx="16"
                  fill="#c0ac98"
                />
                <rect
                  x="244"
                  y="112"
                  width="132"
                  height="64"
                  rx="16"
                  fill="#c0ac98"
                />
                <rect
                  x="91"
                  y="177"
                  width="298"
                  height="37"
                  rx="10"
                  fill="#b7a18b"
                />
                <rect
                  x="71"
                  y="144"
                  width="40"
                  height="71"
                  rx="15"
                  fill="#b09a83"
                />
                <rect
                  x="369"
                  y="144"
                  width="40"
                  height="71"
                  rx="15"
                  fill="#b09a83"
                />
                <path
                  d="m106 212-3 18m274-18 3 18"
                  stroke="#73563d"
                  strokeWidth="9"
                />
              </>
            ) : (
              <>
                <rect
                  x="118"
                  y="62"
                  width="246"
                  height="125"
                  rx="16"
                  fill={product.color === "Walnut" ? "#98775c" : "#b7a38b"}
                />
                <path d="M120 135h244l52 64-9 20H74l-6-20Z" fill="#94795f" />
                <path
                  d="M118 124h246l47 64q5 12-9 16H81q-15-4-8-16Z"
                  fill={kind === "bed_frame" ? "#c1ad92" : "#f7f2e8"}
                  stroke="#c9baa4"
                  strokeWidth="2"
                />
                <path
                  d="M74 193q155 10 335 0M126 141h233"
                  fill="none"
                  stroke="#ded3c3"
                  strokeWidth="2"
                />
                {kind !== "bed_frame" && (
                  <>
                    <path
                      d="m132 99 91-3 5 43h-108Z"
                      fill="#fffaf0"
                      stroke="#ded1c1"
                    />
                    <path
                      d="m246 97 96 2 17 40H240Z"
                      fill="#fffaf0"
                      stroke="#ded1c1"
                    />
                    <path
                      d="m105 160 284-1 21 33H77Z"
                      fill={protector ? "#d5dfd7" : "#d4c3aa"}
                    />
                  </>
                )}
                <path
                  d="M92 217v15m296-15v15"
                  stroke="#72583f"
                  strokeWidth="9"
                />
              </>
            )}
          </svg>
          {!small && (
            <span className={s.photoPlaceholder}>
              Product photo coming soon
            </span>
          )}
        </>
      )}
    </div>
  );
}

function GiftPicker({
  product,
  products,
  selected,
  onApply,
}: {
  product: MemberProduct;
  products: MemberProduct[];
  selected: QuoteLine[];
  onApply: (lines: QuoteLine[]) => void;
}) {
  const [lines, setLines] = useState(selected);
  const [filter, setFilter] = useState("all");
  const gifts = products.filter(
    (p) =>
      p.gift &&
      isAccessoryProduct(p) &&
      p.available &&
      p.brand === product.brand &&
      isCompatibleGift(p, [product]),
  );
  const categories = [...new Set(gifts.map((p) => categoryKey(p.category)))];
  return (
    <div className={s.stack}>
      <p className={s.sub}>
        Accessories for {product.name} · {product.size}. Gift costs are included
        in your margin.
      </p>
      <label className={s.field}>
        <span>Accessory category</span>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All accessories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <div className={s.accessoryList}>
        {gifts
          .filter((p) => filter === "all" || categoryKey(p.category) === filter)
          .map((p) => (
            <div key={p.id} className={s.accessoryRow}>
              <ProductVisual product={p} small />
              <div className={s.accessoryInfo}>
                <strong>{p.name}</strong>
                <p className={s.caption}>
                  {p.size}
                  {p.color ? ` · ${p.color}` : ""}
                </p>
              </div>
              <div className={s.accessoryQuantity}>
                <QuantityStepper
                  label={`${p.name} ${p.size}${p.color ? ` ${p.color}` : ""}`}
                  value={lines.find((l) => l.productId === p.id)?.quantity ?? 0}
                  min={0}
                  max={4}
                  onChange={(quantity) =>
                    setLines((old) => [
                      ...old.filter((l) => l.productId !== p.id),
                      ...(quantity
                        ? [
                            {
                              productId: p.id,
                              quantity,
                              gift: true,
                            },
                          ]
                        : []),
                    ])
                  }
                />
              </div>
            </div>
          ))}
        {!gifts.length && (
          <p className={s.empty}>
            No compatible accessories are available for this size yet.
          </p>
        )}
      </div>
      <div className={s.giftApply}>
        <button
          className={`${s.button} ${s.primary} ${s.full}`}
          onClick={() => onApply(lines)}
        >
          <Symbol name="check" />
          Use {lines.reduce((sum, l) => sum + l.quantity, 0)} free gifts
        </button>
        <p className={s.caption}>
          You can edit or remove gifts in the calculator.
        </p>
      </div>
    </div>
  );
}

function CustomerPreview({
  text,
  demo,
  notify,
}: {
  text: string;
  demo: boolean;
  notify: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      notify("Customer quote copied. Nothing has been sent.");
    } catch {
      if (ref.current) {
        const range = document.createRange();
        range.selectNodeContents(ref.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      notify("Select the quote and use Copy, or press Ctrl+C.");
    }
  }
  return (
    <div className={s.stack}>
      <p className={s.sub}>
        {demo
          ? "Sample quote · not for an actual sale."
          : "Check the products, gifts, additional charges and delivery terms before sharing."}
      </p>
      <div className={s.quoteText} ref={ref}>
        {text}
      </div>
      <button
        className={`${s.button} ${s.primary} ${s.full}`}
        onClick={() => void copy()}
      >
        Copy customer quote
      </button>
      <p className={s.caption}>
        Only customer-facing details are included. Copying does not send a
        message.
      </p>
    </div>
  );
}

export default function MemberQuoteBuilder({
  data,
  input,
  setInput,
  online,
  notify,
  openDialog,
  closeDialog,
  productSelection,
}: BuilderProps) {
  const [view, setView] = useState<"catalog" | "calculator">("catalog");
  const [models, setModels] = useState<Record<string, string>>({});
  const [categoryBrands, setCategoryBrands] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, BundleDraft>>({});
  const [openCartRow, setOpenCartRow] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [added, setAdded] = useState<{
    key: string;
    productId: string;
    sequence: number;
  } | null>(null);
  const addedSequence = useRef(0);
  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const consumedSelection = useRef<number | null>(null);
  const cartHeadingRef = useRef<HTMLButtonElement>(null);
  const [liveResult, setLiveResult] = useState<{
    key: string;
    result?: QuoteResult;
    error?: string;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [undo, setUndo] = useState<{
    input: QuoteInput;
    kind: "clear" | "offer";
  } | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultKey = JSON.stringify([
    input,
    data.refreshedAt,
    data.products.map((p) => [p.id, p.version, p.available]),
    data.bands,
  ]);
  const localResult = useMemo(
    () =>
      data.demo && input.lines.length && input.price
        ? calculateQuote(input, data.products, data.bands)
        : null,
    [data.demo, data.products, data.bands, input],
  );
  const currentResult = data.demo
    ? localResult
    : liveResult?.key === resultKey
      ? liveResult.result
      : null;
  const result = !data.demo && !online ? null : currentResult;
  const calculating =
    !data.demo &&
    !!input.price &&
    !!input.lines.length &&
    online &&
    liveResult?.key !== resultKey;
  const error =
    !online && !data.demo
      ? "Reconnect to check the latest product costs."
      : (liveResult?.key === resultKey ? liveResult.error : "") ||
        (result && !result.valid ? result.error : "");
  const cartProducts = input.lines.flatMap((l) => {
    const p = data.products.find((p) => p.id === l.productId);
    return p ? [p] : [];
  });
  const cartBrand = cartProducts[0]?.brand;
  const mainItems = input.lines
    .filter((l) => !l.gift)
    .reduce((sum, l) => sum + l.quantity, 0);
  const giftItems = input.lines
    .filter((l) => l.gift)
    .reduce((sum, l) => sum + l.quantity, 0);
  const families = useMemo(() => {
    const map = new Map<string, Family>();
    data.products.forEach((p) => {
      const category = categoryKey(p.category);
      const section = ["mattress", "bed_frame", "sofa"].includes(category)
        ? category
        : "accessory";
      const key = JSON.stringify([p.brand, category, p.name, p.gift]);
      const family = map.get(key) ?? {
        key,
        name: p.name,
        brand: p.brand,
        category,
        section,
        gift: p.gift,
        products: [],
      };
      family.products.push(p);
      map.set(key, family);
    });
    return [...map.values()];
  }, [data.products]);
  const categories = sectionOrder.filter((section) =>
    families.some((f) => f.section === section),
  );

  useEffect(() => {
    if (!productSelection || consumedSelection.current === productSelection.key)
      return;
    consumedSelection.current = productSelection.key;
    const product = data.products.find(
      (item) => item.id === productSelection.id && item.available,
    );
    const family = families.find((item) =>
      item.products.some((variant) => variant.id === productSelection.id),
    );
    if (!product || !family) return;
    setCategoryBrands((old) => ({ ...old, [family.section]: product.brand }));
    setModels((old) => ({
      ...old,
      [`${product.brand}:${family.section}`]: family.key,
    }));
    selectVariant(family, product);
    changeView("catalog");
    requestAnimationFrame(() =>
      categoryRefs.current[family.section]?.scrollIntoView({
        block: "start",
        behavior: "instant",
      }),
    );
  }, [productSelection, data.products, families, cartBrand]);

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), 1500);
    return () => clearTimeout(timer);
  }, [added]);
  useEffect(() => {
    function readView() {
      setCartOpen(false);
      setOpenCartRow(null);
      setAdded(null);
      setView(
        new URL(window.location.href).searchParams.get("quoteView") ===
          "calculator"
          ? "calculator"
          : "catalog",
      );
    }
    readView();
    window.addEventListener("popstate", readView);
    return () => window.removeEventListener("popstate", readView);
  }, []);
  useEffect(() => {
    // A reconnect must recheck costs before showing a previously cached margin.
    if (!online) setLiveResult(null);
  }, [online]);
  useEffect(() => {
    if (data.demo || !input.price || !input.lines.length || !online) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await calculateMemberQuote(input);
        if (!cancelled)
          setLiveResult(
            response.ok
              ? { key: resultKey, result: response.data }
              : {
                  key: resultKey,
                  error: response.error ?? "Unable to calculate. Try again.",
                },
          );
      } catch {
        if (!cancelled)
          setLiveResult({
            key: resultKey,
            error: "Unable to reach the calculator. Please try again.",
          });
      }
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, resultKey, data.demo, data.products, data.bands, online]);

  function changeView(next: "catalog" | "calculator") {
    setView(next);
    setOpenCartRow(null);
    setCartOpen(false);
    setAdded(null);
    const url = new URL(window.location.href);
    url.searchParams.set("page", "quote");
    url.searchParams.set("quoteView", next);
    pushMemberRoute(url);
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() =>
      headingRef.current?.focus({ preventScroll: true }),
    );
  }
  function draftFor(family: Family): BundleDraft {
    const saved = drafts[family.key];
    const product =
      family.products.find((p) => p.id === saved?.productId) ??
      family.products.find((p) => p.available && p.size === "Queen") ??
      family.products.find((p) => p.available) ??
      family.products[0];
    return {
      productId: product.id,
      quantity: saved?.quantity ?? 1,
      gifts: (saved?.gifts ?? []).filter((line) => {
        const gift = data.products.find((p) => p.id === line.productId);
        return (
          gift?.available &&
          isAccessoryProduct(gift) &&
          gift.brand === product.brand &&
          isCompatibleGift(gift, [product])
        );
      }),
    };
  }
  function setDraft(family: Family, draft: BundleDraft) {
    setDrafts((old) => ({ ...old, [family.key]: draft }));
  }
  function brandsFor(section: string) {
    return [
      ...new Set(
        families.filter((f) => f.section === section).map((f) => f.brand),
      ),
    ];
  }
  function selectedBrand(section: string) {
    const brands = brandsFor(section);
    const saved = categoryBrands[section];
    return (
      (brands.includes(saved) ? saved : undefined) ??
      (cartBrand && brands.includes(cartBrand) ? cartBrand : undefined) ??
      families.find(
        (f) => f.section === section && f.products.some((p) => p.available),
      )?.brand ??
      brands[0] ??
      ""
    );
  }
  function selectedFamily(section: string) {
    const activeBrand = selectedBrand(section);
    const choices = families.filter(
      (f) => f.brand === activeBrand && f.section === section,
    );
    return (
      choices.find((f) => f.key === models[`${activeBrand}:${section}`]) ??
      choices.find((f) => f.products.some((p) => p.available)) ??
      choices[0]
    );
  }
  function selectBrand(section: string, brand: string) {
    if (brand === selectedBrand(section) || !brandsFor(section).includes(brand))
      return;
    const previous = selectedFamily(section);
    const previousProduct = previous?.products.find(
      (p) => p.id === draftFor(previous).productId,
    );
    const choices = families.filter(
      (f) => f.section === section && f.brand === brand,
    );
    const next =
      choices.find(
        (f) =>
          f.key === models[`${brand}:${section}`] &&
          f.products.some((p) => p.available),
      ) ??
      choices.find((f) => f.products.some((p) => p.available)) ??
      choices[0];
    if (!next) return;
    const preferred =
      next.products.find(
        (p) =>
          p.available &&
          p.size === previousProduct?.size &&
          p.color === previousProduct?.color,
      ) ??
      next.products.find(
        (p) => p.available && p.size === previousProduct?.size,
      ) ??
      next.products.find((p) => p.available && p.size === "Queen") ??
      next.products.find((p) => p.available) ??
      next.products[0];
    setAdded(null);
    setCategoryBrands((old) => ({ ...old, [section]: brand }));
    setModels((old) => ({ ...old, [`${brand}:${section}`]: next.key }));
    setDraft(next, { productId: preferred.id, quantity: 1, gifts: [] });
  }
  function selectModel(section: string, key: string) {
    const next = families.find((f) => f.key === key);
    const activeBrand = selectedBrand(section);
    if (!next || next.section !== section || next.brand !== activeBrand) return;
    setAdded(null);
    const previous = selectedFamily(section);
    const previousProduct = previous?.products.find(
      (p) => p.id === draftFor(previous).productId,
    );
    const preferred =
      next.products.find(
        (p) =>
          p.available &&
          p.size === previousProduct?.size &&
          p.color === previousProduct?.color,
      ) ??
      next.products.find(
        (p) => p.available && p.size === previousProduct?.size,
      );
    if (!drafts[next.key] && preferred)
      setDraft(next, { productId: preferred.id, quantity: 1, gifts: [] });
    setModels((old) => ({ ...old, [`${activeBrand}:${section}`]: key }));
  }
  function selectVariant(family: Family, product: MemberProduct) {
    setAdded(null);
    const old = draftFor(family);
    const gifts = old.gifts.filter((l) => {
      const p = data.products.find((p) => p.id === l.productId);
      return p && isCompatibleGift(p, [product]);
    });
    setDraft(family, { ...old, productId: product.id, gifts });
    if (gifts.length !== old.gifts.length)
      notify("Gift selection updated to fit the new size.");
  }
  function chooseGifts(family: Family) {
    const draft = draftFor(family),
      product = family.products.find((p) => p.id === draft.productId)!;
    openDialog({
      title: "Free gifts · Accessories",
      content: (
        <GiftPicker
          product={product}
          products={data.products}
          selected={draft.gifts}
          onApply={(gifts) => {
            setDraft(family, { ...draft, gifts });
            closeDialog();
          }}
        />
      ),
    });
  }
  function addBundle(family: Family) {
    const draft = draftFor(family);
    try {
      const product = family.products.find((p) => p.id === draft.productId)!;
      if (cartBrand && product.brand !== cartBrand)
        throw new Error(
          `Your cart contains ${cartBrand} products. Quote ${product.brand} separately to use the correct margin tiers.`,
        );
      const lines = addCartLines(
        input.lines,
        [
          {
            productId: draft.productId,
            quantity: draft.quantity,
            gift: false,
          },
          ...draft.gifts,
        ],
        data.products,
      );
      setInput({ ...input, lines });
      setUndo(null);
      setDraft(family, { ...draft, quantity: 1, gifts: [] });
      setAdded({
        key: family.key,
        productId: product.id,
        sequence: ++addedSequence.current,
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unable to add this product.");
    }
  }
  function changeQuantity(productId: string, quantity: number, gift: boolean) {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100) return;
    const lineKey = quoteLineKey({ productId, gift });
    const otherQuantity = input.lines
      .filter((line) => line.productId === productId && quoteLineKey(line) !== lineKey)
      .reduce((sum, line) => sum + line.quantity, 0);
    if (otherQuantity + quantity > 100) return;
    const changed = input.lines.flatMap((l) =>
      quoteLineKey(l) !== lineKey ? [l] : quantity ? [{ ...l, quantity }] : [],
    );
    const lines = pruneIncompatibleGifts(changed, data.products);
    if (lines.length < changed.length)
      notify("Removed gifts that no longer fit the remaining products.");
    setInput({ ...input, lines });
    setUndo(null);
    if (quantity === 0) {
      setOpenCartRow(null);
      requestAnimationFrame(() =>
        (cartHeadingRef.current ?? headingRef.current)?.focus({
          preventScroll: true,
        }),
      );
    }
  }
  function setPrice(price: string) {
    setInput((q) => ({ ...q, price }));
    setUndo(null);
  }
  const hasQuote =
    input.lines.length > 0 || input.price !== "" || Number(input.delivery) !== 0;
  function clearQuote() {
    if (!hasQuote) return;
    setUndo({ input: structuredClone(input), kind: "clear" });
    setInput({ ...input, lines: [], price: "", delivery: "0" });
    setDrafts({});
    setModels({});
    setCategoryBrands({});
    setOpenCartRow(null);
    setAdded(null);
    setLiveResult(null);
  }
  function restoreQuote() {
    if (!undo) return;
    setInput(undo.input);
    setUndo(null);
    notify("Previous quote restored.");
  }
  function pressDigit(key: string) {
    let next = input.price;
    if (key === "backspace") next = next.slice(0, -1);
    else if (key === ".") {
      if (next.includes(".")) return;
      next = (next || "0") + ".";
    } else {
      if (next.includes(".") && next.split(".")[1].length >= 2) return;
      next = next === "0" ? key : next + key;
    }
    if (next.length <= 12) setPrice(next);
  }
  async function preview() {
    if (!result?.valid || (!online && !data.demo)) return;
    setPreviewing(true);
    const snapshot = structuredClone(input),
      key = JSON.stringify(snapshot);
    try {
      const checked = data.demo
        ? calculateQuote(snapshot, data.products, data.bands)
        : await calculateMemberQuote(snapshot).then((response) => {
            if (!response.ok)
              throw new Error(response.error ?? "Unable to confirm the quote.");
            return response.data;
          });
      if (JSON.stringify(inputRef.current) !== key) {
        notify("Your cart changed. Review the new margin before previewing.");
        return;
      }
      if (!checked?.valid)
        throw new Error(checked?.error ?? "Unable to confirm the quote.");
      if (
        checked.version !== result.version ||
        checked.margin !== result.margin
      ) {
        setLiveResult({ key: resultKey, result: checked });
        notify(
          "Costs or rules changed. Check the updated margin before previewing.",
        );
        return;
      }
      const text = data.demo
        ? customerQuote(snapshot, data.products, checked)
        : checked.customerText;
      if (!text)
        throw new Error(
          "Customer quote is not ready. Please refresh and try again.",
        );
      openDialog({
        title: "Customer quote",
        content: (
          <CustomerPreview text={text} demo={data.demo} notify={notify} />
        ),
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unable to confirm the quote.");
    } finally {
      setPreviewing(false);
    }
  }

  function renderCategoryCard(section: string) {
    const activeBrand = selectedBrand(section);
    const brands = brandsFor(section);
    const choices = families.filter(
      (f) => f.brand === activeBrand && f.section === section,
    );
    const family = selectedFamily(section);
    if (!family) return null;
    const draft = draftFor(family);
    const product =
      family.products.find((p) => p.id === draft.productId) ??
      family.products[0];
    const sizes = [...new Set(family.products.map((p) => p.size))].sort(
      (a, b) => {
        const x = sizeOrder.indexOf(a),
          y = sizeOrder.indexOf(b);
        return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
      },
    );
    const colors = family.products.filter((p) => p.size === product.size);
    const giftCount = draft.gifts.reduce((sum, line) => sum + line.quantity, 0);
    const unavailable = !product.available;
    const differentCartBrand = !!cartBrand && product.brand !== cartBrand;
    const label = categoryLabel(section);
    const justAdded =
      added?.key === family.key && added.productId === product.id;
    return (
      <article
        key={section}
        ref={(el) => {
          categoryRefs.current[section] = el;
        }}
        className={s.productCard + " " + s.categoryCard}
        aria-label={label + " product card"}
      >
        <ProductVisual product={product} />
        <div className={s.productCardBody}>
          <div>
            <p className={s.eyebrow}>{label}</p>
            <div className={catalogStyles.selectors}>
              <label className={s.field + " " + catalogStyles.selector}>
                <span>Model</span>
                <select
                  aria-label={label + " model"}
                  value={family.key}
                  onChange={(e) => selectModel(section, e.target.value)}
                >
                  {choices.map((f) => (
                    <option
                      key={f.key}
                      value={f.key}
                      disabled={!f.products.some((p) => p.available)}
                    >
                      {f.name}
                      {!f.products.some((p) => p.available)
                        ? " · unavailable"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.field + " " + catalogStyles.selector}>
                <span>Brand</span>
                <select
                  aria-label={label + " brand"}
                  value={activeBrand}
                  onChange={(e) => selectBrand(section, e.target.value)}
                >
                  {brands.map((brand) => (
                    <option
                      key={brand}
                      value={brand}
                      disabled={
                        !families.some(
                          (f) =>
                            f.section === section &&
                            f.brand === brand &&
                            f.products.some((p) => p.available),
                        )
                      }
                    >
                      {brand}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className={s.caption} style={{ marginTop: 8 }}>
              {product.code}
              {product.color ? " · " + product.color : ""}
            </p>
          </div>
          <fieldset className={s.sizeOptions}>
            <legend>Select size</legend>
            {sizes.map((size) => {
              const p =
                family.products.find(
                  (p) =>
                    p.size === size && p.color === product.color && p.available,
                ) ??
                family.products.find((p) => p.size === size && p.available) ??
                family.products.find((p) => p.size === size)!;
              return (
                <button
                  key={size}
                  aria-pressed={product.size === size}
                  disabled={
                    !family.products.some((p) => p.size === size && p.available)
                  }
                  onClick={() => selectVariant(family, p)}
                >
                  {size}
                </button>
              );
            })}
          </fieldset>
          <div className={s.productOptions}>
            {colors.some((p) => p.color) && (
              <label className={s.field}>
                <span>Colour</span>
                <select
                  aria-label={family.name + " colour"}
                  value={product.id}
                  onChange={(e) =>
                    selectVariant(
                      family,
                      family.products.find((p) => p.id === e.target.value)!,
                    )
                  }
                >
                  {colors.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.available}>
                      {p.color || "Standard"}
                      {!p.available ? " · unavailable" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className={s.field}>
              <span>Quantity</span>
              <QuantityStepper
                label={family.name}
                value={draft.quantity}
                min={1}
                max={10}
                disabled={unavailable}
                onChange={(quantity) =>
                  setDraft(family, {
                    ...draft,
                    quantity,
                  })
                }
              />
            </div>
          </div>
          {differentCartBrand ? (
            <p id={`brand-note-${section}`} className={catalogStyles.brandNote}>
              Your cart contains {cartBrand} products. Quote {product.brand} separately to use the correct margin tiers.
            </p>
          ) : null}
          {!product.gift && !isAccessoryProduct(product) && (
            <>
              <button
                className={s.freeGiftLink}
                disabled={unavailable}
                onClick={() => chooseGifts(family)}
              >
                <span>
                  <Symbol name="gift" />
                  <span>
                    Free gifts
                    <small>
                      {giftCount
                        ? giftCount + " selected · Edit accessories"
                        : "Choose from accessories"}
                    </small>
                  </span>
                </span>
                <Symbol name="plus" size={18} />
              </button>
              {giftCount > 0 && (
                <p className={s.caption}>
                  {draft.gifts
                    .map(
                      (l) =>
                        (data.products.find((p) => p.id === l.productId)
                          ?.name ?? "Accessory") +
                        " ×" +
                        l.quantity,
                    )
                    .join(" · ")}
                </p>
              )}
            </>
          )}
          <button
            className={`${s.button} ${s.primary} ${s.full} ${s.addCartButton} ${justAdded ? s.addCartSuccess : ""}`}
            aria-label={unavailable ? "Currently unavailable" : "Add to cart"}
            aria-describedby={differentCartBrand ? `brand-note-${section}` : undefined}
            disabled={unavailable || differentCartBrand}
            onClick={() => addBundle(family)}
          >
            <span
              key={justAdded ? added.sequence : "ready"}
              className={s.addCartLabel}
            >
              <Symbol name={justAdded ? "check" : "cart"} />
              {unavailable
                ? "Currently unavailable"
                : justAdded
                  ? "Added to cart"
                  : "Add to cart"}
              {!justAdded && <Symbol name="plus" size={17} />}
            </span>
          </button>
        </div>
      </article>
    );
  }

  const cartSummary = (
    <section
      className={`${s.card} ${s.combinationCard}`}
      aria-label="Cart items"
    >
      <h2>
        <button
          ref={cartHeadingRef}
          className={s.combinationToggle}
          aria-label="Your combination"
          aria-expanded={cartOpen}
          aria-controls="quote-combination-panel"
          onClick={() => {
            setCartOpen((open) => !open);
            setOpenCartRow(null);
          }}
        >
          <Symbol name="cart" />
          <span className={s.combinationTitle}>
            <strong>Your combination</strong>
            <span className={s.caption}>
              {mainItems} product{mainItems === 1 ? "" : "s"} · {giftItems} free
              gift{giftItems === 1 ? "" : "s"}
            </span>
          </span>
          <svg
            className={s.combinationChevron}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h2>
      <div
        id="quote-combination-panel"
        className={`${s.combinationReveal} ${cartOpen ? s.combinationOpen : ""}`}
        aria-hidden={!cartOpen}
        inert={!cartOpen}
      >
        <div className={s.combinationClip}>
          <div className={s.combinationBody}>
            <div className={catalogStyles.cartActions}>
              <button
                className={s.button}
                onClick={() => changeView("catalog")}
              >
                <Symbol name="plus" />
                Add product
              </button>
              <button
                className={s.button + " " + catalogStyles.clearAll}
                disabled={!hasQuote}
                onClick={clearQuote}
              >
                Clear all
              </button>
            </div>
            {undo?.kind === "clear" && (
              <div className={catalogStyles.clearFeedback} role="status">
                <span>Quote cleared.</span>
                <button
                  className={s.link}
                  aria-label="Undo clear all"
                  onClick={restoreQuote}
                >
                  Undo
                </button>
              </div>
            )}
            {input.lines.length ? (
              <p className={s.cartSwipeHint}>
                Adjust quantity below. Swipe left for Delete.
              </p>
            ) : (
              <div className={catalogStyles.emptyCart}>
                <h3>Your cart is empty</h3>
                <p className={s.caption}>Add a product to start your next offer.</p>
              </div>
            )}
            <div className={`${s.cartLines} ${s.combinationScroll}`}>
              {input.lines.map((line) => {
                const p = data.products.find((p) => p.id === line.productId);
                const label = [
                  p?.name ?? "Unavailable product",
                  p?.size,
                  p?.color,
                  line.gift ? "free gift" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const key = quoteLineKey(line);
                const totalQuantity = input.lines
                  .filter((item) => item.productId === line.productId)
                  .reduce((sum, item) => sum + item.quantity, 0);
                return (
                  <SwipeCartRow
                    key={key}
                    id={encodeURIComponent(key)}
                    label={label}
                    open={openCartRow === key}
                    onOpenChange={(open) =>
                      setOpenCartRow(open ? key : null)
                    }
                    onDelete={() => changeQuantity(line.productId, 0, line.gift)}
                  >
                    <div className={s.cartLine + " " + s.cartLineAlways}>
                      {p ? (
                        <ProductVisual product={p} small />
                      ) : (
                        <span className={s.cartMissing}>?</span>
                      )}
                      <div className={s.cartLineInfo}>
                        <strong>{p?.name ?? "Unavailable product"}</strong>
                        <p className={s.caption}>
                          {p?.size}
                          {p?.color ? " · " + p.color : ""}
                        </p>
                        {line.gift && (
                          <span className={s.pill + " " + s.good}>
                            Free gift
                          </span>
                        )}
                        <div className={s.quantityControls}>
                          <button
                            aria-label={"Decrease " + label + " quantity"}
                            onClick={() =>
                              changeQuantity(line.productId, line.quantity - 1, line.gift)
                            }
                          >
                            −
                          </button>
                          <span aria-label="Quantity">{line.quantity}</span>
                          <button
                            aria-label={"Increase " + label + " quantity"}
                            disabled={totalQuantity >= 100 || !p?.available}
                            onClick={() =>
                              changeQuantity(line.productId, line.quantity + 1, line.gift)
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </SwipeCartRow>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className={s.quoteBuilder}>
      <span
        className={s.srOnly}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {added
          ? `${families.find((family) => family.key === added.key)?.name ?? "Product"} added to cart. Free gift selection cleared.`
          : ""}
      </span>
      <div className={`${s.titleRow} ${s.builderTitle}`}>
        <div>
          <p className={s.eyebrow}>FROM PRODUCT TO OFFER</p>
          <h1 ref={headingRef} tabIndex={-1}>
            {view === "catalog" ? "Build your offer" : "Calculator"}
          </h1>
          <p className={`${s.sub} ${s.intro}`}>
            {view === "catalog"
              ? "Choose your products. Make room for a better offer."
              : "Enter a selling price. See your margin immediately."}
          </p>
        </div>
      </div>
      {view === "catalog" ? (
        <>
          <div className={s.catalogToolbar}>
            <div className={s.catalogCategories} aria-label="Product category">
              {categories.map((c) => (
                <button
                  key={c}
                  className={s.filter}
                  onClick={() =>
                    categoryRefs.current[c]?.scrollIntoView({
                      block: "start",
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "instant"
                        : "smooth",
                    })
                  }
                >
                  {categoryLabel(c)}
                </button>
              ))}
            </div>
          </div>
          <div className={s.categoryGrid}>
            {categories.map(renderCategoryCard)}
          </div>
          {!families.length && (
            <div className={s.empty}>
              <h2>Your product collection is on its way</h2>
              <p className={s.sub}>
                Products will appear here when the catalogue is ready.
              </p>
            </div>
          )}
          <div className={s.catalogDock + " " + s.catalogCheckout}>
            <div>
              <strong>
                {mainItems
                  ? mainItems + " product" + (mainItems === 1 ? "" : "s")
                  : "Your cart is empty"}
              </strong>
              <p className={s.caption}>{giftItems} free gifts in your cart</p>
            </div>
            <button
              className={s.button + " " + s.primary}
              disabled={!mainItems}
              onClick={() => changeView("calculator")}
            >
              Calculator <Symbol name="arrow" size={17} />
            </button>
          </div>
        </>
      ) : (
        <div className={s.calculatorLayout}>
          <div className={s.calculatorPanel}>
            <section
              className={s.calculatorHero}
              aria-label="Price and margin calculator"
            >
              <div className={s.row}>
                <p className={s.eyebrow}>FIND YOUR PRICE</p>
                <button
                  className={s.calculatorClear}
                  onClick={() => setPrice("")}
                >
                  Clear price
                </button>
              </div>
              <div className={s.calculatorNumbers}>
                <label className={s.calculatorPrice}>
                  <span>Selling price · RM</span>
                  <input
                    aria-label="Selling price"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={input.price}
                    onChange={(e) => {
                      const price = e.target.value;
                      if (/^\d{0,9}(?:\.\d{0,2})?$/.test(price))
                        setPrice(price);
                    }}
                    onFocus={(e) => e.target.select()}
                  />
                  <small>Products + free gifts</small>
                </label>
                <div
                  className={s.calculatorMargin}
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span>Margin</span>
                  <strong>
                    {calculating
                      ? "…"
                      : result?.valid && result.margin !== null
                        ? `${result.margin.toFixed(2)}%`
                        : "—"}
                  </strong>
                  <span
                    className={`${s.pill} ${result?.valid ? s[result.tone] : s.neutral}`}
                  >
                    {calculating
                      ? "Checking…"
                      : result?.valid
                        ? result.label
                        : error
                          ? "Needs review"
                          : "Enter a price"}
                  </span>
                </div>
              </div>
            </section>
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
            {result?.boundary && <p className={s.error}>{result.boundary}</p>}
            <div className={s.calculatorKeypad} aria-label="Calculator keypad">
              {[
                "7",
                "8",
                "9",
                "4",
                "5",
                "6",
                "1",
                "2",
                "3",
                ".",
                "0",
                "backspace",
              ].map((key) => (
                <button
                  key={key}
                  aria-label={
                    key === "backspace"
                      ? "Delete last digit"
                      : key === "."
                        ? "Decimal point"
                        : key
                  }
                  onClick={() => pressDigit(key)}
                >
                  {key === "backspace" ? (
                    <Symbol name="erase" size={23} />
                  ) : (
                    key
                  )}
                </button>
              ))}
            </div>
            <details className={s.deliveryDetails}>
              <summary>
                Additional charges{" "}
                <span>{money(Number(input.delivery) || 0)}</span>
              </summary>
              <label className={s.field}>
                <span>Total additional charges · RM</span>
                <input
                  aria-label="Additional charges"
                  inputMode="decimal"
                  value={input.delivery}
                  onChange={(e) => {
                    if (/^\d{0,9}(?:\.\d{0,2})?$/.test(e.target.value)) {
                      setInput((q) => ({ ...q, delivery: e.target.value }));
                      setUndo(null);
                    }
                  }}
                />
              </label>
              <p className={s.caption}>
                Delivery, disposal and miscellaneous fees. Shown separately in
                the customer quote and excluded from the product margin.
              </p>
            </details>
            <button
              className={`${s.button} ${s.primary} ${s.full}`}
              disabled={
                !result?.valid ||
                calculating ||
                previewing ||
                (!online && !data.demo)
              }
              onClick={() => void preview()}
            >
              {previewing ? "Checking latest costs…" : "Preview customer quote"}
              <Symbol name="arrow" />
            </button>
            <p className={s.caption}>
              {result?.valid && result.multiplier < 1
                ? `Related commission ×${result.multiplier}. Flat KPI allowances are unchanged.`
                : "Quote tiers indicate this offer's margin. Monthly incentives still depend on every brand meeting its target."}
            </p>
          </div>
          <div className={s.calculatorAside}>
            {cartSummary}
            <div className={`${s.stack} ${s.quoteSupport}`}>
              {result?.valid &&
                (result.suggestions.length > 0 ||
                  result.nextPrice !== null) && (
                  <section className={s.suggestion}>
                    <div className={s.row}>
                      <h3>Make your offer go further</h3>
                      <Symbol name="gift" />
                    </div>
                    {result.suggestions.slice(0, 1).map((suggestion) => (
                      <div key={suggestion.productId}>
                        <p>
                          Add 1 {suggestion.name}. Margin becomes{" "}
                          <strong>{suggestion.margin.toFixed(2)}%</strong>,
                          keeping {suggestion.label}.
                        </p>
                        <button
                          className={`${s.button} ${s.smallButton}`}
                          onClick={() => {
                            try {
                              const lines = addCartLines(
                                input.lines,
                                [
                                  {
                                    productId: suggestion.productId,
                                    quantity: 1,
                                    gift: true,
                                  },
                                ],
                                data.products,
                              );
                              setUndo({ input: structuredClone(input), kind: "offer" });
                              setInput({ ...input, lines });
                              notify("Gift added. Your margin is updated.");
                            } catch (e) {
                              notify(
                                e instanceof Error
                                  ? e.message
                                  : "Unable to add this gift.",
                              );
                            }
                          }}
                        >
                          Add this gift <Symbol name="plus" size={16} />
                        </button>
                      </div>
                    ))}
                    {result.nextPrice !== null && (
                      <div>
                        <p>
                          Reach {result.nextThreshold}% at a selling price of{" "}
                          <strong>{money(result.nextPrice)}</strong>.
                        </p>
                        <button
                          className={s.link}
                          onClick={() => {
                            setUndo({ input: structuredClone(input), kind: "offer" });
                            setInput((q) => ({
                              ...q,
                              price: result.nextPrice!.toFixed(2),
                            }));
                          }}
                        >
                          Use this price <Symbol name="arrow" size={16} />
                        </button>
                      </div>
                    )}
                    <p className={s.caption}>
                      Based on product costs and current margin rules.
                    </p>
                  </section>
                )}
              {undo?.kind === "offer" && (
                <button
                  className={s.link}
                  onClick={restoreQuote}
                >
                  <Symbol name="back" size={16} />
                  Undo offer change
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
