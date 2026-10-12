-- NEXAINDO schema: jalankan di Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Admin NEXAINDO',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  monthly_price bigint not null check (monthly_price > 0),
  speed_mbps integer,
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique,
  full_name text not null,
  phone text,
  address text,
  plan_name text not null default '10 Mbps',
  plan_id uuid references public.plans(id) on delete set null,
  monthly_price bigint not null check (monthly_price > 0),
  connection_status text not null default 'offline' check (connection_status in ('active','offline','suspended')),
  is_active boolean not null default true,
  billing_day integer not null default 1 check (billing_day = 1),
  started_on date not null default current_date,
  ended_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  period date not null, -- selalu tanggal 1 pada bulan tagihan
  amount bigint not null check (amount > 0), -- harga disalin saat tagihan dibuat
  due_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','void')),
  description text not null default 'Langganan internet bulanan',
  created_at timestamptz not null default now(),
  unique (customer_id, period),
  check (extract(day from period) = 1)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount bigint not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text not null default 'transfer' check (method in ('transfer','cash','ewallet','other')),
  reference text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoices_period_idx on public.invoices(period);
create index if not exists invoices_status_due_idx on public.invoices(status, due_date);
create index if not exists payments_paid_at_idx on public.payments(paid_at);
create index if not exists customers_name_idx on public.customers(full_name);

-- Membuat profil admin ketika akun Auth dibuat.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Admin NEXAINDO'))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Update timestamp pelanggan.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();

-- Status invoice mengikuti jumlah pembayaran yang tercatat.
create or replace function public.refresh_invoice_status(target_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare invoice_amount bigint; paid_amount bigint; current_status text;
begin
  select amount, status into invoice_amount, current_status from public.invoices where id = target_invoice;
  if not found or current_status = 'void' then return; end if;
  select coalesce(sum(amount),0) into paid_amount from public.payments where invoice_id = target_invoice;
  update public.invoices set status = case when paid_amount <= 0 then 'unpaid' when paid_amount < invoice_amount then 'partial' else 'paid' end where id = target_invoice;
end; $$;
create or replace function public.payment_refresh_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_invoice_status(old.invoice_id);
    return old;
  else
    perform public.refresh_invoice_status(new.invoice_id);
    return new;
  end if;
end; $$;
drop trigger if exists payments_refresh_invoice on public.payments;
create trigger payments_refresh_invoice after insert or update or delete on public.payments
for each row execute function public.payment_refresh_invoice();

-- Jalankan manual untuk membuat tagihan bulan tertentu, contoh: select public.generate_monthly_invoices('2026-10-01');
-- Aman dijalankan ulang: unique(customer_id, period) mencegah tagihan ganda.
create or replace function public.generate_monthly_invoices(target_period date default date_trunc('month', now() at time zone 'Asia/Jakarta')::date)
returns integer language plpgsql security definer set search_path = public as $$
declare period_start date := date_trunc('month', target_period)::date; inserted_count integer;
begin
  if target_period <> period_start then raise exception 'target_period harus tanggal 1 pada bulan yang dipilih'; end if;
  insert into public.invoices (customer_id, period, amount, due_date, description)
  select c.id, period_start, c.monthly_price, period_start, 'Langganan internet - ' || to_char(period_start, 'TMMonth YYYY')
  from public.customers c
  where c.is_active = true
    and c.started_on <= (period_start + interval '1 month - 1 day')::date
    and (c.ended_on is null or c.ended_on >= period_start)
  on conflict (customer_id, period) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end; $$;

-- Aktifkan RLS. Semua tabel operasional hanya dapat diakses pengguna yang sudah login.
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.customers enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;

drop policy if exists "profiles_read_authenticated" on public.profiles;
create policy "profiles_read_own_or_admin" on public.profiles for select to authenticated
using (id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
drop policy if exists "plans_authenticated_all" on public.plans;
create policy "plans_admin_all" on public.plans for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
drop policy if exists "customers_authenticated_all" on public.customers;
create policy "customers_admin_all" on public.customers for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
drop policy if exists "invoices_authenticated_all" on public.invoices;
create policy "invoices_admin_all" on public.invoices for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
drop policy if exists "payments_authenticated_all" on public.payments;
create policy "payments_admin_all" on public.payments for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

insert into public.plans (name, monthly_price, speed_mbps) values
  ('10 Mbps', 150000, 10), ('20 Mbps', 200000, 20), ('30 Mbps', 250000, 30)
on conflict (name) do nothing;

-- Penting: jangan gunakan service_role key di browser. Buat akun admin, lalu set profiles.is_admin = true untuk UUID akun tersebut. Kebijakan operasional hanya mengizinkan profil admin.
