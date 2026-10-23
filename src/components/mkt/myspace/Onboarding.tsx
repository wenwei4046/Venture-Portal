'use client'

import { useEffect, useRef, useState } from 'react'
import { fileRoute } from '@/lib/storage/browser'
import {
  COVERS, NAME_IDEAS, PET_COLOR_NAMES, PET_COLORS, PET_NAME_MAX, SPECIES, SPECIES_KEYS, type Pet, type PetColor, type SpeciesKey,
} from '@/lib/marketing/space'
import PetNode from './PetNode'
import s from './myspace.module.css'

// The first visit's setup (`My Space Bento.dc.html` › onboarding): five steps — the pet (one of four kinds, or one's own
// animal), its name, its colour (required), the cover and the profile photo (both may be skipped) — then *Finish →*.
// The handoff's line under each title ("It lives in your room…", "You can change it later." …) is left out: no
// descriptions on a page. It closes only by finishing, as the handoff's does.

const STEPS = [
  { label: 'Pet', title: 'Choose your pet' },
  { label: 'Name', title: 'Name your pet' },
  { label: 'Colour', title: 'Pick its colour' },
  { label: 'Cover', title: 'Set a cover image' },
  { label: 'Photo', title: 'Add a profile photo' },
]

export interface OnboardingProps {
  pet: Pet
  /** One's own animal, when already sent. */
  petPath: string | null
  /** Again from the drawer's *Redo pet setup*: it starts from what was chosen. */
  redo: boolean
  cover: number
  coverPath: string | null
  avatarPath: string | null
  letter: string
  avatarBg: string
  sending: 'cover' | 'avatar' | 'photo' | 'pet' | null
  onPickPet: () => void
  onUseKind: () => void
  onPreset: (cover: number) => void
  onPick: (kind: 'cover' | 'avatar') => void
  onFinish: (pet: Pet) => void
}

