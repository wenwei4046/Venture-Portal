/**
 * The Revenue app's last answers, kept on the phone (2026-10-08).
 *
 * User: 每次进来好像都在 loading … 进去的时候先看旧的数据，等它 refresh 之后才是新的数据。
 * Every read the app makes — income, the Arena, Insight, the bills — is still
 * answered by the server; its last answer is ALSO kept here, per account, in
 * IndexedDB. The next open shows those answers at once and reads everything
 * again behind them, swapping each one in as it lands: what Facebook and
 * Instagram do. Measured on prod before this: a View-as Today waited 2.6–8 s
 * for its income figure on every open.
 *
 * What is kept is only what the reads already hand the browser — no page
 * (public/sw.js still caches none), no price or cost (no read carries one) —
 * and never across accounts on a shared phone: the account is in every key,
 * /login forgets everything (every sign-out ends there), and an answer older
 * than a week is dropped.
 */

/** One kept answer, as IndexedDB holds it. */
export interface StoredRead {
  /** `account|key` — one row per account and read. */
  id: string;
  account: string;
  key: string;
  /** When it was answered (ms). */
  at: number;
  value: unknown;
}

/** Where the answers live: IndexedDB in the browser, a Map in the tests. */
export interface ReadStore {
  load(account: string): Promise<StoredRead[]>;
  save(rows: StoredRead[]): Promise<void>;
  drop(ids: string[]): Promise<void>;
  clear(): Promise<void>;
}

/** An answer older than this is not shown: a week away, the app opens as it did before. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/** Most answers kept per account — the newest. */
export const MAX_ROWS = 200;
/** Answers landing together are written together. */
export const SAVE_DELAY_MS = 400;

export interface ReadMemory {
  /** Settles once this account's answers are loaded, or there is nothing to load. Never rejects. */
  readonly ready: Promise<void>;
  /** How many answers were kept from before this open. */
  kept(): number;
  get<T>(key: string): T | undefined;
  put(key: string, value: unknown): void;
}

/**
 * A read's key: the read itself, keys sorted and `undefined` left out — the
 * same read asked for twice is the same key, whatever order its object was
 * written in.
 */
export function readKey(read: unknown): string {
  return JSON.stringify(sorted(read));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sorted(v);
    }
    return out;
  }
  return value;
}

export function createReadMemory(account: string, store: ReadStore | null = idbStore(), now: () => number = Date.now): ReadMemory {
  const answers = new Map<string, { at: number; value: unknown }>();
  const dirty = new Map<string, StoredRead>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let keptCount = 0;

  const ready: Promise<void> = (async () => {
    if (!store || !account) return;
    try {
      const rows = await store.load(account);
      const oldest = now() - MAX_AGE_MS;
      const fresh = rows.filter(r => r.at >= oldest).sort((a, b) => b.at - a.at);
      const keep = fresh.slice(0, MAX_ROWS);
      // An answer that landed while the phone's were loading is newer than any of them.
      for (const r of keep) if (!answers.has(r.key)) answers.set(r.key, { at: r.at, value: r.value });
      keptCount = keep.length;
      const drop = [...rows.filter(r => r.at < oldest), ...fresh.slice(MAX_ROWS)].map(r => r.id);
      if (drop.length) void store.drop(drop).catch(() => {});
    } catch {
      // Private mode, a full disk, a blocked database: an app that keeps nothing, as before.
    }
  })();

  const flush = () => {
    timer = null;
    if (!store || !dirty.size) return;
    const rows = [...dirty.values()];
    dirty.clear();
    void store.save(rows).catch(() => {});
  };

  return {
    ready,
    kept: () => keptCount,
    get: <T,>(key: string) => answers.get(key)?.value as T | undefined,
    put(key, value) {
      const at = now();
      answers.set(key, { at, value });
      if (!store || !account) return;
      dirty.set(key, { id: `${account}|${key}`, account, key, at, value });
      if (!timer) timer = setTimeout(flush, SAVE_DELAY_MS);
    },
  };
}

const DB_NAME = "vp-revenue-app";
const STORE = "reads";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }).createIndex("account", "account");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("The app's storage is busy."));
  });
}

function settled(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * The browser's store. Each call opens the database and closes it again, so no
 * page holds it open and /login can always delete it.
 */
export function idbStore(): ReadStore | null {
  if (typeof indexedDB === "undefined") return null;
  const withDb = async <T,>(work: (db: IDBDatabase) => Promise<T>): Promise<T> => {
    const db = await openDb();
    try {
      return await work(db);
    } finally {
      db.close();
    }
  };
  return {
    load: account => withDb(db => new Promise<StoredRead[]>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).index("account").getAll(account);
      request.onsuccess = () => resolve(request.result as StoredRead[]);
      request.onerror = () => reject(request.error);
    })),
    save: rows => withDb(db => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const row of rows) store.put(row);
      return settled(tx);
    }),
    drop: ids => withDb(db => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const id of ids) store.delete(id);
      return settled(tx);
    }),
    clear: () => new Promise<void>(resolve => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    }),
  };
}

/**
 * Forget every account's answers. /login calls it: every sign-out ends there,
 * so a phone handed to somebody else keeps nobody's figures.
 */
export async function forgetReads(store: ReadStore | null = idbStore()): Promise<void> {
  try {
    await store?.clear();
  } catch {
    // Nothing kept, nothing to forget.
  }
}
