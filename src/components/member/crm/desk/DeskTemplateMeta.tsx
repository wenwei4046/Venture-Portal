"use client";
/**
 * Cold lead templates, 2026-11-04 (the owner: "在crm 没得选中英"; "是不是能选它是营销还是实用性这一类的"; "做一个按钮是可以导入到看
 * 审核状态，或也可以是复制链接的功能"). Drawn in the editor's look (the channel switch's segments) — the design has none.
 *   DeskTemplateKind   — the editor's Language (English · 中文) and Category (Marketing · Utility), saved with the template.
 *   DeskTemplateReview — beside New template: Meta's WhatsApp Manager, where every template's review stands, and its link.
 */
import { useState } from "react";

export interface TplOpt { label: string; on: boolean; pick: () => void }
export interface TplKindVM { langOpts: TplOpt[]; catOpts: TplOpt[]; catHint: string }

const LABEL: React.CSSProperties = { fontSize: "11.5px", fontWeight: 700, letterSpacing: ".08em", color: "var(--crm-muted)" };

function Seg({ opts, label }: { opts: TplOpt[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "grid", gridTemplateColumns: `repeat(${opts.length}, 1fr)`, gap: "4px", padding: "4px", borderRadius: "14px", background: "var(--crm-field)" }}>
      {opts.map(o => (
        <button key={o.label} type="button" role="radio" aria-checked={o.on} onClick={o.pick}
          style={{ height: "38px", border: 0, borderRadius: "10px", background: o.on ? "#fff" : "transparent", boxShadow: o.on ? "0 1px 3px rgba(42,22,12,.14)" : "none",
            font: "inherit", fontSize: "14px", fontWeight: o.on ? 700 : 600, color: o.on ? "var(--crm-ink)" : "var(--crm-muted)", cursor: "pointer" }}>{o.label}</button>
      ))}
    </div>
  );
}

export function DeskTemplateKind({ v }: { v: TplKindVM }) {
  return (<>
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span style={LABEL}>LANGUAGE</span>
      <Seg opts={v.langOpts} label="Language" />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span style={LABEL}>CATEGORY</span>
      <Seg opts={v.catOpts} label="Category" />
      <span style={{ fontSize: "12px", color: "var(--crm-muted)", lineHeight: 1.45 }}>{v.catHint}</span>
    </div>
  </>);
}

const PILL: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px",
  border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: 650, color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none" };

/** Opens Meta's WhatsApp Manager in a new tab; Copy link puts its address on the clipboard. Nothing when no account is set. */
export function DeskTemplateReview({ url }: { url: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;
  const copy = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(url).then(done, () => window.prompt("Copy this link", url));
    else window.prompt("Copy this link", url);
  };
  return (<>
    <a href={url} target="_blank" rel="noopener noreferrer" style={PILL} title="Every template's review, in Meta's WhatsApp Manager">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
      Review status in Meta
    </a>
    <button type="button" onClick={copy} style={PILL} aria-live="polite">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>
      {copied ? "Copied" : "Copy link"}
    </button>
  </>);
}

/** WhatsApp's own formatting, drawn as the customer will see it: *bold*, _italic_, ~strikethrough~, ```monospace``` (it has no underline). */
export function WaText({ t }: { t: string }) {
  const parts = t.split(/(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/);
  return (<>{parts.map((s, i) =>
    s.startsWith("```") && s.endsWith("```") && s.length > 6 ? <code key={i} style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: ".92em" }}>{s.slice(3, -3)}</code>
      : /^\*[^*\n]+\*$/.test(s) ? <strong key={i}>{s.slice(1, -1)}</strong>
        : /^_[^_\n]+_$/.test(s) ? <em key={i}>{s.slice(1, -1)}</em>
          : /^~[^~\n]+~$/.test(s) ? <s key={i}>{s.slice(1, -1)}</s>
            : s)}</>);
}

const FORMATS = [["*", "B", "Bold", { fontWeight: 800 }], ["_", "I", "Italic", { fontStyle: "italic" }], ["~", "S", "Strikethrough", { textDecoration: "line-through" }], ["```", "</>", "Monospace", { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: "12px" }]] as const;

/**
 * Bold · Italic · Strikethrough · Monospace for the template's message (2026-11-04, the owner: "我能放粗体，斜体，底线等吗？" —
 * WhatsApp has no underline). Wraps what is selected in the message box in WhatsApp's marks (or puts the pair at the cursor);
 * a press keeps the box's focus and selection.
 */
export function DeskTemplateFormat({ draft, setDraft }: { draft: string; setDraft: (e: { target: { value: string } }) => void }) {
  const wrap = (m: string) => {
    const el = typeof document !== "undefined" ? document.activeElement as HTMLTextAreaElement | null : null;
    const inBox = el?.tagName === "TEXTAREA";
    const a = inBox ? el!.selectionStart : draft.length, b = inBox ? el!.selectionEnd : draft.length;
    const next = draft.slice(0, a) + m + draft.slice(a, b) + m + draft.slice(b);
    setDraft({ target: { value: next } });
    if (inBox) requestAnimationFrame(() => { el!.focus(); el!.setSelectionRange(a + m.length, b + m.length); });
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      <span style={{ ...LABEL, marginRight: "4px" }}>FORMAT</span>
      {FORMATS.map(([m, label, title, look]) => (
        <button key={m} type="button" title={`${title} — ${m}text${m}`} aria-label={title} onMouseDown={e => e.preventDefault()} onClick={() => wrap(m)}
          style={{ minWidth: "34px", height: "30px", padding: "0 10px", borderRadius: "15px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", cursor: "pointer", ...look }}>{label}</button>
      ))}
      <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>WhatsApp has no underline.</span>
    </div>
  );
}
