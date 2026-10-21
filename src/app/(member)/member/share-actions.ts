"use server";

import { revalidatePath } from "next/cache";
import { pushSoon } from "@/lib/push/outbox";
import * as share from "@/lib/member/share-server";
import type { ShareSendInput } from "@/lib/member/share-requests";
import type { MemberReadContext } from "@/lib/member/types";

/**
 * Share order (2026-10-21): the Revenue app's boundary for `lib/member/share-server.ts`. A write that moved a request tells
 * somebody (the colleagues named, or the salesperson), so its push leaves once the answer has gone back; Comm Cal's
 * Requests tab reads the same requests, so its pages are read again too.
 */
export async function fetchShareContext(orderId: string, context?: MemberReadContext) {
  return share.loadShareContext(orderId, context);
}

export async function fetchShareRequests(context?: MemberReadContext) {
  return share.loadShareRequests(context);
}

function moved<T extends { ok: boolean }>(result: T): T {
  if (result.ok) {
    revalidatePath("/member");
    revalidatePath("/revenue", "layout");
    pushSoon();
  }
  return result;
}

export async function sendShareRequest(input: ShareSendInput) {
  return moved(await share.sendShareRequest(input));
}

export async function answerShareRequest(id: string, accept: boolean, note: string | null) {
  return moved(await share.answerShareRequest(id, accept, note));
}

export async function cancelShareRequest(id: string) {
  return moved(await share.cancelShareRequest(id));
}
