import qs from './quotes.module.css'

/** 🔒 — every lock in the Product Builder says what it means on hover (v2 §7). */
export const LOCK_TITLE = 'Internal only · not shown to the client'

export default function Lock({ className }: { className?: string }) {
  return <span className={`${qs.lock}${className ? ` ${className}` : ''}`} title={LOCK_TITLE} aria-label={LOCK_TITLE} role="img">🔒</span>
}
