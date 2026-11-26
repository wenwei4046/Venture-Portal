"use server";

import { loadCommRatioContext, saveCommRatio } from "@/lib/member/comm-ratio-server";
import type { CommRatioContext, CommRatioSaved } from "@/lib/member/comm-ratio";
import type { MemberOutcome } from "@/lib/member/server";

/**
 * A bill's ⋯ › Adjust commission in the Revenue app (2026-11-27): the sheet's read, and the write. Both answer
 * `{ ok, data } | { ok: false, error }` — a refusal in words (`lib/member/comm-ratio-server.ts`).
 */
export async function fetchCommRatioContext(orderId: string): Promise<MemberOutcome<CommRatioContext>> {
  return loadCommRatioContext(orderId);
}

export async function setBillCommRatio(orderId: string, ratio: number | null, note: string | null): Promise<MemberOutcome<CommRatioSaved>> {
  return saveCommRatio(orderId, ratio, note);
}
