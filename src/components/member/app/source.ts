import type { MemberCatalogue, MemberData, MemberInsight, MemberOrgMap, MemberReadContext, MemberRequest, QuoteInput, QuoteResult } from "@/lib/member/types";
import type { RequestEvent } from "./profile/profile-model";
import { readClaimRates, type ClaimRates } from "@/lib/member/claim-rules";
import type { DepartmentIncome, MemberIncome } from "@/lib/member/income";
import type { MemberHonours, MemberWaitingForm } from "@/lib/member/server";
import type { WaitingQueue } from "@/lib/member/waiting-queue";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import type { ArenaWindow, MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberInsightRange, MemberOrderBook } from "@/lib/member/order-book";
import {
  acknowledgeMemberMemo, calculateMemberQuote, cancelMemberRequest, fetchMemberReplacementFormLink, fetchMemberWaitingFormLink, openMemberMemoFile, submitMemberRequest,
  type fetchDepartmentIncome, type fetchMemberCatalogue, type fetchMemberClaimRates, type fetchMemberReplacementForm, type fetchMemberWaitingForm, type fetchMemberWaitingQueue, type fetchMemberHonours, type fetchMemberIncome, type fetchMemberInsight,
  type fetchMemberInsightRange, type fetchMemberOrderBook, type fetchMemberOrgMap, type fetchMemberRequestHistory, type fetchPrincipalMemoReceipts,
  type refreshMemberData,
} from "@/app/(member)/member/actions";
import type { fetchMemberArena } from "@/app/(member)/member/arena-actions";
import type { fetchMemberKpiSummary } from "@/app/(member)/member/kpi-summary-actions";
import { readMemberBatch, type MemberRead } from "@/app/(member)/member/batch-actions";
import { bookMemberRoom, cancelMemberBooking, type MemberBookInput, type fetchMemberRooms } from "@/app/(member)/member/rooms-actions";
import type { MemberRoomsData } from "./profile/rooms-model";
import { openMemberDoc, openMemberPersonal, type fetchMemberDocuments, type fetchMemberPersonal } from "@/app/(member)/member/docs-actions";
import { noteItRequest, openItFile, signItFiles, submitItRequest, type ItNoteInput, type ItSubmitInput, type fetchItDesk, type fetchMyItRequests } from "@/app/(member)/member/it-actions";
import type { ItRequest } from "@/lib/it-requests/model";
import type { fetchMemberCrmUnread } from "@/app/(member)/member/chat-badge-actions";
import type { fetchMemberNotices } from "@/app/(member)/member/bell-actions";
import type { Notices } from "@/lib/push/notices";
import type { MemberDocument } from "@/lib/documentation/member-model";
import type { Personal } from "@/lib/documentation/personal";
import { createReadBatcher } from "./read-batch";
import { createReadMemory, idbStore, readKey, type ReadStore } from "./read-memory";

export type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };
export type { MemberRead };

/**
 * Pull to refresh: a read started for pull number `gen` is handed to the app,
 * which spins until every one of them lands (and sees what threw). The caller
 * gets it back through `settleRead`.
 */
export type TrackRead = <T extends { ok: boolean }>(gen: number, read: Promise<T>) => Promise<T>;

/** A read that threw (offline, a newer release) answers as a failed read, so no caller is left with an unhandled rejection. */
export function settleRead<T extends { ok: boolean }>(read: Promise<T>): Promise<T> {
  return read.catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : "The read failed." }) as unknown as T);
}
export const untracked: TrackRead = (_gen, read) => settleRead(read);

/**
 * Each read, described once: what is sent to the server (`readMemberBatch`)
 * and the key its answer is kept under on the phone. A read's arguments that
 * mean the same thing are written the same way (an Arena read with its fair
 * history is `options` absent however it was asked), so the same question is
 * always the same key.
 */
