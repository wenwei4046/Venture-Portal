'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/ds/Button'
import { dayMon, policyOn } from '@/lib/attendance/engine'
import type { AttRequest } from '@/lib/attendance/types'
import { openMyDoc } from '@/lib/documentation/my-docs-actions'
import { meAckNotice, meAttach, meCancel, meDecide, mePhoto, mePunch, meSendRequest } from '@/lib/me/actions'
import type { DocRow, DocTab } from '@/lib/me/docs'
import { fairOptions, fairRange, otDetail, scheduleTime } from '@/lib/me/forms'
import { checkLeave, tabTypes, tabWord, type Filter } from '@/lib/me/leave'
import { teamRows, waitItems, type WaitItem } from '@/lib/me/org'
import { changedFields, formOf, pendingProfile, type ProfileForm } from '@/lib/me/profile'
import { uploadOwn } from '@/lib/me/read'
import { punchToast, todayCard } from '@/lib/me/today'
import type { MePayslip, OrgPerson } from '@/lib/me/types'
import { AttendanceScreen } from './AttendanceScreen'
import { Camera, type Shot } from './Camera'
import { CrSheet, type CrDraft } from './CrSheet'
import { DocSheet } from './DocSheet'
import { DocumentsScreen } from './DocumentsScreen'
import { HierarchyScreen } from './HierarchyScreen'
import { HubScreen, type Screen } from './HubScreen'
import { Dialog, Icon, Title, Toast, useToast } from './kit'
import { LeaveHistoryScreen } from './LeaveHistoryScreen'
import { LeaveSheet, type LeaveDraft } from './LeaveSheet'
import { LeaveScreen } from './LeaveScreen'
import { MpSheet, type MpDraft } from './MpSheet'
import { OtSheet, type OtDraft } from './OtSheet'
import { PaySheet } from './PaySheet'
import { PayslipScreen } from './PayslipScreen'
import { PersonSheet } from './PersonSheet'
import { ProfileEdit, ProfileView } from './ProfileScreen'
import { RequestScreen } from './RequestScreen'
import { RequestSheet } from './RequestSheet'
import { TeamScreen } from './TeamScreen'
import { useClock, type MeHandle } from './useMe'
import { Viewer } from './Viewer'
import { WaitSheet } from './WaitSheet'

/**
 * Me (2026-10-17, the Claude Design handoff `design_handoff_staff_app`, Staff App v2): one's own attendance and punch,
 * leave, payslips, record, line, documents and requests — and, for an upline, their team and what waits on them. One
 * frame for every place it opens: full screen on a phone (the HR app's avatar, the Finance app's Profile) and a 430px
 * panel on the desktop (the top bar's button). The prototype's screens, sheets, words and motion, on the reader's own
 * data (lib/me); writes through lib/me/actions.
 */

type Sheet =
  | { k: 'leave' } | { k: 'ot' } | { k: 'cr' } | { k: 'mp' }
  | { k: 'pay'; slip: MePayslip } | { k: 'req'; id: string } | { k: 'wait'; item: WaitItem } | { k: 'doc'; doc: DocRow } | { k: 'person'; id: string }

export interface MeAppProps {
  me: MeHandle
  mode: 'phone' | 'panel'
  /** "HOUZS · {host}" on the panel's hub. */
  hostLabel: string
  /** The phone's hub: where its back arrow returns ("Home", "Profile"). */
  backLabel?: string
  onClose: () => void
  /** A phone (the app) or a computer: a computer's punch is flagged for HR. */
  source: 'app' | 'web'
  /** Open straight on the camera (the card's Clock in). */
  startPunch?: 'in' | 'out' | null
  /** The HR app's account rows, under the record in Profile. */
  accountRows?: ReactNode
}

