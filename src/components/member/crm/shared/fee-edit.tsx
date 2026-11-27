"use client";
/**
 * The viewer's own marketing fee, typed in place (the owner, 2026-11-27: "RM 2500 的 marketing fee 变成可调整式，意思是当我调整为0时，
 * 我的其他数据也会跟着变动 … 不同的人去看数据，要求的价值有不同"; "DC & IR 都一样"). One figure a brand a month for every brand;
 * kept per person on the server (crm_save_ui_pref "mktFee"), so the desktop and the phone read the same — Marketing fee,
 * Total cost, Per lead and ROAS on Overview and Ads Performance all follow it. RM 0 leaves the fee out of them.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FEE_DEFAULT, feeTyped } from "../desk/vm/adsperf";
import { typePx } from "./type";

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;

export function FeeEdit({ value, save, tone = "ink", size = 12.5, style }: {
  value: number; save?: (n: number) => void; tone?: "ink" | "light"; size?: number; style?: CSSProperties;
}) {
  const [text, setText] = useState<string | null>(null);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (text != null) box.current?.select(); }, [text != null]); // eslint-disable-line react-hooks/exhaustive-deps
  const muted = tone === "light" ? "var(--crm-hero-label)" : "var(--crm-muted)";
  const ink = tone === "light" ? "#fff" : "var(--crm-ink)";
  const font: CSSProperties = { fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: typePx(size), fontVariantNumeric: "tabular-nums" };
  const done = () => {
    if (text == null) return;
    const n = feeTyped(text);
    setText(null);
    if (n != null && n !== value) save?.(n);
  };
  return (
    <span data-fee-edit="" style={{ display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap", color: muted, ...font, ...style }}
      onClick={e => e.stopPropagation()}>
      <span>Marketing fee</span>
      {text == null ? (
        <button type="button" disabled={!save} onClick={() => setText(String(value))} title={save ? "Change the marketing fee you see (each brand, each month)" : undefined}
          aria-label={`Marketing fee ${rm(value)} a brand a month${save ? ", change" : ""}`}
          style={{ border: 0, margin: 0, padding: "2px 8px", borderRadius: "999px", background: tone === "light" ? "rgba(255,255,255,.18)" : "var(--crm-field)", color: ink, cursor: save ? "pointer" : "default", ...font }}>
          {rm(value)}{save ? " ✎" : ""}
        </button>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          <span>RM</span>
          <input ref={box} value={text} inputMode="decimal" aria-label="Marketing fee a brand a month" onChange={e => setText(e.target.value)} onBlur={done}
            onKeyDown={e => { if (e.key === "Enter") done(); if (e.key === "Escape") setText(null); }}
            style={{ width: "76px", padding: "2px 6px", borderRadius: "6px", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)", ...font }} />
          {value !== FEE_DEFAULT && <button type="button" onMouseDown={e => { e.preventDefault(); setText(null); save?.(FEE_DEFAULT); }}
            style={{ border: 0, background: "transparent", padding: 0, color: tone === "light" ? "#fff" : "var(--crm-rust)", cursor: "pointer", ...font }}>Reset</button>}
        </span>
      )}
      <span>/ brand / month</span>
    </span>
  );
}
