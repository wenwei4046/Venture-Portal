"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MemberBand, QuoteInput, QuoteResult } from "@/lib/member/types";
import type { Outcome } from "../source";
import { calcVM, press as pressKey, quoteInput, type CalcVM } from "./calc-model";
import {
  EMPTY_MEMORY, NO_SOFA_BUILD, addLines, bump as bumpLine, defaultSize, firstFrame, itemCount, layoutFits, layoutKey, remember, sheetLines, sofaBuildOf,
  sofaBuildToSend, sofaCartCharge, sofaPick,
  type BfPick, type CartLine, type QCatalog, type QuoteMemory, type RecentFrame, type RecentSet, type SheetState, type SizeKey, type SofaBuild,
} from "./quote-model";

/** The design preview's starting point: the prototype's own cart, memory and open sheet. */
export interface QuoteInitial {
  brand: string;
  cart: CartLine[];
  price: string;
  memory: QuoteMemory;
  sheet: SheetState | null;
}

export interface UseQuoteArgs {
  /** Every brand's catalogue; the quote is on one of them. */
  catalogs: Record<string, QCatalog>;
  /** The brand to start on when nothing is kept (the first the department sells). */
  fallbackBrand: string;
  schemeId: string;
  bands: MemberBand[];
  /** Where the cart and the last-used sets are kept; null = nowhere (the preview). */
  storeKey: string | null;
  /** Viewing as somebody: nothing is added. */
  readOnly: boolean;
  /** Price the cart (live: the server). */
  calc: (input: QuoteInput) => Promise<Outcome<QuoteResult>>;
  /** True while step 2 (or the desktop calculator) is on screen. */
  pricing: boolean;
  initial?: QuoteInitial;
}

interface Kept {
  brand: string;
  cart: CartLine[];
  price: string;
  fee: string;
  build: SofaBuild;
}

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: unknown) {
  try { storage().setItem(key, JSON.stringify(value)); } catch { /* private mode: keep it in memory only */ }
}

