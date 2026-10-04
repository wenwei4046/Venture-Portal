"use client";

import { useState } from "react";
import Sheet, { SheetHandle } from "../Sheet";
import { ICON, Svg } from "../icons";
import { rm2 } from "../format";
import { cartMeta, sizesText, TAGS, type CartLine, type QCatalog, type QModel } from "./quote-model";
import { QtyStepper } from "./QuoteCalc";
import s from "./quote.module.css";

const TRASH = "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3";
const SEARCH = "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3";
const TAG_CLASS = { orange: s.tagOrange, sand: s.tagSand, green: s.tagGreen, amber: s.tagAmber } as const;

/** *In this quote* — the cart (`cart-style="a"`, 1461–1480). */
export function CartSheet({ open, cart, brandName, itemsText, onClose, onClear, onBump, onRemove, onSetPrice }: {
  open: boolean;
  cart: CartLine[];
  brandName: string;
  itemsText: string;
  onClose: () => void;
  onClear: () => void;
  onBump: (id: string, d: number) => void;
  onRemove: (id: string) => void;
  onSetPrice: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} z={27} dim="a" maxHeight="78%" className={s.cartPanel} label="In this quote">
      <SheetHandle />
      <div className={s.cartHead}>
        <div><h2 className={s.cartTitle}>In this quote</h2><p className={s.cartSub}>{itemsText}</p></div>
        <button className={s.clearAll} onClick={onClear}>Clear all</button>
      </div>
      <div className={s.cartList}>
        {cart.map(l => {
          const tag = TAGS[l.kind];
          return (
            <div key={l.id} className={s.cartRow}>
              <span className={`${s.tag} ${TAG_CLASS[tag.tone]}`}>{tag.label}</span>
              <div className={s.cartText}><span className={s.cartName}>{l.name}</span><span className={s.cartMeta}>{cartMeta(l, brandName)}</span></div>
              <QtyStepper qty={l.qty} onMinus={() => onBump(l.id, -1)} onAdd={() => onBump(l.id, 1)} />
              <button className={s.trash} aria-label="Remove" onClick={() => onRemove(l.id)}><Svg d={TRASH} size={15} sw={2} /></button>
            </div>
          );
        })}
      </div>
      <div className={s.cartFoot}>
        <button className={s.keepAdding} onClick={onClose}>Keep adding</button>
        <button className={s.cartSet} onClick={onSetPrice}>Set price</button>
      </div>
    </Sheet>
  );
}

function matches(model: QModel, q: string): boolean {
  if (!q) return true;
  const hay = [model.name, model.desc, sizesText(model), ...model.modules.map(x => `${x.code} ${x.desc}`)].join(" ").toLowerCase();
  return hay.includes(q);
}

/** *All Akemi models* — A–Z, with a search (1481–1492). */
export function AllModelsSheet({ open, catalog, cart, query, onQuery, onClose, onModel }: {
  open: boolean;
  catalog: QCatalog;
  cart: CartLine[];
  query: string;
  onQuery: (q: string) => void;
  onClose: () => void;
  onModel: (key: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const list = catalog.models.filter(m => matches(m, q));
  return (
    <Sheet open={open} onClose={onClose} z={25} dim="a" height="82%" className={s.allPanel} label={`All ${catalog.name} models`}>
      <SheetHandle />
      <div className={s.allHead}>
        <h2 className={s.allTitle}>{`All ${catalog.name} models`}</h2>
        <span className={s.allCount}>{`${catalog.models.length} models · A–Z`}</span>
      </div>
      <div className={s.search}>
        <Svg d={SEARCH} size={17} sw={1.9} stroke="var(--rv-sub)" />
        <input className={s.searchInput} value={query} onChange={e => onQuery(e.target.value)} placeholder="Search by name or type" />
      </div>
      <div className={s.allList}>
        {list.map(m => {
          const sizes = cart.filter(l => l.kind === "mattress" && l.key === m.key).map(l => l.size);
          const sofa = cart.some(l => l.kind === "sofa" && l.key === m.key);
          return (
            <button key={m.key} className={s.modelRow} onClick={() => onModel(m.key)}>
              <span className={s.modelText}>
                <span className={s.modelName}>{m.name}</span>
                {(sizes.length > 0 || sofa) && <span className={s.inCart}>{sizes.length ? `In cart · ${sizes.join(", ")}` : "In cart"}</span>}
              </span>
              <Svg d={ICON.chevronRight} size={16} sw={1.9} stroke="var(--rv-sub)" />
            </button>
          );
        })}
        {!list.length && <p className={s.noMatch}>{`No ${catalog.name} model matches “${query.trim()}”.`}</p>}
      </div>
    </Sheet>
  );
}

export interface CustomerQuote {
  lines: { name: string; qty: number }[];
  build: string[];
  price: number;
  fee: number;
  /** The text the calculator confirmed — what Copy and Share send. */
  text: string;
}

/** What the customer is shown — the dock's *Preview customer quote*. */
export function CustomerQuoteSheet({ open, quote, brandName, onClose }: {
  open: boolean;
  quote: CustomerQuote | null;
  brandName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (!quote) return;
    try {
      if (navigator.share) { await navigator.share({ text: quote.text }); return; }
      await navigator.clipboard.writeText(quote.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* the member closed the share sheet */ }
  };
  const copy = async () => {
    if (!quote) return;
    try {
      await navigator.clipboard.writeText(quote.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* no clipboard: the text stays on screen */ }
  };
  const items = quote?.lines.reduce((n, l) => n + l.qty, 0) ?? 0;
  return (
    <Sheet open={open} onClose={onClose} z={28} dim="a" maxHeight="86%" scroll className={s.cqPanel} label="Customer quote">
      <SheetHandle />
      <div className={s.cqHead}>
        <div>
          <p className={s.psEyebrow}>CUSTOMER QUOTE</p>
          <h2 className={s.psTitle}>{brandName}</h2>
          <p className={s.psSub}>{`${items} item${items === 1 ? "" : "s"} · what the customer sees`}</p>
        </div>
        <button className={s.psClose} aria-label="Close" onClick={onClose}><Svg d="m6 6 12 12M6 18 18 6" size={18} sw={1.9} /></button>
      </div>
      {quote && (
        <>
          <div className={s.cqCard}>
            <div className={s.cqLines}>
              {quote.lines.map((l, i) => (
                <div key={i} className={s.cqLine}><span>{l.name}</span><span className={s.cqQty}>× {l.qty}</span></div>
              ))}
            </div>
            {quote.build.map((b, i) => <div key={i} className={s.cqBuild}>{b}</div>)}
            <div className={s.cqSums}>
              <div className={s.cqSum}><span>Selling price</span><span className={s.payAmt}>{rm2(quote.price)}</span></div>
              <div className={s.cqSum}><span>Additional fee</span><span className={s.payAmt}>{rm2(quote.fee)}</span></div>
              <div className={s.cqTotal}><span>Total</span><span className={s.payAmt}>{rm2(quote.price + quote.fee)}</span></div>
            </div>
          </div>
          <p className={s.cqTerms}>Tax and other service charges as stated in the confirmed order terms. Availability, delivery date and quote validity are subject to the final confirmed order.</p>
          <div className={s.cqFoot}>
            <button className={s.keepAdding} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            <button className={s.cartSet} onClick={share}>Share quote</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