export default function Onboarding(p: OnboardingProps) {
  const [step, setStep] = useState(0)
  const [species, setSpecies] = useState<SpeciesKey | null>(p.redo && !p.petPath ? p.pet.species : null)
  const [own, setOwn] = useState(p.redo && !!p.petPath)
  const [name, setName] = useState(p.redo ? p.pet.name : '')
  const [color, setColor] = useState<PetColor | null>(p.redo ? p.pet.color : null)
  const [tried, setTried] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { panel.current?.focus() }, [])
  // One's own animal counts once it has arrived.
  const ownReady = own && !!p.petPath

  const ok = step === 0 ? !!species || ownReady : step === 1 ? !!name.trim() : step === 2 ? !!color : true
  const finish = () => p.onFinish({ species: species ?? p.pet.species, name: name.trim(), color: color ?? 'original', onboarded: true })
  const next = () => {
    if (!ok) { setTried(true); return }
    if (step >= 4) finish()
    else { setStep(step + 1); setTried(false) }
  }
  const kind = species ?? p.pet.species
  const preview = (state: 'idle' | 'newTask') => (
    <div className={s.obPreview}>
      <PetNode species={kind} form={0} img={ownReady ? p.petPath : null} size={72} state={state} color={color ?? 'original'} />
    </div>
  )
  const coverStyle = p.coverPath ? { backgroundImage: `url("${fileRoute('marketing', p.coverPath)}")` } : undefined
  const face = p.avatarPath ? <img src={fileRoute('marketing', p.avatarPath)} alt="" /> : p.letter

  return (
    <div className={s.obScrim}>
      <div ref={panel} className={s.obPanel} role="dialog" aria-modal="true" aria-labelledby="ob-title" tabIndex={-1}>
        <ol className={s.obSteps}>
          {STEPS.map((x, i) => (
            <li key={x.label} className={s.obStep} data-done={i < step ? '' : undefined} data-now={i === step ? '' : undefined}>
              <span className={s.obMark}>{i < step ? '✓' : i + 1}</span>
              <span className={s.obLabel}>{x.label}</span>
              {i < STEPS.length - 1 ? <span className={s.obLine} aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
        <h2 id="ob-title" className={s.obTitle}>{STEPS[step].title}</h2>

        {step === 0 ? (
          <div className={s.obKinds} role="radiogroup" aria-label="Pet">
            {SPECIES_KEYS.map(k => (
              <button key={k} type="button" role="radio" aria-checked={species === k && !own} className={s.obKind}
                onClick={() => { setSpecies(k); setOwn(false); p.onUseKind() }}>
                <span className={s.obKindEmoji} aria-hidden="true">{SPECIES[k].forms[0]}</span>
                <span className={s.obKindName}>{SPECIES[k].label}</span>
                <span className={s.obKindEvo} aria-hidden="true">{SPECIES[k].forms.join(' → ')}</span>
              </button>
            ))}
            <button type="button" role="radio" aria-checked={own} className={`${s.obKind} ${s.obOwn}`} disabled={p.sending === 'pet'}
              onClick={() => { setOwn(true); setSpecies(null); p.onPickPet() }}>
              <span className={s.obOwnIcon} aria-hidden="true">⬆</span>
              <span className={s.obKindName}>My own animal</span>
              <span className={s.obKindEvo}>{p.sending === 'pet' ? 'Uploading…' : ownReady ? '✓ Uploaded' : 'Upload a picture'}</span>
            </button>
          </div>
        ) : null}

        {step === 1 ? (
          <>
            {preview('idle')}
            <input className={s.obName} value={name} maxLength={PET_NAME_MAX} placeholder="Give your pet a name" aria-label="Pet's name"
              onChange={e => setName(e.target.value.slice(0, PET_NAME_MAX))} />
            <div className={s.chips}>
              {NAME_IDEAS.map(n => <button key={n} type="button" className={s.chip} onClick={() => setName(n)}>{n}</button>)}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            {preview(color ? 'newTask' : 'idle')}
            <div className={s.obColors} role="radiogroup" aria-label="Pet's colour">
              {PET_COLORS.map(k => (
                <button key={k} type="button" role="radio" aria-checked={color === k} className={s.obColor} onClick={() => { setColor(k); setTried(false) }}>
                  <span className={s.obSwatch} data-pet-color={k} aria-hidden="true" />
                  <span>{PET_COLOR_NAMES[k]}</span>
                </button>
              ))}
            </div>
            {tried && !color ? <div className={s.obMissing} role="alert">Pick a colour to continue.</div> : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className={s.obCover} data-cover={p.coverPath ? undefined : String(p.cover)} data-picture={p.coverPath ? '' : undefined} style={coverStyle}>
              <span className={s.obCoverAvatar} style={{ background: p.avatarBg }} aria-hidden="true">{face}</span>
            </div>
            <div className={s.obCoverOpts} role="radiogroup" aria-label="Cover">
              {Array.from({ length: COVERS }, (_, i) => (
                <button key={i} type="button" role="radio" aria-checked={!p.coverPath && p.cover === i} aria-label={`Cover ${i + 1}`}
                  className={s.coverOpt} data-cover={String(i)} onClick={() => p.onPreset(i)} />
              ))}
            </div>
            <button type="button" className={s.dashBtn} disabled={p.sending === 'cover'} onClick={() => p.onPick('cover')}>
              {p.sending === 'cover' ? 'Uploading…' : '⬆ Upload your own cover image'}
            </button>
          </>
        ) : null}

        {step === 4 ? (
          <div className={s.obAvatarRow}>
            <button type="button" className={s.obAvatar} style={{ background: p.avatarBg }} aria-label="Upload a photo" disabled={p.sending === 'avatar'}
              onClick={() => p.onPick('avatar')}>
              {face}
            </button>
            <button type="button" className={s.btnLine} disabled={p.sending === 'avatar'} onClick={() => p.onPick('avatar')}>
              {p.sending === 'avatar' ? 'Uploading…' : '⬆ Upload a photo'}
            </button>
          </div>
        ) : null}

        <div className={s.obFoot}>
          {step > 0 ? <button type="button" className={s.obBack} onClick={() => setStep(step - 1)}>← Back</button> : null}
          <span className={s.grow} />
          {step >= 3 ? <button type="button" className={s.obSkip} onClick={() => (step >= 4 ? finish() : setStep(step + 1))}>Skip</button> : null}
          <button type="button" className={s.obNext} aria-disabled={!ok} onClick={next}>{step >= 4 ? 'Finish →' : 'Continue →'}</button>
        </div>
      </div>
    </div>
  )
}
