/**
 * A bottom sheet closes when it is pulled down (user 2026-10-13: "customer list 往下滑可以收起来"). Every CRM sheet is a
 * panel sliding up (`animation: sheetUp …`) inside a dimmed backdrop whose own tap closes it, so one listener on the
 * document serves them all, the salesperson's and the Control panel's: a touch that starts on a sheet whose content is
 * scrolled to its top drags the sheet with the finger; let go past the threshold and the backdrop is tapped (its close
 * runs, exactly as a tap outside would), else it springs back. A sheet that is scrolled keeps scrolling.
 */
import { useEffect } from "react";

/** How far (px) a sheet must be pulled before letting go closes it. */
export const CLOSE_AFTER = 90;

/** The sheet a touch started on: the nearest element sliding up, not a full-screen page. */
export function sheetOf(t: EventTarget | null): HTMLElement | null {
  const el = (t as Element | null)?.closest?.('[style*="sheetUp"]');
  return el instanceof HTMLElement ? el : null;
}

/** The scrolling box between the touch and the sheet that is not at its top (then the touch scrolls, it does not drag). */
function scrolledAbove(t: Element, sheet: HTMLElement): boolean {
  for (let el: Element | null = t; el && el !== sheet.parentElement; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollTop > 0 && el.scrollHeight > el.clientHeight) return true;
  }
  return false;
}

export function useSwipeToClose() {
  useEffect(() => {
    let sheet: HTMLElement | null = null, y0 = 0, dy = 0, live = false;
    const onStart = (e: TouchEvent) => {
      const s = sheetOf(e.target);
      if (!s || e.touches.length !== 1 || scrolledAbove(e.target as Element, s)) return;
      // A field or a picker inside the sheet keeps its own touch.
      if ((e.target as Element).closest("input, textarea, select")) return;
      sheet = s; y0 = e.touches[0].clientY; dy = 0; live = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!sheet) return;
      dy = e.touches[0].clientY - y0;
      if (!live && dy > 6) { live = true; sheet.style.transition = "none"; }
      if (!live) { if (dy < -6) sheet = null; return; }
      e.preventDefault();
      sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const onEnd = () => {
      const s = sheet; sheet = null;
      if (!s || !live) return;
      if (dy > CLOSE_AFTER && s.parentElement) {
        s.style.transition = "transform 160ms ease-out"; s.style.transform = "translateY(100%)";
        const backdrop = s.parentElement;
        setTimeout(() => backdrop.click(), 140);
      } else {
        s.style.transition = "transform 200ms cubic-bezier(.2,.8,.2,1)"; s.style.transform = "";
      }
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);
}
