'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { FinDialog, DialogButton, DialogForm, Field, Input, TextArea } from '@/components/finv/Dialog'
import { FinSurface, useFinSurface, type FinPlatform } from '@/components/finv/surface'
import { Chip, Facts, SecLabel, SectHead } from '@/components/hrv/kit'
import { HrIcon } from '@/components/hrv/icons'
import { Select } from '@/components/hrv/select'
import ImageAnnotator from '@/components/it-requests/ImageAnnotator'
import { fetchMyItRequests, fetchItDesk, fetchItRequest, submitItRequest, noteItRequest } from '@/lib/it-requests/actions'
import {
  IT_CATEGORIES, IT_STATUSES, IT_LIMITS, CATEGORY_LABEL, STATUS_LABEL, deviceLabel, itDay, itWhen,
  submitProblem, noteProblem, type ItCategory, type ItFile, type ItRequest, type ItStatus,
} from '@/lib/it-requests/model'
import { FiledFiles, Uploads } from './Attachments'
import FilePreview from './FilePreview'
import { useItUploads, useDraftLifecycle, useFileDrop } from './useItUploads'
import s from './it-support.module.css'

export interface ItSupportProps {
  app: 'hr' | 'finance' | 'portal'
  initialId?: string
  readOnly?: boolean
  desk?: boolean
  canEdit?: boolean
  initialRequests?: ItRequest[]
  initialRequest?: ItRequest | null
  initialError?: string
  initialFileUrls?: Record<string, string>
}

