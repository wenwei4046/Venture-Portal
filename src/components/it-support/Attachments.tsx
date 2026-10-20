'use client'

import { useEffect, useRef, useState } from 'react'
import { DialogButton } from '@/components/finv/Dialog'
import { signItFiles, openItFile } from '@/lib/it-requests/actions'
import { IT_ACCEPT, fileSize, fileTag, isImage, type ItFile } from '@/lib/it-requests/model'
import type { useItUploads } from './useItUploads'
import s from './it-support.module.css'

export function Uploads({ files, disabled = false, onAnnotate }: {
  files: ReturnType<typeof useItUploads>; disabled?: boolean; onAnnotate?: (src: string, fileName: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className={s.files}>
      {files.items.map(item => (
        <div className={s.fileRow} key={item.key}>
          <span className={s.fileTile}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, revoked when the draft ends */}
            {item.preview ? <img src={item.preview} alt="" /> : fileTag(item.name, item.type)}
          </span>
          <span className={s.fileWords}>
            <span>{item.name}</span>
            <span className={item.error ? s.error : s.meta} role={item.error ? 'alert' : undefined}>
              {item.state === 'uploading' ? 'Uploading…' : item.error ?? fileSize(item.size)}
            </span>
          </span>
          {item.preview && onAnnotate && <DialogButton disabled={disabled || files.full || item.state !== 'ready'} onClick={() => onAnnotate(item.preview!, item.name)} aria-label={`Annotate ${item.name}`}>Annotate</DialogButton>}
          <button type="button" className={s.remove} aria-label={`Remove ${item.name}`} disabled={disabled} onClick={() => files.remove(item.key)}>×</button>
        </div>
      ))}
      {!files.full && <DialogButton disabled={disabled} onClick={() => input.current?.click()}>Add screenshots or files</DialogButton>}
      <input ref={input} type="file" multiple hidden accept={IT_ACCEPT} disabled={disabled} aria-label="Screenshots and files" data-testid="it-files"
        onChange={event => {
          if (!disabled) files.add([...(event.target.files ?? [])])
          event.target.value = ''
        }} />
    </div>
  )
}

/** Each file is still checked by the server before its short-lived preview or open link is issued. */
export function FiledFiles({ files, onAnnotate, disabled = false, preloaded }: {
  files: ItFile[]; onAnnotate?: (src: string, fileName: string) => void; disabled?: boolean; preloaded?: { ids: string[]; urls: Record<string, string> }
}) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const pictures = files.filter(file => isImage(file.contentType) && !preloaded?.ids.includes(file.id)).map(file => file.id).join(',')
  const shownUrls = { ...preloaded?.urls, ...urls }
  useEffect(() => {
    if (!pictures) return
    let live = true
    void signItFiles(pictures.split(',')).then(result => {
      if (live && result.ok) setUrls(result.data)
    }).catch(() => { /* The file can still be opened at its own button. */ })
    return () => { live = false }
  }, [pictures])
  const open = async (id: string) => {
    setError('')
    const tab = window.open('about:blank', '_blank')
    if (!tab) return setError('Allow pop-ups, then open the file again.')
    tab.opener = null
    try {
      const result = await openItFile(id, 'view')
      if (!result.ok) {
        tab.close()
        setError(result.error)
      } else tab.location.href = result.data.url
    } catch {
      tab.close()
      setError('The file could not be opened. Please try again.')
    }
  }
  const annotate = async (file: ItFile) => {
    if (!onAnnotate || disabled) return
    setError('')
    try {
      const result = shownUrls[file.id] ? { ok: true as const, data: shownUrls } : await signItFiles([file.id])
      if (result.ok && result.data[file.id]) onAnnotate(result.data[file.id], file.name)
      else setError('The picture could not be opened. Please try again.')
    } catch {
      setError('The picture could not be opened. Please try again.')
    }
  }
  if (!files.length) return null
  return (
    <div className={s.files}>
      {files.map(file => (
        <div className={s.filedFile} key={file.id}>
          <button type="button" className={s.fileOpen} onClick={() => void open(file.id)} aria-label={`Open ${file.name}`}>
            <span className={isImage(file.contentType) ? s.picture : s.fileTile}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link to a private attachment */}
              {shownUrls[file.id] ? <img src={shownUrls[file.id]} alt={file.name} /> : fileTag(file.name, file.contentType)}
            </span>
            <span className={s.fileWords}><span>{file.name}</span><span className={s.meta}>{fileSize(file.size)}</span></span>
            <span className={s.openWord}>Open</span>
          </button>
          {onAnnotate && isImage(file.contentType) && <DialogButton disabled={disabled} onClick={() => void annotate(file)} aria-label={`Annotate ${file.name}`}>Annotate</DialogButton>}
        </div>
      ))}
      {error && <p className={s.error} role="alert">{error}</p>}
    </div>
  )
}
