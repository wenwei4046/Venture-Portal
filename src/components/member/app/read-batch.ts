import type { MemberRead, MemberReadSlot } from "@/app/(member)/member/batch-actions";

/** Most reads one request carries (the server refuses more); a bigger burst goes as several. */
export const BATCH_MAX = 16;

interface Waiting { read: MemberRead; resolve: (value: unknown) => void; reject: (error: unknown) => void }

/**
 * Reads asked for in the same moment go to the server as one request
 * (2026-10-06). Every effect of a render asks in the same task, so a pull's
 * reads, or the first screen's, leave together and are answered side by side
 * (`readMemberBatch`). Each caller still gets its own promise: the read's own
 * answer, or a rejection for a read that threw or a request that never arrived.
 */
export function createReadBatcher(send: (reads: MemberRead[]) => Promise<MemberReadSlot[]>, max = BATCH_MAX) {
  let queue: Waiting[] = [];
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    const all = queue;
    queue = [];
    for (let i = 0; i < all.length; i += max) {
      const part = all.slice(i, i + max);
      send(part.map(w => w.read)).then(
        slots => part.forEach((w, j) => {
          const slot = slots?.[j];
          if (slot && "value" in slot) w.resolve(slot.value);
          else w.reject(new Error(slot && "thrown" in slot ? slot.thrown : "The read did not come back."));
        }),
        error => part.forEach(w => w.reject(error)),
      );
    }
  };

  return function read<T>(request: MemberRead): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({ read: request, resolve: resolve as (value: unknown) => void, reject });
      if (!scheduled) { scheduled = true; setTimeout(flush, 0); }
    });
  };
}