export function useQuote(args: UseQuoteArgs) {
  const { catalogs, fallbackBrand, schemeId, bands, storeKey, readOnly, calc, pricing, initial } = args;
  const [brandState, setBrandState] = useState(initial?.brand ?? "");
  const [cart, setCart] = useState<CartLine[]>(initial?.cart ?? []);
  const [price, setPrice] = useState(initial?.price ?? "");
  const [fee, setFee] = useState("");
  const [build, setBuild] = useState<SofaBuild>(NO_SOFA_BUILD);
  const [sheet, setSheet] = useState<SheetState | null>(initial?.sheet ?? null);
  const [cartOpen, setCartOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [memory, setMemory] = useState<QuoteMemory>(initial?.memory ?? EMPTY_MEMORY);
  const [loaded, setLoaded] = useState(!storeKey);

  // What was kept on this phone: the cart for this session, the last-used sets for good.
  useEffect(() => {
    if (!storeKey) return;
    const kept = read<Kept>(() => sessionStorage, `rv-quote-${storeKey}`);
    if (kept && Array.isArray(kept.cart)) {
      setBrandState(kept.brand ?? "");
      setCart(kept.cart);
      setPrice(typeof kept.price === "string" ? kept.price : "");
      setFee(typeof kept.fee === "string" ? kept.fee : "");
      setBuild(sofaBuildOf(kept.build));
    }
    const mem = read<QuoteMemory>(() => localStorage, `rv-quote-memory-${storeKey}`);
    if (mem && typeof mem === "object") setMemory({ ...EMPTY_MEMORY, ...mem });
    setLoaded(true);
  }, [storeKey]);
  useEffect(() => {
    if (!storeKey || !loaded) return;
    write(() => sessionStorage, `rv-quote-${storeKey}`, { brand: brandState, cart, price, fee, build } satisfies Kept);
  }, [storeKey, loaded, brandState, cart, price, fee, build]);
  useEffect(() => {
    if (!storeKey || !loaded) return;
    write(() => localStorage, `rv-quote-memory-${storeKey}`, memory);
  }, [storeKey, loaded, memory]);

  const brand = catalogs[brandState] ? brandState : catalogs[fallbackBrand] ? fallbackBrand : Object.keys(catalogs)[0] ?? "";
  const catalog: QCatalog | null = catalogs[brand] ?? null;

  // A line the Product List no longer sells leaves the cart.
  useEffect(() => {
    if (!catalog || !loaded) return;
    const known = new Set<string>();
    for (const m of catalog.models) { Object.values(m.sizes).forEach(id => id && known.add(id)); m.modules.forEach(x => known.add(x.productId)); }
    for (const f of catalog.frames) Object.values(f.sizes).forEach(id => id && known.add(id));
    for (const a of catalog.accs) { if (a.any) known.add(a.any); Object.values(a.sizes).forEach(id => id && known.add(id)); }
    for (const k of catalog.kpis) known.add(k.productId);
    setCart(c => (c.every(l => known.has(l.productId)) ? c : c.filter(l => known.has(l.productId))));
  }, [catalog, loaded]);

  const items = itemCount(cart);

  // ── brand ──
  const setBrand = useCallback((code: string) => {
    if (code === brand) return;
    setBrandState(code);
    setCart([]); setPrice(""); setQuery(""); setCartOpen(false); setBuild(NO_SOFA_BUILD); setSheet(null);
  }, [brand]);

  // ── sheets ──
  const layouts = useCallback((modelKey: string) => {
    const model = catalog?.models.find(m => m.key === modelKey);
    return model ? (memory.layouts[brand] ?? []).filter(mods => layoutFits(model, mods)) : [];
  }, [catalog, memory.layouts, brand]);

  // A sofa sheet opens on the cart's leg height and specials: one build makes every sofa in it.
  const openModel = useCallback((key: string) => {
    const model = catalog?.models.find(m => m.key === key);
    if (!model) return;
    setAllOpen(false);
    if (catalog?.sofa) {
      const first = layouts(key)[0];
      setSheet({ mode: "sofa", key, layout: first ? "R0" : "C", mods: first ? { ...first } : {}, qty: 1, kpi: [], height: null, tier: null,
        leg: build.leg, specials: [...build.specials] });
    } else {
      setSheet({ mode: "model", key, size: defaultSize(model.sizes), acc: {}, qty: 1, bfs: [], fx: null, accAll: false });
    }
  }, [catalog, layouts, build.leg, build.specials]);

  const applySet = useCallback((r: RecentSet) => {
    if (r.kind === "sofa") {
      const i = layouts(r.key).findIndex(m => layoutKey(m) === layoutKey(r.mods));
      setSheet({ mode: "sofa", key: r.key, layout: i >= 0 ? `R${i}` : "C", mods: { ...r.mods }, qty: 1, kpi: [...r.kpi], height: null, tier: null,
        leg: build.leg, specials: [...build.specials] });
    } else {
      setSheet({ mode: "model", key: r.key, size: r.size, acc: {}, qty: 1, bfs: r.bfs.map(b => ({ ...b, kpi: [...b.kpi] })), fx: null, accAll: false });
    }
  }, [layouts, build.leg, build.specials]);

  const openFrameOnly = useCallback(() => {
    if (!catalog) return;
    setSheet({ mode: "frame", size: "Q", frame: firstFrame(catalog, "Q"), kpi: [], qty: 1, drop: false });
  }, [catalog]);
  const openAccOnly = useCallback(() => setSheet({ mode: "acc", size: "Q", acc: {}, accAll: false }), []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const patch = useCallback((p: Partial<SheetState>) => setSheet(s => (s ? ({ ...s, ...p } as SheetState) : s)), []);

  /** The bed frame being edited inside a mattress sheet, or the frame-only sheet itself. */
  const patchFrame = useCallback((p: Partial<BfPick & { drop: boolean }>) => setSheet(s => {
    if (!s) return s;
    if (s.mode === "model" && s.fx) return { ...s, fx: { ...s.fx, ...p } };
    if (s.mode === "frame") return { ...s, ...p };
    return s;
  }), []);

  const openBf = useCallback(() => setSheet(s => (s?.mode === "model" && catalog
    ? { ...s, fx: { size: s.size, frame: firstFrame(catalog, s.size), kpi: [], qty: 1, drop: false, idx: -1 } } : s)), [catalog]);
  const editBf = useCallback((i: number) => setSheet(s => (s?.mode === "model" && s.bfs[i]
    ? { ...s, fx: { ...s.bfs[i], kpi: [...s.bfs[i].kpi], drop: false, idx: i } } : s)), []);
  const removeBf = useCallback((i: number) => setSheet(s => (s?.mode === "model" ? { ...s, bfs: s.bfs.filter((_, j) => j !== i) } : s)), []);
  const backToMattress = useCallback(() => setSheet(s => (s?.mode === "model" ? { ...s, fx: null } : s)), []);
  const applyFrame = useCallback((r: RecentFrame) => patchFrame({ size: r.size, frame: r.frame, kpi: [...r.kpi], build: r.build ? { ...r.build } : undefined, drop: false }), [patchFrame]);

  const addSheet = useCallback(() => {
    if (readOnly || !sheet || !catalog) return;
    if (sheet.mode === "model" && sheet.fx) {
      const fx = sheet.fx;
      if (!fx.frame) return;
      const pick: BfPick = { size: fx.size, frame: fx.frame, kpi: [...fx.kpi], qty: fx.qty, ...(fx.build ? { build: { ...fx.build } } : {}) };
      setSheet({ ...sheet, bfs: fx.idx >= 0 ? sheet.bfs.map((b, j) => (j === fx.idx ? pick : b)) : [...sheet.bfs, pick], fx: null });
      return;
    }
    const lines = sheetLines(sheet, catalog);
    if (!lines.length) return;
    const sofa = sheet.mode === "sofa" ? sofaPick(sheet, catalog, cart, build) : null;
    if (sofa?.clash) return;
    if (sofa) {
      // The sheet's seat height, tier, leg height and specials become every sofa's in the cart.
      setBuild(b => ({ ...(sofa.graded ? { height: sofa.height, tier: sofa.tier } : { height: b.height, tier: b.tier }), leg: sofa.leg, specials: sofa.picked }));
    }
    setCart(c => addLines(c, lines));
    setMemory(m => remember(m, sheet, brand));
    setSheet(null);
  }, [readOnly, sheet, catalog, cart, build, brand]);

  // ── the cart ──
  const bump = useCallback((id: string, d: number) => setCart(c => bumpLine(c, id, d)), []);
  const remove = useCallback((id: string) => setCart(c => c.filter(l => l.id !== id)), []);
  const clearCart = useCallback(() => { setCart([]); setCartOpen(false); }, []);
  const toggleCart = useCallback(() => { if (cart.length) setCartOpen(o => !o); }, [cart.length]);
  useEffect(() => { if (!cart.length) setCartOpen(false); }, [cart.length]);

  // ── step 2 ──
  const press = useCallback((key: string) => setPrice(p => pressKey(p, key)), []);
  const input = useMemo(() => quoteInput(schemeId, cart, price, fee, sofaBuildToSend(build, catalog, cart)), [schemeId, cart, price, fee, build, catalog]);
  const inputKey = input ? JSON.stringify(input) : "";
  const [answer, setAnswer] = useState<{ key: string; result: QuoteResult | null; error: string | null } | null>(null);
  const latest = useRef(inputKey);
  latest.current = inputKey;
  useEffect(() => {
    if (!pricing || !input) return;
    const key = JSON.stringify(input);
    const timer = window.setTimeout(() => {
      void calc(input).then(r => {
        if (latest.current !== key) return;
        setAnswer(r.ok ? { key, result: r.data, error: null } : { key, result: null, error: r.error });
      });
    }, 220);
    return () => window.clearTimeout(timer);
    // `input` is keyed by `inputKey`; a new object with the same content asks nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricing, inputKey, calc]);

  const brandBands = useMemo(() => bands.filter(b => b.brand === brand), [bands, brand]);
  const kpiLines = cart.filter(l => l.kind === "kpi");
  const kpiAmount = kpiLines.reduce((a, l) => a + (catalog?.kpis.find(k => k.key === l.key)?.price ?? 0) * l.qty, 0);
  // What the options are charged (2026-10-05; every option since 2026-10-06): the server's
  // figure for the cart on screen, else the catalogue's own — the same charges: each bed
  // frame's, and the sofas' once per sofa.
  const optionCharge = answer && answer.key === inputKey && answer.result?.optionCharge !== undefined
    ? answer.result.optionCharge
    : cart.reduce((a, l) => a + (l.charge ?? 0) * l.qty, 0) + sofaCartCharge(catalog, cart, sofaBuildToSend(build, catalog, cart));
  const vm: CalcVM = useMemo(() => calcVM({
    price, items, bands: brandBands, fee,
    result: answer && input ? answer.result : null,
    error: answer && input ? answer.error : null,
    kpi: { qty: kpiLines.reduce((a, l) => a + l.qty, 0), amount: kpiAmount },
    options: optionCharge,
  }), [price, items, brandBands, fee, answer, input, kpiLines, kpiAmount, optionCharge]);
  /** The customer's quote, once the price on screen has been confirmed by the calculator. */
  const confirmed = answer && answer.key === inputKey && answer.result?.valid ? answer.result : null;
  const applyNext = useCallback(() => { if (vm.next) setPrice(vm.next.value.toFixed(2)); }, [vm.next]);

  return {
    brand, catalog, cart, items, price, fee, build, sheet, cartOpen, allOpen, query, previewOpen, memory, vm, confirmed, readOnly,
    /** The sofas' build the confirmed quote was costed with — what the customer's quote states. */
    quotedBuild: confirmed ? input?.build : undefined,
    setBrand, setFee: (v: string) => setFee(v.replace(/[^0-9.]/g, "")), setQuery, setAllOpen, setCartOpen, toggleCart, setPreviewOpen,
    openModel, applySet, openFrameOnly, openAccOnly, closeSheet, patch, patchFrame, openBf, editBf, removeBf, backToMattress, applyFrame, addSheet,
    bump, remove, clearCart, press, applyNext,
  };
}

export type QuoteApi = ReturnType<typeof useQuote>;
export type { SizeKey };
