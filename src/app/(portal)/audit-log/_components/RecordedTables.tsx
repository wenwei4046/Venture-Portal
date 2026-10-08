import { AUDIT_AREAS, type AuditMode, type AuditTableLine } from '@/lib/audit/changes'

// What the history keeps, said plainly (audit_tables): every record of the
// reader's areas, how its changes are kept, and — for the Principal, who reads
// the whole register — the tables left out and why.

const KEPT: Record<AuditMode, { text: string; tone: string }> = {
  all: { text: 'Every change', tone: 'ledger' },
  people: { text: 'People’s changes only', tone: 'info' },
  none: { text: 'Not recorded', tone: '' },
}

export default function RecordedTables({ lines }: { lines: AuditTableLine[] }) {
  const recorded = lines.filter(l => l.mode !== 'none').length
  const ordered = [...lines].sort(
    (a, b) => AUDIT_AREAS.indexOf(a.area) - AUDIT_AREAS.indexOf(b.area) || a.label.localeCompare(b.label),
  )
  return (
    <details className="audit-recorded mt-8" id="recorded">
      <summary>
        What this history keeps — {recorded} {recorded === 1 ? 'record' : 'records'} in your areas
      </summary>
      <p className="sheet-subtitle">
        A change people make through the portal is kept whole: who, when, the record before and after. What the Houzs
        ERP feeds is kept only where a person changed it. Logs that are a record already, the ERP&apos;s catalogue
        mirror and the statutory schedules are not kept again.
      </p>
      <div className="table-scroll mt-3">
        <table className="ledger-table tight">
          <thead>
            <tr>
              <th>Area</th>
              <th>Record</th>
              <th>Kept</th>
              <th>Why not</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(l => (
              <tr key={l.table_name}>
                <td>{l.area}</td>
                <td>
                  {l.label}
                  <span className="block font-mono text-[10px] text-graphite">{l.table_name}</span>
                </td>
                <td>
                  <span className={`chip ${KEPT[l.mode].tone}`.trim()}>{KEPT[l.mode].text}</span>
                </td>
                <td className="text-[11px]">{l.mode === 'none' ? l.reason : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
