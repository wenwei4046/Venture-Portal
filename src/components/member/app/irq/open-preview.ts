/**
 * Quote settings' Preview: the quote in its own tab, always the same one. Pressed again, the browser reloads that tab
 * where it stands, behind this one, so the press seems to do nothing unless the tab is brought forward (2026-11-06).
 * False when the browser blocked the tab.
 */
export function openIrqPreview(href: string): boolean {
  const tab = window.open(href, "irq-preview");
  if (!tab) return false;
  try { tab.focus(); } catch { /* the tab is open, whether or not it may come forward */ }
  return true;
}
