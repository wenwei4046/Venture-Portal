import { describe, expect, it } from 'vitest'
import { answerWords, choiceOptions, optionListsFromRow, optionThere, optionWords, picksOf, sameAnswer, togglePick } from './options'

// 2026-10-25 — ③d-2: a choice's options from a shared list (the user's answer 9: "a shared option list (Locations) as a
// dropdown — the person filling it in adds a missing option on the spot"). The database's side is
// tests/member-sql/validate-marketing-option-lists.mjs.

describe('shared option lists', () => {
  it('read: every list by its name — a name the database would refuse, and anything not words, left out', () => {
    expect(optionListsFromRow({ Locations: ['Showroom', '', 7, 'LRT'], bad_name: ['x'], Moods: 'Calm' })).toEqual({ Locations: ['Showroom', 'LRT'], Moods: [] })
    expect([optionListsFromRow(null), optionListsFromRow(['Locations'])]).toEqual([{}, {}])
  })

  it('an option typed in: its spaces tidied, at most 40 — there already in other letters, its own spelling', () => {
    expect([optionWords('  Studio   A '), optionWords('   '), optionWords('x'.repeat(41)), optionWords('x'.repeat(40)).length]).toEqual(['Studio A', '', '', 40])
    expect([optionThere(['Showroom', 'LRT'], ' lrt '), optionThere(['Showroom'], 'Studio')]).toEqual(['LRT', null])
  })

  it('an answer as its picks: a list, one word typed before, none', () => {
    expect([picksOf(['LRT', '', 3, 'Showroom']), picksOf(' Old studio '), picksOf(''), picksOf(true), picksOf(undefined)]).toEqual([['LRT', 'Showroom'], ['Old studio'], [], [], []])
  })

  it('a choice offers its list’s options once it names one, else its own — an answer picked before always', () => {
    const lists = { Locations: ['Showroom', 'LRT'] }
    expect(choiceOptions({ list: 'Locations', opts: ['Own'] }, lists, undefined)).toEqual(['Showroom', 'LRT'])
    expect(choiceOptions({ opts: ['Bright', ' ', 'Calm'] }, lists, 'Calm')).toEqual(['Bright', 'Calm'])
    expect(choiceOptions({ list: 'Locations' }, lists, ['LRT', 'Old studio'])).toEqual(['Showroom', 'LRT', 'Old studio'])
    expect(choiceOptions({ list: 'Places' }, lists, undefined)).toEqual([])
  })

  it('a pick toggled — in the order the options run; an answer in words; two answers alike', () => {
    const order = ['Showroom', 'LRT', 'Highway']
    expect([togglePick([], 'LRT', order), togglePick(['LRT'], 'Showroom', order), togglePick(['Showroom', 'LRT'], 'LRT', order), togglePick(['Gone'], 'LRT', order)])
      .toEqual([['LRT'], ['Showroom', 'LRT'], ['Showroom'], ['LRT', 'Gone']])
    expect([answerWords(['Showroom', 'LRT']), answerWords('Calm'), answerWords(true), answerWords(undefined)]).toEqual(['Showroom, LRT', 'Calm', '', ''])
    expect([sameAnswer(['a', 'b'], ['a', 'b']), sameAnswer(['a', 'b'], ['b', 'a']), sameAnswer('a', ['a']), sameAnswer('a', 'a'), sameAnswer(undefined, [])])
      .toEqual([true, false, false, true, false])
  })
})
