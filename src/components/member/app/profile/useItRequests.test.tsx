import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ItRequest } from "@/lib/it-requests/model";
import type { Outcome, RevenueSource } from "../source";

vi.mock("@/app/(member)/member/batch-actions", () => ({ readMemberBatch: vi.fn() }));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/it-actions", () => ({}));

const { useItRequests } = await import("./useItRequests");

const request = (id: string, mine = true): ItRequest => ({
  id, ref: `IT-${id}`, category: "bug", title: `Request ${id}`, details: "", status: "new", app: "revenue", device: null,
  createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", statusAt: null, statusByName: null,
  senderName: "Test sender", senderTitle: null, mine, files: [], notes: [],
});
const ok = <T,>(data: T): Outcome<T> => ({ ok: true, data });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function sourceWith(overrides: Partial<RevenueSource> = {}) {
  return {
    itMine: vi.fn(async () => ok<ItRequest[]>([])),
    itDesk: vi.fn(async () => ok<ItRequest[]>([])),
    itGet: vi.fn(async () => ok<ItRequest | null>(null)),
    ...overrides,
  } as unknown as RevenueSource;
}
const base = { mineOn: true, deskOn: false, gen: 0 };

describe("useItRequests: a notification's exact request", () => {
  it.each([{ mine: true, count: 100 }, { mine: false, count: 300 }])(
    "reads an older $mine request without extending the $count-row list",
    async ({ mine, count }) => {
      const old = request("old", mine);
      const rows = Array.from({ length: count }, (_, i) => request(String(i), mine));
      const list = deferred<Outcome<ItRequest[]>>();
      const itGet = vi.fn(async () => ok<ItRequest | null>(old));
      const source = sourceWith({
        [mine ? "itMine" : "itDesk"]: () => list.promise,
        itGet,
      });
      const { result } = renderHook(() => useItRequests({ ...base, source, deskOn: !mine, selectedId: old.id }));
      await flush();
      expect(itGet).toHaveBeenCalledWith("old");
      expect(result.current.find("old")).toEqual(old);
      // A later list response still cannot hide the old notification's record.
      await act(async () => { list.resolve(ok(rows)); });
      expect(result.current[mine ? "mine" : "desk"]).toHaveLength(count);
      expect(result.current.find("old")).toEqual(old);
      expect(result.current.newCount).toBe(mine ? 0 : count);
    },
  );

  it("makes no reads while both gates are off, and no exact read without an open request", async () => {
    const source = sourceWith();
    const { rerender } = renderHook(
      (props: { mineOn: boolean; selectedId?: string }) => useItRequests({ ...base, source, ...props }),
      { initialProps: { mineOn: false, selectedId: "old" } },
    );
    await flush();
    expect(source.itMine).not.toHaveBeenCalled();
    expect(source.itDesk).not.toHaveBeenCalled();
    expect(source.itGet).not.toHaveBeenCalled();
    rerender({ mineOn: true });
    await flush();
    expect(source.itMine).toHaveBeenCalledTimes(1);
    expect(source.itGet).not.toHaveBeenCalled();
  });

  it("keeps fixtures local and supports sources without the optional exact API", async () => {
    const row = request("fixture");
    const source = sourceWith();
    const fixture = renderHook(() => useItRequests({ ...base, source, deskOn: true, selectedId: row.id, fixture: { mine: [row], desk: [] } }));
    await flush();
    expect(fixture.result.current.find(row.id)).toEqual(row);
    expect(source.itMine).not.toHaveBeenCalled();
    expect(source.itDesk).not.toHaveBeenCalled();
    expect(source.itGet).not.toHaveBeenCalled();
    const legacy = sourceWith({ itGet: undefined, itMine: async () => ok([row]) });
    const live = renderHook(() => useItRequests({ ...base, source: legacy, selectedId: row.id }));
    await flush();
    expect(live.result.current.find(row.id)).toEqual(row);
  });

  it("ignores an old request after another notification opens", async () => {
    const first = deferred<Outcome<ItRequest | null>>();
    const second = request("second");
    const source = sourceWith({ itGet: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok(second)) });
    const { result, rerender } = renderHook(
      ({ selectedId }) => useItRequests({ ...base, source, selectedId }), { initialProps: { selectedId: "first" } },
    );
    rerender({ selectedId: "second" });
    await flush();
    await act(async () => { first.resolve(ok(request("first"))); });
    expect(result.current.find("second")).toEqual(second);
    expect(result.current.find("first")).toBeNull();
  });

  it("ignores in-flight list and exact reads when View as turns both gates off", async () => {
    const exact = deferred<Outcome<ItRequest | null>>();
    const list = deferred<Outcome<ItRequest[]>>();
    const row = request("old");
    const source = sourceWith({ itGet: () => exact.promise, itMine: () => list.promise });
    const { result, rerender } = renderHook(
      ({ mineOn }) => useItRequests({ ...base, source, mineOn, selectedId: row.id }), { initialProps: { mineOn: true } },
    );
    rerender({ mineOn: false });
    await act(async () => { exact.resolve(ok(row)); list.resolve(ok([row])); });
    expect(result.current.mine).toBeNull();
    expect(result.current.find(row.id)).toBeNull();
  });

  it("drops an earlier refresh and an earlier account source's exact answer", async () => {
    const oldRead = deferred<Outcome<ItRequest | null>>();
    const oldSource = sourceWith({ itGet: () => oldRead.promise });
    const fresh = { ...request("old"), status: "fixed" as const };
    const source = sourceWith({ itGet: vi.fn().mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(ok(fresh)) });
    const { result, rerender } = renderHook(
      (props: { source: RevenueSource; gen: number }) => useItRequests({ ...base, ...props, selectedId: "old" }),
      { initialProps: { source: oldSource, gen: 0 } },
    );
    rerender({ source, gen: 0 });
    rerender({ source, gen: 1 });
    await flush();
    await act(async () => { oldRead.resolve(ok(request("old"))); });
    expect(result.current.find("old")).toEqual(fresh);
  });

  it("a successful note replaces the exact record outside both lists and wins over a pending read", async () => {
    const row = request("old");
    const fixed = { ...row, status: "fixed" as const };
    const refresh = deferred<Outcome<ItRequest | null>>();
    const source = sourceWith({
      itGet: vi.fn().mockResolvedValueOnce(ok(row)).mockReturnValueOnce(refresh.promise),
      itNote: vi.fn(async () => ok(fixed)),
    });
    const { result, rerender } = renderHook(
      ({ gen }) => useItRequests({ ...base, source, gen, selectedId: row.id }), { initialProps: { gen: 0 } },
    );
    await flush();
    rerender({ gen: 1 });
    await act(async () => { await result.current.note({ id: row.id, body: "Fixed", status: "fixed", current: "new", files: [] }); });
    await act(async () => { refresh.resolve(ok(row)); });
    expect(result.current.find(row.id)).toEqual(fixed);
    expect(result.current.mine).toEqual([]);
  });

  it("does not expose another sender's exact record without the desk gate", async () => {
    const source = sourceWith({ itGet: async () => ok(request("other", false)) });
    const { result } = renderHook(() => useItRequests({ ...base, source, selectedId: "other" }));
    await flush();
    expect(result.current.find("other")).toBeNull();
  });

  it("settles a refused or unavailable exact read without exposing the previous selection", async () => {
    const row = request("old");
    const source = sourceWith({ itGet: vi.fn().mockResolvedValueOnce(ok(row)).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(ok(null)) });
    const { result, rerender } = renderHook(
      ({ selectedId }) => useItRequests({ ...base, source, selectedId }), { initialProps: { selectedId: row.id } },
    );
    await flush();
    rerender({ selectedId: "refused" });
    await flush();
    expect(result.current.find(row.id)).toBeNull();
    expect(result.current.mineError).toBe("Offline");
    rerender({ selectedId: "missing" });
    await flush();
    expect(result.current.find("missing")).toBeNull();
  });
});
