import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRead, MemberReadSlot } from "@/app/(member)/member/batch-actions";
import { createReadBatcher } from "./read-batch";

vi.mock("@/app/(member)/member/batch-actions", () => ({}));

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const answer = (reads: MemberRead[]): MemberReadSlot[] => reads.map(r => ({ value: { ok: true, data: r.kind } }));

describe("createReadBatcher", () => {
  it("sends the reads asked for in the same moment as one request, each answered on its own", async () => {
    const send = vi.fn(async (reads: MemberRead[]) => answer(reads));
    const read = createReadBatcher(send);
    const a = read<{ data: string }>({ kind: "claimRates" });
    const b = read<{ data: string }>({ kind: "memoReceipts", staffId: "s1" });
    const c = read<{ data: string }>({ kind: "refresh" });
    expect(send).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].map(r => r.kind)).toEqual(["claimRates", "memoReceipts", "refresh"]);
    expect((await a).data).toBe("claimRates");
    expect((await b).data).toBe("memoReceipts");
    expect((await c).data).toBe("refresh");
  });

  it("sends a later moment's reads as a request of their own", async () => {
    const send = vi.fn(async (reads: MemberRead[]) => answer(reads));
    const read = createReadBatcher(send);
    void read({ kind: "claimRates" });
    await vi.runAllTimersAsync();
    void read({ kind: "refresh" });
    await vi.runAllTimersAsync();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual([{ kind: "refresh" }]);
  });

  it("splits a burst bigger than the server takes", async () => {
    const send = vi.fn(async (reads: MemberRead[]) => answer(reads));
    const read = createReadBatcher(send, 3);
    const all = Array.from({ length: 7 }, (_, i) => read({ kind: "requestHistory", id: `r${i}` }));
    await vi.runAllTimersAsync();
    expect(send.mock.calls.map(c => c[0].length)).toEqual([3, 3, 1]);
    expect(await Promise.all(all)).toHaveLength(7);
  });

  it("rejects only the read that threw; the others keep their answers", async () => {
    const send = vi.fn(async (reads: MemberRead[]): Promise<MemberReadSlot[]> =>
      reads.map(r => (r.kind === "refresh" ? { thrown: "boom" } : { value: r.kind })));
    const read = createReadBatcher(send);
    const ok = read<string>({ kind: "claimRates" });
    const bad = read<string>({ kind: "refresh" });
    const settled = Promise.allSettled([ok, bad]);
    await vi.runAllTimersAsync();
    const [a, b] = await settled;
    expect(a).toEqual({ status: "fulfilled", value: "claimRates" });
    expect(b.status).toBe("rejected");
    expect((b as PromiseRejectedResult).reason.message).toBe("boom");
  });

  it("rejects every read of a request that never arrived (offline)", async () => {
    const send = vi.fn(async (): Promise<MemberReadSlot[]> => { throw new TypeError("Failed to fetch"); });
    const read = createReadBatcher(send);
    const settled = Promise.allSettled([read({ kind: "claimRates" }), read({ kind: "refresh" })]);
    await vi.runAllTimersAsync();
    expect((await settled).map(s => s.status)).toEqual(["rejected", "rejected"]);
  });

  it("hands every read the very error a newer release answered with, so the pull can tell to reload", async () => {
    const stale = Object.assign(new Error('Server Action "4080" was not found on the server.'), { name: "UnrecognizedActionError" });
    const send = vi.fn(async (): Promise<MemberReadSlot[]> => { throw stale; });
    const read = createReadBatcher(send);
    const settled = Promise.allSettled([read({ kind: "claimRates" }), read({ kind: "refresh" })]);
    await vi.runAllTimersAsync();
    for (const s of await settled) expect((s as PromiseRejectedResult).reason).toBe(stale);
  });

  it("rejects a read the answer left out", async () => {
    const send = vi.fn(async (): Promise<MemberReadSlot[]> => []);
    const read = createReadBatcher(send);
    const settled = Promise.allSettled([read({ kind: "claimRates" })]);
    await vi.runAllTimersAsync();
    expect((await settled)[0].status).toBe("rejected");
  });
});
