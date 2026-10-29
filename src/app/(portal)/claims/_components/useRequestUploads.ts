'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PR_LIMITS, prFileRefusal, type UploadedFile } from '@/lib/payment-requests/model'
import { removeRequestUpload, uploadRequestFile } from '@/lib/payment-requests/upload'

// The New request window's receipts (2026-10-29, PR ②): each goes up as soon as it is picked (lib/payment-requests/
// upload — straight into the bucket, never through the server), and the window files the ones that arrived when it is
// saved or sent. One taken off before that is removed from the bucket again; a window closed without saving takes its
// uploads with it.

export interface PickedFile {
  key: string
  name: string
  size: number
  state: 'uploading' | 'ready' | 'failed'
  error: string | null
  file: UploadedFile | null
}

export function useRequestUploads(alreadyFiled: number) {
  const [items, setItems] = useState<PickedFile[]>([])
  const current = useRef<PickedFile[]>([])
  const live = useRef(true)
  const change = useCallback((update: (rows: PickedFile[]) => PickedFile[]) => {
    current.current = update(current.current)
    if (live.current) setItems(current.current)
  }, [])
  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const add = useCallback(
    (files: File[]) => {
      const room = Math.max(0, PR_LIMITS.files - alreadyFiled - current.current.length)
      const picked = files.slice(0, room).map((file) => {
        const error = prFileRefusal(file)
        const item: PickedFile = { key: crypto.randomUUID(), name: file.name, size: file.size, state: error ? 'failed' : 'uploading', error, file: null }
        return { item, file }
      })
      change((rows) => [...rows, ...picked.map((x) => x.item)])
      for (const { item, file } of picked) {
        if (item.error) continue
        void uploadRequestFile(file)
          .catch(() => ({ ok: false as const, reason: `${file.name} could not be uploaded. Add it again.` }))
          .then((result) => {
            // A pick taken off, or a window closed, before it arrived.
            if (!live.current || !current.current.some((row) => row.key === item.key)) {
              if (result.ok) void removeRequestUpload(result.file.path)
              return
            }
            change((rows) =>
              rows.map((row) => (row.key !== item.key ? row : result.ok ? { ...row, state: 'ready', file: result.file } : { ...row, state: 'failed', error: result.reason })),
            )
          })
      }
    },
    [alreadyFiled, change],
  )

  const remove = useCallback(
    (key: string) => {
      const item = current.current.find((row) => row.key === key)
      if (item?.file) void removeRequestUpload(item.file.path)
      change((rows) => rows.filter((row) => row.key !== key))
    },
    [change],
  )

  /** Saved: the uploads are the request's now — forgotten here, never removed. */
  const filed = useCallback(() => change(() => []), [change])

  /** Closed without saving: what went up comes down again. */
  const discard = useCallback(() => {
    for (const item of current.current) if (item.file) void removeRequestUpload(item.file.path)
    change(() => [])
  }, [change])

  return {
    items,
    add,
    remove,
    filed,
    discard,
    busy: items.some((i) => i.state === 'uploading'),
    failed: items.some((i) => i.state === 'failed'),
    full: alreadyFiled + items.length >= PR_LIMITS.files,
    uploads: items.flatMap((i) => (i.file ? [i.file] : [])),
  }
}
