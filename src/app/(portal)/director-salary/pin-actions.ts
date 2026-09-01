'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { verifyPin, isLockedOut, getLockoutUntil, hashPin, MAX_ATTEMPTS } from '@/lib/director-pin'

const PIN_COOKIE = 'director_pin_verified'
const PIN_SESSION_TTL = 300 // 5 minutes

export async function verifyDirectorPin(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('treasury')
  const supabase = await createClient()

  const pin = (formData.get('pin') as string) ?? ''
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, error: 'PIN must be exactly 6 digits' }
  }

  // Read lockout state
  const { data: configs } = await supabase
    .from('treasury_config')
    .select('config_key, config_value, description')
    .in('config_key', ['director_pin_hash', 'director_pin_attempts', 'director_pin_lockout_until'])

  const configMap = new Map((configs ?? []).map(c => [c.config_key, c]))
  const storedHash = configMap.get('director_pin_hash')?.description ?? ''
  const attempts = Number(configMap.get('director_pin_attempts')?.config_value ?? 0)
  const lockoutUntil = Number(configMap.get('director_pin_lockout_until')?.config_value ?? 0)

  if (isLockedOut(attempts, lockoutUntil)) {
    const remainingMin = Math.ceil((lockoutUntil - Date.now() / 1000) / 60)
    return { ok: false, error: `Too many attempts. Locked for ${remainingMin} more minute(s).` }
  }

  if (!storedHash || storedHash === '0' || storedHash === '') {
    return { ok: false, error: 'Director PIN not set. Ask Principal to configure in Settings > Directors.' }
  }

  const valid = await verifyPin(pin, storedHash)

  if (!valid) {
    const newAttempts = attempts + 1
    await supabase.from('treasury_config').update({ config_value: newAttempts }).eq('config_key', 'director_pin_attempts')
    if (newAttempts >= MAX_ATTEMPTS) {
      await supabase.from('treasury_config').update({ config_value: getLockoutUntil() }).eq('config_key', 'director_pin_lockout_until')
      return { ok: false, error: 'Incorrect PIN. Locked for 15 minutes.' }
    }
    return { ok: false, error: `Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt(s) remaining.` }
  }

  // Success
  await supabase.from('treasury_config').update({ config_value: 0 }).eq('config_key', 'director_pin_attempts')
  await supabase.from('treasury_config').update({ config_value: 0 }).eq('config_key', 'director_pin_lockout_until')

  const cookieStore = await cookies()
  cookieStore.set(PIN_COOKIE, 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: PIN_SESSION_TTL,
    path: '/',
    sameSite: 'lax',
  })

  return { ok: true }
}

export async function isDirectorPinVerified(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get(PIN_COOKIE)?.value === 'true'
}

export async function setDirectorPin(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('settings')
  const supabase = await createClient()

  const pin = (formData.get('pin') as string) ?? ''
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, error: 'PIN must be exactly 6 digits' }
  }

  const hash = await hashPin(pin)
  const { error } = await supabase
    .from('treasury_config')
    .update({ description: hash })
    .eq('config_key', 'director_pin_hash')

  if (error) return { ok: false, error: `Failed: ${error.message}` }

  await supabase.from('treasury_config').update({ config_value: 0 }).eq('config_key', 'director_pin_attempts')
  await supabase.from('treasury_config').update({ config_value: 0 }).eq('config_key', 'director_pin_lockout_until')

  return { ok: true }
}
