-- ESBOÇO das partes do banco ECO-SISTEMA-TB de que o schema checklist depende.
-- Só para os testes (PGlite). Em produção estas coisas JÁ existem e NÃO são recriadas.
-- Colunas, chaves e políticas copiadas das migrations do GESTAO SALVADOS (0004, 0005, 0017, 0018).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub', '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.admins_stub (user_id uuid primary key);
create or replace function public.is_admin() returns boolean language sql stable security definer as $$
  select exists (select 1 from public.admins_stub where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to authenticated, service_role;

-- empresas (redes) e unidades (lojas)
create table public.redes (
  id uuid primary key default gen_random_uuid(), nome text not null unique, ordem int not null default 0,
  ativo boolean not null default true, created_at timestamptz not null default now()
);
alter table public.redes enable row level security;
create policy "redes: logados leem" on public.redes for select to authenticated using (true);
create policy "redes: admin grava" on public.redes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.lojas (
  id uuid primary key default gen_random_uuid(), nome text not null unique, codigo text, ativo boolean not null default true,
  cnpj text unique check (cnpj is null or cnpj ~ '^\d{14}$'),
  rede_id uuid references public.redes(id),
  tipo text generated always as (
    case when cnpj ~ '^[0-9]{14}$' then case when substr(cnpj, 9, 4) = '0001' then 'matriz' else 'filial' end end
  ) stored,
  sistemas text[] not null default array['checklist']
);
alter table public.lojas enable row level security;
create policy "lojas: ler" on public.lojas for select to authenticated using (true);
create policy "lojas: admin cria" on public.lojas for insert to authenticated with check (public.is_admin());
create policy "lojas: admin edita" on public.lojas for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- catálogo de sistemas, grupos, telas e ações + permissões (as migrations 0023/0024 do PDV rodam por cima)
create table public.sistemas (codigo text primary key, nome text not null, url text, ordem int not null default 0, ativo boolean not null default true);
insert into public.sistemas (codigo, nome, ordem, ativo) values ('pdv', 'PDV Salvados', 10, true), ('checklist', 'Check List Operacional', 40, false);
create table public.grupos (sistema text not null references public.sistemas(codigo), codigo text not null, nome text not null, ordem int not null default 0, primary key (sistema, codigo));
create table public.telas (
  codigo text primary key, nome text not null, app text not null references public.sistemas(codigo), grupo text not null,
  rota text not null, ordem int not null default 0, ativo boolean not null default true, somente_admin boolean not null default false
);
create table public.acoes (codigo text primary key, nome text not null, ordem int not null default 0, especial boolean not null default false);
insert into public.acoes (codigo, nome) values ('ver', 'Ver'), ('inserir', 'Inserir'), ('editar', 'Editar'), ('excluir', 'Excluir'), ('exportar', 'Exportar');
create table public.tela_acoes (tela_codigo text not null references public.telas(codigo), acao text not null references public.acoes(codigo), primary key (tela_codigo, acao));
create table public.usuario_telas (
  user_id uuid not null references auth.users(id), tela_codigo text not null references public.telas(codigo),
  permitido boolean not null default false, primary key (user_id, tela_codigo)
);
create table public.usuario_permissoes (
  user_id uuid not null references auth.users(id), unidade_id uuid not null references public.lojas(id),
  tela_codigo text not null, acao text not null, permitido boolean not null default false,
  primary key (user_id, unidade_id, tela_codigo, acao)
);
alter table public.usuario_telas enable row level security;
alter table public.usuario_permissoes enable row level security;
create policy "utelas: minhas ou admin" on public.usuario_telas for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "utelas: admin grava" on public.usuario_telas for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "uperm: minhas ou admin" on public.usuario_permissoes for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "uperm: admin grava" on public.usuario_permissoes for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update on public.redes, public.lojas to authenticated;
grant select on public.sistemas, public.grupos, public.telas, public.acoes, public.tela_acoes to authenticated;
grant select, insert, update on public.usuario_telas, public.usuario_permissoes to authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;