export function MeApp({ me, mode, hostLabel, backLabel = 'Back', onClose, source, startPunch = null, accountRows }: MeAppProps) {
  const { s } = me
  const phone = mode === 'phone'
  const data = s.data
  const [screen, setScreen] = useState<Screen>('hub')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, flash] = useToast()
  const scroll = useRef<HTMLDivElement | null>(null)
  const photoInput = useRef<HTMLInputElement | null>(null)
  const nowSec = useClock(s.today?.now ?? data?.now, s.todayAt || Date.now())

  // ── Loads ── (each opening reads again; what was read last stays on screen meanwhile)
  useEffect(() => {
    void me.loadMe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (screen === 'hier' && !s.org) void me.loadOrg()
    if (screen === 'pay' && !s.payslips) void me.loadPayslips()
    if (screen === 'docs' && !s.docs) void me.loadDocs()
    if (screen === 'team') void me.loadTeam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  // ── Where you are ──
  const [lvTab, setLvTab] = useState(0)
  const [lvHist, setLvHist] = useState<Filter>('All')
  const [reqFilter, setReqFilter] = useState<Filter>('All')
  const [hierTab, setHierTab] = useState<'My line' | 'Department'>('My line')
  const [deptPick, setDeptPick] = useState<string | null>(null)
  const [docTab, setDocTab] = useState<DocTab>('Personal')
  const [pfEditing, setPfEditing] = useState(false)
  const go = (next: Screen) => {
    if (next === 'leave' && screen !== 'lvhist') setLvTab(0)
    setPfEditing(false)
    setScreen(next)
    requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = 0 })
  }

  // ── The forms (kept between openings, as the prototype keeps them) ──
  const today = data?.workDay ?? s.today?.workDay ?? ''
  const [lv, setLv] = useState<LeaveDraft>({ code: '', month: today.slice(0, 7), from: '', to: '', half: 'Full day', reason: '', file: null })
  const [ot, setOt] = useState<OtDraft>({ date: today, hours: 2, reason: '', after: false, claim: null })
  const [cr, setCr] = useState<CrDraft>({ date: today, dir: 'OUT', time: '18:00', reason: '' })
  const [mp, setMp] = useState<MpDraft>({ event: '', month: today.slice(0, 7), from: '', to: '', role: 'Promoter', count: 2, reason: '' })
  const saved = useMemo(() => formOf(s.record ?? null), [s.record])
  const [pf, setPf] = useState<ProfileForm>(saved)
  const [note, setNote] = useState('')

  // ── The punch ──
  const [cam, setCam] = useState<'in' | 'out' | null>(null)
  /** The punch notice: before the first punch (then the camera), or read again from Edit profile. */
  const [notice, setNotice] = useState<'in' | 'out' | 'read' | null>(null)
  const [noticeRead, setNoticeRead] = useState(false)
  const read = noticeRead || !!s.today?.noticeRead || !!data?.noticeRead
  const punch = (dir: 'in' | 'out') => (read ? setCam(dir) : setNotice(dir))
  const started = useRef(false)
  useEffect(() => {
    if (startPunch && !started.current && data) { started.current = true; punch(startPunch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPunch, data])

  const card = todayCard(s.today, nowSec)
  const person = data?.me ?? null
  const name = person?.name ?? s.record?.name ?? ''
  const reports = data?.reports ?? 0
  const upline = reports > 0 || (s.team?.waiting.length ?? 0) > 0
  const title = person?.title ?? s.record?.title ?? ''
  const hubLine = [upline && reports ? `${title} · ${reports} report${reports === 1 ? '' : 's'}` : title, person?.code].filter(Boolean).join(' · ')
  const profileLine = [title, person?.department].filter(Boolean).join(' · ')
  const waiting = data && s.team ? waitItems(data, s.team) : []

  // ── Writes ──
  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }
  const refresh = () => { void me.loadMe(); void me.loadToday() }

  const onShoot = async (shot: Shot): Promise<boolean> => {
    const dir = cam ?? 'in'
    let photoPath: string | null = null
    if (shot.photo) {
      const up = await uploadOwn('punch', shot.photo, 'selfie.jpg')
      if (!up.ok) { flash(up.reason); return false }
      photoPath = up.path
    }
    const r = await mePunch({
      dir, photoPath, reason: shot.reason, source,
      lat: shot.pos.state === 'here' ? shot.pos.lat : null, lng: shot.pos.state === 'here' ? shot.pos.lng : null,
      accuracy: shot.pos.state === 'here' ? shot.pos.accuracy : null, device: navigator.userAgent.slice(0, 120),
    })
    if (!r.ok) { flash(r.reason); return false }
    setCam(null)
    flash(punchToast(dir, nowSec, shot.place.short, s.today))
    refresh()
    return true
  }

  const send = async (input: Parameters<typeof meSendRequest>[0], after?: (id: string) => Promise<string | null>) => {
    const r = await meSendRequest(input)
    if (!r.ok) { flash(r.reason); return null }
    const extra = after ? await after(r.data.id) : null
    setSheet(null)
    flash(extra ? `Sent · ${r.data.ref} · ${extra}` : `Sent · ${r.data.ref}`)
    refresh()
    return r.data
  }

  const sendLeave = () => run(async () => {
    if (!data?.me) return
    const c = checkLeave(data, { ...lv, file: lv.file ? { name: lv.file.name } : null })
    if (c.error) return
    let path: string | null = null
    if (c.certificate && lv.file) {
      const up = await uploadOwn('request', lv.file, lv.file.name)
      if (!up.ok) { flash(up.reason); return }
      path = up.path
    }
    const half = c.days === 0.5 ? lv.half : null
    const ok = await send({ staffId: data.me.id, kind: 'leave', leaveCode: lv.code, from: lv.from, to: lv.to || lv.from, days: c.days, detail: half ? { half } : {}, reason: lv.reason },
      path && lv.file ? async id => { const a = await meAttach(id, path!, lv.file!.name); return a.ok ? null : 'the certificate did not go up — send it to HR' } : undefined)
    if (ok) setLv(x => ({ ...x, from: '', to: '', reason: '', file: null, half: 'Full day' }))
  })
  const sendOt = () => run(async () => {
    if (!data?.me) return
    const ok = await send({ staffId: data.me.id, kind: 'ot', from: ot.date, to: ot.date, hours: ot.hours, detail: otDetail(data, ot), reason: ot.reason })
    if (ok) setOt(x => ({ ...x, reason: '' }))
  })
  const sendCr = () => run(async () => {
    if (!data?.me) return
    const ok = await send({ staffId: data.me.id, kind: 'correction', from: cr.date, to: cr.date, detail: { punch: cr.dir.toLowerCase(), at: cr.time }, reason: cr.reason })
    if (ok) setCr(x => ({ ...x, reason: '' }))
  })
  const sendMp = () => run(async () => {
    if (!data?.me) return
    const option = fairOptions(data.fairs).find(o => o.value === mp.event)
    const ok = await send({ staffId: data.me.id, kind: 'manpower', from: mp.from, to: mp.to || mp.from, detail: { for: option?.label ?? mp.event, event: mp.event, role: mp.role, count: mp.count }, reason: mp.reason })
    if (ok) setMp(x => ({ ...x, reason: '' }))
  })
  const sendProfile = () => run(async () => {
    if (!data?.me) return
    const changes = changedFields(pf, saved)
    if (!changes.length) return
    const r = await meSendRequest({ staffId: data.me.id, kind: 'profile', detail: { changes }, reason: 'Sent from Profile' })
    if (!r.ok) { flash(r.reason); return }
    setPfEditing(false)
    setPf(saved)
    flash(`Sent to HR · ${r.data.ref} · your record changes once approved`)
    refresh()
  })
  const cancelRequest = (r: AttRequest) => run(async () => {
    const x = await meCancel(r.id)
    if (!x.ok) { flash(x.reason); return }
    setSheet(null)
    flash(`${r.ref} cancelled`)
    refresh()
  })
  const decide = (w: WaitItem, approve: boolean) => run(async () => {
    if (!approve && !note.trim()) return
    const x = await meDecide(w.id, approve, note)
    if (!x.ok) { flash(x.reason); return }
    setSheet(null)
    setNote('')
    flash(approve ? (w.toHR ? `Approved · sent to HR · ${w.who} told` : `Approved · ${w.who} told`) : `Rejected · ${w.who} told`)
    void me.loadTeam()
  })
  const onPhotoFile = (file: File) => run(async () => {
    const up = await uploadOwn('profile', file, file.name)
    if (!up.ok) { flash(up.reason); return }
    const r = await mePhoto(up.path)
    if (!r.ok) { flash(r.reason); return }
    await me.loadRecord()
    flash('Profile photo updated')
  })

  // ── Documents ──
  const [viewing, setViewing] = useState<{ doc: DocRow; url: string | null } | null>(null)
  const viewDoc = (d: DocRow) => run(async () => {
    setSheet(null)
    setViewing({ doc: d, url: null })
    const r = await openMyDoc(d.kind, d.id, 'view')
    if (!r.ok) { setViewing(null); flash(r.reason); return }
    setViewing({ doc: d, url: r.url })
  })
  const downloadDoc = (d: DocRow) => run(async () => {
    const r = await openMyDoc(d.kind, d.id, 'download')
    if (!r.ok) { flash(r.reason); return }
    const a = document.createElement('a')
    a.href = r.url
    a.download = r.fileName || d.title
    document.body.appendChild(a)
    a.click()
    a.remove()
    flash(`Saved · ${r.fileName || d.title}`)
  })

  // ── Openers ──
  const openLeave = () => {
    const types = data ? tabTypes(data) : []
    setLv(x => ({ ...x, code: types[lvTab]?.code ?? data?.leaveTypes[0]?.code ?? '', file: null, month: x.from ? x.month : today.slice(0, 7) }))
    setSheet({ k: 'leave' })
  }
  const openOt = () => { setOt(x => ({ ...x, date: today, hours: 2, after: false, claim: null })); setSheet({ k: 'ot' }) }
  const openCr = (pre?: { day: string; dir: 'in' | 'out'; time: string }) => {
    if (pre) setCr(x => ({ ...x, date: pre.day, dir: pre.dir === 'in' ? 'IN' : 'OUT', time: pre.time }))
    else if (data) setCr(x => ({ ...x, date: x.date || today, time: x.time || scheduleTime(data, today, 'out') }))
    setSheet({ k: 'cr' })
  }
  const openMp = () => {
    if (data && !mp.event) {
      const first = fairOptions(data.fairs)[0]
      const r = first ? fairRange(first, today) : { from: '', to: '' }
      setMp(x => ({ ...x, event: first?.value ?? '', month: r.from ? r.from.slice(0, 7) : x.month || today.slice(0, 7), ...(r.from ? r : {}) }))
    } else setMp(x => ({ ...x, month: x.month || today.slice(0, 7) }))
    setSheet({ k: 'mp' })
  }
  const claim = (n: { day: string; hours: number; out: string; past: string; end: string }) => {
    setOt(x => ({ ...x, date: n.day, hours: Math.max(0.5, n.hours), after: true, reason: '', claim: `${dayMon(n.day)} · punched out ${n.out} · ${n.past} past ${n.end}.` }))
    setSheet({ k: 'ot' })
  }
  const pending = data ? pendingProfile(data) : null

  // ── The frame ──
  const back = () => (screen === 'profile' && pfEditing ? (setPfEditing(false), setPf(saved)) : screen === 'hub' ? onClose() : go(screen === 'lvhist' ? 'leave' : 'hub'))
  const backWord = screen === 'hub' ? backLabel : screen === 'lvhist' ? 'Leave' : 'Me'
  const frame: CSSProperties = {
    position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'rgb(255 255 255)', display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--ds-font-body)', color: 'var(--ds-ink)', fontSize: 14, lineHeight: 'normal', textAlign: 'left',
  }
  const leaveFooter = screen === 'leave' && data && tabTypes(data).length > 0
  const curType = data ? tabTypes(data)[lvTab] : undefined
  const reqOpen = sheet?.k === 'req' ? data?.requests.find(r => r.id === sheet.id) ?? null : null
  const personOpen: OrgPerson | null = sheet?.k === 'person' ? s.org?.people.find(p => p.id === sheet.id) ?? null : null

  const body = () => {
    if (!data) return <Title title="Me" sub={s.dataError ?? 'Reading your record…'} />
    if (!data.me) return <Title title="Me" sub="This login has no staff record. Ask HR to link it." />
    switch (screen) {
      case 'att': return <AttendanceScreen data={data} prev={s.prev} onFix={n => openCr(n)} onClaim={claim} />
      case 'leave': return <LeaveScreen data={data} tab={lvTab} setTab={setLvTab} openRequest={r => setSheet({ k: 'req', id: r.id })} />
      case 'lvhist': return <LeaveHistoryScreen data={data} filter={lvHist} setFilter={setLvHist} openRequest={r => setSheet({ k: 'req', id: r.id })} />
      case 'pay': return <PayslipScreen payslips={s.payslips} error={s.payError} workDay={data.workDay} openSlip={p => setSheet({ k: 'pay', slip: p })} />
      case 'profile': return pfEditing
        ? <ProfileEdit form={pf} set={p => setPf(x => ({ ...x, ...p }))} record={s.record ?? null} clean={changedFields(pf, saved).length === 0} busy={busy}
            onCancel={() => { setPfEditing(false); setPf(saved) }} onSend={sendProfile} onNotice={() => setNotice('read')} />
        : <ProfileView record={s.record ?? null} name={name} roleLine={profileLine} photo={s.photo} pending={pending} extra={accountRows}
            onPhoto={() => photoInput.current?.click()} onEdit={() => (pending ? setSheet({ k: 'req', id: pending.id }) : (setPf(saved), setPfEditing(true)))}
            onOpenPending={() => pending && setSheet({ k: 'req', id: pending.id })} />
      case 'hier': return <HierarchyScreen org={s.org} error={s.orgError} tab={hierTab} setTab={setHierTab} pick={deptPick} setPick={setDeptPick} openPerson={id => setSheet({ k: 'person', id })} />
      case 'docs': return <DocumentsScreen docs={s.docs} error={s.docsError} tab={docTab} setTab={setDocTab} open={d => setSheet({ k: 'doc', doc: d })} />
      case 'req': return <RequestScreen data={data} filter={reqFilter} setFilter={setReqFilter} openOT={openOt} openCR={() => openCr()} openMP={openMp} openRequest={r => setSheet({ k: 'req', id: r.id })} />
      case 'team': return <TeamScreen rows={s.team ? teamRows(data, s.team) : []} waiting={waiting} openWait={w => { setNote(''); setSheet({ k: 'wait', item: w }) }} />
      default: return (
        <HubScreen data={data} name={name} roleLine={hubLine} photo={s.photo} card={card} nowSec={nowSec} upline={upline} waiting={waiting}
          onPhoto={() => photoInput.current?.click()} onPunch={punch} go={go} openRequest={r => setSheet({ k: 'req', id: r.id })}
          openWait={w => { setNote(''); setSheet({ k: 'wait', item: w }) }} />
      )
    }
  }

  return (
    <div data-me="" style={frame}>
      {phone ? <div style={{ height: 'env(safe-area-inset-top, 0px)', flex: 'none' }} /> : null}
      <div style={{ flex: 'none', height: 44, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }}>
        {screen === 'hub' && !phone ? (
          <span style={{ padding: '0 8px', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600 }}>HOUZS · {hostLabel}</span>
        ) : (
          <button type="button" onClick={back} aria-label={`Back to ${backWord}`} style={{ height: 44, border: 0, background: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', fontFamily: 'inherit', fontSize: 14, color: 'var(--ds-ink)', cursor: 'pointer' }}>
            <Icon name="arrowLeft" size={20} stroke={1.9} /><span>{backWord}</span>
          </button>
        )}
        {!phone ? (
          <button type="button" onClick={onClose} aria-label="Close Me" style={{ marginLeft: 'auto', width: 44, height: 44, border: 0, background: 'none', fontSize: 24, color: 'var(--ds-ink)', cursor: 'pointer' }}>×</button>
        ) : null}
      </div>
      <div ref={scroll} className="me-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 20px 40px', display: 'grid', alignContent: 'start', gridAutoRows: 'max-content', gridTemplateColumns: 'minmax(0,1fr)', gap: 22 }}>
        {body()}
      </div>
      {leaveFooter || phone ? (
        <div style={{ flex: 'none', background: 'var(--ds-surface)', borderTop: '1px solid var(--ds-border)' }}>
          {leaveFooter ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 10, padding: '12px 20px 4px' }}>
              <Button size="lg" block onClick={openLeave}>Apply · {(curType ? tabWord(curType) : 'leave').toLowerCase()}</Button>
              <Button size="lg" variant="secondary" block onClick={() => go('lvhist')}>History · {data.requests.filter(r => r.kind === 'leave').length}</Button>
            </div>
          ) : null}
          {phone ? <div style={{ height: 'var(--safe-bottom)' }} /> : leaveFooter ? <div style={{ height: 12 }} /> : null}
        </div>
      ) : null}

      <input ref={photoInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhotoFile(f) }} />

      {data ? (
        <>
          <LeaveSheet open={sheet?.k === 'leave'} data={data} form={lv} set={p => setLv(x => ({ ...x, ...p }))} busy={busy} onClose={() => setSheet(null)} onSend={sendLeave} />
          <OtSheet open={sheet?.k === 'ot'} data={data} form={ot} set={p => setOt(x => ({ ...x, ...p }))} busy={busy} onClose={() => setSheet(null)} onSend={sendOt} />
          <CrSheet open={sheet?.k === 'cr'} data={data} form={cr} set={p => setCr(x => ({ ...x, ...p }))} busy={busy} onClose={() => setSheet(null)} onSend={sendCr} />
          <MpSheet open={sheet?.k === 'mp'} data={data} form={mp} set={p => setMp(x => ({ ...x, ...p }))} busy={busy} onClose={() => setSheet(null)} onSend={sendMp} />
          <RequestSheet request={reqOpen} data={data} myName={name} busy={busy} onClose={() => setSheet(null)} onCancel={cancelRequest} />
          <WaitSheet item={sheet?.k === 'wait' ? sheet.item : null} note={note} setNote={setNote} busy={busy} onClose={() => setSheet(null)} onDecide={decide} />
        </>
      ) : null}
      <PaySheet slip={sheet?.k === 'pay' ? sheet.slip : null} onClose={() => setSheet(null)} onSaved={flash} />
      <DocSheet doc={sheet?.k === 'doc' ? sheet.doc : null} tab={docTab} onClose={() => setSheet(null)} onView={viewDoc} onDownload={downloadDoc} />
      <PersonSheet person={personOpen} onClose={() => setSheet(null)} onCall={p => { if (p.phone) window.location.href = `tel:${p.phone.replace(/[^\d+]/g, '')}`; flash(`Calling ${p.name}`) }} />

      {cam && data ? <Camera dir={cam} data={data} today={s.today} nowSec={nowSec} phone={phone} computer={source === 'web'} onClose={() => setCam(null)} onShoot={onShoot} /> : null}
      {viewing ? <Viewer doc={viewing.doc} url={viewing.url} phone={phone} onClose={() => setViewing(null)} onDownload={downloadDoc} /> : null}

      <Dialog open={!!notice} onClose={() => setNotice(null)} width={340} title="Before your first punch" description="Read once. You can find this again under Edit profile."
        footer={notice === 'read'
          ? <Button block onClick={() => setNotice(null)}>Close</Button>
          : <Button block onClick={() => { const dir = notice === 'out' ? 'out' : 'in'; setNotice(null); setNoticeRead(true); void meAckNotice(); setCam(dir) }}>I understand · open camera</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
          <div><strong style={{ fontWeight: 500 }}>What is collected:</strong> a live photo, the server time and your position at the moment you punch. Nothing between punches.</div>
          <div><strong style={{ fontWeight: 500 }}>Why:</strong> attendance and pay.</div>
          <div><strong style={{ fontWeight: 500 }}>Who sees it:</strong> you and HR. Your upline sees times, place and flags, not the photo.</div>
          <div><strong style={{ fontWeight: 500 }}>How long:</strong> photos {(data ? policyOn(data.workDay, data.policies)?.photoKeepDays : null) || 90} days; punch records seven years.</div>
        </div>
      </Dialog>

      <Toast message={toast} bottom={100} />
    </div>
  )
}
