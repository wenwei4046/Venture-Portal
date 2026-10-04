"use server";

import { revalidatePath } from "next/cache";
import type { MemberReadContext, QuoteInput } from "@/lib/member/types";
export type { AdminMemberInput, AdminMemberData } from "@/lib/member/server";
import {
  loadMemberData,
  loadMemberInsight,
  loadMemberInsightRange,
  loadMemberOrderBook,
  loadMemberOrgMap,
  calculateMemberQuote as calculate,
  submitMemberRequest as submit,
  acknowledgeMemberMemo as acknowledge,
  adminMemberAction as administer,
  type AdminMemberCommand,
} from "@/lib/member/server";

export async function refreshMemberData() {
  const data = await loadMemberData();
  return data.configured
    ? { ok: true as const, data }
    : {
        ok: false as const,
        error:
          data.message ?? "Your member profile has not been configured yet.",
      };
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
  }
  return result;
}
export async function acknowledgeMemberMemo(id: string, ack: boolean) {
  const result = await acknowledge(id, ack);
  if (result.ok) revalidatePath("/member");
  return result;
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
