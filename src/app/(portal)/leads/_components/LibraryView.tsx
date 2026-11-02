'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { LeadIcon } from '@/components/layout/lead-icons'
import { leadMediaLinks, removeLibraryItem, saveLibraryItem } from '@/lib/leads/actions'
import { createClient } from '@/lib/supabase/client'
import { RETRY_PHONE, templateProblem, type LibraryItem, type StepFile, type StepKind, type TemplateStep } from '@/lib/leads/template'
import { ATTACH_ACCEPT, STEP_TYPES, extOf, isImage, typeOf } from '@/lib/leads/template-map'
import RichText from './RichText'
import s from './library.module.css'

/**
 * Lead View v2 › Step library (2026-11-02, the v2 handoff §7.7): one table — Step · Message · Used in · Last edited,
 * sortable, filtered by type. A row opens its panel (TYPE for a new one, MESSAGE, BUTTONS, ATTACHMENT, USED IN, a phone
 * PREVIEW, Cancel / Save); **saving updates every template that uses the step** (the user's point 4 —
 * lead_library_push, mig 20261102120000). Right-click: Edit, Duplicate, Delete — deleting changes no template.
 */

type Sort = 'name' | 'text' | 'used' | 'edited'
type Draft = { id: string | null; type: StepKind; name: string; text: string; buttons: string[]; file: StepFile | null }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayOf = (iso: string | undefined) => { if (!iso) return '—'; const d = new Date(iso); return `${d.toLocaleString('en-GB', { day: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })} ${MON[Number(d.toLocaleString('en-GB', { month: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })) - 1]}` }
const draftOf = (l: LibraryItem): Draft => {
  const st = l.steps[0]
  return { id: l.id, type: st?.kind ?? 'message', name: l.name, text: st?.text ?? '', buttons: (st?.buttons ?? []).map(b => b.label), file: st?.file ?? null }
}
/** The one step a library item keeps, from the panel. */
function stepOf(d: Draft, was: TemplateStep | undefined): TemplateStep {
  const base: TemplateStep = { ...(was ?? {}), id: 's1', kind: d.type, name: d.name.trim(), text: d.text }
  delete base.pos
  delete base.lib
  delete base.buttons
  delete base.file
  return {
    ...base,
    ...(d.type === 'question' ? { buttons: d.buttons.map(label => ({ label, next: '' })), next: '' } : d.type === 'handoff' || d.type === 'ai' ? {} : { next: '' }),
    ...(d.type === 'phone' && !base.retryText ? { retryText: RETRY_PHONE, retryMax: '2', failNext: 'person' } : {}),
    ...(d.file ? { file: d.file } : {}),
  }
}

