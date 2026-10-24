import { energyTone, exerciseTitle, PET_STATES, xpBar, type PetStats } from '@/lib/marketing/space'
import PetNode from './PetNode'
import type { RoomPet } from './RoomTile'
import s from './myspace.module.css'

// The pet's own tile (`My Space Bento.dc.html` › the pet tile, ⑦-5): the pet, its name and level, its XP to the next
// level and its energy, how it feels — and, its owner's to look after, *🍙 Feed* (a snack, +20 energy) and *🏃*
// (a workout: −15 energy, +10 XP the first three a day). Nobody off Marketing's roster has a pet.

export interface PetTileProps {
  /** Null: no pet lives here. */
  pet: RoomPet | null
  name: string
  stats: PetStats | null
  /** Marketing · Edit: fed and worked out by its owner. */
  canCare: boolean
  /** A feed or a workout on its way: the buttons wait. */
  caring: boolean
  onFeed: () => void
  onExercise: () => void
}

export default function PetTile(p: PetTileProps) {
  if (!p.pet || !p.stats) {
    return (
      <div className={s.petTile}>
        <span className={s.petNone}>🐾 No pet</span>
      </div>
    )
  }
  const bar = xpBar(p.stats.xp)
  const { energy, snacks, workouts } = p.stats
  const feel = PET_STATES[p.pet.state]
  return (
    <div className={s.petTile}>
      <div className={s.petTileNode}>
        <PetNode species={p.pet.species} form={p.pet.form} img={p.pet.img} state={p.pet.state} color={p.pet.color} size={50} />
      </div>
      <div className={s.petTileMain}>
        <div className={s.petTileHead}>
          <span className={s.petTileName}>{p.name}</span>
          <span className={s.grow} />
          <span className={s.petLv}>Lv {bar.level}</span>
        </div>
        <div className={s.bar} role="progressbar" aria-label="XP" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bar.pct}
          aria-valuetext={bar.label} title={bar.label}>
          <div className={s.barFill} style={{ width: `${bar.pct}%` }} />
        </div>
        <div className={s.bar} role="progressbar" aria-label="Energy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={energy} title="Energy">
          <div className={s.barFill} data-tone={energyTone(energy)} style={{ width: `${energy}%` }} />
        </div>
        <div className={s.petTileState} title={feel.label}>{feel.bubble || '🙂'} {feel.label}</div>
        {p.canCare ? (
          <div className={s.petCare}>
            <button type="button" className={s.careBtn} title="Feed" aria-label={`Feed · ${snacks} snack${snacks === 1 ? '' : 's'}`}
              disabled={p.caring} onClick={p.onFeed}>
              🍙 {snacks}
            </button>
            <button type="button" className={s.careBtn} title={exerciseTitle(workouts)} aria-label={exerciseTitle(workouts)} disabled={p.caring}
              onClick={p.onExercise}>
              🏃
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
