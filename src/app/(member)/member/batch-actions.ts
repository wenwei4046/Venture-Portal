"use server";

import type { ArenaWindow } from "@/lib/member/arena";
import type { MemberReadContext } from "@/lib/member/types";
import {
  fetchDepartmentIncome,
  fetchMemberCatalogue,
  fetchMemberClaimRates,
  fetchMemberWaitingForm,
  fetchMemberReplacementForm,
  fetchMemberWaitingQueue,
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
import { fetchMemberRooms } from "./rooms-actions";
import { fetchMemberDocuments, fetchMemberPersonal } from "./docs-actions";
import { fetchMemberCrmUnread } from "./chat-badge-actions";
import { fetchMemberNotices } from "./bell-actions";
import { fetchItDesk, fetchMyItRequests } from "./it-actions";
import { fetchShareRequests } from "./share-actions";

/** One of the Revenue app's reads, named by the action it calls. */
export type MemberRead =
  | { kind: "refresh"; lite?: boolean }
  | { kind: "catalogue" }
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
  | { kind: "waitingForm" }
  | { kind: "replacementForm" }
  | { kind: "waitingQueue"; context?: Pick<MemberReadContext, "staffId"> }
  | { kind: "requestHistory"; id: string }
  | { kind: "rooms"; from: string; to: string }
  | { kind: "documents"; staffId?: string }
  | { kind: "crmUnread" }
  | { kind: "notices" }
  | { kind: "personal"; staffId?: string }
  // IT support (2026-10-20): one's own requests, and the desk's.
  | { kind: "itMine" }
  | { kind: "itDesk" }
  // Share order (2026-10-21): the share requests one sent and was sent — or, View as, the viewed member's.
  | { kind: "shareRequests"; context?: MemberReadContext };

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
    case "refresh": return refreshMemberData({ lite: read.lite === true });
    case "catalogue": return fetchMemberCatalogue();
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
    case "waitingForm": return fetchMemberWaitingForm();
    case "replacementForm": return fetchMemberReplacementForm();
    case "waitingQueue": return fetchMemberWaitingQueue(read.context);
    case "requestHistory": return fetchMemberRequestHistory(read.id);
    case "rooms": return fetchMemberRooms(read.from, read.to);
    case "documents": return fetchMemberDocuments(read.staffId);
    case "crmUnread": return fetchMemberCrmUnread();
    case "notices": return fetchMemberNotices();
    case "personal": return fetchMemberPersonal(read.staffId);
    case "itMine": return fetchMyItRequests();
    case "itDesk": return fetchItDesk();
    case "shareRequests": return fetchShareRequests(read.context);
    default: return Promise.reject(new Error("Unknown read."));
  }
}
