import { fileRoute } from '@/lib/storage/browser'
import { zipNames, type LibFile } from '@/lib/marketing/library'
import { createZip } from '@/lib/zip-store'

/**
 * A folder's files in one ZIP, made here in the browser (⑥-1 — a ZIP made by a function stops at 4.5 MB) and saved as
 * `<name>.zip`. Each file is fetched afresh from its own link: R2 answers a link loaded before without its CORS
 * headers, and the browser would hand that copy on (the screenshot annotator's way, components/it-requests). Its body
 * stays the Blob it came as and goes into the ZIP stored, not squeezed (photos and videos are compressed already), so
 * the page never holds the folder in its memory (lib/zip-store). `step` hears each file in.
 */
export async function saveZip(files: readonly LibFile[], name: string, step: (done: number, all: number) => void): Promise<void> {
  const zip = createZip()
  const names = zipNames(files)
  for (const [i, f] of files.entries()) {
    const r = await fetch(fileRoute('marketing', f.path), { cache: 'no-store' })
    if (!r.ok) throw new Error(`${f.name}: HTTP ${r.status}`)
    await zip.add(names[i], await r.blob(), new Date(f.at || Date.now()))
    step(i + 1, files.length)
  }
  const url = URL.createObjectURL(zip.finish())
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.zip`
  document.body.append(a)
  a.click()
  a.remove()
  // The download has its own copy once it starts.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
