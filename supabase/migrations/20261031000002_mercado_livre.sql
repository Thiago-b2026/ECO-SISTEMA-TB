-- =====================================================================
-- Integração Mercado Livre: guarda a conexão OAuth da loja (1 conta)
-- Tokens ficam só no servidor: as tabelas têm RLS ligado e NENHUMA
-- policy, então o navegador não lê nem grava. Só as Edge Functions
-- (service_role) acessam. A tela consulta o status por ml_status().
-- =====================================================================

create table public.ml_conexao (
  id             smallint primary key default 1 check (id = 1),
  ml_user_id     bigint not null,
  ml_nickname    text,
  access_token   text not null,
  refresh_token  text not null,
  expires_at     timestamptz not null,
  scope          text,
  conectado_por  uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_ml_conexao_updated before update on public.ml_conexao
  for each row execute function public.set_updated_at();
alter table public.ml_conexao enable row level security;

-- Estado temporário do fluxo OAuth (state + PKCE), apagado no retorno
create table public.ml_oauth_estado (
  state          text primary key,
  code_verifier  text not null,
  user_id        uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now()
);
alter table public.ml_oauth_estado enable row level security;

-- Status da conexão para a tela (sem expor tokens)
create or replace function public.ml_status()
returns table (conectado boolean, ml_nickname text, ml_user_id bigint, atualizado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select true, c.ml_nickname, c.ml_user_id, c.updated_at
  from public.ml_conexao c
  where public.has_any_role(auth.uid(), array['admin','gerente','estoquista']::public.app_role[]);
$$;
revoke all on function public.ml_status() from public, anon;
grant execute on function public.ml_status() to authenticated;
