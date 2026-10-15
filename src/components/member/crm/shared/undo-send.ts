/**
 * Undo send (the owner, 2026-10-15: a message to a customer should be taken back within a short time; told that neither
 * WhatsApp's nor Messenger's API can take back one the customer already has, the owner chose "1" — a send held a moment
 * with Undo). A message tapped Send shows in the chat at once with its clock, but goes to the customer only after
 * UNDO_MS; Unsend in that time takes it out of the chat and puts its words back in the box — the customer never gets it.
 * Since the same day ("出現在點對話框的功能鍵裡，不出現在頁面上") there is no bar: a held message's long-press menu
 * offers **Unsend · Ns** (msg-menu, both chats). Words, photos, videos, voice notes and files alike; a visit card, a
 * template and a forward go at once. The hold lives on the phone: closed in those seconds, the message does not go.
 */
export const UNDO_MS = 10_000;

type Held = { id: string; label: string; until: number; done: (send: boolean) => void };
let held: Held[] = [];

/** Holds a send for UNDO_MS: true when it should go, false when it was undone. */
export function holdForUndo(id: string, label: string): Promise<boolean> {
  return new Promise(resolve => {
    const h: Held = { id, label, until: Date.now() + UNDO_MS, done: () => {} };
    const timer = setTimeout(() => h.done(true), UNDO_MS);
    h.done = send => { clearTimeout(timer); held = held.filter(x => x !== h); resolve(send); };
    held = [...held, h];
  });
}
/** Is this message still held (not gone to the customer yet)? */
export const isHeld = (id: string) => held.some(h => h.id === id);
/** Seconds left before a held message goes (at least 1). */
export const heldLeft = (id: string) => { const h = held.find(x => x.id === id); return h ? Math.max(1, Math.ceil((h.until - Date.now()) / 1000)) : 0; };
/** Take a held message back; false when it has gone already. */
export function undoHeld(id: string): boolean {
  const h = held.find(x => x.id === id);
  if (!h) return false;
  h.done(false);
  return true;
}
