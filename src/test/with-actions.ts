import { actionsFromKeys } from '@/lib/permission-actions'

/**
 * A mocked account as loadUser() answers it (2026-10-08, PR2): its keys, and
 * the actions those keys allow — what `current_actions()` gives an account with
 * no permission template. A mock without `actions` may do nothing (canDo).
 */
export function withActions<T extends { permissions?: readonly string[]; role?: string }>(user: T): T & { actions: Record<string, 'own' | 'dept' | 'all'> } {
  return { ...user, actions: actionsFromKeys(user.permissions ?? [], user.role ?? 'staff') }
}
