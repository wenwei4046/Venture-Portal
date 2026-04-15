import Link from 'next/link'

// Phase 7 Step 11: Statements + Invoices share one sidebar entry, split by tab.
// "Statements" (default) = monthly consolidated statements.
// "Invoices" = billing overview + invoice generation (formerly /billing).
export default function StatementsTabHeader({ active }: { active: 'statements' | 'invoices' }) {
  return (
    <div className="border-b border-hairline mb-8 -mt-2">
      <nav className="flex gap-6" aria-label="Statements tabs">
        <TabLink href="/statements" label="Statements" isActive={active === 'statements'} />
        <TabLink href="/statements/invoices" label="Invoices" isActive={active === 'invoices'} />
      </nav>
    </div>
  )
}

function TabLink({
  href,
  label,
  isActive,
}: {
  href: string
  label: string
  isActive: boolean
}) {
  return (
    <Link
      href={href}
      className={
        isActive
          ? 'pb-3 border-b-2 border-accent font-serif text-accent text-sm'
          : 'pb-3 border-b-2 border-transparent font-serif italic text-graphite text-sm hover:text-ink transition-colors'
      }
    >
      {label}
    </Link>
  )
}
