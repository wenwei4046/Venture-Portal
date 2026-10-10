// Which tab the allocator opens on — shared by the page (the server knows it
// before the tabs mount, so the head's Generate invoices is drawn right on the
// first paint) and by the tabs themselves.

export type AllocTab = 'calc' | 'records' | 'staff' | 'setup'

/** A record sent back to be corrected (and correctable) opens Calculate;
 *  otherwise the month's records, or Calculate when it has none. */
export function landingTab(txns: ReadonlyArray<{ id: string; locked: boolean }>, editId?: string): AllocTab {
  if (editId && txns.some((t) => t.id === editId && !t.locked)) return 'calc'
  return txns.length > 0 ? 'records' : 'calc'
}
