"use server";

import { revalidatePath } from "next/cache";
import { pushSoon } from "@/lib/push/outbox";
import { loadCommRatioContext, saveCommRatio } from "@/lib/member/comm-ratio-server";
import type { CommRatioContext, CommRatioSaved } from "@/lib/member/comm-ratio";
import type { MemberOutcome } from "@/lib/member/server";

/**
 * A bill's ⋯ › Adjust commission in the Revenue app (2026-11-27): the sheet's read, and the write. Both answer
 * `{ ok, data } | { ok: false, error }` — a refusal in words (`lib/member/comm-ratio-server.ts`). A ratio set tells the
 * bill's holders (its push leaves once the answer has gone back); Comm Cal's month pages read the same ratios, so they
 * are read again.
 */
export async function fetchCommRatioContext(orderId: string): Promise<MemberOutcome<CommRatioContext>> {
  return loadCommRatioContext(orderId);
}

export async function setBillCommRatio(orderId: string, ratio: number | null, note: string | null): Promise<MemberOutcome<CommRatioSaved>> {
  const result = await saveCommRatio(orderId, ratio, note);
  if (result.ok && result.data.changed) {
    revalidatePath("/member");
    revalidatePath("/revenue", "layout");
    pushSoon();
  }
  return result;
}