export const ask = {
  insight: (period: string | undefined, context?: MemberReadContext): MemberRead => ({ kind: "insight", period, context }),
  kpi: (schemeId: string, context?: MemberReadContext, period?: string): MemberRead => ({ kind: "kpi", schemeId, context, period }),
  arena: (membershipId: string, period: string, window: ArenaWindow, context?: MemberReadContext, options?: { history?: boolean }): MemberRead =>
    ({ kind: "arena", membershipId, period, window, context, options: options?.history === false ? { history: false } : undefined }),
  orgMap: (context?: Pick<MemberReadContext, "subDepartmentId">): MemberRead => ({ kind: "orgMap", context }),
  orderBook: (subDepartmentId: string, from: string, until: string, context?: MemberReadContext): MemberRead =>
    ({ kind: "orderBook", subDepartmentId, from, until, context }),
  insightRange: (subDepartmentId: string, from: string, until: string, context?: MemberReadContext): MemberRead =>
    ({ kind: "insightRange", subDepartmentId, from, until, context }),
  income: (subDepartmentId: string, period: string, context?: MemberReadContext): MemberRead => ({ kind: "income", subDepartmentId, period, context }),
  departmentIncome: (subDepartmentId: string, period: string): MemberRead => ({ kind: "departmentIncome", subDepartmentId, period }),
  honours: (subDepartmentId: string, from: string, until: string, context?: MemberReadContext): MemberRead =>
    ({ kind: "honours", subDepartmentId, from, until, context }),
  memoReceipts: (staffId: string): MemberRead => ({ kind: "memoReceipts", staffId }),
  claimRates: (): MemberRead => ({ kind: "claimRates" }),
  waitingForm: (): MemberRead => ({ kind: "waitingForm" }),
  replacementForm: (): MemberRead => ({ kind: "replacementForm" }),
  waitingQueue: (context?: Pick<MemberReadContext, "staffId">): MemberRead => ({ kind: "waitingQueue", context: context ? { staffId: context.staffId } : undefined }),
  requestHistory: (id: string): MemberRead => ({ kind: "requestHistory", id }),
  catalogue: (): MemberRead => ({ kind: "catalogue" }),
  rooms: (from: string, to: string): MemberRead => ({ kind: "rooms", from, to }),
  documents: (context?: { staffId: string }): MemberRead => (context ? { kind: "documents", staffId: context.staffId } : { kind: "documents" }),
  crmUnread: (): MemberRead => ({ kind: "crmUnread" }),
  notices: (): MemberRead => ({ kind: "notices" }),
  personal: (context?: { staffId: string }): MemberRead => (context ? { kind: "personal", staffId: context.staffId } : { kind: "personal" }),
  itMine: (): MemberRead => ({ kind: "itMine" }),
  itDesk: (): MemberRead => ({ kind: "itDesk" }),
};

/**
 * Where the app's numbers come from. The live app reads the database through
 * the member server actions; the design preview hands the same shapes from
 * fixtures, so both run the very same screens and models.
 */
