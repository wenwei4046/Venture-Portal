import Link from 'next/link'

// 2026-05-15 reorder: Invoices is the default Statements landing
// (/statements). Monthly Statements moved to /statements/monthly. The
// sidebar entry still says "Statements" — only the landing content swapped.
export default function StatementsTabHeader({ active }: { active: 'statements' | 'invoices' }) {
  return (
    <div className="border-b border-hairline mb-8 -mt-2">
      <nav className="flex gap-6" aria-label="Statements tabs">
        <TabLink href="/statements" label="Invoices" isActive={active === 'invoices'} />
        <TabLink href="/statements/monthly" label="Statements" isActive={active === 'statements'} />
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
