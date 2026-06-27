-- Company-wide saved layouts for configurable reports (e.g. the custom cash
-- flow: user-defined categories + which accounts roll up under each). One row
-- per report_key, shared across the company. JSONB so the whole layout is saved
-- atomically on each edit.
create table if not exists public.report_layouts (
  report_key  text primary key,
  layout      jsonb not null default '{}'::jsonb,
  updated_by  uuid references public.users(id),
  updated_at  timestamptz not null default now()
);

alter table public.report_layouts enable row level security;

drop policy if exists report_layouts_read on public.report_layouts;
create policy report_layouts_read on public.report_layouts
  for select using (current_user_role() in ('principal','finance'));

drop policy if exists report_layouts_write on public.report_layouts;
create policy report_layouts_write on public.report_layouts
  for all using (current_user_role() in ('principal','finance'))
  with check (current_user_role() in ('principal','finance'));
