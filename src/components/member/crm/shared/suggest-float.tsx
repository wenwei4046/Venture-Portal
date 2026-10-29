"use client";
/**
 * The suggested replies' floating logo (the owner, 2026-10-29: "你可以做成一个 logo 漂浮就行，替换 auto replies"): a round
 * sparkle button over the chat, above the composer at the right, there while the customer's words wait and the box is
 * empty; a tap opens the one to three drafts (shared/suggest-reply.ts), a tap on one puts it in the box to edit and send.
 * The Attach card's "Suggest reply" tile opens the same list (`openSuggest`). Under the drafts, the company's reply library
 * (2026-10-29), filled for this customer, to search and pick from by category.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { typePx } from "./type";

let wanted = 0;
const subs = new Set<() => void>();
/** The Attach tile: open the list in the chat on screen. */
export function openSuggest() { wanted++; subs.forEach(f => f()); }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export interface LibraryReply { title: string; category: string; text: string }

/** The library's entries for a search and a category: every word of the search in the title, category or words. */
export function filterLibrary(lib: LibraryReply[], q: string, cat: string): LibraryReply[] {
  const words = q.toLowerCase().split(/s+/).filter(Boolean);
  return lib.filter(r => (!cat || r.category === cat) && words.every(w => `${r.title} ${r.category} ${r.text}`.toLowerCase().includes(w)));
}

const SPARK = "M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z";

/** `desk`: the computer's chat (its reply box floats 22 px off the bottom, 50 px tall): the logo and the list sit over it at its right. */
export function SuggestFloat({ list, library, pick, showLogo, desk }: { list: { text: string; why: string }[]; library?: LibraryReply[]; pick: (text: string) => void; showLogo: boolean; desk?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const ask = useSyncExternalStore(subscribe, () => wanted, () => 0);
  const [seen] = useState(ask);
  // The Attach tile asks for the list (any ask after this chat's list was drawn).
  useEffect(() => { if (ask !== seen) setOpen(true); }, [ask, seen]);
  if (!showLogo && !open) return null;
  return (
    <>
      {open && (<>
        <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, zIndex: 4 }} />
        <div role="dialog" aria-label="Suggested replies" style={{ position: "absolute", right: desk ? "24px" : "12px", left: desk ? "auto" : "12px", width: desk ? "420px" : undefined, bottom: desk ? "140px" : "calc(var(--chat-foot, 64px) + 64px - var(--safe-bottom, 0px))", zIndex: 5,
          maxHeight: library?.length ? "70%" : "50%", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", padding: "12px", boxSizing: "border-box", borderRadius: "18px", background: "#fff", boxShadow: "0 14px 36px rgba(42,22,12,.22)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <strong style={{ flex: 1, fontSize: typePx(15), color: "var(--crm-ink)" }}>Suggested replies</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ border: 0, background: "transparent", padding: "4px", cursor: "pointer", color: "var(--crm-faint)", fontSize: typePx(18), lineHeight: 1 }}>×</button>
          </div>
          {!list.length && <span style={{ fontSize: typePx(13), color: "var(--crm-muted)", lineHeight: 1.45 }}>No suggestion for the customer&apos;s last message yet. As the team answers more chats, more come up.</span>}
          {list.map((s, i) => (
            <button key={i} type="button" onClick={() => { setOpen(false); pick(s.text); }}
              style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px", borderRadius: "12px", border: "1px solid var(--crm-line)", background: "#fff", textAlign: "left", cursor: "pointer", font: "inherit" }}>
              <span style={{ fontSize: typePx(14), lineHeight: 1.45, color: "var(--crm-ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.text}</span>
              <span style={{ fontSize: typePx(11.5), color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.why}</span>
            </button>
          ))}
          <span style={{ fontSize: typePx(11), color: "var(--crm-faint)" }}>From what the team answered before — edit it before sending.</span>
          {!!library?.length && (() => {
            const cats = [...new Set(library.map(r => r.category).filter(Boolean))];
            const shown = filterLibrary(library, q, cat);
            const chip = (on: boolean) => ({ border: on ? "1px solid var(--crm-rust)" : "1px solid var(--crm-line)", background: on ? "var(--crm-rust)" : "#fff", color: on ? "#fff" : "var(--crm-ink)", borderRadius: "999px", padding: "4px 10px", fontSize: typePx(12), cursor: "pointer", font: "inherit", whiteSpace: "nowrap" as const });
            return (<>
              <strong style={{ marginTop: "6px", fontSize: typePx(14), color: "var(--crm-ink)" }}>Reply library</strong>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search replies" aria-label="Search the reply library"
                style={{ border: "1px solid var(--crm-line)", borderRadius: "10px", padding: "8px 10px", font: "inherit", fontSize: typePx(15), outline: "none", color: "var(--crm-ink)", background: "#fff" }} />
              {!!cats.length && (
                <div style={{ display: "flex", gap: "6px", overflowX: "auto", flexShrink: 0 }}>
                  <button type="button" onClick={() => setCat("")} style={chip(!cat)}>All</button>
                  {cats.map(c => <button key={c} type="button" onClick={() => setCat(c === cat ? "" : c)} style={chip(c === cat)}>{c}</button>)}
                </div>
              )}
              {!shown.length && <span style={{ fontSize: typePx(13), color: "var(--crm-muted)" }}>No reply matches.</span>}
              {shown.map((r, i) => (
                <button key={`l${i}`} type="button" onClick={() => { setOpen(false); pick(r.text); }}
                  style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px", borderRadius: "12px", border: "1px solid var(--crm-line)", background: "#fff", textAlign: "left", cursor: "pointer", font: "inherit", flexShrink: 0 }}>
                  <span style={{ fontSize: typePx(13), fontWeight: 600, color: "var(--crm-ink)" }}>{r.title}{r.category ? <span style={{ fontWeight: 400, color: "var(--crm-faint)" }}> · {r.category}</span> : null}</span>
                  <span style={{ fontSize: typePx(13.5), lineHeight: 1.45, color: "var(--crm-muted)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.text}</span>
                </button>
              ))}
            </>);
          })()}
        </div>
      </>)}
      {showLogo && (
        <button type="button" onClick={() => setOpen(o => !o)} aria-label="Suggested replies" aria-expanded={open} title="Suggested replies"
          style={{ position: "absolute", right: desk ? "28px" : "16px", bottom: desk ? "84px" : "calc(var(--chat-foot, 64px) + 10px - var(--safe-bottom, 0px))", zIndex: 5, width: "46px", height: "46px", borderRadius: "50%", border: 0, cursor: "pointer",
            display: "grid", placeItems: "center", background: "radial-gradient(circle at 30% 30%, var(--crm-orange), var(--crm-rust) 70%)", color: "#fff", boxShadow: "0 6px 18px rgba(189,74,25,.35)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={SPARK} /></svg>
          <span style={{ position: "absolute", top: "-2px", right: "-2px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#fff", color: "var(--crm-rust)", fontSize: typePx(11), fontWeight: 700, display: "grid", placeItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>{list.length}</span>
        </button>
      )}
    </>
  );
}
