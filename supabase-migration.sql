-- Run once in Supabase SQL Editor before enabling Shopify Communications.
alter table public.conversations add column if not exists shopify_customer_id text;
alter table public.conversations add column if not exists customer_email text;
alter table public.conversations add column if not exists unread_for_student boolean not null default false;
create unique index if not exists conversations_shopify_customer_id_uidx
  on public.conversations (shopify_customer_id)
  where shopify_customer_id is not null;
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);
