import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_AGE_MS, MAX_ROWS, SAVE_DELAY_MS, createReadMemory, forgetReads, readKey, type ReadStore, type StoredRead } from "./read-memory";

/** A store in memory, standing in for IndexedDB. */
function memStore(seed: StoredRead[] = []) {
  const rows = new Map(seed.map(r => [r.id, r]));
  const calls = { save: 0, drop: [] as string[], clear: 0 };
  const store: ReadStore = {
    load: async account => [...rows.values()].filter(r => r.account === account),
    save: async list => { calls.save++; for (const r of list) rows.set(r.id, r); },
    drop: async ids => { calls.drop.push(...ids); for (const id of ids) rows.delete(id); },
    clear: async () => { calls.clear++; rows.clear(); },
  };
  return { store, rows, calls };
}
const row = (account: string, key: string, at: number, value: unknown): StoredRead => ({ id: `${account}|${key}`, account, key, at, value });
const NOW = 1_000_000_000_000;

afterEach(() => { vi.useRealTimers(); });

describe("the phone's memory of the Revenue app's reads (2026-10-08)", () => {
  it("one read is one key, whatever order its object was written in", () => {
    expect(readKey({ kind: "income", subDepartmentId: "fair", period: "2026-10", context: undefined }))
      .toBe(readKey({ period: "2026-10", kind: "income", subDepartmentId: "fair" }));
    expect(readKey({ kind: "arena", context: { subDepartmentId: "fair", staffId: "a" } }))
      .toBe(readKey({ context: { staffId: "a", subDepartmentId: "fair" }, kind: "arena" }));
    expect(readKey({ kind: "income", period: "2026-10" })).not.toBe(readKey({ kind: "income", period: "2026-09" }));
  });

  it("opens on this account's answers only — never another account's on the same phone", async () => {
    const { store } = memStore([row("me", "a", NOW - 1000, { figure: 1 }), row("someone-else", "a", NOW - 1000, { figure: 2 })]);
    const memory = createReadMemory("me", store, () => NOW);
    await memory.ready;
    expect(memory.get("a")).toEqual({ figure: 1 });
    expect(memory.kept()).toBe(1);
  });

  it("drops an answer older than a week, from the screen and from the phone", async () => {
    const { store, calls } = memStore([row("me", "old", NOW - MAX_AGE_MS - 1, 1), row("me", "new", NOW - 60_000, 2)]);
    const memory = createReadMemory("me", store, () => NOW);
    await memory.ready;
    expect(memory.get("old")).toBeUndefined();
    expect(memory.get("new")).toBe(2);
    await Promise.resolve();
    expect(calls.drop).toEqual(["me|old"]);
  });

  it("keeps the newest answers when there are more than it holds", async () => {
    const seed = Array.from({ length: MAX_ROWS + 5 }, (_, i) => row("me", `k${i}`, NOW - (MAX_ROWS + 5 - i) * 1000, i));
    const memory = createReadMemory("me", memStore(seed).store, () => NOW);
    await memory.ready;
    expect(memory.kept()).toBe(MAX_ROWS);
    expect(memory.get("k0")).toBeUndefined();
    expect(memory.get(`k${MAX_ROWS + 4}`)).toBe(MAX_ROWS + 4);
  });

  it("writes the answers that land together in one go, a moment later", async () => {
    vi.useFakeTimers();
    const { store, rows, calls } = memStore();
    const memory = createReadMemory("me", store, () => NOW);
    await memory.ready;
    memory.put("a", { x: 1 });
    memory.put("b", { y: 2 });
    expect(memory.get("a")).toEqual({ x: 1 });
    expect(calls.save).toBe(0);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(calls.save).toBe(1);
    expect(rows.get("me|a")).toMatchObject({ account: "me", key: "a", at: NOW, value: { x: 1 } });
    expect(rows.get("me|b")?.value).toEqual({ y: 2 });
  });

  it("an answer that lands while the phone's are loading is newer than any of them", async () => {
    let release!: (rows: StoredRead[]) => void;
    const store: ReadStore = { ...memStore().store, load: () => new Promise(r => { release = r; }) };
    const memory = createReadMemory("me", store, () => NOW);
    memory.put("a", "fresh");
    release([row("me", "a", NOW - 5000, "kept")]);
    await memory.ready;
    expect(memory.get("a")).toBe("fresh");
  });

  it("a broken store (private mode, a full disk) is an app that keeps nothing — it still works", async () => {
    const store: ReadStore = { ...memStore().store, load: () => Promise.reject(new Error("blocked")), save: () => Promise.reject(new Error("full")) };
    const memory = createReadMemory("me", store, () => NOW);
    await expect(memory.ready).resolves.toBeUndefined();
    expect(memory.kept()).toBe(0);
    memory.put("a", 1);
    expect(memory.get("a")).toBe(1);
  });

  it("without an account nothing is written", async () => {
    vi.useFakeTimers();
    const { store, calls } = memStore();
    const memory = createReadMemory("", store, () => NOW);
    memory.put("a", 1);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(calls.save).toBe(0);
  });

  it("/login forgets everything, and a store that cannot is no error", async () => {
    const { store, calls } = memStore([row("me", "a", NOW, 1)]);
    await forgetReads(store);
    expect(calls.clear).toBe(1);
    await expect(forgetReads({ ...store, clear: () => Promise.reject(new Error("gone")) })).resolves.toBeUndefined();
    await expect(forgetReads(null)).resolves.toBeUndefined();
  });
});
