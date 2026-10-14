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
/** How far (px) a phone's sheet must be pulled down before letting go closes it (as the CRM's sheets). */
export const SWIPE_CLOSE_PX = 90;
const SHEET_EASE = "cubic-bezier(.2,.8,.2,1)";

/** A scrolling box between the touch and the panel that is not at its top: the touch scrolls it, it does not drag. */
function scrolledAbove(target: Element, panel: HTMLElement): boolean {
  for (let el: Element | null = target; el && el !== panel.parentElement; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollTop > 0 && el.scrollHeight > el.clientHeight) return true;
  }
  return false;
}

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

  // A phone's sheet closes when it is pulled down (2026-10-14, the refresh handoff's motion: "swipe-down closes", as the
  // CRM's sheets since 2026-10-13): a touch that starts on the panel while what it scrolls is at its top drags the panel
  // with the finger; let go past SWIPE_CLOSE_PX and it slides away and closes, else it springs back. The move and end
  // listeners live only for such a touch — a document-wide non-passive touchmove makes iOS wait before every scroll.
  // Not on a desktop, where the sheet is a panel on the right.
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    let y0 = 0, dy = 0, live = false, active = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      dy = e.touches[0].clientY - y0;
      if (!live && dy > DRAG_PX) { live = true; panel.style.transition = "none"; }
      if (!live) { if (dy < -DRAG_PX) stop(); return; }
      e.preventDefault();
      panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const stop = () => {
      active = false;
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
    const onEnd = () => {
      const wasLive = live;
      stop();
      if (!wasLive) return;
      if (dy > SWIPE_CLOSE_PX) {
        panel.style.transition = `transform 320ms ${SHEET_EASE}`;
        panel.style.transform = "translateY(105%)";
        closeRef.current();
      } else {
        panel.style.transition = `transform 200ms ${SHEET_EASE}`;
        panel.style.transform = "";
      }
      // Its own classes take over again once it has gone, or come back.
      clearTimeout(settle);
      settle = setTimeout(() => { panel.style.transition = ""; panel.style.transform = ""; }, 340);
    };
    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      if (!target || e.touches.length !== 1 || panel.getBoundingClientRect().left > 0 || scrolledAbove(target, panel)) return;
      // A field or a picker inside the sheet keeps its own touch.
      if (target.closest("input, textarea, select, audio, video")) return;
      y0 = e.touches[0].clientY; dy = 0; live = false; active = true;
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
      document.addEventListener("touchcancel", onEnd);
    };
    panel.addEventListener("touchstart", onStart, { passive: true });
    return () => { panel.removeEventListener("touchstart", onStart); stop(); };
  }, [open]);

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
