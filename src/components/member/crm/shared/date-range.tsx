"use client";
/**
 * One date-range picker for every place the CRM picks a period (docs/design_handoff_crm/fixes/voice-and-dates.md §2):
 * Custom lets them pick any From and To, earlier months included, and it never overlaps or is clipped.
 *   - a month header with ‹ › (no limit to this month), a month grid; click a start then an end (an end before the start
 *     swaps them); the range as words ("3 – 18 Oct 2026"); From / To date fields in step with the grid; Apply · Cancel;
 *   - future days only where the data can exist (`future`);
 *   - answers { a: From 00:00, b: To 23:59:59.999 } in local time;
 *   - portalled to the page with fixed positioning beside its anchor, flipping up / left where there is no room, above
 *     tables and side panels; a click outside or Esc closes it. On a phone (`sheet`) it is a bottom sheet.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { typePx } from "./type";
import { CAL } from "./cal-look";

const f = (w: number, px: number) => `${w} ${typePx(px)} Inter, sans-serif`;

export interface Range { a: number; b: number }
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONF = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

/** "3 – 18 Oct 2026", "28 Sep – 4 Oct 2026", "3 Oct 2026". */
export function rangeWords(a: string, b: string | null): string {
  const x = fromIso(a), y = b ? fromIso(b) : x;
  if (!b || a === b) return `${x.getDate()} ${MON[x.getMonth()]} ${x.getFullYear()}`;
  if (x.getFullYear() !== y.getFullYear()) return `${x.getDate()} ${MON[x.getMonth()]} ${x.getFullYear()} – ${y.getDate()} ${MON[y.getMonth()]} ${y.getFullYear()}`;
  if (x.getMonth() !== y.getMonth()) return `${x.getDate()} ${MON[x.getMonth()]} – ${y.getDate()} ${MON[y.getMonth()]} ${y.getFullYear()}`;
  return `${x.getDate()} – ${y.getDate()} ${MON[y.getMonth()]} ${y.getFullYear()}`;
}

/** A click on a day: a start, then an end (swapped when before the start), then a start again. */
export function tapDay(a: string | null, b: string | null, day: string): { a: string; b: string | null } {
  if (!a || b) return { a: day, b: null };
  return day < a ? { a: day, b: a } : { a, b: day };
}
/** The range as answered: From 00:00 to To 23:59:59.999, local time. */
export function toRange(a: string, b: string | null): Range { return { a: dayStart(fromIso(a)), b: dayEnd(fromIso(b ?? a)) }; }

/**
 * What opened a picker that names no anchor: the button last pressed (the owner, 2026-11-09: "日历也不应该出现在画面中间" —
 * the Audit log's and Reports' pickers named none and sat in the screen's middle, over the page).
 */
let lastPress: HTMLElement | null = null;
if (typeof document !== "undefined") document.addEventListener("pointerdown", e => { const t = (e.target as Element | null)?.closest?.("button,[role=button],a"); if (t instanceof HTMLElement) lastPress = t; }, true);

