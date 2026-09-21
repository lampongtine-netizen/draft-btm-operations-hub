-- Additive migration only. Review in a Supabase branch before production.
create schema if not exists private;

create or replace function private.is_btm_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function private.is_btm_staff() from public, anon;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_btm_staff() to authenticated;

-- Move existing table authorization to the private helper so the privileged
-- function cannot be called through the public Data API as an RPC endpoint.
drop policy if exists "admins only - admins" on public.admins;
drop policy if exists btm_staff_all_admins on public.admins;
create policy btm_staff_all_admins on public.admins for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));

drop policy if exists "admins only - students" on public.students;
drop policy if exists btm_staff_all_students on public.students;
create policy btm_staff_all_students on public.students for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));

drop policy if exists "admins only - tasks" on public.tasks;
drop policy if exists btm_staff_all_tasks on public.tasks;
create policy btm_staff_all_tasks on public.tasks for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));

drop policy if exists "admins only - activity_log" on public.activity_log;
drop policy if exists btm_staff_all_activity_log on public.activity_log;
create policy btm_staff_all_activity_log on public.activity_log for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));

drop policy if exists "admins only - conversations" on public.conversations;
drop policy if exists btm_staff_all_conversations on public.conversations;
create policy btm_staff_all_conversations on public.conversations for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));

drop policy if exists "admins only - messages" on public.messages;
drop policy if exists btm_staff_all_messages on public.messages;
create policy btm_staff_all_messages on public.messages for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));

drop policy if exists "admins only - notes" on public.notes;
drop policy if exists btm_staff_all_notes on public.notes;
create policy btm_staff_all_notes on public.notes for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));

drop policy if exists "admins only - support_plan_goals" on public.support_plan_goals;
drop policy if exists btm_staff_all_support_plan_goals on public.support_plan_goals;
create policy btm_staff_all_support_plan_goals on public.support_plan_goals for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));

drop function if exists public.is_current_user_admin();

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  cadence text not null default 'Weekly' check (cadence in ('Daily','Weekly','Monthly')),
  status text not null default 'Submitted' check (status in ('Submitted','Reviewed','Overdue')),
  checkin_date date not null default current_date,
  note text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 240),
  student_id uuid references public.students(id) on delete set null,
  owner_id uuid references public.admins(id) on delete set null,
  status text not null default 'Pending' check (status in ('Pending','Approved','Changes Requested')),
  due_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checkins_student_date_idx on public.checkins(student_id,checkin_date desc);
create index if not exists approvals_status_due_idx on public.approvals(status,due_date);
create index if not exists approvals_student_idx on public.approvals(student_id);
create index if not exists approvals_owner_idx on public.approvals(owner_id);

alter table public.checkins enable row level security;
alter table public.approvals enable row level security;

drop policy if exists btm_staff_all_checkins on public.checkins;
create policy btm_staff_all_checkins on public.checkins
for all to authenticated
using ((select private.is_btm_staff()))
with check ((select private.is_btm_staff()));

drop policy if exists btm_staff_all_approvals on public.approvals;
create policy btm_staff_all_approvals on public.approvals
for all to authenticated
using ((select private.is_btm_staff()))
with check ((select private.is_btm_staff()));

grant select,insert,update,delete on public.checkins to authenticated;
grant select,insert,update,delete on public.approvals to authenticated;
revoke all on public.checkins from anon;
revoke all on public.approvals from anon;
