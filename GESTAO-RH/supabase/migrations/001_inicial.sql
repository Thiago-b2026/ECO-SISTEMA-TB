-- =====================================================================
-- RH Compass 2.0 – multi-empresa
-- Aplicado no banco do ECO-SISTEMA-TB, schema rh (separado do public)
-- =====================================================================

-- Tudo fica no schema "rh" (pasta separada). O ECO-SISTEMA usa o "public".
-- Este arquivo NÃO altera nada do public nem gatilhos do ECO.
create schema if not exists rh;

-- ---------- Tipos ----------
do $$ begin
  create type rh.papel as enum ('owner', 'admin', 'operador');
exception when duplicate_object then null; end $$;

-- ---------- Tabelas ----------
create table if not exists rh.empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cnpj        text,
  pct_extras  numeric(6,2) not null default 5,    -- "Gastos Extras" (% sobre os itens)
  meta_otimo  numeric(6,2) not null default 8,    -- abaixo disso = ÓTIMO
  meta_alerta numeric(6,2) not null default 10,   -- a partir disso = ALERTA
  created_at  timestamptz not null default now()
);

create table if not exists rh.lojas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references rh.empresas(id) on delete cascade,
  codigo      text not null,          -- chave usada dentro do JSON dos lançamentos (loja1, loja2...)
  nome        text not null,
  ordem       int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (empresa_id, codigo)
);

create table if not exists rh.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text,
  email      text,
  created_at timestamptz not null default now()
);

