'use client'

import {
  CATALOG, FLOOR_NAMES, FLOORS, FORM_LEVELS, PET_COLOR_NAMES, PET_COLORS, PET_NAME_MAX, PIECES, SPECIES, SPECIES_KEYS, WALL_NAMES, WALLS,
  type Pet, type PieceKind, type Room, type SpacePicture,
} from '@/lib/marketing/space'
import s from './myspace.module.css'

// Edit layout's drawer › 🎨 Room & pet (`My Space Bento.dc.html`): *Wall*, *Floor*, *Add furniture* (the sixteen), the
// piece picked in the room (⇋ Flip, Remove), and *Your pet* — its name, its kind (or ⬆ one's own animal), its three
// forms, its colour, *Redo pet setup*. The handoff's lines of help ("Drag furniture left or right…", "XP = stages ×
// difficulty…") are left out: no descriptions on a page, and XP waits for question 32.

export interface RoomDrawerTabProps {
  room: Room
  selected: string | null
  onRoom: (room: Room) => void
  onAddPiece: (k: PieceKind) => void
  onFlip: () => void
  onRemovePiece: () => void
  /** Null: no pet for this space's owner (not on Marketing's roster). */
  pet: Pet | null
  petPath: string | null
  form: number
  /** A picture on its way up: *⬆ Upload your animal* waits for it. */
  sending: SpacePicture | null
  onPet: (patch: Partial<Pet>) => void
  onPetName: (name: string) => void
  onPetNameDone: () => void
  onPickPet: () => void
  onClearPet: () => void
  onRedo: () => void
}

export default function RoomDrawerTab(p: RoomDrawerTabProps) {
  const sel = p.selected ? p.room.items.find(i => i.id === p.selected) : null
  return (
    <>
      <div>
        <div className={s.drawerHead}>Wall</div>
        <div className={s.swatches} role="radiogroup" aria-label="Wall">
          {WALLS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={p.room.wall === k} aria-label={WALL_NAMES[k]} title={WALL_NAMES[k]}
              className={s.bgOpt} data-wall={k} onClick={() => p.onRoom({ ...p.room, wall: k })} />
          ))}
        </div>
      </div>
      <div>
        <div className={s.drawerHead}>Floor</div>
        <div className={s.swatches} role="radiogroup" aria-label="Floor">
          {FLOORS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={p.room.floor === k} aria-label={FLOOR_NAMES[k]} title={FLOOR_NAMES[k]}
              className={s.bgOpt} data-floor={k} onClick={() => p.onRoom({ ...p.room, floor: k })} />
          ))}
        </div>
      </div>
      <div>
        <div className={s.drawerHead}>Add furniture</div>
        <div className={s.catalog}>
          {PIECES.map(k => (
            <button key={k} type="button" className={s.catalogItem} title={`Add ${CATALOG[k].label}`} aria-label={`Add ${CATALOG[k].label}`}
              onClick={() => p.onAddPiece(k)}>
              <span className={s.catalogEmoji} aria-hidden="true">{CATALOG[k].emoji}</span>
              <span className={s.catalogLabel}>{CATALOG[k].label}</span>
            </button>
          ))}
        </div>
      </div>
      {sel ? (
        <div className={s.selPiece}>
          <span className={s.selEmoji} aria-hidden="true">{CATALOG[sel.k].emoji}</span>
          <span className={s.selLabel}>{CATALOG[sel.k].label}</span>
          <button type="button" className={s.selBtn} onClick={p.onFlip}>⇋ Flip</button>
          <button type="button" className={`${s.selBtn} ${s.selRemove}`} onClick={p.onRemovePiece}>Remove</button>
        </div>
      ) : null}
      {p.pet ? (
        <div>
          <div className={s.drawerHead}>Your pet</div>
          <input className={s.petName} value={p.pet.name} maxLength={PET_NAME_MAX} aria-label="Pet's name"
            onChange={e => p.onPetName(e.target.value)} onBlur={p.onPetNameDone} />
          <div className={s.chips} role="radiogroup" aria-label="Pet">
            {SPECIES_KEYS.map(k => (
              <button key={k} type="button" role="radio" aria-checked={!p.petPath && p.pet?.species === k} className={s.chip}
                onClick={() => {
                  if (p.petPath) p.onClearPet()
                  p.onPet({ species: k })
                }}>
                <span aria-hidden="true">{SPECIES[k].forms[p.form]}</span> {SPECIES[k].label}
              </button>
            ))}
          </div>
          <div className={s.petUpload}>
            <button type="button" className={s.dashBtn} disabled={p.sending != null} onClick={p.onPickPet}>
              {p.sending === 'pet' ? 'Uploading…' : '⬆ Upload your animal'}
            </button>
            {p.petPath ? <button type="button" className={s.selBtn} onClick={p.onClearPet}>Remove</button> : null}
          </div>
          <div className={s.forms}>
            {SPECIES[p.pet.species].forms.map((emoji, i) => (
              <div key={emoji} className={s.form} data-now={i === p.form ? '' : undefined} data-later={i > p.form ? '' : undefined}>
                <span className={s.formEmoji} aria-hidden="true">{emoji}</span>
                <span className={s.formName}>{SPECIES[p.pet!.species].names[i]}</span>
                <span className={s.formLv}>{FORM_LEVELS[i]}</span>
              </div>
            ))}
          </div>
          <div className={s.colors} role="radiogroup" aria-label="Pet's colour">
            {PET_COLORS.map(k => (
              <button key={k} type="button" role="radio" aria-checked={p.pet?.color === k} aria-label={PET_COLOR_NAMES[k]} title={PET_COLOR_NAMES[k]}
                className={s.colorOpt} data-pet-color={k} onClick={() => p.onPet({ color: k })} />
            ))}
          </div>
          <button type="button" className={s.reset} onClick={p.onRedo}>Redo pet setup</button>
        </div>
      ) : null}
    </>
  )
}
