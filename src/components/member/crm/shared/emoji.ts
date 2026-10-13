/**
 * The composer's sticker button (2026-10-13; the user: "點 sticker 沒有反應"): an emoji sheet; a tap puts the emoji into
 * the reply at its end. Real stickers are not sent (WhatsApp wants a WebP file, Messenger offers only its own few).
 */
export const CHAT_EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😉",
  "🙂", "🤗", "🤩", "😎", "🥰", "😅", "😆", "😇",
  "🤔", "😮", "😴", "😢", "😭", "😤", "😱", "🙏",
  "👍", "👎", "👌", "👏", "🙌", "🤝", "💪", "✌️",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "💯", "✨",
  "🎉", "🎁", "🔥", "⭐", "✅", "❌", "⏰", "📅",
  "📍", "🏠", "🛋️", "🛏️", "🪑", "🚗", "📞", "💬",
  "☕", "🍰", "🌹", "🌞", "🌙", "🎈", "👋", "😃",
];

/** The draft with an emoji added at its end (a space before it when the draft ends in a word). */
export const withEmoji = (draft: string, e: string) => (draft && !/\s$/.test(draft) && /[\p{L}\p{N}]$/u.test(draft) ? `${draft} ${e}` : `${draft}${e}`);
