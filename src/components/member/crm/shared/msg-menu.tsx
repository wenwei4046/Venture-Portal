"use client";

import { useEffect, useSyncExternalStore, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";

/**
 * A message's menu, as WhatsApp's (the owner, 2026-10-14, WhatsApp's long-press menu beside ours: "reply 的這些功能怎麼
 * 不見了，team & mine 一樣要有"): a long press on any message — words, photo, video, voice note, document — dims the chat,
 * shows the reactions on top, the message, and its actions under it. The same in Mine's chat and the Team chat; each
 * chat hands in what its actions do (sales/vm/chat.ts, panel/vm/lead.ts). Mounted once by CrmApp.
 */
export type MsgAction = { label: string; icon: string; danger?: boolean; run: () => void };
export type MsgMenu = { mine: boolean; preview: string; reaction: string; react: (e: string) => void; actions: MsgAction[] };

export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
export const MENU_ICON = {
  reply: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 6 6v4",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  pin: "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z",
  del: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};

let state: MsgMenu | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
export function openMsgMenu(m: MsgMenu) { state = m; emit(); }
const closeMenu = () => { state = null; emit(); };

/**
 * A long press (450 ms, the finger still) opens the menu; the tap that ends it does not also open the photo or the
 * viewer; the phone's own callout (Save Image …) is held back by the bubble's `WebkitTouchCallout: none`.
 */
export function pressToOpen(open: () => void) {
  let timer: ReturnType<typeof setTimeout> | null = null, fired = false, x = 0, y = 0;
  const stop = () => { if (timer) clearTimeout(timer); timer = null; };
  return {
    onPointerDown: (e: PointerEvent) => {
      fired = false; x = e.clientX; y = e.clientY; stop();
      timer = setTimeout(() => { fired = true; timer = null; try { navigator.vibrate?.(12); } catch { /* no buzz */ } open(); }, 450);
    },
    onPointerMove: (e: PointerEvent) => { if (Math.abs(e.clientX - x) + Math.abs(e.clientY - y) > 10) stop(); },
    onPointerUp: stop,
    onPointerCancel: stop,
    onClickCapture: (e: MouseEvent) => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } },
    onContextMenu: (e: MouseEvent) => { e.preventDefault(); stop(); fired = true; open(); },
  };
}

export function MessageMenu() {
  const m = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => null);
  useEffect(() => {
    if (!m) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [m]);
  if (!m || typeof document === "undefined") return null;
  const side = m.mine ? "flex-end" : "flex-start";
  return createPortal(
    <div onClick={closeMenu} role="dialog" aria-modal="true" aria-label="Message options"
      style={{ position: "fixed", inset: 0, zIndex: 2147481000, background: "rgba(40,30,25,.28)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: side, gap: "10px", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 14px calc(var(--safe-bottom, 0px) + 16px)", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif", animation: "fadeIn 150ms ease-out" }}>
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: "2px", padding: "6px 8px", borderRadius: "30px", background: "#fff", boxShadow: "0 6px 24px rgba(0,0,0,.18)" }}>
        {REACTIONS.map(e => (
          <button key={e} type="button" onClick={() => { closeMenu(); m.react(m.reaction === e ? "" : e); }} aria-label={`React ${e}`}
            style={{ width: "44px", height: "44px", borderRadius: "22px", border: 0, background: m.reaction === e ? "#F1E4DA" : "transparent", fontSize: "28px", cursor: "pointer", padding: 0 }}>{e}</button>
        ))}
      </div>
      {!!m.preview && (
        <div onClick={e => e.stopPropagation()} style={{ maxWidth: "80%", padding: "10px 13px", borderRadius: m.mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.mine ? "#FCD6B8" : "#fff", color: "#3F2B22", fontSize: "15px", lineHeight: 1.4, boxShadow: "0 6px 24px rgba(0,0,0,.12)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.preview}</div>
      )}
      <div onClick={e => e.stopPropagation()} style={{ width: "240px", maxWidth: "80%", borderRadius: "16px", background: "rgba(255,255,255,.97)", boxShadow: "0 6px 24px rgba(0,0,0,.18)", overflow: "hidden" }}>
        {m.actions.map((a, i) => (
          <button key={a.label} type="button" onClick={() => { closeMenu(); a.run(); }}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "13px 16px", border: 0, borderTop: i ? "1px solid #F0E6DE" : 0, background: "transparent", color: a.danger ? "#C0392B" : "#3F2B22", fontSize: "16px", textAlign: "left", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={a.icon} /></svg>
            {a.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
