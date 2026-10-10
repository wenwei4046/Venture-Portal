"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import s from "./sheet.module.css";

export type SheetDim = "a" | "b" | "c" | "d" | "e";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** The layer's z-index — the prototype stacks each sheet at its own. */
  z: number;
  dim?: SheetDim;
  /** Phone only: the panel's height / max-height (the prototype's ph84, pm86 …). */
  height?: string;
  maxHeight?: string;
  scroll?: boolean;
  /** Padding, gap and flex of the panel itself — they differ per sheet. */
  className?: string;
  label: string;
  /**
   * The sheet shows one row of the page behind it — a bill, a request, a person.
   * On desktop that page stays live beside the panel: a click there still closes
   * the panel, but it is not swallowed, so clicking another row swaps what the
   * panel shows in one click instead of only closing it. A phone keeps the dim.
   */
  peek?: boolean;
  children: ReactNode;
}

const dims = { a: s.dimA, b: s.dimB, c: s.dimC, d: s.dimD, e: s.dimE } as const;
/** A press that travels further than this before the click is a drag, not a click outside. */
const DRAG_PX = 6;

/** A bottom sheet on a phone, a right-hand panel on desktop. */
export default function Sheet({ open, onClose, z, dim = "a", height, maxHeight, scroll, className, label, peek = false, children }: SheetProps) {
  const vars = { "--sheet-h": height, "--sheet-max": maxHeight } as CSSProperties;
  const dimRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  // A peek closes on a click outside it from the document's capture phase — before
  // React's own click handlers — so the row clicked opens straight after, in the
  // same click. A press that began in the panel (selecting its text out of it) and
  // a drag are not clicks outside; the dim, where a phone has one, closes by itself.
  useEffect(() => {
    if (!peek || !open) return;
    let press: { inside: boolean; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      press = { inside: !!panelRef.current?.contains(e.target as Node), x: e.clientX, y: e.clientY };
    };
    const click = (e: MouseEvent) => {
      const pressed = press;
      press = null;
      const panel = panelRef.current;
      const target = e.target as Node | null;
      if (!panel || !target || panel.contains(target) || dimRef.current?.contains(target) || pressed?.inside) return;
      if (pressed && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > DRAG_PX) return;
      // The next row opens at its top, not where this one was scrolled to.
      panel.scrollTop = 0;
      closeRef.current();
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("click", click, true);
    };
  }, [peek, open]);

  return (
    <div className={`${s.layer} ${open ? s.layerOpen : ""} ${peek ? s.peek : ""}`} style={{ zIndex: z }} aria-hidden={!open}>
      <div ref={dimRef} className={`${s.dim} ${dims[dim]} ${open ? s.dimOpen : ""}`} onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={label}
        className={`${s.panel} ${open ? s.panelOpen : ""} ${scroll ? s.panelScroll : ""} ${className ?? ""}`}
        style={vars} inert={!open}>
        {children}
      </div>
    </div>
  );
}

export function SheetHandle() {
  return <span className={s.handle} />;
}
