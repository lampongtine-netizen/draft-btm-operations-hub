-- BTM Operations HQ messaging backend
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  role text not null default 'Operations',
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  shopify_customer_id text unique not null,
  customer_name text not null,
  customer_email text,
  status text not null default 'open' check (status in ('open','pending','closed')),
  assigned_to uuid references public.admins(id) on delete set null,
  unread_for_admin boolean not null default false,
  unread_for_student boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('student','admin')),
  sender_name text not null,
  body text not null,
  attachment_url text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists conversations_updated_at_idx on public.conversations(updated_at desc);
create index if not exists conversations_status_idx on public.conversations(status);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at asc);

-- Server-side API uses the Supabase service-role key, so these tables are intentionally
-- not exposed directly to the browser. Keep the service-role key in Vercel only.

insert into public.admins (name, email, role)
values ('Christine', 'CHANGE-ME@example.com', 'Operations')
on conflict (email) do nothing;

-- Optional demo conversations. Replace the customer IDs before production.
with c as (
  insert into public.conversations (shopify_customer_id, customer_name, customer_email, status, unread_for_admin)
  values
    ('demo-c1','Sarah Whitfield','sarah@example.com','open',true),
    ('demo-c2','Jessica Ann Reyes','jessica@example.com','open',true),
    ('demo-c3','Emma Delacroix','emma@example.com','pending',false)
  on conflict (shopify_customer_id) do update set customer_name=excluded.customer_name
  returning id, shopify_customer_id
)
insert into public.messages (conversation_id, sender_type, sender_name, body)
select c.id, 'student', c.customer_name,
  case c.shopify_customer_id
    when 'demo-c1' then 'Hi! Just submitted my business audit — how long until I hear back on my support plan?'
    when 'demo-c2' then 'I logged in but I don’t see where to fill out the business audit — is that live yet?'
    else 'My card got declined again — can you check what’s going on with my subscription?'
  end
from c
where not exists (select 1 from public.messages m where m.conversation_id=c.id);
