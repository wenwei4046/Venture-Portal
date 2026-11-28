"use client";
/**
 * The reply mark after our template (2026-11-28, the owner: "同时能不能直接在聊天室做这个记号"): a dot in its colour and the
 * word — Won · Appt · Replied · No reply (shared/reply-groups.ts › REPLY_MARK) — as the Inbox row's tag draws it. The desktop
 * chat's head (DeskChatHead4a) and the phone chats' heads (patched in by chat-composer-patches.cjs / panel-1011-patches.cjs).
 */
export function ReplyMark({ m, size = 12 }: { m: { label: string; color: string } | null | undefined; size?: number }) {
  if (!m) return null;
  return (
    <span data-reply-mark="" title="After the template we sent" style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", height: `${size + 10}px`, padding: "0 9px", borderRadius: `${(size + 10) / 2}px`, boxSizing: "border-box",
      background: "var(--crm-field)", fontSize: `${size}px`, fontWeight: 500, color: "var(--crm-ink-soft)", whiteSpace: "nowrap" }}>
      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: m.color }} />{m.label}
    </span>
  );
}
