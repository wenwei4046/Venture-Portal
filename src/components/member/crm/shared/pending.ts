import type { CrmData } from "@/lib/member/crm-data";

/**
 * The screen reads the CRM again every 5 s (CrmApp). A message still being sent is only on this screen ("sending",
 * shared/actions › send / sendMedia), so a fresh read would drop it for a moment and bring it back when it lands. The
 * fresh read keeps them: each chat's sending messages stay at its end until their send answers.
 */
export function keepSending(prev: CrmData | null, next: CrmData): CrmData {
  if (!prev) return next;
  const sending = new Map<string, CrmData["customers"][number]["messages"]>();
  for (const c of prev.customers) {
    const s = c.messages.filter(m => m.status === "sending");
    if (s.length) sending.set(c.id, s);
  }
  if (!sending.size) return next;
  return { ...next, customers: next.customers.map(c => {
    const s = sending.get(c.id);
    return s ? { ...c, messages: [...c.messages, ...s.filter(m => !c.messages.some(x => x.id === m.id))] } : c;
  }) };
}
