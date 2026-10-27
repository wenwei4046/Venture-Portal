// Lead View › the reply box's emoji (2026-10-27 — the user: "聊天室加 Emoji"). Messenger and Instagram take emoji as
// plain text, so a picked one is typed into the reply where the cursor is; nothing else changes on the way out.

export const EMOJI_GROUPS: Array<{ name: string; emoji: string[] }> = [
  { name: 'Smileys', emoji: ['😊', '😀', '😁', '😄', '😆', '😂', '🤣', '🙂', '😉', '😍', '🥰', '😘', '😋', '😎', '🤩', '🥳', '🤗', '🤔', '😅', '😌', '😴', '😮', '😢', '😭', '🙈', '🙏'] },
  { name: 'Gestures', emoji: ['👍', '👌', '👏', '🙌', '🤝', '👋', '✌️', '🤞', '💪', '👉', '👇', '☝️', '✋', '🫶'] },
  { name: 'Hearts', emoji: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '💕', '💖', '💯', '✨', '🌟', '🔥', '🎉', '🎊', '🎁'] },
  { name: 'Home & shop', emoji: ['🛋️', '🛏️', '🪑', '🚪', '🏠', '🏡', '🏬', '🛒', '🛍️', '💰', '💳', '🏷️', '📦', '🚚', '📍', '🗺️', '📞', '📱', '💬', '📅', '⏰', '✅', '❌', '⭐', '📸', '🎈'] },
]

/** Put the emoji where the cursor is (over a selection), and say where the cursor goes after it. */
export function insertAt(text: string, start: number, end: number, emoji: string): { text: string; caret: number } {
  const a = Math.max(0, Math.min(start, text.length))
  const b = Math.max(a, Math.min(end, text.length))
  return { text: text.slice(0, a) + emoji + text.slice(b), caret: a + emoji.length }
}

/** The viewer's recently used emoji, newest first, eight at most (kept in their browser — a convenience, not data). */
export function withRecent(recent: string[], emoji: string): string[] {
  return [emoji, ...recent.filter(e => e !== emoji)].slice(0, 8)
}