export interface RevenueSource {
  refresh(): Promise<Outcome<MemberData>>;
  insight(period: string | undefined, context?: MemberReadContext): Promise<Outcome<MemberInsight>>;
  /** KPI items of a month ('YYYY-MM'); absent = the current month. */
  kpi(schemeId: string, context?: MemberReadContext, period?: string): Promise<Outcome<MemberKpiSummary>>;
  /** `history: false` leaves the booth history out (the Championship's months). */
  arena(membershipId: string, period: string, window: ArenaWindow, context?: MemberReadContext, options?: { history?: boolean }): Promise<Outcome<MemberArenaSnapshot>>;
  orgMap(context?: Pick<MemberReadContext, "subDepartmentId">): Promise<Outcome<MemberOrgMap>>;
  /** One member's bills, line by line, from one month to another (inclusive). */
  orderBook(subDepartmentId: string, from: string, until: string, context?: MemberReadContext): Promise<Outcome<MemberOrderBook>>;
  /** The member and their team over a quarter or a year. */
  insightRange(subDepartmentId: string, from: string, until: string, context?: MemberReadContext): Promise<Outcome<MemberInsightRange>>;
  /** A cart's margin at a price — priced on the server; no cost ever comes back. */
  quote(input: QuoteInput): Promise<Outcome<QuoteResult>>;
  /** Mark a memo read (`ack` false) or acknowledge it — the member's own receipt. */
  memo(id: string, ack: boolean): Promise<Outcome<{ acknowledgedAt: string | null }>>;
  /** A memo's file (2026-10-12): a short link made at the tap (never kept). */
  memoFile?(id: string, mode: "view" | "download"): Promise<Outcome<{ url: string; fileName: string }>>;
  /** Who moved a request, when, and why. */
  requestHistory(id: string): Promise<Outcome<RequestEvent[]>>;
  submitRequest(form: FormData): Promise<Outcome<MemberRequest>>;
  /** Withdraw a request HR has not acted on yet. */
  cancelRequest(id: string): Promise<Outcome<MemberRequest>>;
  /** HR's fair-claim rates and regions. */
  claimRates(): Promise<Outcome<ClaimRates>>;
  /** The waiting-list form HR set (2026-10-10). */
  waitingForm?(): Promise<Outcome<MemberWaitingForm>>;
  /** Download form: a fresh link to HR's uploaded application form — null when the app builds it. Never kept. */
  waitingFormLink?(): Promise<Outcome<{ url: string; name: string } | null>>;
  /** The replacement form HR set (2026-10-11, round 2's README 18.5). */
  replacementForm?(): Promise<Outcome<MemberWaitingForm>>;
  /** Download form on a replacement — the waiting list's way. Never kept. */
  replacementFormLink?(): Promise<Outcome<{ url: string; name: string } | null>>;
  /** Waiting list & replacements: the member's sub-departments' waiting lists, in acceptance order. */
  waitingQueue?(context?: Pick<MemberReadContext, "staffId">): Promise<Outcome<WaitingQueue[]>>;
  /** My income: one month as Comm Cal works it out (live until the close), and the months paid. */
  income(subDepartmentId: string, period: string, context?: MemberReadContext): Promise<Outcome<MemberIncome>>;
  /** Today for a Principal viewing nobody: the sub-department's commission this month, before salaries. */
  departmentIncome(subDepartmentId: string, period: string): Promise<Outcome<DepartmentIncome>>;
  /** My honours: the member's finishes over a window of months, and which months are final. */
  honours(subDepartmentId: string, from: string, until: string, context?: MemberReadContext): Promise<Outcome<MemberHonours>>;
  /** View as: the viewed person's memo receipts. */
  memoReceipts(staffId: string): Promise<Outcome<{ memoId: string; readAt: string | null; acknowledgedAt: string | null }[]>>;
  /** The Quote's catalogue (2026-10-08) — read when the Quote needs it, no longer with every open. */
  catalogue?(): Promise<Outcome<MemberCatalogue>>;
  /** Book a room (2026-10-11): the rooms and their bookings from one day to another, and who may be picked. */
  rooms?(from: string, to: string): Promise<Outcome<MemberRoomsData>>;
  /** Book a room for yourself. */
  bookRoom?(input: MemberBookInput): Promise<Outcome<{ id: string; ref: string }>>;
  /** Cancel a meeting you booked. */
  cancelBooking?(id: string): Promise<Outcome<true>>;
  /** Documentation (2026-10-11): the files HR shares with the member's department — or, View as, with the viewed one's. */
  documents?(context?: { staffId: string }): Promise<Outcome<MemberDocument[]>>;
  /** A file's short link, made at the tap (never kept). */
  openDocument?(id: string, context?: { staffId: string }): Promise<Outcome<{ url: string; fileName: string }>>;
  /** Today's CRM chat button (2026-10-14): the unread messages of the account's own chats. */
  crmUnread?(): Promise<Outcome<number>>;
  /** The bell (2026-10-14, live): the account's own notifications, read again — the layout hands the open's. */
  notices?(): Promise<Outcome<Notices>>;
  /** Documentation › Personal (2026-10-14): what HR shares with the member of their own folder, and their letters. */
  personal?(context?: { staffId: string }): Promise<Outcome<Personal>>;
  /** One of Personal: a file of theirs, or a letter — its short link made at the tap. */
  openPersonal?(kind: "drive" | "letter", id: string, context?: { staffId: string }): Promise<Outcome<{ url: string; fileName: string }>>;
  /** IT support (2026-10-20): one's own requests — read fresh each time, never kept on the phone. */
  itMine?(): Promise<Outcome<ItRequest[]>>;
  /** …everybody's, for IT requests · View. */
  itDesk?(): Promise<Outcome<ItRequest[]>>;
  /** Send one (its files already in the bucket). */
  itSubmit?(input: ItSubmitInput): Promise<Outcome<ItRequest>>;
  /** A reply, IT's note, a status. */
  itNote?(input: ItNoteInput): Promise<Outcome<ItRequest>>;
  /** Short links to some of a request's files (its pictures' previews). */
  itSign?(ids: string[]): Promise<Outcome<Record<string, string>>>;
  /** One file's short link, made at the tap. */
  itOpen?(id: string, mode: "view" | "download"): Promise<Outcome<{ url: string; fileName: string }>>;
  /**
   * What the phone kept from an earlier open (the live app only, 2026-10-08):
   * the last answer to a read (`ask.*`), shown while it is read again.
   */
  peek?<T>(read: MemberRead): T | undefined;
  /**
   * Put what the screen now shows in place of the phone's kept answer to a read (2026-10-20): a file the member just
   * opened stays opened on the next open too, instead of showing New — and Profile's count — until the list is read
   * again. Nothing is sent.
   */
  keep?(read: MemberRead, value: unknown): void;
  /** Settles once the phone's answers are loaded — the app asks for nothing before, or the first screen would miss them. */
  ready?: Promise<void>;
  /** How many answers the phone kept from before this open. */
  kept?(): number;
}