create table if not exists rh.empresa_membros (
  empresa_id uuid not null references rh.empresas(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  papel      rh.papel not null default 'operador',
  created_at timestamptz not null default now(),
  primary key (empresa_id, user_id)
);

-- Mesmo formato do app antigo + empresa_id.
-- data = { "faturamento": {loja1: n, ...}, "items": [ {loja1: n, ...} x 13 ] }
create table if not exists rh.rh_entries (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references rh.empresas(id) on delete cascade,
  tab         text not null check (tab in ('provisao', 'realizado')),
  ano         int  not null check (ano between 2000 and 2100),
  mes         int  not null check (mes between 0 and 11),   -- 0 = janeiro (igual ao app antigo)
  data        jsonb not null default '{}'::jsonb,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (empresa_id, tab, ano, mes)
);
create index if not exists rh_entries_empresa_ano on rh.rh_entries (empresa_id, ano);

-- Histórico: toda alteração guarda o valor anterior (nada se perde)
create table if not exists rh.rh_entries_log (
  id           bigserial primary key,
  empresa_id   uuid not null references rh.empresas(id) on delete cascade,
  tab          text not null,
  ano          int  not null,
  mes          int  not null,
  data_antiga  jsonb,
  data_nova    jsonb,
  alterado_por uuid references auth.users(id) on delete set null,
  alterado_em  timestamptz not null default now()
);
create index if not exists rh_entries_log_empresa on rh.rh_entries_log (empresa_id, alterado_em desc);

-- ---------- Funções auxiliares (permissões) ----------
create or replace function rh.papel_em(e uuid)
returns rh.papel language sql stable security definer set search_path = rh, public as $$
  select papel from rh.empresa_membros where empresa_id = e and user_id = auth.uid()
$$;

create or replace function rh.is_membro(e uuid)
returns boolean language sql stable security definer set search_path = rh, public as $$
  select exists (select 1 from rh.empresa_membros where empresa_id = e and user_id = auth.uid())
$$;

create or replace function rh.is_gestor(e uuid)
returns boolean language sql stable security definer set search_path = rh, public as $$
  select exists (select 1 from rh.empresa_membros
                 where empresa_id = e and user_id = auth.uid() and papel in ('owner', 'admin'))
$$;

-- ---------- Gatilhos ----------
-- Cria o perfil quando um usuário é criado
-- Gatilho com nome próprio (rh_on_auth_user_created) para não substituir o do ECO.
-- Se der qualquer erro aqui, o cadastro do usuário continua (não trava o ECO).
create or replace function rh.handle_new_user()
returns trigger language plpgsql security definer set search_path = rh, public as $$
begin
  begin
    insert into rh.profiles (id, nome, email)
    values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
    on conflict (id) do nothing;
  exception when others then null;
  end;
  return new;
end $$;

drop trigger if exists rh_on_auth_user_created on auth.users;
create trigger rh_on_auth_user_created after insert on auth.users
  for each row execute function rh.handle_new_user();

-- Perfis dos usuários que já existem
insert into rh.profiles (id, nome, email)
select id, coalesce(raw_user_meta_data->>'nome', raw_user_meta_data->>'name', split_part(email, '@', 1)), email
from auth.users
on conflict (id) do nothing;

-- Grava histórico de lançamentos (só quando o conteúdo muda)
create or replace function rh.log_rh_entries()
returns trigger language plpgsql security definer set search_path = rh, public as $$
begin
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then
    return new;
  end if;
  insert into rh.rh_entries_log (empresa_id, tab, ano, mes, data_antiga, data_nova, alterado_por)
  values (new.empresa_id, new.tab, new.ano, new.mes,
          case when tg_op = 'UPDATE' then old.data end, new.data,
          coalesce(auth.uid(), new.updated_by));
  return new;
end $$;

drop trigger if exists rh_entries_log_trg on rh.rh_entries;
create trigger rh_entries_log_trg after insert or update on rh.rh_entries
  for each row execute function rh.log_rh_entries();

create or replace function rh.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists rh_entries_touch on rh.rh_entries;
create trigger rh_entries_touch before update on rh.rh_entries
  for each row execute function rh.touch_updated_at();

-- ---------- Cadastro de nova empresa (quem cria vira Dono) ----------
create or replace function rh.criar_empresa(p_nome text, p_cnpj text, p_lojas text[])
returns uuid language plpgsql security definer set search_path = rh, public as $$
declare
  v_id uuid;
  i int;
begin
  if auth.uid() is null then
    raise exception 'Faça login para cadastrar uma empresa';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome da empresa';
  end if;
  if p_lojas is null or array_length(p_lojas, 1) is null then
    p_lojas := array['Loja 1'];
  end if;

  insert into rh.empresas (nome, cnpj) values (trim(p_nome), nullif(trim(p_cnpj), ''))
  returning id into v_id;

  for i in 1 .. array_length(p_lojas, 1) loop
    insert into rh.lojas (empresa_id, codigo, nome, ordem)
    values (v_id, 'loja' || i, coalesce(nullif(trim(p_lojas[i]), ''), 'Loja ' || i), i);
  end loop;

  insert into rh.empresa_membros (empresa_id, user_id, papel) values (v_id, auth.uid(), 'owner');
  return v_id;
end $$;

-- Adiciona loja a uma empresa existente (gera o próximo código livre)
create or replace function rh.adicionar_loja(p_empresa uuid, p_nome text)
returns uuid language plpgsql security definer set search_path = rh, public as $$
declare
  v_n int;
  v_id uuid;
begin
  if not rh.is_gestor(p_empresa) then
    raise exception 'Sem permissão';
  end if;
  select coalesce(max(nullif(regexp_replace(codigo, '\D', '', 'g'), '')::int), 0) + 1
    into v_n from rh.lojas where empresa_id = p_empresa;
  insert into rh.lojas (empresa_id, codigo, nome, ordem)
  values (p_empresa, 'loja' || v_n, coalesce(nullif(trim(p_nome), ''), 'Loja ' || v_n), v_n)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- Segurança (RLS) ----------
alter table rh.empresas        enable row level security;
alter table rh.lojas           enable row level security;
alter table rh.profiles        enable row level security;
alter table rh.empresa_membros enable row level security;
alter table rh.rh_entries      enable row level security;
alter table rh.rh_entries_log  enable row level security;

drop policy if exists empresas_sel on rh.empresas;
create policy empresas_sel on rh.empresas for select using (rh.is_membro(id));
drop policy if exists empresas_upd on rh.empresas;
create policy empresas_upd on rh.empresas for update using (rh.is_gestor(id)) with check (rh.is_gestor(id));
drop policy if exists empresas_del on rh.empresas;
create policy empresas_del on rh.empresas for delete using (rh.papel_em(id) = 'owner');

drop policy if exists lojas_sel on rh.lojas;
create policy lojas_sel on rh.lojas for select using (rh.is_membro(empresa_id));
drop policy if exists lojas_upd on rh.lojas;
create policy lojas_upd on rh.lojas for update using (rh.is_gestor(empresa_id)) with check (rh.is_gestor(empresa_id));

drop policy if exists membros_sel on rh.empresa_membros;
create policy membros_sel on rh.empresa_membros for select using (rh.is_membro(empresa_id));

drop policy if exists profiles_sel on rh.profiles;
create policy profiles_sel on rh.profiles for select using (
  id = auth.uid() or exists (
    select 1 from rh.empresa_membros m
    where m.user_id = profiles.id and rh.is_membro(m.empresa_id)
  )
);
drop policy if exists profiles_upd on rh.profiles;
create policy profiles_upd on rh.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists rh_sel on rh.rh_entries;
create policy rh_sel on rh.rh_entries for select using (rh.is_membro(empresa_id));
drop policy if exists rh_ins on rh.rh_entries;
create policy rh_ins on rh.rh_entries for insert with check (rh.is_membro(empresa_id));
drop policy if exists rh_upd on rh.rh_entries;
create policy rh_upd on rh.rh_entries for update using (rh.is_membro(empresa_id)) with check (rh.is_membro(empresa_id));

drop policy if exists rhlog_sel on rh.rh_entries_log;
create policy rhlog_sel on rh.rh_entries_log for select using (rh.is_membro(empresa_id));

-- ---------- Tempo real ----------
do $$ begin
  alter publication supabase_realtime add table rh.rh_entries;
exception when duplicate_object then null; end $$;

-- ---------- Permissões de acesso ao schema rh (a RLS acima continua valendo) ----------
grant usage on schema rh to anon, authenticated, service_role;
grant all on all tables in schema rh to authenticated, service_role;
grant all on all sequences in schema rh to authenticated, service_role;
grant execute on all functions in schema rh to authenticated, service_role;
revoke execute on function rh.handle_new_user() from authenticated;
alter default privileges in schema rh grant all on tables to authenticated, service_role;
alter default privileges in schema rh grant all on sequences to authenticated, service_role;
alter default privileges in schema rh grant execute on functions to authenticated, service_role;
