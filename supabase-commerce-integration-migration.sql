-- Additive commerce/integration schema. Existing operational rows are preserved.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  external_event_id text not null unique,
  event_type text not null,
  student_id uuid references public.students(id) on delete set null,
  shopify_customer_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  payment_status text,
  subscription_status text,
  access_active boolean not null default false,
  amount numeric,
  currency text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.access_entitlements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  program text not null,
  level text,
  source text not null default 'shopify',
  source_reference text not null,
  status text not null default 'active' check (status in ('active','paused','cancelled','expired','pending')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id,source,source_reference,program)
);

create table if not exists public.submission_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  checkin_id uuid references public.checkins(id) on delete set null,
  provider text not null check (provider in ('supabase','google_drive','shopify','external')),
  storage_path text,
  external_url text,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists payment_events_student_created_idx on public.payment_events(student_id,created_at desc);
create index if not exists payment_events_shopify_idx on public.payment_events(shopify_customer_id);
create index if not exists access_entitlements_student_status_idx on public.access_entitlements(student_id,status);
create index if not exists submission_documents_student_idx on public.submission_documents(student_id,created_at desc);

alter table public.payment_events enable row level security;
alter table public.access_entitlements enable row level security;
alter table public.submission_documents enable row level security;

drop policy if exists btm_staff_all_payment_events on public.payment_events;
create policy btm_staff_all_payment_events on public.payment_events for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));
drop policy if exists btm_staff_all_access_entitlements on public.access_entitlements;
create policy btm_staff_all_access_entitlements on public.access_entitlements for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));
drop policy if exists btm_staff_all_submission_documents on public.submission_documents;
create policy btm_staff_all_submission_documents on public.submission_documents for all to authenticated
using ((select private.is_btm_staff())) with check ((select private.is_btm_staff()));

grant select,insert,update,delete on public.payment_events,public.access_entitlements,public.submission_documents to authenticated;
revoke all on public.payment_events,public.access_entitlements,public.submission_documents from anon;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('student-submissions','student-submissions',false,10485760,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists btm_staff_read_student_submissions on storage.objects;
create policy btm_staff_read_student_submissions on storage.objects for select to authenticated
using (bucket_id='student-submissions' and (select private.is_btm_staff()));
