-- Atomic, RLS-proof bank cache bump. Root cause (2026-06-10): JS-side
-- `bank_accounts.update(current_balance)` from Finance-role Server Actions is
-- silently blocked by RLS (UPDATE policy is principal-only; PostgREST returns
-- success with 0 rows). recordRepayment / voidPaidReceipt drift the cache vs GL
-- every time Finance records a repayment or voids a receipt.
-- SECURITY DEFINER bypasses RLS; guard allows finance + principal only
-- (null-safe: a missing/inactive users row must NOT fail open).
-- Atomic `current_balance + delta` also removes the read-modify-write race
-- the old JS pattern had.
-- (Applied via MCP apply_migration on 2026-06-10; file kept for repo parity.)

create or replace function bump_bank_balance(p_bank_account_id uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_new numeric;
begin
  v_role := current_user_role();
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'bump_bank_balance: unauthorized role %', coalesce(v_role::text, 'none')
      using errcode = 'insufficient_privilege';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'bump_bank_balance: delta must be a non-zero number';
  end if;

  update bank_accounts
  set current_balance = round(current_balance + p_delta, 2)
  where id = p_bank_account_id
  returning current_balance into v_new;

  if not found then
    raise exception 'bump_bank_balance: bank account % not found', p_bank_account_id;
  end if;

  return v_new;
end $$;

grant execute on function bump_bank_balance(uuid, numeric) to authenticated;
