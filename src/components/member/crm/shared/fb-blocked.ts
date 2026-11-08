/**
 * Blocked on Facebook (the owner, 2026-11-08: "若我在 fb 已经 block 了这个人，对话框写 block, 并放到 block 分类里"): a
 * Messenger customer whom Facebook says the Page can no longer reply to. `CrmData.messengerBlocked` lists their contact
 * ids (undefined / empty until the database has the column). Such a chat is in the inbox's Blocked category and in no
 * other (as a Cold lead is only in Cold leads) on Mine, Team and the desktop, after Cold leads; its chat says so where
 * the status strip / head says "Attention · waiting …" or "Window closed", and offers no composer.
 */
import type { CrmCustomer, CrmData } from "@/lib/member/crm-data";

/** The strip's / head's words, and the category's name. */
export const FB_BLOCKED = "Blocked on Facebook";
export const FB_BLOCKED_CATEGORY = "Blocked";
/** The line in the composer's place (the desktop); the phone's cold card has FB_BLOCKED over FB_BLOCKED_SUB. */
export const FB_BLOCKED_NOTE = "Blocked on Facebook — they can't receive messages";
export const FB_BLOCKED_SUB = "They can't receive messages.";

const sets = new WeakMap<readonly string[], Set<string>>();

/** Is this customer blocked on Facebook? Every screen asks here. */
export function isFbBlocked(c: Pick<CrmCustomer, "id">, data: Pick<CrmData, "messengerBlocked">): boolean {
  const ids = data.messengerBlocked;
  if (!ids?.length) return false;
  let s = sets.get(ids);
  if (!s) { s = new Set(ids); sets.set(ids, s); }
  return s.has(c.id);
}
