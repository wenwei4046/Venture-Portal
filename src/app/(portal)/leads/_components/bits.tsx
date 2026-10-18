import type { LeadBrand, LeadChannel } from '@/lib/leads/types'
import s from './lead.module.css'

/** A brand's chip, in its tone. */
export function BrandChip({ brand }: { brand: Pick<LeadBrand, 'name' | 'tone'> | undefined }) {
  if (!brand) return null
  return (
    <span className={s.brand} data-tone={brand.tone}>
      {brand.name}
    </span>
  )
}

export const CHANNEL_LABEL: Readonly<Record<LeadChannel, string>> = { messenger: 'Messenger', instagram: 'Instagram' }

/** The 1–2 letters an avatar shows. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase()
}

/**
 * A label in English. Until 2026-10-18 the Simplified Chinese helper showed beside it, smaller ("简体+英文"); the
 * user then asked for English only ("改成纯英文，画面太乱了"), so `zh` is kept but not drawn — one line to bring
 * it back, should a translation toggle be wanted.
 */
export function Bi({ en }: { en: string; zh?: string; block?: boolean }) {
  return <>{en}</>
}
