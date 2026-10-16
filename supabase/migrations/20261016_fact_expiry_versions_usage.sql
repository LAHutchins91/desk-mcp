-- Additive only: nullable columns and new tables. No existing row or column changes.
alter table public.approved_answers add column if not exists expires_at timestamptz;
alter table public.refund_rules add column if not exists expires_at timestamptz;
alter table public.escalation_limits add column if not exists expires_at timestamptz;
alter table public.approved_commitments add column if not exists expires_at timestamptz;

create table if not exists public.desk_fact_versions (
  id bigint generated always as identity primary key,
  desk_id uuid not null references public.support_desks (id) on delete cascade,
  fact_type text not null check (fact_type in ('answer', 'refund_rule', 'escalation_limit', 'commitment')),
  fact_id uuid not null,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  replaced_at timestamptz not null default now()
);
create index if not exists desk_fact_versions_fact on public.desk_fact_versions (desk_id, fact_id, revision desc);

create table if not exists public.desk_fact_usage (
  id bigint generated always as identity primary key,
  desk_id uuid not null references public.support_desks (id) on delete cascade,
  tool text not null,
  fact_type text not null check (fact_type in ('answer', 'refund_rule', 'escalation_limit', 'commitment')),
  fact_id uuid not null,
  revision integer not null,
  stale boolean not null default false,
  used_at timestamptz not null default now()
);
create index if not exists desk_fact_usage_desk on public.desk_fact_usage (desk_id, used_at desc);
create index if not exists desk_fact_usage_fact on public.desk_fact_usage (desk_id, fact_id, used_at desc);

alter table public.desk_fact_versions enable row level security;
alter table public.desk_fact_usage enable row level security;

drop policy if exists desk_fact_versions_owner on public.desk_fact_versions;
create policy desk_fact_versions_owner on public.desk_fact_versions for all to authenticated
  using (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()));
drop policy if exists desk_fact_usage_owner on public.desk_fact_usage;
create policy desk_fact_usage_owner on public.desk_fact_usage for all to authenticated
  using (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.support_desks d where d.id = desk_id and d.owner_id = auth.uid()));

grant select, insert on public.desk_fact_versions to authenticated;
grant select, insert on public.desk_fact_usage to authenticated;
