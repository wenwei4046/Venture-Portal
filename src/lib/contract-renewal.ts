/**
 * Renewing a contract (2026-10-24 — the user: "如果是加一个 renew button 的话，流程是这样：当它已经 expired 之后，到时候按一下
 * renew，就可以再选一次是几个月，对不对？同时要 attach 一个新的 contract"). On the person's page the contract's line offers
 * Renew: the new contract's first day — the day after the old one ends, unless HR picks another (a late renewal may
 * start the day it is signed) — its period from the contract periods again, and the new contract itself, filed to their
 * Data center record as it is renewed (`renewContract`, team/people/contract-actions.ts). The database then counts the
 * end from that day (`contract_start`, mig 20261025052000), so both reminders come again before the new end.
 *
 * Pure, so the form and the server ask one set of rules.
 */
import { CONTRACT_MONTH_CHOICES, DEFAULT_CONTRACT_MONTHS, contractEnd, dayAfter, dayLabel, daysFrom, isDay } from './employment-status'

/** The letter type Renew's new contract starts on: the one whose name says contract, when exactly one does. */
export const RENEWAL_LETTER_TYPE = /contract/i

/** The contract they are on now, as the database keeps it: its first day (the hire date until renewed), months, last day. */
export interface ContractNow {
  startsOn: string | null
  months: number | null
  endsOn: string | null
}

/** Where a renewal starts unless HR picks another day: the day after the contract's end. */
export function renewalStart(endsOn: string | null | undefined): string | null {
  return endsOn && isDay(endsOn) ? dayAfter(endsOn) : null
}

/** The period the form starts on: theirs, when it is one of the contract periods — else 12 months. */
export function renewalMonths(months: number | null | undefined): number {
  return months && (CONTRACT_MONTH_CHOICES as readonly number[]).includes(months) ? months : DEFAULT_CONTRACT_MONTHS
}

/**
 * A renewal checked against the contract it replaces — null when it may be written, else why not, in words for the
 * screen: a period from the list, a real first day after the current contract's, and an end after its end.
 */
export function renewalRefusal(now: ContractNow, start: string, months: number): string | null {
  if (!(CONTRACT_MONTH_CHOICES as readonly number[]).includes(months)) return "Pick the new contract's period."
  if (!isDay(start)) return 'Pick the day the new contract starts.'
  if (!now.startsOn || !now.endsOn) return 'Their contract has no end yet — fill in the hire date first.'
  if (daysFrom(now.startsOn, start) <= 0) return `The new contract starts after this one did (${dayLabel(now.startsOn)}).`
  const ends = contractEnd(start, months)
  if (!ends || daysFrom(now.endsOn, ends) <= 0) return `The new contract has to end after this one does (${dayLabel(now.endsOn)}).`
  return null
}
