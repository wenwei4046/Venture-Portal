/**
 * A table column's width, dragged at its header's right edge (the owner, 2026-10-13): Ads Performance's table and
 * Insight's ad table. The width follows the pointer until it is let go; a double-click gives the column back to the
 * table's own share.
 */
import type { DeskCtx, DeskUi } from "./ctx";

type Widths = "apW" | "insW";
type Down = { clientX: number; currentTarget: HTMLElement; preventDefault(): void; stopPropagation(): void };

export function columnSizer(set: DeskCtx["set"], field: Widths) {
  const resize = (k: string, min: number) => (e: Down) => {
    e.preventDefault(); e.stopPropagation();
    const cell = e.currentTarget.parentElement, x0 = e.clientX, w0 = cell ? cell.getBoundingClientRect().width : min;
    const move = (ev: PointerEvent) => {
      const w = Math.round(Math.min(640, Math.max(min, w0 + ev.clientX - x0)));
      set(u => ({ ...u, [field]: { ...(u[field] as Record<string, number>), [k]: w } }) as DeskUi);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); document.body.style.cursor = "col-resize";
  };
  const reset = (k: string) => () => set(u => { const w = { ...(u[field] as Record<string, number>) }; delete w[k]; return { ...u, [field]: w } as DeskUi; });
  return { resize, reset };
}