/** The design preview: reads nothing — its screens come from fixtures. */
const nothing = async () => ({ ok: false as const, error: "Preview data only." });
export const demoSource: RevenueSource = {
  refresh: nothing, insight: nothing, kpi: nothing, arena: nothing, orgMap: nothing, orderBook: nothing, insightRange: nothing, quote: nothing,
  memo: nothing, requestHistory: nothing, submitRequest: nothing, cancelRequest: nothing, claimRates: nothing, memoReceipts: nothing, income: nothing, honours: nothing,
  departmentIncome: nothing, catalogue: nothing,
};

/** What a read action answers. */
type Answer<F extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>;
/**
 * Reads asked for together leave together (`readMemberBatch`): the client runs Server Actions one at a time, and a
 * screen's or a pull's reads one by one took the sum of their times. Writes and the quote's price go straight.
 */
const read = createReadBatcher(reads => readMemberBatch(reads));

/**
 * The live app's source. Given the signed-in account, every answer is also
 * kept on the phone (read-memory.ts) and `peek` hands it back on the next
 * open; without one it keeps nothing.
 */
export function createLiveSource(account?: string, store: ReadStore | null = idbStore()): RevenueSource {
  const memory = account ? createReadMemory(account, store) : null;
  /** Ask, and keep the answer when it is one — a refusal never replaces what the phone kept. */
  const go = <T extends { ok: boolean }>(request: MemberRead, answer: Promise<T> = read<T>(request)): Promise<T> =>
    !memory ? answer : answer.then(a => {
      if (a.ok) memory.put(readKey(request), (a as unknown as { data: unknown }).data);
      return a;
    });

  return {
    async refresh() {
      // The pull's snapshot: everything but the Quote's catalogue, which the Quote reads on its own.
      const result = await read<Answer<typeof refreshMemberData>>({ kind: "refresh", lite: true });
      return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
    },
    insight: (period, context) => go<Answer<typeof fetchMemberInsight>>(ask.insight(period, context)),
    kpi: (schemeId, context, period) => go<Answer<typeof fetchMemberKpiSummary>>(ask.kpi(schemeId, context, period)),
    arena: (membershipId, period, window, context, options) =>
      go<Answer<typeof fetchMemberArena>>(ask.arena(membershipId, period, window, context, options)),
    orgMap: context => go<Answer<typeof fetchMemberOrgMap>>(ask.orgMap(context)),
    orderBook: (subDepartmentId, from, until, context) => go<Answer<typeof fetchMemberOrderBook>>(ask.orderBook(subDepartmentId, from, until, context)),
    insightRange: (subDepartmentId, from, until, context) =>
      go<Answer<typeof fetchMemberInsightRange>>(ask.insightRange(subDepartmentId, from, until, context)),
    quote: input => calculateMemberQuote(input),
    async memo(id, ack) {
      const result = await acknowledgeMemberMemo(id, ack);
      return result.ok ? { ok: true, data: { acknowledgedAt: result.data.acknowledgedAt } } : result;
    },
    memoFile: (id, mode) => openMemberMemoFile(id, mode),
    requestHistory: id => go<Answer<typeof fetchMemberRequestHistory>>(ask.requestHistory(id)),
    submitRequest: form => submitMemberRequest(form),
    cancelRequest: id => cancelMemberRequest(id),
    claimRates() {
      const request = ask.claimRates();
      return go(request, read<Answer<typeof fetchMemberClaimRates>>(request)
        .then((result): Outcome<ClaimRates> => (result.ok ? { ok: true, data: readClaimRates(result.data) } : result)));
    },
    waitingForm: () => go<Answer<typeof fetchMemberWaitingForm>>(ask.waitingForm()),
    waitingFormLink: () => fetchMemberWaitingFormLink(),
    replacementForm: () => go<Answer<typeof fetchMemberReplacementForm>>(ask.replacementForm()),
    replacementFormLink: () => fetchMemberReplacementFormLink(),
    waitingQueue: context => go<Answer<typeof fetchMemberWaitingQueue>>(ask.waitingQueue(context)),
    memoReceipts: staffId => go<Answer<typeof fetchPrincipalMemoReceipts>>(ask.memoReceipts(staffId)),
    income: (subDepartmentId, period, context) => go<Answer<typeof fetchMemberIncome>>(ask.income(subDepartmentId, period, context)),
    departmentIncome: (subDepartmentId, period) => go<Answer<typeof fetchDepartmentIncome>>(ask.departmentIncome(subDepartmentId, period)),
    honours: (subDepartmentId, from, until, context) => go<Answer<typeof fetchMemberHonours>>(ask.honours(subDepartmentId, from, until, context)),
    catalogue: () => go<Answer<typeof fetchMemberCatalogue>>(ask.catalogue()),
    rooms: (from, to) => go<Answer<typeof fetchMemberRooms>>(ask.rooms(from, to)),
    bookRoom: input => bookMemberRoom(input),
    cancelBooking: id => cancelMemberBooking(id),
    documents: context => go<Answer<typeof fetchMemberDocuments>>(ask.documents(context)),
    openDocument: (id, context) => openMemberDoc(id, context?.staffId),
    crmUnread: () => go<Answer<typeof fetchMemberCrmUnread>>(ask.crmUnread()),
    // Never kept on the phone: every open has the layout's own, fresh.
    notices: () => read<Answer<typeof fetchMemberNotices>>(ask.notices()),
    personal: context => go<Answer<typeof fetchMemberPersonal>>(ask.personal(context)),
    openPersonal: (kind, id, context) => openMemberPersonal(kind, id, context?.staffId),
    // IT support (2026-10-20): read fresh, never kept — a status IT set an hour ago must not wait for a pull.
    itMine: () => read<Answer<typeof fetchMyItRequests>>(ask.itMine()),
    itDesk: () => read<Answer<typeof fetchItDesk>>(ask.itDesk()),
    itSubmit: input => submitItRequest(input),
    itNote: input => noteItRequest(input),
    itSign: ids => signItFiles(ids),
    itOpen: (id, mode) => openItFile(id, mode),
    ...(memory ? {
      peek: <T,>(request: MemberRead) => memory.get<T>(readKey(request)),
      keep: (request: MemberRead, value: unknown) => memory.put(readKey(request), value),
      ready: memory.ready,
      kept: () => memory.kept(),
    } : {}),
  };
}

/** The live source without a phone memory (nothing is kept): what a caller without an account uses. */
export const liveSource: RevenueSource = createLiveSource();
