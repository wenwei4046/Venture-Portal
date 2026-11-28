"use client";
/**
 * An ad's replies after our template (the owner, 2026-11-28: a lead form's customer writes first, but the team can only
 * answer once they reply to the template it sends — "发了template 过去后，客户又回复=青色，没回复=黄色"): a bar in the two
 * colours by share, then "3 replied · 5 no reply", each number opening its customers. Nothing sent yet reads "—".
 * Desktop Overview's Replies column and the phone Overview's line under an ad.
 */
import type { CSSProperties } from "react";

export const REPLIED_C = "var(--crm-replied)", NOREPLY_C = "var(--crm-noreply)";

export function ReplyBar({ replied, noReply, openReplied, openNoReply, size = 12, bar = 56 }: {
  replied: number; noReply: number; openReplied?: () => void; openNoReply?: () => void; size?: number; bar?: number;
}) {
  const n = replied + noReply;
  if (!n) return <span style={{ fontSize: `${size}px`, color: "var(--crm-faint)" }}>—</span>;
  const num = (v: number, word: string, c: string, open: (() => void) | undefined, label: string) => {
    const st: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
      ...(open ? { cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "3px", textDecorationColor: "var(--crm-faint-2)" } : {}) };
    const press = open ? { role: "button" as const, tabIndex: 0, title: `Click to see who ${label}`, "aria-label": `${v} ${word}`,
      onClick: (e: { stopPropagation(): void }) => { e.stopPropagation(); open(); },
      onKeyDown: (e: { key: string; preventDefault(): void; stopPropagation(): void }) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); open(); } } } : {};
    return <span {...press} style={st}><span aria-hidden style={{ width: "7px", height: "7px", borderRadius: "50%", flex: "none", background: c }} /><b style={{ fontWeight: 500, color: "var(--crm-ink)" }}>{v}</b><span style={{ color: "var(--crm-muted)" }}>{word}</span></span>;
  };
  return (
    <span data-reply-bar="" style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, fontSize: `${size}px` }}>
      <span aria-hidden style={{ flex: "none", width: `${bar}px`, height: "6px", borderRadius: "3px", overflow: "hidden", display: "flex", background: NOREPLY_C }}>
        <span style={{ width: `${(replied / n) * 100}%`, background: REPLIED_C }} />
      </span>
      {num(replied, "replied", REPLIED_C, openReplied, "replied")}
      <span aria-hidden style={{ color: "var(--crm-faint)" }}>·</span>
      {num(noReply, "no reply", NOREPLY_C, openNoReply, "has not replied")}
    </span>
  );
}
