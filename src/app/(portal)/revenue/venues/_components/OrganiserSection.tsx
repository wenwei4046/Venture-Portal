'use client'

import {
  ActionButton,
  Field,
  Hidden,
  Hint,
  RowForm,
  SaveButton,
  SectionHead,
  Tick,
} from '@/components/RowForm'
import { formatMoney } from '@/lib/utils'
import type { OrganiserFairs } from '@/lib/organisers'
import { deleteOrganiser, upsertOrganiser } from '../../organiser-actions'
import { monthLabel } from '@/lib/venue-register'

/**
 * The organiser register — every name, typed once.
 *
 * The user asked for this list before the venue one ("我会先建一个 organizer
 * list。我把 organizer 加在那边，然后在 dropdown 里面直接选是哪一个
 * organizer"), and the order matters: a venue's organiser is PICKED from here,
 * never typed beside the venue. Typed per venue, `HOMEDEC` / `Homedec` /
 * `Home Dec` become three organisers with a third of the sales each, and the
 * only symptom is a report that quietly does not add up.
 *
 * Fairs / bills / sales value are counted from the venue table below, over
 * whatever month is showing, so the two sections can never disagree.
 *
 * Active is how an organiser leaves: it drops out of every dropdown and keeps
 * the months it explains. Remove is for a name typed by mistake — the database
 * refuses it once a fair is recorded against it.
 */
export default function OrganiserSection({
  organisers,
  month,
}: {
  organisers: OrganiserFairs[]
  month: string | null
}) {
  const running = organisers.filter(o => o.fairs > 0).length

  return (
    <section className="mb-12">
      <SectionHead
        title="Organisers"
        count={`${organisers.length} ORGANISER${organisers.length === 1 ? '' : 'S'}`}
      />
      <Hint>
        Who runs the fairs. The ERP sends the venue and nothing about the organiser, so each name
        is typed here once and then picked beside a venue — which is what keeps one organiser one
        row however many ways somebody spells it.{' '}
        {organisers.length > 0 ? (
          <>
            {running} of {organisers.length} ran a fair{' '}
            {month ? <>in {monthLabel(month)}</> : <>in the months on record</>}.
          </>
        ) : (
          <>Add the first one below.</>
        )}
      </Hint>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Organiser</th>
              <th>Note</th>
              <th className="right m-hide">Fairs</th>
              <th className="right m-hide">Bills</th>
              <th className="right">Sales value</th>
              <th className="w-20">Active</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            <RowForm action={upsertOrganiser}>
              {({ pending }) => (
                <tr className="bg-surface-2/40">
                  <td>
                    <Field name="name" placeholder="HOMEDEC" width="w-56" required ariaLabel="New organiser" />
                  </td>
                  <td>
                    <Field name="notes" placeholder="Note (optional)" width="w-56" ariaLabel="Note" />
                  </td>
                  <td className="num m-hide" />
                  <td className="num m-hide" />
                  <td className="num" />
                  <td>
                    <Tick name="is_active" defaultChecked ariaLabel="new organiser active" />
                  </td>
                  <td>
                    <SaveButton pending={pending} label="Add" />
                  </td>
                </tr>
              )}
            </RowForm>

            {organisers.map(o => (
              <RowForm key={o.id} action={upsertOrganiser}>
                {({ pending }) => (
                  <tr>
                    <td>
                      <Hidden name="id" value={o.id} />
                      <Field
                        name="name"
                        defaultValue={o.name}
                        width="w-56"
                        required
                        ariaLabel={`Name of ${o.name}`}
                      />
                    </td>
                    <td>
                      <Field
                        name="notes"
                        defaultValue={o.notes ?? ''}
                        width="w-56"
                        placeholder="—"
                        ariaLabel={`Note on ${o.name}`}
                      />
                    </td>
                    <td className="num m-hide" data-label="Fairs">
                      {o.fairs || <span className="text-muted">—</span>}
                    </td>
                    <td className="num m-hide" data-label="Bills">
                      {o.bills || <span className="text-muted">—</span>}
                    </td>
                    <td className="num">
                      {o.total > 0 ? formatMoney(o.total) : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      <Tick
                        name="is_active"
                        defaultChecked={o.isActive}
                        ariaLabel={`${o.name} active`}
                      />
                    </td>
                    <td className="flex items-center gap-3">
                      <SaveButton pending={pending} label="✓" />
                      <ActionButton
                        run={() => deleteOrganiser(o.id)}
                        label="Remove"
                        danger
                        confirm={`Remove ${o.name} from the organiser register?`}
                      />
                    </td>
                  </tr>
                )}
              </RowForm>
            ))}

            {organisers.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted font-serif italic">
                  No organisers yet — the venue table below has nothing to offer until there is one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
