"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemberReadContext } from "@/lib/member/types";
import { openNotMineOn, type NotMineRequest } from "@/lib/member/not-mine-requests";
import { settleRead, type RevenueSource } from "../../source";

/**
 * Not my order's state (2026-11-14): the requests the member sent — read with the app's open, again on every pull and
 * whenever HR's answer reaches the bell (`signal`), never kept on the phone. A request sent or withdrawn here replaces
 * itself in the list at once.
 */
export function useNotMineRequests({ source, on, context, gen, signal }: {
  source: RevenueSource;
  /** The live app, ready to read (not the preview's demo). */
  on: boolean;
  /** View as: the viewed member's, read only. */
  context?: MemberReadContext;
  /** Pull to refresh: read again. */
  gen: number;
  /** Changes when HR's answer comes in: read again. */
  signal: string;
}): {
  list: NotMineRequest[] | null;
  error: string | null;
  /** One request, by id. */
  find: (id: string) => NotMineRequest | null;
  /** The request still with HR on a bill. */
  onBill: (orderId: string) => NotMineRequest | null;
  /** A request as it now stands, after a send or a withdrawal. */
  put: (r: NotMineRequest) => void;
} {
  const [list, setList] = useState<NotMineRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const staff = context?.staffId;
  const sub = context?.subDepartmentId;

  useEffect(() => {
    if (!on || !source.notMineRequests) return;
    let live = true;
    void settleRead(source.notMineRequests(staff && sub ? { staffId: staff, subDepartmentId: sub } : undefined)).then(res => {
      if (!live) return;
      if (res.ok) { setList(res.data); setError(null); } else setError(res.error);
    });
    return () => { live = false; };
  }, [on, source, staff, sub, gen, signal]);

  // Another member viewed (or none): their list is read afresh, never the last one's shown meanwhile.
  useEffect(() => { setList(null); setError(null); }, [staff, sub]);

  const put = useCallback((r: NotMineRequest) => {
    setList(current => [r, ...(current ?? []).filter(x => x.id !== r.id)]);
  }, []);
  const find = useCallback((id: string) => list?.find(r => r.id === id) ?? null, [list]);
  const onBill = useCallback((orderId: string) => openNotMineOn(list ?? [], orderId), [list]);
  return { list, error, find, onBill, put };
}
