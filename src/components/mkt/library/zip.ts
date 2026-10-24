import { fileRoute } from '@/lib/storage/browser'
import { zipNames, type LibFile } from '@/lib/marketing/library'

/**
 * A folder's files in one ZIP, made here in the browser (⑥-1 — a ZIP made by a function stops at 4.5 MB) and saved as
 * `<name>.zip`. Each file is fetched afresh from its own link: R2 answers a link loaded before without its CORS
 * headers, and the browser would hand that copy on (the screenshot annotator's way, components/it-requests). Stored,
 * not squeezed — photos and videos are compressed already. `step` hears each file in.
 */
export async function saveZip(files: readonly LibFile[], name: string, step: (done: number, all: number) => void): Promise<void> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const names = zipNames(files)
  for (const [i, f] of files.entries()) {
    const r = await fetch(fileRoute('marketing', f.path), { cache: 'no-store' })
    if (!r.ok) throw new Error(`${f.name}: HTTP ${r.status}`)
    zip.file(names[i], await r.arrayBuffer())
    step(i + 1, files.length)
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.zip`
  document.body.append(a)
  a.click()
  a.remove()
  // The download has its own copy once it starts.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
