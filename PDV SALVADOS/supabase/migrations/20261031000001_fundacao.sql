-- =====================================================================
-- Fase 0 — Fundação: perfis de usuário, papéis e segurança (RLS)
-- =====================================================================

-- Papéis do sistema (um por usuário)
create type public.app_role as enum ('admin', 'gerente', 'vendedor', 'estoquista');

-- ---------------------------------------------------------------------
-- Função utilitária: atualiza updated_at em qualquer tabela
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- PROFILES — dados do usuário (1:1 com auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text not null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------
-- USER_ROLES — papel de cada usuário (tabela separada por segurança:
-- o usuário nunca consegue mudar o próprio papel)
-- ---------------------------------------------------------------------
create table public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  role        public.app_role not null,
  created_at  timestamptz not null default now()
);
alter table public.user_roles enable row level security;

-- ---------------------------------------------------------------------
-- Funções de checagem de papel (SECURITY DEFINER evita recursão no RLS)
-- ---------------------------------------------------------------------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = any(_roles));
$$;

-- Atalhos usados nas políticas
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin');
$$;

create or replace function public.is_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(auth.uid(), array['admin','gerente']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------
-- Novo usuário: cria o profile. O PRIMEIRO usuário do sistema vira admin.
-- Os demais ficam sem papel até o admin liberar (tela Usuários).
-- Não há senha no código: o primeiro admin é criado pelo painel do Supabase.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;

  -- trava para dois cadastros simultâneos não virarem admin juntos
  perform pg_advisory_xact_lock(hashtext('primeiro_admin'));
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- RLS — PROFILES
-- ---------------------------------------------------------------------
-- Todos os logados veem nome/e-mail dos colegas (necessário p/ escolher vendedor no PDV)
create policy "profiles: logados leem" on public.profiles
  for select to authenticated using (true);
-- Cada um edita o próprio nome; admin edita qualquer um
create policy "profiles: editar próprio ou admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "profiles: admin exclui" on public.profiles
  for delete to authenticated using (public.is_admin());

-- Usuário comum não pode se desativar nem mudar o e-mail pela API
create or replace function public.profiles_protect_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.ativo := old.ativo;
    new.email := old.email;
  end if;
  return new;
end;
$$;
create trigger trg_profiles_protect before update on public.profiles
  for each row execute function public.profiles_protect_columns();

-- ---------------------------------------------------------------------
-- RLS — USER_ROLES
-- ---------------------------------------------------------------------
create policy "roles: logados leem" on public.user_roles
  for select to authenticated using (true);
create policy "roles: só admin altera" on public.user_roles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Permissões de acesso às tabelas (o RLS acima filtra as linhas)
-- ---------------------------------------------------------------------
grant select, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
revoke all on public.profiles, public.user_roles from anon;
