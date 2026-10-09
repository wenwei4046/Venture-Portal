import { actionsFromKeys } from '@/lib/permission-actions'
import { sensitiveFromKeys } from '@/lib/sensitive'

/**
 * A mocked account as loadUser() answers it (2026-10-08, PR2): its keys, the
 * actions those keys allow — what `current_actions()` gives an account with no
 * permission template — and (PR4) the sensitive fields its kind sees. A mock
 * without `actions` may do nothing (canDo); one without `sensitive` sees ••••.
 */
export function withActions<T extends { permissions?: readonly string[]; role?: string }>(
  user: T,
): T & { actions: Record<string, 'own' | 'dept' | 'all'>; sensitive: Array<'salary' | 'nric' | 'bank'> } {
  return {
    ...user,
    actions: actionsFromKeys(user.permissions ?? [], user.role ?? 'staff'),
    sensitive: sensitiveFromKeys(user.permissions ?? [], user.role ?? 'staff'),
  }
}
