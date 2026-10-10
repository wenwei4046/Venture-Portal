/**
 * The sub-department's waiting list as a member sees it (2026-10-10, HR
 * revamp 7b): `member_waiting_queue()` numbers everybody HR accepted in the
 * order they were accepted — the member's own applicants by their full name
 * (with the request they came from), everybody else's by a first name and an
 * initial. Read here, so the app and the server agree on its shape.
 *
 * Pure, so it is tested.
 */

export interface WaitingQueueRow {
  position: number;
  name: string;
  mine: boolean;
  /** The member's own request — null for anybody else's. */
  requestId: string | null;
}

export interface WaitingQueue {
  subDepartmentId: string;
  name: string;
  rows: WaitingQueueRow[];
}

/** `member_waiting_queue()`'s answer; anything it could not have sent is left out. */
export function queuesFrom(raw: unknown): WaitingQueue[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const q = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    if (!q || typeof q.subDepartmentId !== "string" || typeof q.name !== "string") return [];
    const rows = Array.isArray(q.rows)
      ? q.rows.flatMap((r) => {
          const x = r && typeof r === "object" ? (r as Record<string, unknown>) : null;
          const position = Number(x?.position);
          if (!x || !Number.isInteger(position) || position < 1 || typeof x.name !== "string") return [];
          const mine = x.mine === true;
          return [{ position, name: x.name, mine, requestId: mine && typeof x.requestId === "string" ? x.requestId : null }];
        })
      : [];
    return [{ subDepartmentId: q.subDepartmentId, name: q.name, rows: rows.sort((a, b) => a.position - b.position) }];
  });
}

/** Where one of the member's own requests stands on its list: "#2 of 5", or null when it is not on one. */
export function placeOf(queues: readonly WaitingQueue[], requestId: string): { position: number; total: number; ahead: number } | null {
  for (const q of queues) {
    const row = q.rows.find((r) => r.requestId === requestId);
    if (row) return { position: row.position, total: q.rows.length, ahead: row.position - 1 };
  }
  return null;
}
