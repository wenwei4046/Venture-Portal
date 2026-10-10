import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Field, Hidden, RowForm, SaveButton } from './RowForm'

/**
 * A RowForm is a table row whose fields belong to a form portalled outside
 * the table. The one thing it must do is run its action when the row is
 * submitted — and from 2026-09-07 to 2026-09-10 it did not: the submit
 * handler read `onDone?.(await action(fd))`, and with no onDone (no row
 * passes one) the optional call short-circuits, so JavaScript never evaluated
 * the argument and the action was never called. The button flickered
 * "Saving…", nothing was written, nothing was reported.
 */
function Row({
  action,
  onDone,
}: {
  action: (fd: FormData) => Promise<unknown>
  onDone?: (result: unknown) => void
}) {
  return (
    <table>
      <tbody>
        <RowForm action={action} onDone={onDone}>
          {({ pending }) => (
            <tr>
              <td>
                <Hidden name="scheme_id" value="scheme-1" />
                <Field name="product_rate" type="number" defaultValue="11" ariaLabel="new rank rate" />
              </td>
              <td>
                <SaveButton pending={pending} label="Add" />
              </td>
            </tr>
          )}
        </RowForm>
      </tbody>
    </table>
  )
}

/** The row's own form: the one its fields point at through the `form` attribute. */
function rowForm(): HTMLFormElement {
  const input = screen.getByLabelText('new rank rate')
  const id = input.getAttribute('form')
  if (!id) throw new Error('the field is not attached to a form')
  const form = document.getElementById(id)
  if (!(form instanceof HTMLFormElement)) throw new Error('the row form is not in the document')
  return form
}

describe('RowForm', () => {
  it('runs the action when the row is submitted and nobody asked for the result', async () => {
    const action = vi.fn(async () => undefined)
    render(<Row action={action} />)

    fireEvent.submit(rowForm())

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))
    expect(action).toHaveBeenCalledWith(expect.any(FormData))
  })

  it('hands what the action returned to onDone', async () => {
    const action = vi.fn(async () => ({ note: 'the mirror was skipped' }))
    const onDone = vi.fn()
    render(<Row action={action} onDone={onDone} />)

    fireEvent.submit(rowForm())

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ note: 'the mirror was skipped' }))
  })

  it('shows the error beside the button when the action throws', async () => {
    const action = vi.fn(async () => {
      throw new Error('Rank SS already pays 11%')
    })
    render(<Row action={action} />)

    fireEvent.submit(rowForm())

    expect(await screen.findByText('Rank SS already pays 11%')).toBeInTheDocument()
    // The transition's pending flag clears in its own commit, after the error renders —
    // under a loaded run the two can land in separate frames, so wait for the label.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled())
  })

  it('keeps the form outside the table and the row controls attached to it', () => {
    render(<Row action={vi.fn(async () => undefined)} />)
    const form = rowForm()

    expect(form.hidden).toBe(true)
    expect(form.parentElement).toBe(document.body)
    expect(screen.getByRole('button', { name: 'Add' }).getAttribute('form')).toBe(form.id)
    expect(screen.getByLabelText('new rank rate').getAttribute('form')).toBe(form.id)
  })
})