export default function LibraryView({ items, ready, initialId, canEdit }: { items: LibraryItem[]; ready: boolean; initialId: string | null; canEdit: boolean }) {
  const router = useRouter()
  const steps = useMemo(() => items.filter(l => l.kind === 'step'), [items])
  const [type, setType] = useState<'all' | StepKind>('all')
  const [sort, setSort] = useState<{ k: Sort; dir: 'asc' | 'desc' }>({ k: 'edited', dir: 'desc' })
  const [d, setD] = useState<Draft | null>(() => { const l = steps.find(x => x.id === initialId); return l ? draftOf(l) : null })
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const [ctx, setCtx] = useState<{ l: LibraryItem; x: number; y: number } | null>(null)
  const [asking, setAsking] = useState<LibraryItem | null>(null)
  const [uploading, setUploading] = useState(false)
  const [links, setLinks] = useState<Record<string, string>>({})

  const filePath = d?.file?.path
  useEffect(() => {
    if (!filePath || links[filePath]) return
    let live = true
    leadMediaLinks([filePath]).then(r => { if (live && r.ok) setLinks(l => ({ ...l, ...r.data })) })
    return () => { live = false }
  }, [filePath, links])

  const keyOf: Record<Sort, (l: LibraryItem) => string | number> = {
    name: l => l.name.toLowerCase(), text: l => (l.steps[0]?.text ?? '').toLowerCase(), used: l => l.usedIn.length, edited: l => l.updatedAt ?? '',
  }
  const shown = steps.filter(l => type === 'all' || l.steps[0]?.kind === type).sort((a, b) => {
    const p = keyOf[sort.k](a), q = keyOf[sort.k](b)
    const c = typeof p === 'number' && typeof q === 'number' ? p - q : String(p).localeCompare(String(q))
    return sort.dir === 'asc' ? c : -c
  })
  const live = d?.id ? steps.find(l => l.id === d.id) ?? null : null
  const openItem = (next: Draft | null) => {
    if (dirty && !window.confirm('Leave this step without saving its changes?')) return
    setD(next); setDirty(false); setError('')
  }
  const edit = (o: Partial<Draft>) => { setD(x => (x ? { ...x, ...o } : x)); setDirty(true); setError('') }
  const save = () => {
    if (!d || busy) return
    if (!d.name.trim()) { setError('Give the step a name.'); return }
    const step = stepOf(d, live?.steps[0])
    const problem = templateProblem([step])
    if (problem) { setError(problem); return }
    start(async () => {
      const r = await saveLibraryItem(d.id, { kind: 'step', name: d.name.trim(), description: live?.description ?? '', steps: [step] })
      if (!r.ok) { setError(r.reason); return }
      const n = live?.usedIn.length ?? 0
      flash(d.id ? `Saved · updated ${n} ${n === 1 ? 'template' : 'templates'}` : `Added “${d.name.trim()}”`)
      setD(null); setDirty(false)
      router.refresh()
    })
  }
  const duplicate = (l: LibraryItem) => start(async () => {
    const r = await saveLibraryItem(null, { kind: 'step', name: `${l.name} copy`.slice(0, 60), description: l.description, steps: l.steps })
    if (!r.ok) { setError(r.reason); return }
    flash(`Duplicated “${l.name}”`)
    router.refresh()
  })
  const remove = (l: LibraryItem) => start(async () => {
    const r = await removeLibraryItem(l.id)
    setAsking(null)
    if (!r.ok) { setError(r.reason); return }
    if (d?.id === l.id) { setD(null); setDirty(false) }
    flash(`Deleted “${l.name}”`)
    router.refresh()
  })
  const pick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { setError('A photo or file is 25 MB at most.'); return }
    setUploading(true)
    const name = file.name.replace(/[\\/]/g, '_').slice(-120) || 'file'
    const path = `chat/tpl/${crypto.randomUUID()}/${name}`
    const up = await createClient().storage.from('lead-media').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    setUploading(false)
    if (up.error) { setError('The file could not be uploaded. Please try again.'); return }
    setLinks(l => ({ ...l, [path]: URL.createObjectURL(file) }))
    edit({ file: { path, name, mime: file.type || 'application/octet-stream', size: file.size } })
  }

  const head = (k: Sort, l: string) => {
    const on = sort.k === k
    return (
      <button type="button" className={s.sort} data-on={on || undefined}
        onClick={() => setSort(on ? { k, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: k === 'edited' || k === 'used' ? 'desc' : 'asc' })}>
        {l}{on ? <LeadIcon name={sort.dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} /> : <span className={s.idle}><LeadIcon name="arrow-up-down" size={12} /></span>}
      </button>
    )
  }
  const fileUrl = d?.file ? links[d.file.path] ?? '' : ''
  const typeLabel = d ? typeOf(d.type).label : ''

  return (
    <div className={s.wrap}>
      <section className={s.card} aria-label="Step library">
        <div className={s.bar}>
          <div className={s.seg} role="group" aria-label="Type">
            {[{ k: 'all' as const, l: 'All', n: steps.length }, ...STEP_TYPES.map(t => ({ k: t.kind, l: t.label, n: steps.filter(x => x.steps[0]?.kind === t.kind).length }))].map(o => (
              <button key={o.k} type="button" className={s.segBtn} aria-pressed={type === o.k} onClick={() => setType(o.k)}>{o.l}<span className={s.segN}>{o.n}</span></button>
            ))}
          </div>
          <span className={s.fill} />
          {canEdit ? (
            <button type="button" className={s.new} disabled={!ready} title={ready ? undefined : 'Waiting for the database update'}
              onClick={() => openItem({ id: null, type: 'question', name: '', text: '', buttons: ['Option 1'], file: null })}><LeadIcon name="plus" size={15} />New step</button>
          ) : null}
        </div>
        <div className={s.head}>{head('name', 'Step')}{head('text', 'Message')}{head('used', 'Used in')}{head('edited', 'Last edited')}</div>
        <div className={s.body}>
          {shown.map(l => {
            const t = typeOf(l.steps[0]?.kind ?? 'message')
            const n = l.usedIn.length
            return (
              <div key={l.id} className={s.row} role="option" aria-selected={d?.id === l.id} tabIndex={0} title={l.usedIn.map(u => u.flowName).join(' · ')}
                onClick={() => openItem(draftOf(l))} onKeyDown={e => { if (e.key === 'Enter') openItem(draftOf(l)) }}
                onContextMenu={e => { if (!canEdit) return; e.preventDefault(); setCtx({ l, x: Math.min(e.clientX, window.innerWidth - 190), y: Math.min(e.clientY, window.innerHeight - 120) }) }}>
                <div className={s.step}><span className={s.tile}><LeadIcon name={t.icon} size={14} /></span><span className={s.name} title={t.label}>{l.name}</span></div>
                <span className={s.msg}>{l.steps[0]?.text}</span>
                <span className={s.usedN} data-none={!n || undefined}>{n ? `${n} ${n === 1 ? 'template' : 'templates'}` : '—'}</span>
                <span className={s.edited}>{dayOf(l.updatedAt)}</span>
              </div>
            )
          })}
          {!shown.length ? <div className={s.empty}>{type === 'all' ? 'No steps yet' : `No ${typeOf(type).label} steps yet`}</div> : null}
        </div>

        {d ? (
          <>
            <div className={s.scrim} onClick={() => openItem(null)} aria-hidden="true" />
            <div className={s.panel} role="dialog" aria-label={d.name || 'New step'}>
              <div className={s.pHead}>
                <span className={s.pTile}><LeadIcon name="blocks" size={15} /></span>
                <div className={s.pTitles}>
                  <input className={s.pName} value={d.name} maxLength={60} placeholder="Step name" disabled={!canEdit} aria-label="Step name" onChange={e => edit({ name: e.target.value })} />
                  <span className={s.pSub}>{d.id ? `${typeLabel} · Edited ${dayOf(live?.updatedAt)}` : 'New step'}</span>
                </div>
                <button type="button" className={s.close} title="Close" aria-label="Close" onClick={() => openItem(null)}><LeadIcon name="x" size={16} /></button>
              </div>
              <div className={s.pBody}>
                {!d.id ? (
                  <div className={s.sect}>
                    <span className={s.kicker}>TYPE</span>
                    <div className={s.seg} role="group" aria-label="Type">
                      {STEP_TYPES.map(t => <button key={t.kind} type="button" className={s.segBtn} aria-pressed={d.type === t.kind} onClick={() => edit({ type: t.kind, buttons: t.kind === 'question' && !d.buttons.length ? ['Option 1'] : d.buttons })}>{t.label}</button>)}
                    </div>
                  </div>
                ) : null}
                <label className={s.label}>MESSAGE
                  <textarea className={s.textarea} rows={5} value={d.text} maxLength={1000} disabled={!canEdit} onChange={e => edit({ text: e.target.value })} />
                </label>
                {d.type === 'question' ? (
                  <div className={s.sect}>
                    <span className={s.kicker}>BUTTONS</span>
                    {d.buttons.map((b, i) => (
                      <div key={i} className={s.optRow}>
                        <input className={s.opt} value={b} maxLength={200} disabled={!canEdit} aria-label={`Button ${i + 1}`} onChange={e => edit({ buttons: d.buttons.map((x, j) => (j === i ? e.target.value : x)) })} />
                        {canEdit ? <button type="button" className={s.x} title="Remove" aria-label="Remove button" disabled={d.buttons.length <= 1} onClick={() => edit({ buttons: d.buttons.filter((_, j) => j !== i) })}><LeadIcon name="x" size={14} /></button> : null}
                      </div>
                    ))}
                    {canEdit && d.buttons.length < 13 ? <button type="button" className={s.addOpt} onClick={() => edit({ buttons: [...d.buttons, `Option ${d.buttons.length + 1}`] })}><LeadIcon name="plus" size={13} />Add button</button> : null}
                  </div>
                ) : null}
                {d.type === 'message' ? (
                  <div className={s.sect}>
                    <span className={s.kicker}>ATTACHMENT</span>
                    {d.file ? (
                      <div className={s.fileBox}>
                        {isImage(d.file.mime) ? <span className={s.thumb} style={{ backgroundImage: fileUrl ? `url("${fileUrl}")` : undefined }} /> : <span className={s.ext}>{extOf(d.file.name)}</span>}
                        <span className={s.fileName}>{d.file.name}</span>
                        {canEdit ? (
                          <>
                            <label className={s.replace}>Replace<input type="file" accept={ATTACH_ACCEPT} className={s.hidden} onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} /></label>
                            <button type="button" className={s.x} title="Remove" aria-label="Remove the file" onClick={() => edit({ file: null })}><LeadIcon name="x" size={14} /></button>
                          </>
                        ) : null}
                      </div>
                    ) : canEdit ? (
                      <label className={s.upload}><LeadIcon name="upload" size={18} />{uploading ? 'Uploading…' : 'Upload photo or file'}
                        <input type="file" accept={ATTACH_ACCEPT} className={s.hidden} disabled={uploading} onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
                      </label>
                    ) : <span className={s.none}>No attachment</span>}
                  </div>
                ) : null}
                <div className={s.sect}>
                  <span className={s.kicker}>USED IN</span>
                  <div className={s.chips}>
                    {(live?.usedIn ?? []).map(u => (
                      <Link key={u.flowId} className={s.usedChip} href={`/leads/flows?t=${u.flowId}`} title="Open template">
                        <LeadIcon name="workflow" size={12} />{u.flowName}<LeadIcon name="arrow-up-right" size={12} />
                      </Link>
                    ))}
                    {!(live?.usedIn.length) ? <span className={s.none}>Not used in any template yet</span> : null}
                  </div>
                </div>
                <div className={s.sect}>
                  <span className={s.kicker}>PREVIEW</span>
                  <div className={s.phone}>
                    <div className={s.notchRow}><span className={s.notch} /></div>
                    <div className={s.screen}>
                      <div className={s.spacer} />
                      {d.file ? (isImage(d.file.mime)
                        ? <span className={s.img} style={{ backgroundImage: fileUrl ? `url("${fileUrl}")` : undefined }} role="img" aria-label={d.file.name} />
                        : <div className={s.doc}><span className={s.docExt}>{extOf(d.file.name)}</span>{d.file.name}</div>) : null}
                      <div className={s.bot}><RichText text={(d.text || 'Write the message…').replace(/\{name\}/g, 'Jason')} /></div>
                      {d.type === 'question' ? <div className={s.btns}>{d.buttons.map((b, i) => <div key={i} className={s.pBtn}>{b}</div>)}</div> : null}
                      {d.type === 'phone' ? <div className={s.cust}>012-338 4721</div> : null}
                    </div>
                  </div>
                </div>
              </div>
              <div className={s.foot}>
                <span className={s.error} role={error ? 'alert' : undefined}>{error}</span>
                <button type="button" className={s.cancel} onClick={() => openItem(null)}>Cancel</button>
                {canEdit ? <button type="button" className={s.save} data-on={(dirty && ready) || undefined} disabled={!dirty || busy || !ready} onClick={save}>{busy ? 'Saving…' : 'Save'}</button> : null}
              </div>
            </div>
          </>
        ) : null}
      </section>

      {ctx ? (
        <>
          <div className={s.ctxCatch} onClick={() => setCtx(null)} onContextMenu={e => { e.preventDefault(); setCtx(null) }} aria-hidden="true" />
          <div className={s.ctx} role="menu" style={{ left: ctx.x, top: ctx.y }}>
            <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { const l = ctx.l; setCtx(null); openItem(draftOf(l)) }}>Edit</button>
            <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { const l = ctx.l; setCtx(null); duplicate(l) }}>Duplicate</button>
            <button type="button" role="menuitem" className={s.ctxItem} data-rust="" onClick={() => { const l = ctx.l; setCtx(null); setAsking(l) }}>Delete</button>
          </div>
        </>
      ) : null}
      {asking ? (
        <>
          <div className={s.backdrop} onClick={() => setAsking(null)} aria-hidden="true" />
          <div className={s.confirm} role="dialog" aria-modal="true" aria-label={`Delete ${asking.name}`}>
            <span className={s.cTitle}>Delete “{asking.name}”?</span>
            <span className={s.cText}>{asking.usedIn.length
              ? `Used in ${asking.usedIn.map(u => u.flowName).join(', ')}. The steps in these templates stay as they are. To remove them, delete them in each template.`
              : 'Not used in any template.'}</span>
            <div className={s.cRow}>
              <button type="button" className={s.cancel} onClick={() => setAsking(null)}>Cancel</button>
              <button type="button" className={s.del} disabled={busy} onClick={() => remove(asking)}>Delete</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
