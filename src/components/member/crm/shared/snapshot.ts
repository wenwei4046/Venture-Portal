import type { CrmData } from "@/lib/member/crm-data";
import { idbStore, MAX_AGE_MS } from "@/components/member/app/read-memory";

/**
 * The CRM's last answer, kept on the phone (2026-10-14, the owner: "當我進入時，我看到的還是上次的畫面"): in the Revenue
 * app's own kept-reads store (IndexedDB, read-memory.ts) under the account "crm" — /login deletes that store, so a phone
 * handed on keeps nobody's chats — one row for the phone screens and one for the desktop. A week old, it is not shown.
 */
const ACCOUNT = "crm";
let lastSaved = 0;

export async function loadSnapshot(key: string): Promise<CrmData | null> {
  const store = idbStore();
  if (!store) return null;
  try {
    const row = (await store.load(ACCOUNT)).find(r => r.key === key);
    return row && Date.now() - row.at < MAX_AGE_MS ? (row.value as CrmData) : null;
  } catch { return null; }
}

/** Saved at most every 10 s (the screen reads every 5 s). */
export function saveSnapshot(key: string, data: CrmData) {
  const store = idbStore(), now = Date.now();
  if (!store || now - lastSaved < 10_000) return;
  lastSaved = now;
  void store.save([{ id: `${ACCOUNT}|${key}`, account: ACCOUNT, key, at: now, value: data }]).catch(() => {});
}
