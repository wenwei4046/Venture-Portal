'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { IT_LIMITS, isImage, itContentType, itFileRefusal, type ItUpload } from '@/lib/it-requests/model'
import { removeItUpload, uploadItFile } from '@/lib/it-requests/upload'

export interface Attachment {
  key: string
  name: string
  size: number
  type: string
  state: 'uploading' | 'ready' | 'failed'
  error: string | null
  file: ItUpload | null
  preview: string | null
}

/** Upload immediately; the composer decides whether a finished upload is filed or discarded. */
export function useItUploads() {
  const [items, setItems] = useState<Attachment[]>([])
  const current = useRef<Attachment[]>([])
  const live = useRef(true)
  const previews = useRef(new Set<string>())
  const change = useCallback((update: (rows: Attachment[]) => Attachment[]) => {
    current.current = update(current.current)
    if (live.current) setItems(current.current)
  }, [])
  const release = useCallback((item: Attachment) => {
    if (item.preview) {
      URL.revokeObjectURL(item.preview)
      previews.current.delete(item.preview)
    }
  }, [])
  useEffect(() => {
    live.current = true
    const urls = previews.current
    return () => {
      live.current = false
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const add = useCallback((files: File[]) => {
    const picked = files.slice(0, Math.max(0, IT_LIMITS.files - current.current.length)).map(file => {
      const error = itFileRefusal(file)
      const type = itContentType(file.name, file.type) ?? file.type
      const preview = !error && isImage(type) && URL.createObjectURL ? URL.createObjectURL(file) : null
      if (preview) previews.current.add(preview)
      const item: Attachment = {
        key: crypto.randomUUID(), name: file.name, size: file.size, type,
        state: error ? 'failed' : 'uploading', error, file: null, preview,
      }
      return { item, file }
    })
    change(rows => [...rows, ...picked.map(x => x.item)])
    for (const { item, file } of picked) {
      if (item.error) continue
      void uploadItFile(file).catch(() => ({ ok: false as const, reason: `${file.name} could not be uploaded. Add it again.` })).then(result => {
        // A cancelled pick can finish after its form has gone away.
        if (!live.current || !current.current.some(row => row.key === item.key)) {
          if (result.ok) void removeItUpload(result.file.path)
          return
        }
        change(rows => rows.map(row => row.key !== item.key ? row : result.ok
          ? { ...row, state: 'ready', file: result.file }
          : { ...row, state: 'failed', error: result.reason }))
      })
    }
  }, [change])

  const remove = useCallback((key: string) => {
    const item = current.current.find(row => row.key === key)
    if (item?.file) void removeItUpload(item.file.path)
    if (item) release(item)
    change(rows => rows.filter(row => row.key !== key))
  }, [change, release])
  const clear = useCallback(() => {
    for (const item of current.current) release(item)
    change(() => [])
  }, [change, release])
  const discard = useCallback(() => {
    for (const item of current.current) if (item.file) void removeItUpload(item.file.path)
    clear()
  }, [clear])
  const paste = useCallback((event: ClipboardEvent) => {
    const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'))
    if (!files.length) return
    event.preventDefault()
    add(files)
  }, [add])

  return {
    items, add, remove, clear, discard, paste,
    busy: items.some(item => item.state === 'uploading'),
    failed: items.some(item => item.state === 'failed'),
    full: items.length >= IT_LIMITS.files,
    uploads: items.flatMap(item => item.file ? [item.file] : []),
  }
}

const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

/**
 * Files dragged in from the computer (2026-10-24 — the user: "drag 那个 file 移过来，放空在这个 text blank space 的时候，
 * 它要能够直接 attach"): dropped on the zone they are added as if picked, and while they are over it `over` says so.
 * A text drag is left to the browser; while the zone may take none (sending, ten already) the pointer says no.
 * `guard`, on what holds the zone, keeps a file dropped beside it from being opened in place of the page.
 */
export function useFileDrop(add: (files: File[]) => void, enabled: boolean) {
  const [over, setOver] = useState(false)
  // dragenter / dragleave fire for every child crossed: over until the last one is left.
  const depth = useRef(0)
  const zone = useMemo(() => ({
    onDragEnter(event: DragEvent) {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth.current += 1
      setOver(true)
    },
    onDragOver(event: DragEvent) {
      if (!carriesFiles(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = enabled ? 'copy' : 'none'
    },
    onDragLeave(event: DragEvent) {
      if (!carriesFiles(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setOver(false)
    },
    onDrop(event: DragEvent) {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth.current = 0
      setOver(false)
      if (enabled) add([...event.dataTransfer.files])
    },
  }), [add, enabled])
  const guard = useMemo(() => ({
    onDragOver(event: DragEvent) {
      if (!carriesFiles(event) || event.isDefaultPrevented()) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'none'
    },
    onDrop(event: DragEvent) {
      if (carriesFiles(event)) event.preventDefault()
    },
  }), [])
  return { over: enabled && over, zone, guard }
}

/** Closing during a server write waits for its answer before deciding whether uploads can be removed. */
export function useDraftLifecycle(active: boolean, discard: () => void) {
  const closed = useRef(!active)
  const sending = useRef(false)
  useEffect(() => {
    closed.current = !active
    if (!active && !sending.current) discard()
  }, [active, discard])
  useEffect(() => () => {
    closed.current = true
    if (!sending.current) discard()
  }, [discard])
  return { closed, sending }
}
