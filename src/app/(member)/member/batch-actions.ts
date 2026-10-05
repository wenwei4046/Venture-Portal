"use server";

import type { ArenaWindow } from "@/lib/member/arena";
import type { MemberReadContext } from "@/lib/member/types";
import {
  fetchDepartmentIncome,
  fetchMemberClaimRates,
  fetchMemberHonours,
  fetchMemberIncome,
  fetchMemberInsight,
  fetchMemberInsightRange,
  fetchMemberOrderBook,
  fetchMemberOrgMap,
  fetchMemberRequestHistory,
  fetchPrincipalMemoReceipts,
  refreshMemberData,
} from "./actions";
import { fetchMemberArena } from "./arena-actions";
import { fetchMemberKpiSummary } from "./kpi-summary-actions";

/** One of the Revenue app's reads, named by the action it calls. */
export type MemberRead =
  | { kind: "refresh" }
  | { kind: "insight"; period?: string; context?: MemberReadContext }
  | { kind: "kpi"; schemeId: string; period?: string; context?: MemberReadContext }
  | { kind: "arena"; membershipId: string; period: string; window: ArenaWindow; context?: MemberReadContext; options?: { history?: boolean } }
  | { kind: "orgMap"; context?: Pick<MemberReadContext, "subDepartmentId"> }
  | { kind: "orderBook"; subDepartmentId: string; from: string; until: string; context?: MemberReadContext }
  | { kind: "insightRange"; subDepartmentId: string; from: string; until: string; context?: MemberReadContext }
  | { kind: "income"; subDepartmentId: string; period: string; context?: MemberReadContext }
  | { kind: "departmentIncome"; subDepartmentId: string; period: string }
  | { kind: "honours"; subDepartmentId: string; from: string; until: string; context?: MemberReadContext }
  | { kind: "memoReceipts"; staffId: string }
  | { kind: "claimRates" }
  | { kind: "requestHistory"; id: string };

/** A read's answer, or the message of what it threw — the client rejects that read alone. */
export type MemberReadSlot = { value: unknown } | { thrown: string };

/**
 * Several of the app's reads in one request, answered side by side (2026-10-06).
 * The client runs Server Actions one at a time, so the eight reads a pull makes
 * took the SUM of their times — 4 to 6 s on prod for View as; here they take the
 * slowest one's. Each read is the very action the app called before, with its
 * own checks under the caller's own session, so nothing is reachable here that
 * was not reachable one by one. Writes never come this way.
 */
export async function readMemberBatch(reads: MemberRead[]): Promise<MemberReadSlot[]> {
  if (!Array.isArray(reads) || reads.length === 0 || reads.length > 16) throw new Error("Ask for between 1 and 16 reads.");
  return Promise.all(reads.map(async (read): Promise<MemberReadSlot> => {
    try {
      return { value: await readOne(read) };
    } catch (error) {
      return { thrown: error instanceof Error ? error.message.slice(0, 250) : "The read failed." };
    }
  }));
}

function readOne(read: MemberRead): Promise<unknown> {
  switch (read?.kind) {
    case "refresh": return refreshMemberData();
    case "insight": return fetchMemberInsight(read.period, read.context);
    case "kpi": return fetchMemberKpiSummary(read.schemeId, read.context, read.period);
    case "arena": return fetchMemberArena(read.membershipId, read.period, read.window, read.context, read.options);
    case "orgMap": return fetchMemberOrgMap(read.context);
    case "orderBook": return fetchMemberOrderBook(read.subDepartmentId, read.from, read.until, read.context);
    case "insightRange": return fetchMemberInsightRange(read.subDepartmentId, read.from, read.until, read.context);
    case "income": return fetchMemberIncome(read.subDepartmentId, read.period, read.context);
    case "departmentIncome": return fetchDepartmentIncome(read.subDepartmentId, read.period);
    case "honours": return fetchMemberHonours(read.subDepartmentId, read.from, read.until, read.context);
    case "memoReceipts": return fetchPrincipalMemoReceipts(read.staffId);
    case "claimRates": return fetchMemberClaimRates();
    case "requestHistory": return fetchMemberRequestHistory(read.id);
    default: return Promise.reject(new Error("Unknown read."));
  }
}
