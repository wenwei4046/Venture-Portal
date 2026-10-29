"use client";
/**
 * Settings › Reply library (2026-10-29, the owner: "存入一些不错的话术，让业务参考，当然里面的名字等，可以根据客户的咨询自动调整"):
 * the company's good replies — a title, a category, keywords that bring it up as a suggestion and the words, with blanks
 * ({name}, {me}, {project} …) the chat fills in for the customer on screen (shared/suggest-reply.ts › fillReply). CRM ·
 * Manage edits and saves the whole list at once (crm_save_reply_library); anybody else reads it.
 */
import { useState } from "react";
import type { CrmReplyItem } from "@/lib/member/crm-data";
import { BLANKS, fillReply } from "../shared/suggest-reply";

export interface ReplyLibraryBits { can: boolean; items: CrmReplyItem[]; save: (items: CrmReplyItem[]) => Promise<boolean> }

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const SAMPLE = { name: "Mei Ling Tan", details: { loc: "Setia Sky Ville", type: "Condo", size: "1,200 sqft" } };
const field = { border: "1px solid var(--crm-line)", borderRadius: "10px", padding: "8px 10px", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)", background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" as const };
const label = { font: "500 11px Inter, sans-serif", color: "var(--crm-muted)", letterSpacing: ".04em", textTransform: "uppercase" as const };

/** The list as it should be saved: trimmed, keywords split on commas, nothing blank. */
export function tidyLibrary(items: CrmReplyItem[]): CrmReplyItem[] {
  return items.map(i => ({ ...i, title: i.title.trim(), category: i.category.trim(), body: i.body.trim(), keywords: i.keywords.map(k => k.trim()).filter(Boolean) }));
}
/** Why the list cannot be saved yet, else null (the database's own limits). */
export function libraryProblem(items: CrmReplyItem[]): string | null {
  if (items.length > 300) return "Up to 300 replies in the library.";
  for (const i of tidyLibrary(items)) {
    if (!i.title) return "Give each reply a title.";
    if (i.title.length > 80) return `"${i.title.slice(0, 20)}…": a title is up to 80 characters.`;
    if (!i.body) return `"${i.title}": write its words.`;
    if (i.body.length > 2000) return `"${i.title}": up to 2,000 characters.`;
    if (i.category.length > 40) return `"${i.title}": a category is up to 40 characters.`;
  }
  return null;
}

