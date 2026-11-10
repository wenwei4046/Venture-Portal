"use client";

import { goneWords, type GoneChannel } from "./media-gone";
import { typePx } from "./type";

/**
 * A customer's file Meta no longer serves and we never kept (2026-11-10): a quiet tile in the file's place —
 * "Photo no longer available · WhatsApp keeps a customer's files 7 days" — instead of a black box that retries.
 */
export function GoneTile({ kind, channel, style }: { kind: "image" | "video" | "audio" | "file"; channel: GoneChannel; style?: React.CSSProperties }) {
  const w = goneWords(kind, channel);
  return (
    <span data-media-gone={kind} role="img" aria-label={`${w.title}. ${w.why}.`}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", boxSizing: "border-box", padding: "12px 14px",
        width: "100%", height: "100%", minHeight: "88px", ...style, borderRadius: "10px", background: "var(--crm-field)", border: "1px dashed var(--crm-line)",
        color: "var(--crm-muted)", textAlign: "center", cursor: "default" }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="m3 4 18 16" />
      </svg>
      <strong style={{ fontSize: typePx(13), fontWeight: 600, lineHeight: 1.3, color: "var(--crm-ink-soft)" }}>{w.title}</strong>
      <small style={{ fontSize: typePx(11.5), lineHeight: 1.35 }}>{w.why}</small>
    </span>
  );
}
