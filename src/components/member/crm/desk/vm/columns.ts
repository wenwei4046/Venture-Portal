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

/**
 * A side pane's or column's edge, dragged (v2, the prototype's ibDrag): the width follows the pointer between lo and hi,
 * `dir` -1 for an edge on the left of what it sizes. Kept in the screen's state under `key`; a double-click on the edge
 * sets it back to null (the default).
 */
type WidthKey = "ibListW" | "ibInfoW" | "ibCpW" | "paneW" | "sheetW" | "menuW" | "perfW" | "mwtLogW" | "auditW";
export function edgeDrag(set: DeskCtx["set"], key: WidthKey, w0: number, dir: 1 | -1, lo: number, hi: number) {
  return (e: Down) => {
    e.preventDefault();
    const host = e.currentTarget.parentElement, sc = host ? host.getBoundingClientRect().width / (host.offsetWidth || 1) || 1 : 1, x0 = e.clientX;
    const move = (ev: PointerEvent) => { const w = Math.round(Math.min(hi, Math.max(lo, w0 + (dir * (ev.clientX - x0)) / sc))); set(u => ({ ...u, [key]: w }) as DeskUi); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; };
    document.body.style.cursor = "col-resize"; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
}

/** A table's columns as one array of widths (Contacts' PP columns, Audit log's three), each dragged at its edge. */
export function arrayDrag(set: DeskCtx["set"], key: "auCols", w0: number[], min: number[], max: number) {
  return (i: number) => (e: Down) => {
    e.preventDefault();
    const host = e.currentTarget.parentElement, sc = host ? host.getBoundingClientRect().width / (host.offsetWidth || 1) || 1 : 1, x0 = e.clientX, start = [...w0];
    const move = (ev: PointerEvent) => { const n = [...start]; n[i] = Math.round(Math.min(max, Math.max(min[i], start[i] + (ev.clientX - x0) / sc))); set(u => ({ ...u, [key]: n }) as DeskUi); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; };
    document.body.style.cursor = "col-resize"; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
}

/** One named width in a map (Contacts' table: each column by its key). The drag starts from the column as drawn — it
 * started from a default width, so the first drag of a shared (fr) column jumped (2026-10-23, the owner: "做成可调节宽度"). */
export function mapDrag(set: DeskCtx["set"], key: "ppCW", w0: number, k: string, lo: number, hi: number) {
  return (e: Down) => {
    e.preventDefault(); e.stopPropagation();
    const host = e.currentTarget.parentElement, sc = host ? host.getBoundingClientRect().width / (host.offsetWidth || 1) || 1 : 1, x0 = e.clientX;
    if (host && host.offsetWidth) w0 = host.offsetWidth;
    const move = (ev: PointerEvent) => { const n = Math.round(Math.min(hi, Math.max(lo, w0 + (ev.clientX - x0) / sc))); set(u => ({ ...u, [key]: { ...(u[key] as Record<string, number>), [k]: n } }) as DeskUi); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; };
    document.body.style.cursor = "col-resize"; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
}
