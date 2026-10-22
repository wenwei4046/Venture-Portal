"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MemberReadContext } from "@/lib/member/types";
import { openRequestOn, waitingOn, type ShareRequest } from "@/lib/member/share-requests";
import { settleRead, type RevenueSource } from "../../source";

/**
 * Share order's state (2026-10-21): the share requests the member sent and was sent — read with the app's open, again on
 * every pull and whenever a share notice reaches the bell (`signal`), never kept on the phone. A request sent, answered
 * or withdrawn here replaces itself in the list at once.
 */
export function useShareRequests({ source, on, context, staffId, gen, signal }: {
  source: RevenueSource;
  /** The live app, ready to read (not the preview's demo). */
  on: boolean;
  /** View as: the viewed member's, read only. */
  context?: MemberReadContext;
  /** Whose answers are asked for: the member's own staff id (or the viewed member's). */
  staffId: string;
  /** Pull to refresh: read again. */
  gen: number;
  /** Changes when a share notice comes in: read again. */
  signal: string;
}): {
  list: ShareRequest[] | null;
  error: string | null;
  /** One request, by id. */
  find: (id: string) => ShareRequest | null;
  /** The request still open on a bill. */
  onBill: (orderId: string) => ShareRequest | null;
  /** The requests waiting for the member's own answer — the bell's and Today's "needs you". */
  waiting: ShareRequest[];
  /** A request as it now stands, after a send, an answer or a withdrawal. */
  put: (r: ShareRequest) => void;
} {
  const [list, setList] = useState<ShareRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const staff = context?.staffId;
  const sub = context?.subDepartmentId;

  useEffect(() => {
    if (!on || !source.shareRequests) return;
    let live = true;
    void settleRead(source.shareRequests(staff && sub ? { staffId: staff, subDepartmentId: sub } : undefined)).then(res => {
      if (!live) return;
      if (res.ok) { setList(res.data); setError(null); } else setError(res.error);
    });
    return () => { live = false; };
  }, [on, source, staff, sub, gen, signal]);

  // Another member viewed (or none): their list is read afresh, never the last one's shown meanwhile.
  useEffect(() => { setList(null); setError(null); }, [staff, sub]);

  const put = useCallback((r: ShareRequest) => {
    setList(current => {
      const rest = (current ?? []).filter(x => x.id !== r.id);
      return [r, ...rest];
    });
  }, []);
  const find = useCallback((id: string) => list?.find(r => r.id === id) ?? null, [list]);
  const onBill = useCallback((orderId: string) => openRequestOn(list ?? [], orderId), [list]);
  const waiting = useMemo(() => (list ?? []).filter(r => waitingOn(r, staffId)), [list, staffId]);
  return { list, error, find, onBill, waiting, put };
}
