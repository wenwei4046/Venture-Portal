"use server";

import { revalidatePath } from "next/cache";
import { pushSoon } from "@/lib/push/outbox";
import * as notMine from "@/lib/member/not-mine-server";
import type { MemberReadContext } from "@/lib/member/types";

/**
 * Not my order (2026-11-14): the Revenue app's boundary for `lib/member/not-mine-server.ts`. A request sent tells HR (its
 * push leaves once the answer has gone back); Comm Cal's Requests tab reads the same requests, so its pages are read again.
 */
export async function fetchNotMineContext(orderId: string, context?: MemberReadContext) {
  return notMine.loadNotMineContext(orderId, context);
}

export async function fetchNotMineRequests(context?: MemberReadContext) {
  return notMine.loadNotMineRequests(context);
}

function moved<T extends { ok: boolean }>(result: T): T {
  if (result.ok) {
    revalidatePath("/member");
    revalidatePath("/revenue", "layout");
    pushSoon();
  }
  return result;
}

export async function sendNotMineRequest(orderId: string, reason: string) {
  return moved(await notMine.sendNotMineRequest(orderId, reason));
}

export async function cancelNotMineRequest(id: string) {
  return moved(await notMine.cancelNotMineRequest(id));
}
