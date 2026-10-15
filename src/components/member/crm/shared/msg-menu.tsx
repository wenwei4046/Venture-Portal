"use client";

import { useEffect, useState, useSyncExternalStore, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { typePx } from "./type";

/**
 * A message's menu, as WhatsApp's (the owner, 2026-10-14, WhatsApp's long-press menu beside ours: "reply 的這些功能怎麼
 * 不見了，team & mine 一樣要有"): a long press on any message — words, photo, video, voice note, document — dims the chat,
 * shows the reactions on top, the message, and its actions under it. The same in Mine's chat and the Team chat; each
 * chat hands in what its actions do (sales/vm/chat.ts, panel/vm/lead.ts). Mounted once by CrmApp.
 */
export type MsgAction = { label: string; icon: string; danger?: boolean; run: () => void };
/** Forward: the chats it may go to; Info: the message's facts, as label · value rows. */
export type ForwardChat = { id: string; name: string; sub: string };
export type MsgMenu = {
  mine: boolean; preview: string; reaction: string; react: (e: string) => void; actions: MsgAction[];
  forward?: { chats: ForwardChat[]; send: (toId: string) => void };
  info?: [string, string][];
};

export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
export const MENU_ICON = {
  reply: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v4",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  pin: "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z",
  forward: "M15 5l6 6-6 6M21 11H9a6 6 0 0 0-6 6v2",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-5M12 8h.01",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z",
  del: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};

let state: MsgMenu | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
export function openMsgMenu(m: MsgMenu) { state = m; emit(); }
/**
 * Straight to Forward or Info (the desktop, CRM Desktop v2: its own menu beside the bubble lists them, so the dialog
 * opens without the phone's long-press sheet first).
 */
let startView: "" | "forward" | "info" = "";
export function openMsgView(m: MsgMenu, view: "forward" | "info") { startView = view; state = m; emit(); }

/** A chat's starred messages (the chat's ⋮ › Starred messages, 2026-10-14): a tap goes to the message in the chat. */
export type StarredItem = { id: string; who: string; text: string; at: string };
let starred: { items: StarredItem[] } | null = null;
export function openStarred(items: StarredItem[]) { starred = { items }; state = null; emit(); }
/** Brings a message into view in the open chat and lights it a moment. */
export function goToMessage(id: string) {
  const el = typeof document !== "undefined" ? document.querySelector<HTMLElement>(`[data-msg="${CSS.escape(id)}"]`) : null;
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  const was = el.style.filter;
  el.style.transition = "filter 300ms"; el.style.filter = "brightness(.85)";
  setTimeout(() => { el.style.filter = was; }, 1200);
}
const closeMenu = () => { state = null; starred = null; emit(); };

/**
 * A long press (450 ms, the finger still) opens the menu; the tap that ends it does not also open the photo or the
 * viewer; the phone's own callout (Save Image …) is held back by the bubble's `WebkitTouchCallout: none`.
 * A finger dragged RIGHT across a message replies to it, as WhatsApp's (the owner, 2026-10-14: "點擊對話往右滑可以回復該
 * 條信息"): the bubble follows the finger up to 80 px with the reply arrow showing behind it, and let go past 56 px it
 * becomes the reply (`reply`). Touch only — a mouse drag selects text. The bubbles take `touch-action: pan-y`
 * (crm.module.css) so a sideways drag reaches us while an up / down one still scrolls the chat.
 */
/** After a swipe reply the reply box takes the keyboard, as WhatsApp's does (the box is redrawn first). */
// Mine's box is `textarea[data-draft]`; the Team chat's is the input reading "Reply to …".
export function focusDraft() { setTimeout(() => document.querySelector<HTMLElement>('textarea[data-draft], input[placeholder^="Reply to "]')?.focus(), 30); }
export const SWIPE_REPLY = 56, SWIPE_MAX = 80;
/** How far a drag of dx × dy moves the bubble: 0 until it is plainly sideways and rightward, then dx up to the most. */
export function swipeShift(dx: number, dy: number, dragging: boolean): number {
  if (!dragging && (dx < 12 || Math.abs(dy) > dx * 0.6)) return 0;
  return Math.max(0, Math.min(SWIPE_MAX, dx));
}
export function pressToOpen(open: () => void, reply?: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null, fired = false, x = 0, y = 0;
  let el: HTMLElement | null = null, drag = false, shift = 0, arrow: HTMLDivElement | null = null;
  const stop = () => { if (timer) clearTimeout(timer); timer = null; };
  const settle = () => {
    if (el) { const b = el; b.style.transition = "transform 180ms ease-out"; b.style.transform = ""; setTimeout(() => { b.style.transition = ""; }, 200); }
    arrow?.remove(); arrow = null; drag = false; shift = 0;
  };
  const draw = () => {
    if (!el) return;
    el.style.transition = ""; el.style.transform = shift ? `translateX(${shift}px)` : "";
    if (!arrow) {
      arrow = document.createElement("div");
      arrow.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3F2B22" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${MENU_ICON.reply}"/></svg>`;
      Object.assign(arrow.style, { position: "fixed", zIndex: "2147480000", width: "30px", height: "30px", borderRadius: "15px", background: "rgba(63,43,34,.12)", display: "grid", placeItems: "center", pointerEvents: "none" });
      document.body.appendChild(arrow);
    }
    const r = el.getBoundingClientRect();
    arrow.style.left = `${r.left - shift + Math.min(shift, 44) - 38}px`;
    arrow.style.top = `${r.top + r.height / 2 - 15}px`;
    arrow.style.opacity = String(Math.min(1, shift / SWIPE_REPLY));
    arrow.style.transform = `scale(${shift >= SWIPE_REPLY ? 1.15 : 0.7 + 0.3 * shift / SWIPE_REPLY})`;
  };
  return {
    onPointerDown: (e: PointerEvent) => {
      fired = false; x = e.clientX; y = e.clientY; stop(); settle();
      el = reply && e.pointerType !== "mouse" ? e.currentTarget as HTMLElement : null;
      timer = setTimeout(() => { fired = true; timer = null; try { navigator.vibrate?.(12); } catch { /* no buzz */ } open(); }, 450);
    },
    onPointerMove: (e: PointerEvent) => {
      const dx = e.clientX - x, dy = e.clientY - y;
      if (Math.abs(dx) + Math.abs(dy) > 10) stop();
      if (!el || fired) return;
      const next = swipeShift(dx, dy, drag);
      if (!drag && !next) return;
      if (!drag) { drag = true; try { el.setPointerCapture(e.pointerId); } catch { /* fine */ } }
      if (shift < SWIPE_REPLY && next >= SWIPE_REPLY) { try { navigator.vibrate?.(10); } catch { /* no buzz */ } }
      shift = next; draw();
    },
    onPointerUp: () => {
      stop();
      if (drag) { fired = true; const go = shift >= SWIPE_REPLY; settle(); if (go) reply?.(); }
      el = null;
    },
    onPointerCancel: () => { stop(); settle(); el = null; },
    onClickCapture: (e: MouseEvent) => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } },
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); stop(); fired = true; open(); },
  };
}

export function MessageMenu() {
  const m = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => null);
  const st = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => starred, () => null);
  const [view, setView] = useState<"" | "forward" | "info">("");
  const [q, setQ] = useState("");
  useEffect(() => { setView(startView); startView = ""; setQ(""); }, [m]);
  useEffect(() => {
    if (!m) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [m]);
  if (st && typeof document !== "undefined") {
    return createPortal(
      <div onClick={closeMenu} role="dialog" aria-modal="true" aria-label="Starred messages" style={{ position: "fixed", inset: 0, zIndex: 2147481000, background: "rgba(40,30,25,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 14px calc(var(--safe-bottom, 0px) + 16px)", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "340px", maxWidth: "92vw", maxHeight: "80vh", display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", boxShadow: "0 6px 24px rgba(0,0,0,.18)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "14px 16px 10px" }}>
            <strong style={{ flex: "1", fontSize: typePx(17), color: "#3F2B22" }}>★ Starred messages</strong>
            <button type="button" onClick={closeMenu} style={{ border: 0, background: "transparent", color: "#806B60", fontSize: typePx(15), fontWeight: 600, cursor: "pointer" }}>Done</button>
          </div>
          <div style={{ overflowY: "auto", flex: "1", minHeight: 0 }}>
            {!st.items.length && <p style={{ margin: "8px 16px 18px", color: "#806B60", fontSize: typePx(14), lineHeight: 1.45 }}>No starred messages in this chat. Long-press a message and tap Star to keep it here.</p>}
            {st.items.map(it => (
              <button key={it.id} type="button" onClick={() => { closeMenu(); setTimeout(() => goToMessage(it.id), 60); }}
                style={{ width: "100%", display: "flex", flexDirection: "column", gap: "3px", padding: "11px 16px", border: 0, borderTop: "1px solid #F3E9E1", background: "transparent", textAlign: "left", cursor: "pointer" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: typePx(12), color: "#806B60" }}><strong style={{ color: "#BD4A19", fontWeight: 650 }}>{it.who}</strong><span>{it.at}</span></span>
                <span style={{ fontSize: typePx(14), color: "#3F2B22", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{it.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  if (!m || typeof document === "undefined") return null;
  const side = m.mine ? "flex-end" : "flex-start";
  const card = { width: "320px", maxWidth: "92vw", borderRadius: "16px", background: "#fff", boxShadow: "0 6px 24px rgba(0,0,0,.18)", overflow: "hidden" } as const;
  // Forward: every chat it may go to, searched by name; one tap sends it there.
  if (view === "forward" && m.forward) {
    const shown = m.forward.chats.filter(c => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
    return createPortal(
      <div onClick={closeMenu} role="dialog" aria-modal="true" aria-label="Forward to" style={{ position: "fixed", inset: 0, zIndex: 2147481000, background: "rgba(40,30,25,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 14px calc(var(--safe-bottom, 0px) + 16px)", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif" }}>
        <div onClick={e => e.stopPropagation()} style={{ ...card, display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 16px 10px" }}>
            <strong style={{ flex: "1", fontSize: typePx(17), color: "#3F2B22" }}>Forward to…</strong>
            <button type="button" onClick={closeMenu} style={{ border: 0, background: "transparent", color: "#806B60", fontSize: typePx(15), fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a customer" autoFocus
            style={{ margin: "0 16px 8px", height: "40px", padding: "0 14px", borderRadius: "20px", border: "1px solid #EBDDD2", background: "#FBF7F3", fontSize: typePx(16), outline: "none" }} />
          <div style={{ overflowY: "auto", flex: "1", minHeight: 0 }}>
            {!shown.length && <p style={{ margin: "16px", color: "#806B60", fontSize: typePx(14) }}>No customer to forward to.</p>}
            {shown.map(c => (
              <button key={c.id} type="button" onClick={() => { closeMenu(); m.forward!.send(c.id); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", border: 0, borderTop: "1px solid #F3E9E1", background: "transparent", textAlign: "left", cursor: "pointer" }}>
                <span style={{ flex: "none", width: "38px", height: "38px", borderRadius: "19px", background: "#FBE9DD", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: typePx(13), fontWeight: 700 }}>{c.name.split(/s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                <span style={{ flex: "1", minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: typePx(15), fontWeight: 600, color: "#3F2B22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</strong>
                  <small style={{ fontSize: typePx(12), color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  // Info: when it was sent or received, by whom, and how far it got.
  if (view === "info" && m.info) {
    return createPortal(
      <div onClick={closeMenu} role="dialog" aria-modal="true" aria-label="Message info" style={{ position: "fixed", inset: 0, zIndex: 2147481000, background: "rgba(40,30,25,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 14px", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif" }}>
        <div onClick={e => e.stopPropagation()} style={card}>
          <div style={{ display: "flex", alignItems: "center", padding: "14px 16px 6px" }}>
            <strong style={{ flex: "1", fontSize: typePx(17), color: "#3F2B22" }}>Message info</strong>
            <button type="button" onClick={closeMenu} style={{ border: 0, background: "transparent", color: "#806B60", fontSize: typePx(15), fontWeight: 600, cursor: "pointer" }}>Done</button>
          </div>
          {!!m.preview && <p style={{ margin: "4px 16px 10px", padding: "8px 10px", borderRadius: "10px", background: "#FBF7F3", color: "#3F2B22", fontSize: typePx(14), display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.preview}</p>}
          {m.info.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "11px 16px", borderTop: "1px solid #F3E9E1", fontSize: typePx(14) }}>
              <span style={{ color: "#806B60" }}>{k}</span><strong style={{ color: "#3F2B22", fontWeight: 600, textAlign: "right" }}>{v}</strong>
            </div>
          ))}
        </div>
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div onClick={closeMenu} role="dialog" aria-modal="true" aria-label="Message options"
      style={{ position: "fixed", inset: 0, zIndex: 2147481000, background: "rgba(40,30,25,.28)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: side, gap: "10px", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 14px calc(var(--safe-bottom, 0px) + 16px)", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif", animation: "fadeIn 150ms ease-out" }}>
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: "2px", padding: "6px 8px", borderRadius: "30px", background: "#fff", boxShadow: "0 6px 24px rgba(0,0,0,.18)" }}>
        {REACTIONS.map(e => (
          <button key={e} type="button" onClick={() => { closeMenu(); m.react(m.reaction === e ? "" : e); }} aria-label={`React ${e}`}
            style={{ width: "44px", height: "44px", borderRadius: "22px", border: 0, background: m.reaction === e ? "#F1E4DA" : "transparent", fontSize: typePx(28), cursor: "pointer", padding: 0 }}>{e}</button>
        ))}
      </div>
      {!!m.preview && (
        <div onClick={e => e.stopPropagation()} style={{ maxWidth: "80%", padding: "10px 13px", borderRadius: m.mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.mine ? "#FCD6B8" : "#fff", color: "#3F2B22", fontSize: typePx(15), lineHeight: 1.4, boxShadow: "0 6px 24px rgba(0,0,0,.12)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.preview}</div>
      )}
      <div onClick={e => e.stopPropagation()} style={{ width: "240px", maxWidth: "80%", borderRadius: "16px", background: "rgba(255,255,255,.97)", boxShadow: "0 6px 24px rgba(0,0,0,.18)", overflow: "hidden" }}>
        {m.actions.map((a, i) => (
          <button key={a.label} type="button" onClick={() => { if (a.label === "Forward" && m.forward) { setView("forward"); return; } if (a.label === "Info" && m.info) { setView("info"); return; } closeMenu(); a.run(); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "13px 16px", border: 0, borderTop: i ? "1px solid #F0E6DE" : 0, background: "transparent", color: a.danger ? "#C0392B" : "#3F2B22", fontSize: typePx(16), textAlign: "left", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={a.icon} /></svg>
            {a.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
