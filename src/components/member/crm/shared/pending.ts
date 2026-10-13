import type { CrmData } from "@/lib/member/crm-data";

/**
 * The screen reads the CRM again every 5 s (CrmApp). Two things only this screen knows survive that read:
 * - a message still being sent ("sending", sales/actions › send / sendMedia) stays at its chat's end until its send
 *   answers — else it would vanish for a moment and come back;
 * - a photo, video or voice note this phone just sent keeps showing from the phone's own copy (the owner, 2026-10-13:
 *   "加照片為什麼還要加載 supabase?" — the read swapped it for the stored file, which then downloaded again).
 */
const localMedia = new Map<string, string>();

/** This phone's copy of a file it sent (an object URL), shown instead of the stored one for this session. */
export function rememberLocalMedia(messageId: string, url: string) {
  if (messageId && url) localMedia.set(messageId, url);
}

export function keepSending(prev: CrmData | null, next: CrmData): CrmData {
  const sending = new Map<string, CrmData["customers"][number]["messages"]>();
  if (prev) for (const c of prev.customers) {
    const s = c.messages.filter(m => m.status === "sending");
    if (s.length) sending.set(c.id, s);
  }
  if (!sending.size && !localMedia.size) return next;
  return { ...next, customers: next.customers.map(c => {
    const s = sending.get(c.id);
    const own = localMedia.size && c.messages.some(m => m.media && localMedia.has(m.id))
      ? c.messages.map(m => (m.media && localMedia.has(m.id) ? { ...m, media: { ...m.media, url: localMedia.get(m.id)! } } : m))
      : c.messages;
    if (!s && own === c.messages) return c;
    return { ...c, messages: s ? [...own, ...s.filter(m => !own.some(x => x.id === m.id))] : own };
  }) };
}