export function DateRangePicker({ value, onApply, onCancel, anchor, future = false, sheet = false, today = new Date(), allFrom }: {
  value: Range | null; onApply(r: Range): void; onCancel(): void; anchor?: RefObject<HTMLElement | null>; future?: boolean; sheet?: boolean; today?: Date;
  /** The first day there is anything to show: offers All time (the owner, 2026-11-09: "新增 All Time"). */
  allFrom?: number;
}) {
  const opener = useRef<HTMLElement | null>(null);
  if (!opener.current && !sheet) opener.current = lastPress;
  const todayIso = iso(today);
  const [a, setA] = useState<string | null>(value ? iso(new Date(value.a)) : null);
  const [b, setB] = useState<string | null>(value ? iso(new Date(value.b)) : null);
  const [month, setMonth] = useState(() => { const d = value ? new Date(value.a) : today; return new Date(d.getFullYear(), d.getMonth(), 1); });
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (sheet) return;
    const place = () => {
      const at = anchor?.current ?? (opener.current?.isConnected ? opener.current : null), rr = at?.getBoundingClientRect();
      const r = rr && rr.width + rr.height > 0 ? rr : undefined, el = box.current; if (!el) return;
      const w = el.offsetWidth, h = el.offsetHeight, W = window.innerWidth, H = window.innerHeight;
      const x = r ? r.left : W - w - 24, y = r ? r.bottom + 6 : 72;
      const left = Math.max(8, Math.min(x + w > W - 8 && r ? r.right - w : x, W - w - 8));
      const top = y + h > H - 8 && r && r.top - h - 6 >= 8 ? r.top - h - 6 : Math.max(8, Math.min(y, H - h - 8));
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor, sheet, month]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    const down = (e: PointerEvent) => { if (!sheet && box.current && !box.current.contains(e.target as Node) && !anchor?.current?.contains(e.target as Node)) onCancel(); };
    window.addEventListener("keydown", key); document.addEventListener("pointerdown", down, true);
    return () => { window.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down, true); };
  }, [onCancel, sheet, anchor]);

  const first = month, lead = (first.getDay() + 6) % 7, nDays = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + nDays) / 7) * 7 }, (_, i) => { const d = new Date(first.getFullYear(), first.getMonth(), i - lead + 1); return { d, s: iso(d), inM: d.getMonth() === first.getMonth() }; });
  const tap = (s: string) => { const n = tapDay(a, b, s); setA(n.a); setB(n.b); };
  const field = (k: "a" | "b") => (e: { target: { value: string } }) => {
    const v = e.target.value; if (!v || (!future && v > todayIso)) return;
    if (k === "a") { setA(v); if (b && b < v) setB(v); } else { setB(v); if (a && v < a) { setB(a); setA(v); } }
    const d = fromIso(v); setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const apply = () => { if (a) onApply(toRange(a, b)); };
  const step = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));
  // Quick ranges, ending today: picking one fills From and To, Apply shows it.
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const quick: [string, Date, Date][] = [["Last 7 days", new Date(t0.getTime() - 6 * 86_400_000), t0], ["This month", new Date(t0.getFullYear(), t0.getMonth(), 1), t0],
    ["Last month", new Date(t0.getFullYear(), t0.getMonth() - 1, 1), new Date(t0.getFullYear(), t0.getMonth(), 0)],
    ...(allFrom != null ? [["All time", new Date(Math.min(allFrom, t0.getTime())), t0] as [string, Date, Date]] : [])];
  const setQuick = (x: Date, y: Date) => { setA(iso(x)); setB(iso(y)); setMonth(new Date(y.getFullYear(), y.getMonth(), 1)); };
  const lo = a && b ? a : a, hi = b ?? a;
  const FIELD: CSSProperties = { flex: 1, minWidth: 0, height: "34px", padding: "0 8px", boxSizing: "border-box", border: "1px solid var(--crm-line)", borderRadius: "7px", font: f(400, 12.5), color: "var(--crm-ink)", background: "#fff" };
  const BTN: CSSProperties = { height: "34px", padding: "0 14px", borderRadius: "7px", font: f(500, 13), cursor: "pointer", display: "flex", alignItems: "center", border: 0 };
  /** The phone sheet's month arrows: the Insight period sheet's 34 px white circles. */
  const ROUND: CSSProperties = { width: "34px", height: "34px", padding: 0, border: 0, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(42,22,12,.10)", display: "grid", placeItems: "center", color: "var(--crm-ink)", font: f(500, 16), cursor: "pointer" };

  const body = (
    <div ref={box} role="dialog" aria-label="Pick dates" onClick={e => e.stopPropagation()}
      style={sheet
        ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 1000, background: "#fff", borderRadius: "26px 26px 0 0", padding: "10px 20px calc(24px + var(--sheet-safe, 0px))", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "12px", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", color: "var(--crm-ink)", fontFamily: "Inter, sans-serif" }
        : { position: "fixed", zIndex: 1000, width: "320px", boxSizing: "border-box", padding: "14px", borderRadius: "10px", background: "#fff", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "10px", color: "var(--crm-ink)", fontFamily: "Inter, sans-serif", ...pos }}>
      {sheet && <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-line)", margin: "0 auto" }} />}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {quick.map(([l, x, y]) => { const on = a === iso(x) && (b ?? a) === iso(y);
          return <button key={l} type="button" onClick={() => setQuick(x, y)} aria-pressed={on} style={{ height: "28px", padding: "0 10px", borderRadius: "14px", border: `1px solid ${on ? "var(--crm-ink)" : "var(--crm-line)"}`, background: on ? "var(--crm-ink)" : "#fff", color: on ? "#fff" : "var(--crm-ink)", font: f(500, 12), cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>; })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <button type="button" aria-label="Previous month" onClick={() => step(-1)} style={sheet ? ROUND : { ...BTN, width: "30px", padding: 0, justifyContent: "center", background: "transparent", color: "var(--crm-ink)" }}>‹</button>
        <span style={{ flex: 1, textAlign: "center", font: sheet ? f(700, 16) : f(500, 14), whiteSpace: "nowrap" }}>{MONF[month.getMonth()]} {month.getFullYear()}</span>
        <button type="button" aria-label="Next month" onClick={() => step(1)} style={sheet ? ROUND : { ...BTN, width: "30px", padding: 0, justifyContent: "center", background: "transparent", color: "var(--crm-ink)" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: "2px" }}>
        {DOW.map((d, i) => <span key={i} style={{ textAlign: "center", font: f(500, 11), color: "var(--crm-faint)", height: "22px", lineHeight: "22px" }}>{d}</span>)}
        {cells.map((c, i) => {
          // The CRM's one range-picker look (cal-look.ts, as the phone's period sheets): the ends rust, the peach band between, today a rust ring.
          const off = !future && c.s > todayIso, end = c.s === lo || c.s === hi, mid = !!lo && !!hi && c.s > lo && c.s < hi, today = c.s === todayIso && !end;
          // On a phone the sheet draws its days as the Insight period sheet does (panel/vm/common.ts › ovrCells): a 36 px circle
          // in a 40 px cell, the band a pill across the range that rounds at the range's ends and the row's edges.
          if (sheet) {
            const band = !!lo && !!hi && lo !== hi && (mid || end), col = i % 7, l = c.s === lo || col === 0, r = c.s === hi || col === 6;
            return (
              <button key={c.s} type="button" disabled={off} onClick={() => tap(c.s)} aria-pressed={end} aria-label={c.s} data-day={c.s}
                style={{ height: "40px", border: 0, padding: 0, display: "grid", placeItems: "center", cursor: off ? "default" : "pointer", background: band ? CAL.rangeBg : "transparent",
                  borderRadius: band ? `${l ? 20 : 0}px ${r ? 20 : 0}px ${r ? 20 : 0}px ${l ? 20 : 0}px` : 0 }}>
                <span style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", font: f(end || today ? 700 : 500, 14), fontVariantNumeric: "tabular-nums",
                  background: end ? CAL.pickBg : today ? "#fff" : "transparent", boxShadow: end ? "0 3px 8px rgba(42,22,12,.22)" : today ? CAL.todayRing : "none",
                  color: end ? CAL.pickFg : off ? CAL.offFg : c.inM ? CAL.dayFg : CAL.outFg }}>{c.d.getDate()}</span>
              </button>
            );
          }
          return (
            <button key={c.s} type="button" disabled={off} onClick={() => tap(c.s)} aria-pressed={end} aria-label={c.s} data-day={c.s}
              style={{ height: "32px", border: 0, padding: 0, cursor: off ? "default" : "pointer", font: f(end || today ? 600 : 400, 12.5), borderRadius: end || today ? "7px" : 0,
                background: end ? CAL.pickBg : mid ? CAL.rangeBg : "transparent", boxShadow: today ? CAL.todayRing : "none",
                color: end ? CAL.pickFg : off ? CAL.offFg : c.inM ? CAL.dayFg : CAL.outFg }}>{c.d.getDate()}</button>
          );
        })}
      </div>
      <div style={{ font: f(500, 12.5), color: a ? "var(--crm-ink)" : "var(--crm-faint)", whiteSpace: "nowrap" }}>{a ? rangeWords(lo!, hi) : "Pick the first day"}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <input type="date" aria-label="From" value={lo ?? ""} max={future ? undefined : todayIso} onChange={field("a")} style={FIELD} />
        <span style={{ color: "var(--crm-faint)" }}>–</span>
        <input type="date" aria-label="To" value={hi ?? ""} max={future ? undefined : todayIso} onChange={field("b")} style={FIELD} />
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={{ ...BTN, background: "#fff", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }}>Cancel</button>
        <button type="button" onClick={apply} disabled={!a} style={{ ...BTN, background: "var(--crm-rust)", color: "#fff", opacity: a ? 1 : 0.5 }}>Apply</button>
      </div>
    </div>
  );
  if (typeof document === "undefined") return null;
  return createPortal(sheet ? (<><div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out" }} />{body}</>) : body, document.body);
}
