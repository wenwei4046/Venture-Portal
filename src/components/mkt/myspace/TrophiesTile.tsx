import { trophyShelf, type PetStats } from '@/lib/marketing/space'
import s from './myspace.module.css'

// The trophies (`My Space Bento.dc.html` › the trophies tile, ⑦-5 — the user's answer 34): one a project finished this
// quarter where its owner did any stage, six at most, each named by its project; two still to win, greyed; how many.

export default function TrophiesTile({ stats }: { stats: PetStats | null }) {
  const shelf = trophyShelf(stats)
  return (
    <div className={s.trophies}>
      <div className={s.trophiesHead}>🏆 Trophies</div>
      <div className={s.trophyRow}>
        {shelf.got.map((g, i) => (
          <span key={`got-${i}`} role="img" aria-label={g.name || 'Trophy'} title={g.name || undefined}>{g.emoji}</span>
        ))}
        {shelf.locked.map((emoji, i) => (
          <span key={`locked-${i}`} className={s.trophyLocked} aria-hidden="true">{emoji}</span>
        ))}
      </div>
      <div className={s.trophyLine}>{shelf.line}</div>
    </div>
  )
}
