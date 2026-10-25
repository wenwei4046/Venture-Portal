'use client'

import { useState } from 'react'
import type { NewPic } from '@/lib/marketing/task-minutes'
import s from './newproject.module.css'

// The task's PICs as New Project names them (②a-4, ②a-5): the PIC's name — they read it on the link — and their WhatsApp,
// where the link goes; *+ Second PIC*, on their own link. Under the minutes they approve, or under the stages whose 🔗 level
// asks them.

export default function PicFields({ pic, onChange }: { pic: NewPic; onChange: (patch: Partial<NewPic>) => void }) {
  const [second, setSecond] = useState(false)
  return (
    <div className={s.picFields}>
      <label className={s.field}>
        <span className={s.fieldLabel}>PIC name<span className={s.marks}><span title="Required">⭐</span><span title="The PIC sees it on the link">👁</span></span></span>
        <input className={s.input} value={pic.name} maxLength={80} onChange={e => onChange({ name: e.target.value })} />
      </label>
      <label className={s.field}>
        <span className={s.fieldLabel}>PIC WhatsApp<span className={s.marks}><span title="Required">⭐</span><span title="Internal only — the PIC never sees it">🔒</span></span></span>
        <input className={`${s.input} ${s.mono}`} value={pic.whatsapp} maxLength={40} inputMode="tel" placeholder="+60 1X-XXX XXXX"
          onChange={e => onChange({ whatsapp: e.target.value })} />
      </label>
      {second || pic.name2 ? (
        <>
          <label className={s.field}>
            <span className={s.fieldLabel}>Second PIC<span className={s.marks}><span title="The PICs see it on the link">👁</span></span></span>
            <input className={s.input} value={pic.name2} maxLength={80} onChange={e => onChange({ name2: e.target.value })} />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Second PIC WhatsApp<span className={s.marks}>{pic.name2.trim() ? <span title="Required">⭐</span> : null}<span title="Internal only — the PIC never sees it">🔒</span></span></span>
            <input className={`${s.input} ${s.mono}`} value={pic.whatsapp2} maxLength={40} inputMode="tel" placeholder="+60 1X-XXX XXXX"
              onChange={e => onChange({ whatsapp2: e.target.value })} />
          </label>
        </>
      ) : (
        <button type="button" className={`${s.textBtn} ${s.addPic}`} onClick={() => setSecond(true)}>+ Second PIC</button>
      )}
    </div>
  )
}