export function DeskReplyLibrary({ v }: { v: ReplyLibraryBits }) {
  const [draft, setDraft] = useState<CrmReplyItem[] | null>(null);
  const [kwText, setKwText] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const list = draft ?? v.items;
  const dirty = draft !== null;
  const problem = dirty ? libraryProblem(list) : null;
  const edit = (next: CrmReplyItem[]) => setDraft(next);
  const put = (i: number, part: Partial<CrmReplyItem>) => edit(list.map((x, k) => (k === i ? { ...x, ...part } : x)));
  const move = (i: number, by: number) => {
    const j = i + by; if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; edit(next); setKwText({}); setOpen(open === i ? j : open === j ? i : open);
  };
  const remove = (i: number) => { edit(list.filter((_, k) => k !== i)); setKwText({}); setOpen(null); };
  const add = () => { edit([...list, { id: null, title: "", category: list[list.length - 1]?.category ?? "", body: "", keywords: [] }]); setOpen(list.length); setQ(""); };
  const cancel = () => { setDraft(null); setKwText({}); setOpen(null); };
  const save = () => {
    if (!dirty || problem || busy) return;
    setBusy(true);
    void v.save(tidyLibrary(list)).then(ok => { setBusy(false); if (ok) { setDraft(null); setKwText({}); setOpen(null); } });
  };
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = list.map((r, i) => ({ r, i })).filter(({ r }) => words.every(w => `${r.title} ${r.category} ${r.keywords.join(" ")} ${r.body}`.toLowerCase().includes(w)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "980px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the library" aria-label="Search the library" style={{ ...field, maxWidth: "320px" }} />
        <span style={{ flex: 1, font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{list.length} {list.length === 1 ? "reply" : "replies"}</span>
        {dirty && <button type="button" onClick={cancel} disabled={busy} style={{ border: "1px solid var(--crm-line)", background: "#fff", borderRadius: "10px", padding: "8px 14px", font: "500 13px Inter, sans-serif", cursor: "pointer", color: "var(--crm-ink)" }}>Cancel</button>}
        {dirty && <button type="button" onClick={save} disabled={busy || !!problem} title={problem ?? undefined} style={{ border: 0, background: problem ? "var(--crm-line)" : "var(--crm-rust)", color: "#fff", borderRadius: "10px", padding: "8px 14px", font: "600 13px Inter, sans-serif", cursor: problem ? "default" : "pointer" }}>{busy ? "Saving…" : "Save changes"}</button>}
        {v.can && <button type="button" onClick={add} style={{ border: "1px solid var(--crm-rust)", background: "#fff", color: "var(--crm-rust)", borderRadius: "10px", padding: "8px 14px", font: "600 13px Inter, sans-serif", cursor: "pointer" }}>+ Add reply</button>}
      </div>
      {problem && <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-rust)" }}>{problem}</span>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>
        <span>Blanks filled in for the customer on screen:</span>
        {BLANKS.map(([b, what]) => <span key={b} title={what} style={{ padding: "2px 8px", borderRadius: "999px", background: "var(--crm-sand)", color: "var(--crm-ink)", font: "500 12px Inter, sans-serif" }}>{b}</span>)}
      </div>
      {!list.length && (
        <div style={{ padding: "28px 0", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>
          No replies yet.{v.can ? " Add the replies that work well — salespeople see them under Suggested replies in every chat." : ""}
        </div>
      )}
      {!!list.length && !shown.length && <div style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No reply matches.</div>}
      <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--crm-ink)" }}>
        {shown.map(({ r, i }) => {
          const isOpen = open === i && v.can;
          return (
            <div key={`${r.id ?? "new"}-${i}`} style={{ borderBottom: "1px solid var(--crm-line)", padding: "12px 0", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : i)} disabled={!v.can} style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: v.can ? "pointer" : "default", display: "flex", flexDirection: "column", gap: "4px", font: "inherit" }}>
                  <span style={{ font: `500 15px ${TIGHT}`, color: "var(--crm-ink)" }}>{r.title || "Untitled reply"}{r.category && <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}> · {r.category}</span>}</span>
                  {!isOpen && <span style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.body || "—"}</span>}
                  {!isOpen && !!r.keywords.length && <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>Keywords: {r.keywords.join(", ")}</span>}
                </button>
                {v.can && (
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0 || !!q} style={iconBtn}>↑</button>
                    <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === list.length - 1 || !!q} style={iconBtn}>↓</button>
                    <button type="button" aria-label="Delete reply" onClick={() => remove(i)} style={{ ...iconBtn, color: "var(--crm-rust)" }}>×</button>
                  </div>
                )}
              </div>
              {isOpen && (
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "14px" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={label}>Title</span>
                    <input value={r.title} maxLength={80} onChange={e => put(i, { title: e.target.value })} placeholder="Price enquiry" style={field} /></label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={label}>Category</span>
                    <input value={r.category} maxLength={40} onChange={e => put(i, { category: e.target.value })} placeholder="Pricing" style={field} /></label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px", gridColumn: "1 / -1" }}><span style={label}>Keywords · comma separated — a customer using one brings this reply up first</span>
                    <input value={kwText[i] ?? r.keywords.join(", ")} onChange={e => { setKwText(t => ({ ...t, [i]: e.target.value })); put(i, { keywords: e.target.value.split(",") }); }} placeholder="price, how much, 价钱" style={field} /></label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={label}>Words</span>
                    <textarea value={r.body} maxLength={2000} rows={7} onChange={e => put(i, { body: e.target.value })} placeholder="Hi {name}, thanks for asking! For {project} …" style={{ ...field, resize: "vertical", lineHeight: 1.45 }} /></label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={label}>Preview · for a customer like Mei Ling</span>
                    <div style={{ ...field, minHeight: "140px", whiteSpace: "pre-wrap", background: "var(--crm-cream)", color: "var(--crm-ink)" }}>{fillReply(r.body, SAMPLE, { me: "You", showroom: "your showroom" }) || "—"}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const iconBtn = { width: "30px", height: "30px", border: "1px solid var(--crm-line)", borderRadius: "8px", background: "#fff", cursor: "pointer", font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" };
