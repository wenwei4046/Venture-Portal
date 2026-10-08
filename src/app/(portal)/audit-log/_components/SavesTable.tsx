import Link from 'next/link'
import { officeTime } from '@/lib/office-time'
import { filtersHref, type ChangeAction, type ChangeFilters, type DescribedChange, type Save } from '@/lib/audit/changes'

// Audit Log › Changes: one row per save — when, who, and every record it
// touched with its fields before → after (DESIGN.md › Audit log). Server-rendered;
// the long saves and long records fold in a <details>, no script needed.

const TONE: Record<ChangeAction, string> = { Added: 'ledger', Changed: 'info', Removed: 'danger' }
/** Records of one save shown before "all N". */
const RECORDS_SHOWN = 6
/** Fields of an added / removed record shown before "all N". */
const FIELDS_SHOWN = 8

const NO_FILTERS: ChangeFilters = { area: null, table: null, who: null, from: null, to: null, row: null, before: null }

export default function SavesTable({ saves }: { saves: Save[] }) {
  return (
    <div className="table-scroll">
      <table className="ledger-table audit-saves">
        <thead>
          <tr>
            <th className="w-[130px]">When</th>
            <th className="w-[170px]">Who</th>
            <th>What changed</th>
          </tr>
        </thead>
        <tbody>
          {saves.map(save => (
            <tr key={`${save.txid}:${save.changes[0]?.id ?? 0}`}>
              <td className="align-top font-mono text-[11px] whitespace-nowrap" title={officeTime(save.at).format('D MMM YYYY HH:mm:ss')}>
                {officeTime(save.at).format('D MMM YY HH:mm')}
              </td>
              <td className="align-top">
                <div>{save.who}</div>
                {save.via ? <div className="text-[11px] text-graphite">{save.via}</div> : null}
              </td>
              <td className="align-top">
                {save.changes.slice(0, RECORDS_SHOWN).map(change => <ChangeBlock key={change.id} change={change} />)}
                {save.changes.length > RECORDS_SHOWN ? (
                  <details className="audit-more">
                    <summary>All {save.changes.length} records of this save</summary>
                    {save.changes.slice(RECORDS_SHOWN).map(change => <ChangeBlock key={change.id} change={change} />)}
                  </details>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChangeBlock({ change }: { change: DescribedChange }) {
  const history = change.rowKey ? filtersHref(NO_FILTERS, { table: change.tableName, row: change.rowKey }) : null
  return (
    <div className="audit-change">
      <div className="audit-change-head">
        <span className={`chip ${TONE[change.action]}`}>
          <span className="dot" />
          {change.action}
        </span>
        <span className="font-bold">{change.table}</span>
        <span aria-hidden>·</span>
        {history ? (
          <Link href={history} className="audit-row-link" title="Every change to this record">
            {change.rowLabel}
          </Link>
        ) : (
          <span>{change.rowLabel}</span>
        )}
      </div>
      <Fields change={change} />
    </div>
  )
}

function Fields({ change }: { change: DescribedChange }) {
  if (change.action === 'Changed') {
    return (
      <ul className="audit-fields">
        {change.fields.map(f => (
          <li key={f.key}>
            <span className="audit-field">{f.label}</span>
            {f.hidden ? (
              <span className="audit-hidden">changed — hidden from your title</span>
            ) : (
              <span>
                <span className="audit-was">{f.before}</span>
                <span aria-hidden> → </span>
                <span className="sr-only"> became </span>
                <span className="audit-now">{f.after}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    )
  }
  const value = (f: DescribedChange['fields'][number]) => (change.action === 'Added' ? f.after : f.before)
  const shown = change.fields.slice(0, FIELDS_SHOWN)
  const rest = change.fields.slice(FIELDS_SHOWN)
  return (
    <>
      <ul className="audit-fields">
        {shown.map(f => (
          <li key={f.key}>
            <span className="audit-field">{f.label}</span>
            <span className={change.action === 'Removed' ? 'audit-was' : undefined}>{value(f)}</span>
          </li>
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="audit-more">
          <summary>All {change.fields.length} fields</summary>
          <ul className="audit-fields">
            {rest.map(f => (
              <li key={f.key}>
                <span className="audit-field">{f.label}</span>
                <span className={change.action === 'Removed' ? 'audit-was' : undefined}>{value(f)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {change.hiddenValues > 0 ? (
        <p className="audit-hidden mt-1">
          {change.hiddenValues} {change.hiddenValues === 1 ? 'value' : 'values'} hidden from your title (salary, NRIC or bank)
        </p>
      ) : null}
    </>
  )
}
