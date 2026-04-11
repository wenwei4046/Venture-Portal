import Link from 'next/link'

// Settings tabs — server-rendered, no client JS. Tab state lives in the URL
// (?tab=treasury|tiers|overdue|splits|directors|simulator). Each tab is a
// simple <Link>; the parent page reads searchParams and renders the matching
// panel below. Active tab gets the italic-rust styling from DESIGN.md.

export type SettingsTab =
  | 'treasury'
  | 'tiers'
  | 'overdue'
  | 'splits'
  | 'directors'
  | 'simulator'

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'treasury', label: 'Treasury' },
  { key: 'tiers', label: 'Tiers' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'splits', label: 'Splits' },
  { key: 'directors', label: 'Directors' },
  { key: 'simulator', label: 'Simulator' },
]

export function isSettingsTab(s: string | undefined): s is SettingsTab {
  return !!s && TABS.some((t) => t.key === s)
}

export default function SettingsTabs({ active }: { active: SettingsTab }) {
  return (
    <nav
      aria-label="Settings sections"
      className="border-b border-hairline mb-8 flex items-end gap-6 overflow-x-auto"
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={`/settings?tab=${tab.key}`}
            className={
              isActive
                ? 'font-serif italic text-accent text-base pb-3 -mb-px border-b-2 border-accent'
                : 'font-serif text-graphite text-base pb-3 hover:text-ink transition-colors'
            }
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
