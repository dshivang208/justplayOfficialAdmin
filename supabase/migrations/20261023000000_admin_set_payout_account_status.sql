-- Lets a Super Admin manually verify (or fail / reset) a venue's payout account.
-- Needed while Cashfree isn't configured: the save-beneficiary function then
-- leaves every account 'pending' forever. Super Admin only, and audit logged
-- (without the bank details themselves).
create or replace function public.admin_set_payout_account_status(
  p_venue_id uuid,
  p_status   text
)
returns public.payout_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.payout_accounts;
begin
  if not public.is_super_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_status not in ('verified', 'failed', 'pending') then
    raise exception 'INVALID_STATUS';
  end if;

  update public.payout_accounts
  set verification_status = p_status, updated_at = now()
  where venue_id = p_venue_id
  returning * into v_account;

  if v_account.id is null then
    raise exception 'PAYOUT_ACCOUNT_NOT_FOUND';
  end if;

  insert into public.admin_audit_log (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'payout_account.set_status', 'payout_accounts', v_account.id::text,
          jsonb_build_object('venue_id', p_venue_id, 'status', p_status, 'method', v_account.method));

  return v_account;
end;
$$;

revoke all on function public.admin_set_payout_account_status(uuid, text) from public, anon;
grant execute on function public.admin_set_payout_account_status(uuid, text) to authenticated;
