import m from './minutes.module.css'

// A label that never changes its width: whichever of its words is shown, the box keeps the widest of them (bold when the
// label turns bold) — so switching a tab, a pill or a button never nudges what stands beside it. The words it may show
// are drawn invisibly from a data attribute, never as text: screen readers and searches see only the word shown.

export default function Steady({ show, also = [], bold = false }: {
  show: string
  /** The other words this label can show. */
  also?: readonly string[]
  /** It turns bold when picked: keep the bold width too. */
  bold?: boolean
}) {
  return (
    <span className={m.steady}>
      <span>{show}</span>
      {[show, ...also].map((w, i) => (
        <span key={i} className={`${m.steadyGhost}${bold ? ` ${m.steadyBold}` : ''}`} data-w={w} aria-hidden="true" />
      ))}
    </span>
  )
}
