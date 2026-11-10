-- ESBOÇO das partes do banco ECO-SISTEMA-TB de que o schema checklist depende.
-- Só para os testes (PGlite). Em produção estas coisas JÁ existem e NÃO são recriadas.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'sub', '')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

create table public.lojas (id uuid primary key default gen_random_uuid(), nome text not null, ativo boolean not null default true,
  sistemas text[] not null default array['checklist']);
create table public.admins_stub (user_id uuid primary key);
create or replace function public.is_admin() returns boolean language sql stable security definer as $$
  select exists (select 1 from public.admins_stub where user_id = auth.uid());
$$;
grant select on public.lojas to authenticated;
grant execute on function public.is_admin() to authenticated;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;
