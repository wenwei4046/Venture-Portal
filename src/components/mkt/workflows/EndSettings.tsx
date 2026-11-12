'use client'

import { useState } from 'react'
import { CELEBRATIONS, GIF_TYPES, type FinishCfg, type FinishNotify } from '@/lib/marketing/flow'
import { fileRoute } from '@/lib/storage/browser'
import RadioCard from './RadioCard'
import w from './workflows.module.css'

// 🏁 Task done (2a's right panel): when it is done (read off the last stage), who is told, the celebration (four
// presets, or a GIF / WebP / APNG of one's own under 4 MB — uploaded to the bucket `marketing`, its thumbnail shown),
// ▶ Preview run, what the PIC reads on the link, and close or keep open three days for the PIC's feedback.

const NOTIFY: readonly [FinishNotify, string][] = [['all', 'Everyone on the task'], ['mm', 'MM'], ['pic', 'PIC via link'], ['req', 'Who requested it']]

export default function EndSettings({
  finish,
  category,
  doneWhen,
  onChange,
  onUpload,
  onPreview,
}: {
  finish: FinishCfg
  category: string
  /** "Stage 6 · Final is approved by Rachel → PIC" */
  doneWhen: string
  onChange: (next: FinishCfg) => void
  /** Sends a picked file to the bucket; answers its path, or null (the builder says why). */
  onUpload: (file: File) => Promise<string | null>
  onPreview: () => void
}) {
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<FinishCfg>) => onChange({ ...finish, ...p })
  const custom = finish.celebration === 'custom'
  const gif = finish.gifPath
  return (
    <div className={w.panel}>
      <div className={w.panelHead}>
        <span className={`${w.panelBadge} ${w.badgeGreen}`}>🏁</span>
        <span className={w.panelTitle}>Task done</span>
        <span className={w.grow} />
        <span className={w.panelAside} title={`End of every ${category} task`}>End of every {category} task</span>
      </div>
      <div className={w.part}>
        <span className={w.q}>Done when</span>
        <div className={w.doneWhen}>{doneWhen}</div>
        <span className={w.tiny}>Change it on the last stage’s Approval.</span>
      </div>
      <div className={w.part}>
        <span className={w.q}>Notify</span>
        <div className={w.chips}>
          {NOTIFY.map(([k, label]) => {
            const on = finish.notify.includes(k)
            return (
              <button key={k} type="button" aria-pressed={on} className={`${w.chip}${on ? ` ${w.chipOn}` : ''}`}
                onClick={() => set({ notify: on ? finish.notify.filter(x => x !== k) : NOTIFY.map(n => n[0]).filter(x => x === k || finish.notify.includes(x)) })}>
                {on ? '✓ ' : ''}{label}
              </button>
            )
          })}
        </div>
      </div>
      <div className={w.part}>
        <div className={w.celebHead}>
          <span className={`${w.q} ${w.grow}`}>Celebration</span>
          <button type="button" className={w.previewRun} onClick={onPreview}>▶ Preview run</button>
        </div>
        <div className={w.celebGrid} role="radiogroup" aria-label="Celebration">
          {CELEBRATIONS.map(c => (
            <button key={c.key} type="button" role="radio" aria-checked={finish.celebration === c.key}
              className={`${w.celeb}${finish.celebration === c.key ? ` ${w.celebOn}` : ''}`} onClick={() => set({ celebration: c.key })}>
              <span className={w.celebIcon}>{c.icon}</span>
              <span className={w.stable} data-label={c.label}><span>{c.label}</span></span>
            </button>
          ))}
        </div>
      </div>
      <label className={`${w.upload}${custom ? ` ${w.uploadOn}` : ''}${busy ? ` ${w.uploadBusy}` : ''}`}
        onClick={e => {
          // A GIF already sent: a click uses it; the file box opens only to replace it (its own line says so).
          if (gif && !custom && !(e.target instanceof HTMLInputElement)) {
            e.preventDefault()
            set({ celebration: 'custom' })
          }
        }}>
        <input
          type="file"
          className={w.uploadInput}
          accept={GIF_TYPES.join(',')}
          disabled={busy}
          aria-label="Upload your own GIF"
          onChange={async e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setBusy(true)
            try {
              const path = await onUpload(file)
              if (path) onChange({ ...finish, gifPath: path, celebration: 'custom' })
            } finally {
              setBusy(false)
            }
          }}
        />
        {gif ? <img className={w.thumb} src={fileRoute('marketing', gif)} alt="" /> : <span className={w.uploadIcon}>⬆</span>}
        <span className={w.uploadText}>
          <span className={custom ? w.uploadTitleOn : undefined}>{busy ? 'Uploading…' : gif ? (custom ? '✓ Your GIF · in use' : 'Use your GIF') : 'Upload your own GIF'}</span>
          <span className={w.uploadSub}>{gif ? 'Click to replace · GIF, WebP or APNG, under 4 MB' : 'GIF, WebP or APNG, under 4 MB'}</span>
        </span>
      </label>
      <label className={w.part}>
        <span className={w.q}>PIC sees on the link</span>
        <input className={w.input} value={finish.picText} maxLength={120} placeholder={`Your ${category.toLowerCase()} is ready`}
          onChange={e => set({ picText: e.target.value })} />
      </label>
      <div className={w.part} role="radiogroup" aria-label="After it’s done">
        <span className={w.q}>After it’s done</span>
        <RadioCard on={finish.after === 'close'} title="Close the task" text="Moves to Done right away. XP is given out." onPick={() => set({ after: 'close' })} />
        <RadioCard on={finish.after === 'feedback'} title="Keep open 3 days for PIC feedback" text="PIC can still comment on the link. Closes by itself after 3 working days."
          onPick={() => set({ after: 'feedback' })} />
      </div>
    </div>
  )
}
