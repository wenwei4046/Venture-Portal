import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { taskFromRow, type MktTaskPage } from '@/lib/marketing/task'
import TaskPicLink from './TaskPicLink'

// 2026-10-25 — ②a-5: the PIC's link on a task whose stages they approve, its minutes not theirs (the user's answer 52):
// each PIC's own link to copy or share on WhatsApp — the message naming the stage ready for their approval, else the
// task to follow.

const pl = { pic: 'Kelvin Tan', whatsapp: '012-345 6789', pic2: 'Hana Lee', whatsapp2: '013-999 8888', link: 'a'.repeat(32), link2: 'b'.repeat(32) }
const pageOf = (stage: Record<string, unknown>) => taskFromRow({
  today: '2026-10-26', me: null, team: [], sub: null,
  project: { id: 'p1', trackId: 'TSK-CAR-2610-007', kind: 'quick', sub: 'sub', title: 'Raya visual', status: 'active', cur: 0, picLink: pl },
  stages: [{ project: 'p1', idx: 0, name: 'Design', owner: 's1', appr: [{ kind: 'pic' }], status: 'accepted', ver: 1, apprIdx: 0, ...stage }],
  subtasks: [], events: [], series: null, holidays: [],
}) as MktTaskPage
const show = (page: MktTaskPage) => render(<TaskPicLink page={page} pl={page.project.picLink!} say={() => {}} />)
const texts = () => screen.getAllByRole('link', { name: 'Share via WhatsApp' }).map(a => decodeURIComponent(a.getAttribute('href') ?? ''))

afterEach(cleanup)

describe('the PIC link card', () => {
  it('each PIC’s own link — copied, or shared on WhatsApp to follow the task', () => {
    show(pageOf({}))
    expect(screen.getByText('Kelvin Tan or Hana Lee (PIC)')).toBeTruthy()
    const origin = window.location.origin
    expect(screen.getByText(`${origin}/t/${'a'.repeat(32)}`)).toBeTruthy()
    expect(screen.getByText(`${origin}/t/${'b'.repeat(32)}`)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Copy link' })).toHaveLength(2)
    expect(texts()).toEqual([
      `https://wa.me/60123456789?text=Hi Kelvin Tan, you can follow Raya visual and approve its stages on this link: ${origin}/t/${'a'.repeat(32)}`,
      `https://wa.me/60139998888?text=Hi Hana Lee, you can follow Raya visual and approve its stages on this link: ${origin}/t/${'b'.repeat(32)}`,
    ])
    expect(screen.queryByText(/Ready for their approval/)).toBeNull()
  })

  it('a stage waiting for them: said, and the message names it', () => {
    show(pageOf({ status: 'review', ver: 2 }))
    expect(screen.getByText('Ready for their approval: Design · version 2')).toBeTruthy()
    expect(texts()[1]).toBe(`https://wa.me/60139998888?text=Hi Hana Lee, Design (version 2) of Raya visual is ready for your approval: ${window.location.origin}/t/${'b'.repeat(32)}`)
  })
})
