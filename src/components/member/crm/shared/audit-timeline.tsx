"use client";

/**
 * One audit-log format everywhere (CRM redesign v4, notes/24 §5 and frame D4b of
 * docs/design_handoff_crm_redesign_v4/CRM Optimized Desktop.dc.html): the chat's Audit log, Customer info › Audit log,
 * Insight › Team activity's lead drawer, Settings › Audit log — and the phone's.
 *
 * Each line: date + time right-aligned in a 62px column, a 10px dot on a 2px line (ink = got / assignment / move / edit,
 * green = reply / appointment / show-up, oxblood = cancel / block / delete), title 14.5px 600, detail 13px muted
 * ("before → after" for an edit). Newest at the bottom; no heading inside the panel.
 */

import type { CSSProperties, ReactNode } from "react";

export type AuditTone = "ink" | "green" | "oxblood";

export interface AuditLine {
  key: string | number;
  /** "8 Nov" — the date line; leave empty to draw the time alone. */
  date: string;
  /** "8:40" */
  time: string;
  title: ReactNode;
  detail?: ReactNode;
  tone?: AuditTone;
  /** Click on the line (optional). */
  onClick?: () => void;
}

export const AUDIT_DOT: Record<AuditTone, string> = { ink: "var(--crm-ink)", green: "var(--crm-v4-green)", oxblood: "var(--crm-oxblood)" };

const row: CSSProperties = { display: "grid", gridTemplateColumns: "62px 18px minmax(0,1fr)", columnGap: 10 };
const when: CSSProperties = {
  display: "flex", flexDirection: "column", gap: 2, paddingTop: 1,
  font: "500 12px var(--font-inter, Inter), sans-serif", color: "var(--crm-faint)", textAlign: "right", fontVariantNumeric: "tabular-nums",
};
const rail: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center" };
const body: CSSProperties = { display: "flex", flexDirection: "column", gap: 3, paddingBottom: 18, minWidth: 0 };
const titleStyle: CSSProperties = { font: "600 14.5px var(--font-inter, Inter), sans-serif", color: "var(--crm-ink)", overflowWrap: "anywhere" };
const detailStyle: CSSProperties = { font: "400 13px/1.4 var(--font-inter, Inter), sans-serif", color: "var(--crm-muted)", overflowWrap: "anywhere" };

/** Day + month in the timeline's words ("8 Nov"), and the 24-hour time ("8:40"), in the office's clock (UTC+8). */
export function auditWhen(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 8 * 3_600_000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return { date: `${d.getUTCDate()} ${months[d.getUTCMonth()]}`, time: `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}` };
}

export function AuditTimeline({ lines, empty = "Nothing yet", style }: { lines: AuditLine[]; empty?: ReactNode; style?: CSSProperties }) {
  if (!lines.length) return <div style={{ ...detailStyle, padding: "6px 0" }}>{empty}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", ...style }} data-audit-timeline="">
      {lines.map((l, i) => {
        const last = i === lines.length - 1;
        return (
          <div key={l.key} style={{ ...row, cursor: l.onClick ? "pointer" : undefined }} onClick={l.onClick}>
            <span style={when}>{l.date ? <span>{l.date}</span> : null}<span>{l.time}</span></span>
            <span style={rail} aria-hidden>
              <span style={{ width: 10, height: 10, marginTop: 4, borderRadius: "50%", background: AUDIT_DOT[l.tone ?? "ink"], flex: "none" }} />
              <span style={{ flex: 1, width: 2, background: last ? "transparent" : "var(--crm-audit-rail)", minHeight: 34 }} />
            </span>
            <span style={body}>
              <span style={titleStyle}>{l.title}</span>
              {l.detail ? <span style={detailStyle}>{l.detail}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
