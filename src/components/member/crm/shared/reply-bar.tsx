"use client";
/**
 * An ad's replies after our template (the owner, 2026-11-28: a lead form's customer writes first, but the team can only
 * answer once they reply to the template it sends — "发了template 过去后，客户又回复=青色，没回复=黄色"; then "新增有appt
 * 有另一个颜色"): a bar by share — green for those who booked an appointment, cyan for the rest who replied, yellow for
 * the rest who did not — then "3 replied · 1 appt · 5 no reply" (appt is part of who replied), each number opening its
 * customers. Nothing sent yet reads "—". Desktop Overview's Replies column and the phone Overview's line under an ad.
 */
import type { CSSProperties } from "react";

/** The three colours named once (the desktop table's foot, where the cells show numbers only). */
export function ReplyLegend({ size = 11 }: { size?: number }) {
  const item = (c: string, t: string) => <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: c }} />{t}</span>;
  return <span data-reply-legend="" style={{ display: "inline-flex", gap: "14px", fontSize: `${size}px`, color: "var(--crm-muted)" }}>
    {item(REPLIED_C, "Replied after template")}{item(APPT_C, "Appt")}{item(WON_C, "Won")}{item(NOREPLY_C, "No reply yet")}
  </span>;
}

// Won in the CRM's own rust (2026-11-28: "多一个won"), apart from the appointment's green.
export const REPLIED_C = "var(--crm-replied)", NOREPLY_C = "var(--crm-noreply)", APPT_C = "var(--crm-v4-green)", WON_C = "var(--crm-rust)";

export function ReplyBar({ replied, noReply, appt = [], won = [], openReplied, openNoReply, openAppt, openWon, size = 12, bar = 56, compact = false }: {
  replied: string[]; noReply: string[]; appt?: string[]; won?: string[];
  openReplied?: () => void; openNoReply?: () => void; openAppt?: () => void; openWon?: () => void; size?: number; bar?: number;
  /** Numbers only, the words in the tooltip (the desktop column, where the words did not fit — 2026-11-28). */ compact?: boolean;
}) {
  const n = replied.length + noReply.length;
  if (!n) return <span style={{ fontSize: `${size}px`, color: "var(--crm-faint)" }}>—</span>;
  const won1 = new Set(won), booked = new Set([...appt, ...won]);
  // The bar's four parts add up to everyone sent a template, each customer once: Won first, then an appointment, then
  // replied, then not.
  const parts = [[won.length, WON_C], [appt.filter(x => !won1.has(x)).length, APPT_C], [replied.filter(x => !booked.has(x)).length, REPLIED_C], [noReply.filter(x => !booked.has(x)).length, NOREPLY_C]] as const;
  const num = (v: number, word: string, c: string, open: (() => void) | undefined, label: string) => {
    const st: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
      ...(open ? { cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px", textDecorationColor: "var(--crm-faint-2)" } : {}) };
    const press = !open ? { title: `${v} ${word}` } : { role: "button" as const, tabIndex: 0, title: `${v} ${word} · click to see who ${label}`, "aria-label": `${v} ${word}`,
      onClick: (e: { stopPropagation(): void }) => { e.stopPropagation(); open(); },
      onKeyDown: (e: { key: string; preventDefault(): void; stopPropagation(): void }) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); open(); } } };
    return <span {...press} style={st}><span aria-hidden style={{ width: "7px", height: "7px", borderRadius: "50%", flex: "none", background: c }} /><b style={{ fontWeight: 500, color: "var(--crm-ink)" }}>{v}</b>{!compact && <span style={{ color: "var(--crm-muted)" }}>{word}</span>}</span>;
  };
  const dot = <span aria-hidden style={{ color: "var(--crm-faint)" }}>·</span>;
  return (
    <span data-reply-bar="" style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, fontSize: `${size}px` }}>
      <span aria-hidden style={{ flex: "none", width: `${bar}px`, height: "6px", borderRadius: "3px", overflow: "hidden", display: "flex", background: "var(--crm-field)" }}>
        {parts.map(([v, c], i) => (v ? <span key={i} style={{ width: `${(v / n) * 100}%`, background: c }} /> : null))}
      </span>
      {num(replied.length, "replied", REPLIED_C, openReplied, "replied")}
      {appt.length > 0 && <>{dot}{num(appt.length, "appt", APPT_C, openAppt, "booked an appointment")}</>}
      {won.length > 0 && <>{dot}{num(won.length, "won", WON_C, openWon, "was won")}</>}
      {dot}
      {num(noReply.length, "no reply", NOREPLY_C, openNoReply, "has not replied")}
    </span>
  );
}
