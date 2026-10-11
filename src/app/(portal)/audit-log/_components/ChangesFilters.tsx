import Link from 'next/link'
import { AUDIT_AREAS, type AuditTableLine, type ChangeFilters } from '@/lib/audit/changes'
import { Select } from '@/components/hrv/select'

// The Changes page's filters: a plain GET form, so a filtered view is a link
// somebody can send. Only the areas and records the reader's permissions open
// are offered. Each control is keyed by its value, so a new URL re-seeds it
// (a reused <select> keeps its old defaultValue otherwise).

const field = 'flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[0.04em]'

export default function ChangesFilters({
  filters,
  lines,
  actors,
}: {
  filters: ChangeFilters
  lines: AuditTableLine[]
  actors: Array<{ id: string; name: string }>
}) {
  const recorded = lines.filter(l => l.mode !== 'none')
  const areas = AUDIT_AREAS.filter(a => recorded.some(l => l.area === a))
  return (
    <form method="get" action="/audit-log" className="sheet-toolbar items-end" role="search" aria-label="Filter the changes">
      <label className={field}>
        Area
        <Select bare name="area" defaultValue={filters.area ?? ''} key={`area:${filters.area ?? ''}`}>
          <option value="">Every area</option>
          {areas.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>
      </label>
      <label className={field}>
        Record
        <Select bare name="table" defaultValue={filters.table ?? ''} key={`table:${filters.table ?? ''}`}>
          <option value="">Every record</option>
          {areas.map(a => (
            <optgroup key={a} label={a}>
              {recorded.filter(l => l.area === a).map(l => (
                <option key={l.table_name} value={l.table_name}>{l.label}</option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>
      <label className={field}>
        Who
        <Select bare name="who" defaultValue={filters.who ?? ''} key={`who:${filters.who ?? ''}`}>
          <option value="">Anybody</option>
          <option value="system">System — ERP feed, server, migrations</option>
          {actors.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </label>
      <label className={field}>
        From
        <input type="date" name="from" defaultValue={filters.from ?? ''} key={`from:${filters.from ?? ''}`} />
      </label>
      <label className={field}>
        To
        <input type="date" name="to" defaultValue={filters.to ?? ''} key={`to:${filters.to ?? ''}`} />
      </label>
      {filters.row ? <input type="hidden" name="row" value={filters.row} /> : null}
      <div className="flex items-center gap-2 ml-auto">
        <button type="submit" className="bg-accent hover:bg-accent-hover text-white text-sm px-4 py-2 rounded-control transition-colors">
          Show
        </button>
        <Link href="/audit-log" className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors">
          Clear
        </Link>
      </div>
    </form>
  )
}
