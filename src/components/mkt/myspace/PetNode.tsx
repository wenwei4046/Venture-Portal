import { fileRoute } from '@/lib/storage/browser'
import { PET_STATES, SPECIES, type PetColor, type PetState, type SpeciesKey } from '@/lib/marketing/space'
import s from './myspace.module.css'

// The pet as the handoff draws it (`My Space Bento.dc.html` › petNode): its kind's form — or one's own animal — moving as
// it feels (chilling, a new task, working, overloaded, asleep …), the state's bubble over it, its colour a filter, a
// shadow under it. Facing −1 turns it round.

export interface PetNodeProps {
  species: SpeciesKey
  form: number
  /** One's own animal (its path in the bucket), in place of the kind's emoji. */
  img: string | null
  size: number
  state: PetState
  color: PetColor
  facing?: 1 | -1
}

export default function PetNode({ species, form, img, size, state, color, facing = 1 }: PetNodeProps) {
  const bubble = PET_STATES[state].bubble
  return (
    <div className={s.pet} aria-hidden="true">
      {bubble ? <span className={s.petBubble} style={{ bottom: Math.round(size * 0.75) }}>{bubble}</span> : null}
      <div className={s.petBody} data-state={state} data-color={color}>
        {img ? (
          <img src={fileRoute('marketing', img)} alt="" className={s.petImg}
            style={{ width: Math.round(size * 1.25), height: Math.round(size * 1.25), transform: `scaleX(${facing})` }} />
        ) : (
          <span className={s.petEmoji} style={{ fontSize: size, transform: `scaleX(${facing})` }}>{SPECIES[species].forms[form]}</span>
        )}
      </div>
      <div className={s.petShadow} style={{ width: Math.round(size * 0.7), height: Math.round(size * 0.16) }} />
    </div>
  )
}
