-- Desk policy tables. Run in the Supabase SQL editor for a hosted desk.
-- Access tokens stay OAuth bearer tokens. This file does not create API keys.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'none',
  subscription_status text not null default 'none',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.support_desks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approved_answers (
  id uuid primary key,
  desk_id uuid not null references public.support_desks (id) on delete cascade,
  topic text not null,
  question text not null,
  answer text not null,
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.refund_rules (
  id uuid primary key,
  desk_id uuid not null references public.support_desks (id) on delete cascade,
  name text not null,
  match_terms text[] not null check (cardinality(match_terms) >= 1),
  decision text not null check (decision in ('ALLOW', 'DENY')),
  remedy text not null,
  window_days integer check (window_days is null or (window_days >= 0 and window_days <= 3650)),
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.escalation_limits (
  id uuid primary key,
  desk_id uuid not null references public.support_desks (id) on delete cascade,
  name text not null,
  channel text not null,
  tier_ladder text[] not null check (cardinality(tier_ladder) >= 1),
  max_tier text not null,
  allow_refund_promise boolean not null default false,
  allow_feature_promise boolean not null default false,
  allow_timeline_promise boolean not null default false,
  notes text not null default '',
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.approved_commitments (
  id uuid primary key,
  desk_id uuid not null references public.support_desks (id) on delete cascade,
  kind text not null check (kind in ('FEATURE', 'TIMELINE')),
  name text not null,
  statement text not null,
  status text not null check (status in ('APPROVED', 'RETIRED')),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.desk_support_requests (
  id uuid primary key,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists approved_answers_identity on public.approved_answers (desk_id, lower(topic), lower(question));
create unique index if not exists refund_rules_identity on public.refund_rules (desk_id, lower(name));
create unique index if not exists escalation_limits_channel on public.escalation_limits (desk_id, lower(channel));
create unique index if not exists commitments_identity on public.approved_commitments (desk_id, kind, lower(name));

alter table public.profiles enable row level security;
alter table public.support_desks enable row level security;
alter table public.approved_answers enable row level security;
alter table public.refund_rules enable row level security;
alter table public.escalation_limits enable row level security;
alter table public.approved_commitments enable row level security;
alter table public.desk_support_requests enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());

create policy support_desks_owner on public.support_desks for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy approved_answers_owner on public.approved_answers for all to authenticated
  using (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()));

create policy refund_rules_owner on public.refund_rules for all to authenticated
  using (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()));

create policy escalation_limits_owner on public.escalation_limits for all to authenticated
  using (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()));

create policy commitments_owner on public.approved_commitments for all to authenticated
  using (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()));

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.support_desks to authenticated;
grant select, insert, update, delete on public.approved_answers to authenticated;
grant select, insert, update, delete on public.refund_rules to authenticated;
grant select, insert, update, delete on public.escalation_limits to authenticated;
grant select, insert, update, delete on public.approved_commitments to authenticated;

create or replace function public.handle_new_desk_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_desk on auth.users;
create trigger on_auth_user_created_desk
  after insert on auth.users
  for each row execute function public.handle_new_desk_user();
