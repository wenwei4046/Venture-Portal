import { describe, expect, it } from 'vitest'
import { saveRecordAndLine, type SaveStep } from './person-line-save'

// A person's page saves who they report to through the charts' own writer
// (2026-10-16); with a new title in the same save, the order decides whether
// the database lets either through.

function steps(lineAnswers: SaveStep[], opts: { lineSent?: boolean; titleSent?: boolean; recordThrows?: string } = {}) {
  const log: string[] = []
  const answers = [...lineAnswers]
  const run = saveRecordAndLine({
    lineSent: opts.lineSent ?? true,
    titleSent: opts.titleSent ?? false,
    moveLine: async () => {
      log.push('line')
      return answers.shift() ?? { ok: true }
    },
    writeRecord: async () => {
      log.push('record')
      if (opts.recordThrows) throw new Error(opts.recordThrows)
    },
  })
  return { run, log }
}

describe('saving the record and the line', () => {
  it('with no new line, writes the record alone', async () => {
    const { run, log } = steps([], { lineSent: false })
    expect(await run).toEqual({ ok: true })
    expect(log).toEqual(['record'])
  })

  it('moves the line first, then the record — a promotion under a new, higher manager', async () => {
    const { run, log } = steps([{ ok: true }], { titleSent: true })
    expect(await run).toEqual({ ok: true })
    expect(log).toEqual(['line', 'record'])
  })

  it('a refused line with no new title is the answer, and nothing else is written', async () => {
    const { run, log } = steps([{ ok: false, reason: 'A cannot report to B: a Revenue Specialist cannot hold downlines.' }])
    expect(await run).toEqual({ ok: false, reason: 'A cannot report to B: a Revenue Specialist cannot hold downlines.' })
    expect(log).toEqual(['line'])
  })

  it('a demotion under a lower manager: refused first, the title goes in, then the line holds', async () => {
    const { run, log } = steps([{ ok: false, reason: 'stands above … on the ladder' }, { ok: true }], { titleSent: true })
    expect(await run).toEqual({ ok: true })
    expect(log).toEqual(['line', 'record', 'line'])
  })

  it('refused both ways: the second refusal is the answer', async () => {
    const { run, log } = steps([{ ok: false, reason: 'first' }, { ok: false, reason: 'second' }], { titleSent: true })
    expect(await run).toEqual({ ok: false, reason: 'second' })
    expect(log).toEqual(['line', 'record', 'line'])
  })

  it('a refused record is thrown in its own words', async () => {
    const { run } = steps([{ ok: true }], { recordThrows: 'Employee code already used by another active staff' })
    await expect(run).rejects.toThrow('Employee code already used by another active staff')
  })
})
