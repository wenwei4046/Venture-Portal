// Lead View › copying a lead's message for the sales team. The Clipboard API first; where a browser (or an embedded
// view) refuses it, the older select-and-copy, which works on a click in more places. Says whether either took it.

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { /* nothing more to try */ }
    ta.remove()
    return ok
  }
}
