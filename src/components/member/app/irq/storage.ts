"use client";
// IR Quote (2026-11-05): the prototype kept everything in the browser — the settings in localStorage
// (`irq.config.v1` live, `irq.preview.v1` the Principal's unpublished draft), each salesperson's quote drafts
// (`irq.drafts.<user>`), the Drive in IndexedDB. The ported logic still reads and writes through a
// localStorage-shaped object so it behaves exactly as designed; this is that object. Its values are read from the
// server before a screen opens (`preload`), every write lands in memory at once and is sent to the server behind
// it (`persist`), and another tab of the same browser hears it as the prototype's `storage` event did — that is how
// Quote settings' *Preview* updates the quote open in the other tab while the Principal edits.
type Listener = (e: { key: string; newValue: string | null }) => void;
type Persist = (key: string, value: string | null) => Promise<void>;

const mem = new Map<string, string>();
const listeners = new Set<Listener>();
let persist: Persist = async () => {};
let onError: (key: string, err: unknown) => void = () => {};
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const chan: BroadcastChannel | null = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("irq-storage") : null;

chan?.addEventListener("message", ev => {
  const { key, value } = ev.data as { key: string; value: string | null };
  if (value === null) mem.delete(key);
  else mem.set(key, value);
  listeners.forEach(fn => fn({ key, newValue: value }));
});

/** Wires the store to the server: what to send, and what to do when it fails. */
export function configureIrqStorage(p: Persist, err: (key: string, e: unknown) => void) {
  persist = p;
  onError = err;
}
/** Values read on the server, set before a screen's logic first reads them. */
export function preloadIrqStorage(values: Record<string, string | null | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (v == null) mem.delete(k);
    else mem.set(k, v);
  }
}

function send(key: string, value: string | null, delay: number) {
  clearTimeout(pending.get(key));
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      persist(key, value).catch(e => onError(key, e));
    }, delay),
  );
}

export const irqStorage = {
  getItem(key: string): string | null {
    return mem.has(key) ? (mem.get(key) as string) : null;
  },
  /** `delay`: the Principal's draft is sent once the typing pauses; everything else at once. */
  setItem(key: string, value: string, delay = 0) {
    mem.set(key, value);
    chan?.postMessage({ key, value });
    send(key, value, delay);
  },
  removeItem(key: string) {
    mem.delete(key);
    chan?.postMessage({ key, value: null });
    send(key, null, 0);
  },
  /** The prototype's `window.addEventListener("storage", …)`: changes made in another tab. */
  on(fn: Listener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** Sends whatever is still waiting (before a page is left). */
  flush() {
    for (const [key, t] of pending) {
      clearTimeout(t);
      pending.delete(key);
      persist(key, mem.get(key) ?? null).catch(e => onError(key, e));
    }
  },
};
