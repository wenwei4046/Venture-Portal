import "server-only";

import { isPrincipalAccount, type MaskableUser } from "@/lib/view-as";
import type { MemberReadContext } from "./types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** App boundary only; each authenticated RPC independently authorizes stored identity and membership. */
export function principalReadContext(user: MaskableUser, context?: Partial<MemberReadContext>, departmentOnly = false): boolean {
  const principal = isPrincipalAccount(user);
  if (context !== undefined) {
    if (!principal) throw new Error("Only Principal can select another member to view.");
    if (!context || (!departmentOnly && (typeof context.staffId !== "string" || !uuid.test(context.staffId)))
      || typeof context.subDepartmentId !== "string" || !uuid.test(context.subDepartmentId)) {
      throw new Error("Choose a valid member and department.");
    }
  } else if (principal) {
    throw new Error("Choose a member to view this feature.");
  }
  return principal;
}