/** One's own IT requests, on the white HR / Finance surface. The host supplies its title and navigation. */
export default function ItSupport({
  app, initialId, readOnly = false, desk = false, canEdit = false, initialRequests, initialRequest, initialError = '', initialFileUrls,
}: ItSupportProps) {
  const [requests, setRequests] = useState<ItRequest[]>(initialRequests ?? [])
  const [loading, setLoading] = useState(initialRequests === undefined)
  const [error, setError] = useState(initialError)
  const [filter, setFilter] = useState<ItStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(0)
  const [selected, setSelected] = useState<ItRequest | null>(initialRequest ?? null)
  const [detailOpen, setDetailOpen] = useState(!!initialRequest)
  const [usePreloadedFiles, setUsePreloadedFiles] = useState(!!initialRequest)
  const revision = useRef(0)
  const statusId = useId()
  const load = useCallback(async (id?: string) => {
    const version = ++revision.current
    setLoading(true)
    setError('')
    setUsePreloadedFiles(false)
    try {
      const [list, target] = await Promise.all([desk ? fetchItDesk() : fetchMyItRequests(), id ? fetchItRequest(id) : Promise.resolve(null)])
      if (revision.current !== version) return
      if (list.ok) {
        setRequests(list.data)
        setSelected(previous => previous ? list.data.find(row => row.id === previous.id) ?? previous : null)
      } else setError(list.error)
      if (target) {
        if (target.ok && target.data) {
          setSelected(target.data)
          setDetailOpen(true)
        } else setError(target.ok ? 'That request is not available.' : target.error)
      }
    } catch {
      if (revision.current === version) setError('Your requests could not be read. Please refresh to try again.')
    } finally {
      if (revision.current === version) setLoading(false)
    }
  }, [desk])
  useEffect(() => {
    if (initialRequests !== undefined) {
      // Portal routes preload these reads on the server. Mounting must not start another Server Action.
      revision.current++
      setRequests(initialRequests)
      setLoading(false)
      setError(initialError)
      if (initialRequest) { setSelected(initialRequest); setDetailOpen(true); setUsePreloadedFiles(true) }
    } else if (initialRequest) {
      setSelected(initialRequest)
      setDetailOpen(true)
      void load()
    } else void load(initialId)
    return () => { revision.current++ }
  }, [load, initialId, initialRequests, initialRequest, initialError])
  const saved = (request: ItRequest) => {
    revision.current++
    setLoading(false)
    setRequests(rows => request.mine || desk ? [request, ...rows.filter(row => row.id !== request.id)] : rows)
    setSelected(previous => previous?.id === request.id ? request : previous)
  }
  const matching = requests.filter(request => filter === 'all' || request.status === filter)
  const pages = Math.max(1, Math.ceil(matching.length / 20))
  const shownPage = Math.min(page, pages)
  const rows = matching.slice((shownPage - 1) * 20, shownPage * 20)
  return (
    <div className={s.root} data-fin-kit="">
      <div className={s.toolbar}>
        <div className={s.filter}>
          <label htmlFor={statusId}>Status</label>
          <Select id={statusId} value={filter} onChange={event => { setFilter(event.target.value as ItStatus | 'all'); setPage(1) }}>
            <option value="all">All statuses</option>
            {IT_STATUSES.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
          </Select>
        </div>
        <div className={s.actions}>
          <DialogButton onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</DialogButton>
          <DialogButton kind="primary" disabled={readOnly} onClick={() => { setDraft(value => value + 1); setCreating(true) }}>
            <HrIcon name="buoy" />Send a request
          </DialogButton>
        </div>
      </div>
      {readOnly && <p className={s.meta}>Read-only while viewing as</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
      <SectHead title={desk ? "Everybody's requests" : 'My requests'} count={`${matching.length}`} />
      <div className={s.tableFrame} aria-busy={loading}>
        <table className="ledger-table">
          <thead><tr><th scope="col">Request</th><th scope="col" className={s.desktop}>Type</th><th scope="col">Status</th><th scope="col" className={s.desktop}>Sent</th></tr></thead>
          <tbody>
            {loading && !requests.length ? [0, 1, 2].map(index => (
              <tr key={index}><td colSpan={4}><span className={`skeleton ${s.skeleton}`} /></td></tr>
            )) : rows.length ? rows.map(request => (
              <tr key={request.id}>
                <td><button type="button" className={s.requestButton} onClick={() => { setSelected(request); setDetailOpen(true); setUsePreloadedFiles(false) }}>
                  <span>{request.title}</span><span className={s.meta}>{request.ref}{desk ? ` · ${request.senderName} · ${appLabel(request.app)}` : ''}<span className={s.mobile}> · {CATEGORY_LABEL[request.category]} · {itDay(request.createdAt)}</span></span>
                </button></td>
                <td className={s.desktop}>{CATEGORY_LABEL[request.category]}</td>
                <td><Status status={request.status} /></td>
                <td className={`${s.desktop} ${s.date}`}>{itDay(request.createdAt)}</td>
              </tr>
            )) : <tr><td colSpan={4} className={s.empty}>
              {error ? 'Requests are unavailable. Refresh to try again.' : filter === 'all' ? 'No requests yet.' : <>No {STATUS_LABEL[filter].toLowerCase()} requests. <button type="button" onClick={() => setFilter('all')}>Show all</button></>}
            </td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && <div className={s.pagination}>
        <DialogButton disabled={shownPage === 1} onClick={() => setPage(shownPage - 1)}>Previous</DialogButton>
        <span className={s.meta}>Page {shownPage} of {pages}</span>
        <DialogButton disabled={shownPage === pages} onClick={() => setPage(shownPage + 1)}>Next</DialogButton>
      </div>}
      <NewRequest key={draft} open={creating} app={app} readOnly={readOnly} onClose={() => setCreating(false)} onSaved={saved} />
      {selected && <RequestDetail key={selected.id} open={detailOpen} request={selected} readOnly={readOnly} canEdit={desk && canEdit}
        preloaded={usePreloadedFiles && initialRequest?.id === selected.id && initialFileUrls !== undefined ? { ids: initialRequest.files.map(file => file.id), urls: initialFileUrls } : undefined}
        onClose={() => setDetailOpen(false)} onSaved={saved} />}
    </div>
  )
}

/** Finance already supplies its phone context; HR's phone uses the same white sheet and safe-area handling. */
function SupportDialog({ open, title, locked, onClose, aside = null, children }: {
  open: boolean; title: string; locked: boolean; onClose: () => void
  /** A filed file's preview, beside the window (2026-10-24). */
  aside?: ReactNode
  children: ReactNode
}) {
  const inherited = useFinSurface()
  const [phone, setPhone] = useState<{ platform: FinPlatform } | null>(null)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setPhone(media.matches ? { platform: /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : 'android' } : null)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return <FinSurface.Provider value={inherited ?? phone}>
    <FinDialog open={open} title={title} locked={locked} tall aside={aside} onClose={onClose}>{children}</FinDialog>
  </FinSurface.Provider>
}

function Status({ status }: { status: ItStatus }) {
  return <Chip tone={status === 'fixed' ? 'ledger' : status === 'in_progress' ? 'alert' : 'info'}>{STATUS_LABEL[status]}</Chip>
}

const APP_LABEL: Readonly<Record<string, string>> = { hr: 'HR', finance: 'Finance', revenue: 'Revenue', portal: 'Portal' }
const appLabel = (app: string) => APP_LABEL[app] ?? app

function browserDevice() {
  return deviceLabel(navigator.userAgent, {
    standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
    width: window.innerWidth, height: window.innerHeight,
  })
}

function NewRequest({ open, app, readOnly, onClose, onSaved }: {
  open: boolean; app: ItSupportProps['app']; readOnly: boolean; onClose: () => void; onSaved: (request: ItRequest) => void
}) {
  const [category, setCategory] = useState<ItCategory | null>(null)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<ItRequest | null>(null)
  const [annotation, setAnnotation] = useState<{ src: string; fileName: string } | null>(null)
  const fields = useId()
  const files = useItUploads()
  const { closed, sending } = useDraftLifecycle(open, files.discard)
  // A file dragged onto the form attaches as if picked (2026-10-24); Details says where it lands.
  const drop = useFileDrop(files.add, open && !readOnly && !busy && !files.full)
  const mayAnnotate = useRef(false)
  mayAnnotate.current = open && !readOnly && !busy && !files.full
  const annotate = (src: string, fileName: string) => {
    if (mayAnnotate.current) setAnnotation({ src, fileName })
  }
  const send = async () => {
    if (sending.current || !open || readOnly) return
    const problem = submitProblem({ category: category ?? '', title, details, files: files.items.length })
    if (problem) return setError(problem)
    if (files.busy || files.failed) return setError(files.busy ? 'Wait for the files to finish uploading.' : 'Remove the files that could not be uploaded, then add them again.')
    setError('')
    setBusy(true)
    sending.current = true
    try {
      const result = await submitItRequest({ app, category: category!, title, details, files: files.uploads, device: browserDevice() })
      if (!result.ok) {
        if (!closed.current) setError(result.error)
      } else {
        files.clear()
        if (!closed.current) { setSent(result.data); onSaved(result.data) }
      }
    } catch {
      if (!closed.current) setError('Your request could not be sent. Please try again.')
    } finally {
      sending.current = false
      if (closed.current) files.discard()
      else setBusy(false)
    }
  }
  return <><SupportDialog open={open} title="Send to IT" locked={busy || !!annotation} onClose={onClose}>
    {sent ? <DialogForm buttons={<DialogButton onClick={onClose}>Done</DialogButton>}>
      <div className={s.success} role="status"><HrIcon name="approve" size={28} /><strong>Sent to IT</strong><span className={s.date}>{sent.ref}</span><p>You will be told when IT replies or its status changes.</p></div>
    </DialogForm> : <DialogForm onSubmit={() => void send()} buttons={<>
      <DialogButton disabled={busy} onClick={onClose}>Cancel</DialogButton>
      <DialogButton kind="primary" type="submit" disabled={busy || files.busy || readOnly}>{busy ? 'Sending…' : 'Send to IT'}</DialogButton>
    </>}>
      <div className={s.form} onPaste={busy || readOnly ? undefined : files.paste} {...drop.zone} data-drop={drop.over ? '' : undefined}>
        <div role="group" aria-label="What is it?" className={s.categories}>
          {IT_CATEGORIES.map(item => <DialogButton key={item.id} disabled={busy} aria-pressed={category === item.id} className={category === item.id ? s.picked : undefined} onClick={() => setCategory(item.id)}>{item.label}</DialogButton>)}
        </div>
        <Field label="Title" htmlFor={`${fields}-title`}><Input id={`${fields}-title`} value={title} onChange={event => setTitle(event.target.value)} maxLength={IT_LIMITS.title} disabled={busy} aria-required="true" /></Field>
        <Field label="Details" htmlFor={`${fields}-details`}><div className={s.dropBox}>
          <TextArea id={`${fields}-details`} value={details} onChange={event => setDetails(event.target.value)} maxLength={IT_LIMITS.details} rows={5} disabled={busy} placeholder="What happened, where in the app, and what you expected" />
          {drop.over && <span className={s.dropHint} aria-hidden="true">Drop to attach</span>}
        </div></Field>
        <div><SecLabel>Screenshots and files</SecLabel><Uploads files={files} disabled={busy || readOnly} onAnnotate={readOnly ? undefined : annotate} /><p className={s.meta}>Up to 10 files, 2 GB each.</p></div>
        {error && <p className={s.error} role="alert">{error}</p>}
      </div>
    </DialogForm>}
  </SupportDialog>
    {annotation && <ImageAnnotator {...annotation} theme="portal" onSave={file => { files.add([file]) }} onClose={() => setAnnotation(null)} />}
  </>
}

function RequestDetail({ open, request, readOnly, canEdit, preloaded, onClose, onSaved }: {
  open: boolean; request: ItRequest; readOnly: boolean; canEdit: boolean; preloaded?: { ids: string[]; urls: Record<string, string> }; onClose: () => void; onSaved: (request: ItRequest) => void
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(request.status)
  const [annotation, setAnnotation] = useState<{ src: string; fileName: string } | null>(null)
  // A filed file opened beside the window (2026-10-24), never in another tab of its own.
  const [preview, setPreview] = useState<{ file: ItFile; thumb?: string } | null>(null)
  const noteId = useId()
  const files = useItUploads()
  const { closed, sending } = useDraftLifecycle(open, files.discard)
  const writes = (request.mine || canEdit) && !readOnly
  // A file dragged onto the note attaches as if picked (2026-10-24); dropped elsewhere in the window it is not opened in place of the page.
  const drop = useFileDrop(files.add, open && writes && !busy && !files.full)
  const mayAnnotate = useRef(false)
  mayAnnotate.current = open && writes && !busy && !files.full
  useEffect(() => { setStatus(request.status) }, [request.status])
  useEffect(() => { if (!open) { setBody(''); setError(''); setAnnotation(null); setPreview(null); setStatus(request.status) } }, [open, request.status])
  const opened = (file: ItFile, thumb?: string) => setPreview({ file, thumb })
  const annotate = writes ? (src: string, fileName: string) => {
    if (mayAnnotate.current) setAnnotation({ src, fileName })
  } : undefined
  const send = async () => {
    if (sending.current || !writes || !open) return
    const nextStatus = canEdit && status !== request.status ? status : null
    const problem = noteProblem({ body, files: files.items.length, status: nextStatus, current: request.status })
    if (problem) return setError(problem)
    if (files.busy || files.failed) return setError(files.busy ? 'Wait for the files to finish uploading.' : 'Remove the files that could not be uploaded, then add them again.')
    sending.current = true
    setBusy(true)
    setError('')
    try {
      const result = await noteItRequest({ id: request.id, body, files: files.uploads, status: nextStatus, current: request.status })
      if (!result.ok) {
        if (!closed.current) setError(result.error)
      } else {
        files.clear()
        if (!closed.current) { setBody(''); onSaved(result.data) }
      }
    } catch {
      if (!closed.current) setError('Your reply could not be sent. Please try again.')
    } finally {
      sending.current = false
      if (closed.current) files.discard()
      else setBusy(false)
    }
  }
  return <><SupportDialog open={open} title={request.title} locked={busy || !!annotation} onClose={onClose}
    aside={preview ? <FilePreview key={preview.file.id} file={preview.file} thumb={preview.thumb} onClose={() => setPreview(null)} /> : null}>
    <DialogForm onSubmit={() => void send()} buttons={<>
      <DialogButton disabled={busy} onClick={onClose}>Done</DialogButton>
      {writes && <DialogButton kind="primary" type="submit" disabled={busy || files.busy}>{busy ? 'Sending…' : canEdit ? 'Send' : 'Send reply'}</DialogButton>}
    </>}>
      <div className={s.form} {...drop.guard}>
        <div className={s.detailHead}><span className={s.date}>{request.ref}</span><Status status={request.status} /></div>
        <Facts labelWidth={74} rows={[
          { l: 'Type', v: CATEGORY_LABEL[request.category] },
          { l: 'Sent', v: itWhen(request.createdAt) },
          { l: 'By', v: request.mine ? 'You' : request.senderName },
          { l: 'From', v: appLabel(request.app) },
          ...(request.statusAt && request.statusByName ? [{ l: STATUS_LABEL[request.status], v: `${request.statusByName} · ${itWhen(request.statusAt)}` }] : []),
          ...(request.device ? [{ l: 'Device', v: request.device }] : []),
        ]} />
        {request.details && <p className={s.prose}>{request.details}</p>}
        {request.files.some(file => file.noteId === null) && <section><SecLabel>Screenshots and files</SecLabel><FiledFiles files={request.files.filter(file => file.noteId === null)} onAnnotate={annotate} onOpen={opened} active={preview?.file.id} disabled={busy || files.full} preloaded={preloaded} /></section>}
        {request.notes.length > 0 && <section>
          <SecLabel>Updates</SecLabel>
          <div className={s.thread}>{request.notes.map(note => <div className={s.note} data-it={note.side === 'it' ? '' : undefined} key={note.id}>
            <div className={s.noteHead}><strong>{note.mine ? 'You' : note.side === 'it' ? `IT · ${note.authorName}` : note.authorName}</strong><time className={s.date}>{itWhen(note.at)}</time></div>
            {note.statusTo && <div className={s.noteStatus}>Marked <Status status={note.statusTo} /></div>}
            {note.body && <p className={s.prose}>{note.body}</p>}
            <FiledFiles files={request.files.filter(file => file.noteId === note.id)} onAnnotate={annotate} onOpen={opened} active={preview?.file.id} disabled={busy || files.full} preloaded={preloaded} />
          </div>)}</div>
        </section>}
        {writes && <section className={s.composer} onPaste={busy ? undefined : files.paste} {...drop.zone} data-drop={drop.over ? '' : undefined}>
          <Field label={canEdit ? 'Your note' : 'Your reply'} htmlFor={noteId}><div className={s.dropBox}>
            <TextArea id={noteId} value={body} onChange={event => setBody(event.target.value)} rows={3} maxLength={IT_LIMITS.note} disabled={busy} />
            {drop.over && <span className={s.dropHint} aria-hidden="true">Drop to attach</span>}
          </div></Field>
          <Uploads files={files} disabled={busy} onAnnotate={annotate} />
          {canEdit && <Field label="Status" htmlFor={`${noteId}-status`}>
            <Select id={`${noteId}-status`} value={status} disabled={busy} onChange={event => setStatus(event.target.value as ItStatus)}>
              {IT_STATUSES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
          </Field>}
        </section>}
        {error && <p className={s.error} role="alert">{error}</p>}
      </div>
    </DialogForm>
  </SupportDialog>
    {annotation && <ImageAnnotator {...annotation} theme="portal" onSave={file => { files.add([file]) }} onClose={() => setAnnotation(null)} />}
  </>
}
