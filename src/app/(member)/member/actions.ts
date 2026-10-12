"use server";

import { revalidatePath } from "next/cache";
import { pushSoon } from "@/lib/push/outbox";
import { getMemberUser } from "@/lib/auth";
import { isPrincipalAccount } from "@/lib/view-as";
import { markMyMemo, openMemoFile } from "@/lib/memos/actions";
import type { MemberReadContext, QuoteInput } from "@/lib/member/types";
export type { AdminMemberInput, AdminMemberData } from "@/lib/member/server";
import {
  loadMemberData,
  loadMemberCatalogue,
  loadMemberInsight,
  loadMemberInsightRange,
  loadMemberOrderBook,
  loadMemberOrgMap,
  calculateMemberQuote as calculate,
  submitMemberRequest as submit,
  acknowledgeMemberMemo as acknowledge,
  cancelMemberRequest as cancel,
  loadMemberRequestHistory,
  loadMemberClaimRates,
  loadMemberWaitingForm,
  loadMemberWaitingFormLink,
  loadMemberReplacementForm,
  loadMemberReplacementFormLink,
  loadMemberWaitingQueue,
  loadPrincipalMemoReceipts,
  loadMemberIncome,
  loadDepartmentIncome,
  loadMemberHonours,
  adminMemberAction as administer,
  type AdminMemberCommand,
} from "@/lib/member/server";

/** `lite`: the Revenue app's pull — everything but the Quote's catalogue (fetchMemberCatalogue). */
export async function refreshMemberData(options: { lite?: boolean } = {}) {
  const data = await loadMemberData({ lite: options?.lite === true });
  return data.configured
    ? { ok: true as const, data }
    : {
        ok: false as const,
        error:
          data.message ?? "Your member profile has not been configured yet.",
      };
}
export async function fetchMemberCatalogue() {
  return loadMemberCatalogue();
}
export async function fetchMemberInsight(period?: string, context?: MemberReadContext) {
  return loadMemberInsight(period, context);
}
export async function fetchMemberOrderBook(subDepartmentId: string, from: string, until: string, context?: MemberReadContext) {
  return loadMemberOrderBook(subDepartmentId, from, until, context);
}
export async function fetchMemberInsightRange(subDepartmentId: string, from: string, until: string, context?: MemberReadContext) {
  return loadMemberInsightRange(subDepartmentId, from, until, context);
}
export async function fetchMemberOrgMap(context?: Pick<MemberReadContext, "subDepartmentId">) {
  return loadMemberOrgMap(context);
}
export async function calculateMemberQuote(input: QuoteInput) {
  return calculate(input);
}
export async function submitMemberRequest(form: FormData) {
  const result = await submit(form);
  if (result.ok) {
    revalidatePath("/member");
    revalidatePath("/claims");
    // HR is told of a request sent or answered (mig 20261011180000).
    pushSoon();
  }
  return result;
}
export async function fetchMemberRequestHistory(id: string) {
  return loadMemberRequestHistory(id);
}
export async function cancelMemberRequest(id: string) {
  const result = await cancel(id);
  if (result.ok) {
    revalidatePath("/member");
    revalidatePath("/claims");
  }
  return result;
}
export async function fetchPrincipalMemoReceipts(staffId: string) {
  return loadPrincipalMemoReceipts(staffId);
}
export async function fetchMemberIncome(subDepartmentId: string, period: string, context?: MemberReadContext) {
  return loadMemberIncome(subDepartmentId, period, context);
}
export async function fetchDepartmentIncome(subDepartmentId: string, period: string) {
  return loadDepartmentIncome(subDepartmentId, period);
}
export async function fetchMemberHonours(subDepartmentId: string, from: string, until: string, context?: MemberReadContext) {
  return loadMemberHonours(subDepartmentId, from, until, context);
}
export async function fetchMemberClaimRates() {
  return loadMemberClaimRates();
}
/** The waiting-list form HR set (Sales Groups › Form settings) — the Revenue app draws it. */
export async function fetchMemberWaitingForm() {
  return loadMemberWaitingForm();
}
/** Download form: a fresh ten-minute link to HR's uploaded application form, or null for the built one. */
export async function fetchMemberWaitingFormLink() {
  return loadMemberWaitingFormLink();
}
/** The replacement form HR set (Sales Groups › Replacement list › Form settings, 2026-10-11). */
export async function fetchMemberReplacementForm() {
  return loadMemberReplacementForm();
}
/** Download form on a replacement: HR's upload through a ten-minute link, or null for the built one. */
export async function fetchMemberReplacementFormLink() {
  return loadMemberReplacementFormLink();
}
/** Waiting list & replacements: the member's sub-departments' waiting lists (the viewed member's in View as). */
export async function fetchMemberWaitingQueue(context?: Pick<MemberReadContext, "staffId">) {
  return loadMemberWaitingQueue(context);
}
export async function acknowledgeMemberMemo(id: string, ack: boolean) {
  // The Principal's own memos (2026-10-12): their People record is not a Revenue member's, so their receipt goes
  // through the login's own function — the very row the portal's bell and the HR app write.
  const user = await getMemberUser();
  if (user && isPrincipalAccount(user)) {
    const own = await markMyMemo(id, ack);
    return own.ok
      ? { ok: true as const, data: { id, readAt: own.readAt, acknowledgedAt: own.acknowledgedAt, version: 1 } }
      : { ok: false as const, error: own.reason };
  }
  const result = await acknowledge(id, ack);
  if (result.ok) revalidatePath("/member");
  return result;
}
/** A memo's file (2026-10-12): a short link made at the tap — to its person, or to the Principal viewing them. */
export async function openMemberMemoFile(id: string, mode: "view" | "download") {
  const link = await openMemoFile(id, mode);
  return link.ok ? { ok: true as const, data: { url: link.url, fileName: link.fileName } } : { ok: false as const, error: link.reason };
}
export async function adminMemberAction(command: AdminMemberCommand) {
  const result = await administer(command);
  if (result.ok && !["list", "invoice"].includes(command.action)) {
    revalidatePath("/member");
    revalidatePath("/member-admin");
    revalidatePath("/team/people");
    revalidatePath("/revenue", "layout");
  }
  return result;
}
