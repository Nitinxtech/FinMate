-- Phase 1: Auth-bound financial profile onboarding with RLS.

create extension if not exists "pgcrypto";

create table if not exists public.financial_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  onboarding_step text not null default 'country_currency',
  onboarding_completed boolean not null default false,
  country_code text,
  currency_code text,
  employment_type text,
  ctc_annual numeric(14,2),
  ctc_components jsonb not null default '[]'::jsonb,
  monthly_gross_salary numeric(14,2),
  monthly_deductions jsonb not null default '[]'::jsonb,
  monthly_take_home_salary numeric(14,2),
  monthly_expenses jsonb not null default '[]'::jsonb,
  monthly_savings_target numeric(14,2),
  debts jsonb not null default '[]'::jsonb,
  insurances jsonb not null default '[]'::jsonb,
  investments jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  derived_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id),
  check (onboarding_step in ('country_currency', 'employment', 'monthly_compensation', 'financial_snapshot', 'review')),
  check (ctc_annual is null or ctc_annual >= 0),
  check (monthly_gross_salary is null or monthly_gross_salary >= 0),
  check (monthly_take_home_salary is null or monthly_take_home_salary >= 0),
  check (monthly_savings_target is null or monthly_savings_target >= 0)
);

create index if not exists financial_profiles_user_id_idx on public.financial_profiles(user_id);

create or replace function public.set_financial_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists financial_profiles_set_updated_at on public.financial_profiles;
create trigger financial_profiles_set_updated_at
before update on public.financial_profiles
for each row
execute function public.set_financial_profiles_updated_at();

alter table public.financial_profiles enable row level security;

create policy "profiles_select_own"
on public.financial_profiles
for select
using (auth.uid() = user_id);

create policy "profiles_insert_own"
on public.financial_profiles
for insert
with check (auth.uid() = user_id);

create policy "profiles_update_own"
on public.financial_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "profiles_delete_own"
on public.financial_profiles
for delete
using (auth.uid() = user_id);
