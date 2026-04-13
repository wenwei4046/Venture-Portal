import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10
const MAX_ATTEMPTS = 3
const LOCKOUT_SECONDS = 900 // 15 minutes

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  if (!hash || hash === '0' || hash === '') return false
  return bcrypt.compare(pin, hash)
}

export function isLockedOut(attempts: number, lockoutUntil: number): boolean {
  if (attempts < MAX_ATTEMPTS) return false
  return Date.now() / 1000 < lockoutUntil
}

export function getLockoutUntil(): number {
  return Math.floor(Date.now() / 1000) + LOCKOUT_SECONDS
}

export { MAX_ATTEMPTS, LOCKOUT_SECONDS }
