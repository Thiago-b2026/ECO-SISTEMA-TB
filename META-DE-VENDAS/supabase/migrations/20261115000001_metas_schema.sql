-- =====================================================================================
-- META DE VENDAS E PREMIAÇÃO – schema "metas" (Ecossistema TB, código do sistema `metas`)
-- Banco: Supabase ECO-SISTEMA-TB (blqgmueqsqqpflorusrm). NÃO APLICAR sem OK do usuário.
--
-- Vem do app Lovable "Sales Champion", adaptado às regras do ecossistema:
--   * unidades = public.lojas (cadastro do Portal); NÃO cria tabela de lojas própria;
--   * sem user_roles / has_role: quem pode o quê vem das permissões por unidade
--     (public.pode(tela, ação, unidade) e public.minhas_unidades('metas'));
--   * sem gatilho em auth.users: quem cria login é só o admin (Edge Function admin-usuarios).
--
-- Telas e ações usadas aqui (o catálogo entra numa migration do GESTAO SALVADOS, etapa 3):
--   metas.dashboard        ver
--   metas.lancamentos      ver, inserir, editar, excluir   (lançar o resultado de qualquer vendedor)
--   metas.ranking          ver
--   metas.meu_desempenho   ver, editar                     (editar = o vendedor lança o PRÓPRIO resultado)
--   metas.historico        ver, exportar
--   metas.vendedores       ver, inserir, editar
--   metas.configuracao     ver, editar, fechar_mes         (meta do mês; fechar e reabrir o mês)
--
-- Regras:
--   * quem tem alguma tela do sistema liberada numa unidade vê os dados daquela unidade (o ranking
--     mostra todos os vendedores da loja, como no Lovable); o vendedor sempre vê o próprio cadastro;
--   * mês fechado bloqueia lançamentos e a meta daquela unidade/mês, para TODOS (inclusive admin):
--     é preciso reabrir o mês antes;
--   * o lançamento guarda a unidade do vendedor no momento do lançamento (o histórico não muda se o
--     vendedor trocar de loja);
--   * vendedor não é apagado: é inativado (os lançamentos ficam no histórico).
-- Idempotente: pode rodar de novo sem apagar dados.
-- =====================================================================================

create schema if not exists metas;
grant usage on schema metas to authenticated, service_role;

-- ---------- funções de apoio ----------
create or replace function metas._set_updated_at()
returns trigger language plpgsql set search_path = metas, public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Unidades que o usuário logado enxerga no sistema (alguma tela de "metas" com "ver"; admin: todas)
create or replace function metas.ve_unidade(_loja uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.minhas_unidades('metas') u where u.id = _loja);
$$;

create or replace function metas._primeiro_dia(_d date)
returns boolean language sql immutable as $$
  select _d = date_trunc('month', _d)::date;
$$;

-- ---------- tabelas ----------
create table if not exists metas.vendedores (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id),
  user_id uuid unique references auth.users(id) on delete set null,
  nome text not null check (length(btrim(nome)) > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists metas_vendedores_loja on metas.vendedores (loja_id);

create table if not exists metas.configuracao_meta (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas(id),
  mes_referencia date not null check (metas._primeiro_dia(mes_referencia)),
  meta_total numeric(14,2) not null default 0 check (meta_total >= 0),
  percentual_minimo numeric(5,4) not null default 0.90 check (percentual_minimo > 0 and percentual_minimo <= 1),
  premio_meta_100 numeric(14,2) not null default 0 check (premio_meta_100 >= 0),
  premio_meta_90 numeric(14,2) not null default 0 check (premio_meta_90 >= 0),
  valor_por_cliente_engajado numeric(10,2) not null default 0 check (valor_por_cliente_engajado >= 0),
  atualizado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loja_id, mes_referencia)
);

create table if not exists metas.lancamentos (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references metas.vendedores(id),
  loja_id uuid not null references public.lojas(id),
  mes_referencia date not null check (metas._primeiro_dia(mes_referencia)),
  faturamento_realizado numeric(14,2) not null default 0 check (faturamento_realizado >= 0),
  clientes_engajados integer not null default 0 check (clientes_engajados >= 0),
  lancado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendedor_id, mes_referencia)
);
create index if not exists metas_lancamentos_loja_mes on metas.lancamentos (loja_id, mes_referencia);

create table if not exists metas.meses_fechados (
  loja_id uuid not null references public.lojas(id),
  mes_referencia date not null check (metas._primeiro_dia(mes_referencia)),
  fechado_por uuid default auth.uid(),
  fechado_em timestamptz not null default now(),
  primary key (loja_id, mes_referencia)
);

create or replace function metas.mes_fechado(_loja uuid, _mes date)
returns boolean language sql stable security definer set search_path = metas as $$
  select exists (select 1 from metas.meses_fechados m where m.loja_id = _loja and m.mes_referencia = _mes);
$$;

-- ---------- gatilhos ----------
drop trigger if exists metas_vendedores_updated on metas.vendedores;
create trigger metas_vendedores_updated before update on metas.vendedores
  for each row execute function metas._set_updated_at();
drop trigger if exists metas_config_updated on metas.configuracao_meta;
create trigger metas_config_updated before update on metas.configuracao_meta
  for each row execute function metas._set_updated_at();
drop trigger if exists metas_lanc_updated on metas.lancamentos;
create trigger metas_lanc_updated before update on metas.lancamentos
  for each row execute function metas._set_updated_at();

-- A unidade do vendedor precisa usar o sistema "metas"
create or replace function metas._checa_vendedor()
returns trigger language plpgsql security definer set search_path = metas, public as $$
begin
  if not public.unidade_usa(new.loja_id, 'metas') then
    raise exception 'A unidade escolhida não usa o Meta de Vendas (marque o sistema na unidade, no Portal).';
  end if;
  return new;
end;
$$;
drop trigger if exists metas_vendedores_checa on metas.vendedores;
create trigger metas_vendedores_checa before insert or update of loja_id on metas.vendedores
  for each row execute function metas._checa_vendedor();

-- Lançamento: unidade vem do vendedor (no insert) e mês fechado bloqueia tudo
create or replace function metas._checa_lancamento()
returns trigger language plpgsql security definer set search_path = metas, public as $$
declare _loja uuid; _ativo boolean;
begin
  if tg_op = 'DELETE' then
    if metas.mes_fechado(old.loja_id, old.mes_referencia) then
      raise exception 'Mês fechado: reabra o mês para alterar os lançamentos.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    select v.loja_id, v.ativo into _loja, _ativo from metas.vendedores v where v.id = new.vendedor_id;
    if _loja is null then raise exception 'Vendedor não encontrado.'; end if;
    if not _ativo then raise exception 'Vendedor inativo: reative o cadastro para lançar.'; end if;
    new.loja_id := _loja;
  else
    -- a unidade, o vendedor e o mês de um lançamento não mudam
    if new.vendedor_id <> old.vendedor_id or new.loja_id <> old.loja_id or new.mes_referencia <> old.mes_referencia then
      raise exception 'Não é possível trocar o vendedor, a unidade ou o mês de um lançamento.';
    end if;
    if metas.mes_fechado(old.loja_id, old.mes_referencia) then
      raise exception 'Mês fechado: reabra o mês para alterar os lançamentos.';
    end if;
  end if;

  if metas.mes_fechado(new.loja_id, new.mes_referencia) then
    raise exception 'Mês fechado: reabra o mês para alterar os lançamentos.';
  end if;
  new.lancado_por := coalesce(auth.uid(), new.lancado_por);
  return new;
end;
$$;
drop trigger if exists metas_lanc_checa on metas.lancamentos;
create trigger metas_lanc_checa before insert or update or delete on metas.lancamentos
  for each row execute function metas._checa_lancamento();

-- Meta do mês: mês fechado bloqueia
create or replace function metas._checa_config()
returns trigger language plpgsql security definer set search_path = metas, public as $$
begin
  if tg_op = 'UPDATE' and (new.loja_id <> old.loja_id or new.mes_referencia <> old.mes_referencia) then
    raise exception 'Não é possível trocar a unidade ou o mês de uma meta.';
  end if;
  if not public.unidade_usa(new.loja_id, 'metas') then
    raise exception 'A unidade escolhida não usa o Meta de Vendas (marque o sistema na unidade, no Portal).';
  end if;
  if metas.mes_fechado(new.loja_id, new.mes_referencia) then
    raise exception 'Mês fechado: reabra o mês para alterar a meta.';
  end if;
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end;
$$;
drop trigger if exists metas_config_checa on metas.configuracao_meta;
create trigger metas_config_checa before insert or update on metas.configuracao_meta
  for each row execute function metas._checa_config();

-- Fechar o mês grava quem fechou
create or replace function metas._checa_fechamento()
returns trigger language plpgsql security definer set search_path = metas, public as $$
begin
  new.fechado_por := coalesce(auth.uid(), new.fechado_por);
  new.fechado_em := now();
  return new;
end;
$$;
drop trigger if exists metas_fechamento_checa on metas.meses_fechados;
create trigger metas_fechamento_checa before insert on metas.meses_fechados
  for each row execute function metas._checa_fechamento();

-- ---------- RLS ----------
alter table metas.vendedores enable row level security;
alter table metas.configuracao_meta enable row level security;
alter table metas.lancamentos enable row level security;
alter table metas.meses_fechados enable row level security;

drop policy if exists "vendedores: ver" on metas.vendedores;
create policy "vendedores: ver" on metas.vendedores for select to authenticated
  using (user_id = auth.uid() or metas.ve_unidade(loja_id));
drop policy if exists "vendedores: incluir" on metas.vendedores;
create policy "vendedores: incluir" on metas.vendedores for insert to authenticated
  with check (public.pode('metas.vendedores', 'inserir', loja_id));
drop policy if exists "vendedores: editar" on metas.vendedores;
create policy "vendedores: editar" on metas.vendedores for update to authenticated
  using (public.pode('metas.vendedores', 'editar', loja_id))
  with check (public.pode('metas.vendedores', 'editar', loja_id));

drop policy if exists "config: ver" on metas.configuracao_meta;
create policy "config: ver" on metas.configuracao_meta for select to authenticated
  using (metas.ve_unidade(loja_id));
drop policy if exists "config: incluir" on metas.configuracao_meta;
create policy "config: incluir" on metas.configuracao_meta for insert to authenticated
  with check (public.pode('metas.configuracao', 'editar', loja_id));
drop policy if exists "config: editar" on metas.configuracao_meta;
create policy "config: editar" on metas.configuracao_meta for update to authenticated
  using (public.pode('metas.configuracao', 'editar', loja_id))
  with check (public.pode('metas.configuracao', 'editar', loja_id));

-- o próprio vendedor (lança o próprio resultado, se tiver "Meu desempenho → editar" na unidade)
create or replace function metas._eh_o_vendedor(_vendedor uuid)
returns boolean language sql stable security definer set search_path = metas as $$
  select exists (select 1 from metas.vendedores v where v.id = _vendedor and v.user_id = auth.uid());
$$;

drop policy if exists "lanc: ver" on metas.lancamentos;
create policy "lanc: ver" on metas.lancamentos for select to authenticated
  using (metas.ve_unidade(loja_id) or metas._eh_o_vendedor(vendedor_id));
-- no insert a unidade vem do vendedor (gatilho roda antes da política): confere a unidade gravada
drop policy if exists "lanc: incluir" on metas.lancamentos;
create policy "lanc: incluir" on metas.lancamentos for insert to authenticated
  with check (public.pode('metas.lancamentos', 'inserir', loja_id)
              or (metas._eh_o_vendedor(vendedor_id) and public.pode('metas.meu_desempenho', 'editar', loja_id)));
drop policy if exists "lanc: editar" on metas.lancamentos;
create policy "lanc: editar" on metas.lancamentos for update to authenticated
  using (public.pode('metas.lancamentos', 'editar', loja_id)
         or (metas._eh_o_vendedor(vendedor_id) and public.pode('metas.meu_desempenho', 'editar', loja_id)))
  with check (public.pode('metas.lancamentos', 'editar', loja_id)
              or (metas._eh_o_vendedor(vendedor_id) and public.pode('metas.meu_desempenho', 'editar', loja_id)));
drop policy if exists "lanc: excluir" on metas.lancamentos;
create policy "lanc: excluir" on metas.lancamentos for delete to authenticated
  using (public.pode('metas.lancamentos', 'excluir', loja_id));

drop policy if exists "fechados: ver" on metas.meses_fechados;
create policy "fechados: ver" on metas.meses_fechados for select to authenticated
  using (metas.ve_unidade(loja_id));
drop policy if exists "fechados: fechar" on metas.meses_fechados;
create policy "fechados: fechar" on metas.meses_fechados for insert to authenticated
  with check (public.pode('metas.configuracao', 'fechar_mes', loja_id));
drop policy if exists "fechados: reabrir" on metas.meses_fechados;
create policy "fechados: reabrir" on metas.meses_fechados for delete to authenticated
  using (public.pode('metas.configuracao', 'fechar_mes', loja_id));

-- ---------- login do vendedor ----------
-- Liga (ou desliga, com e-mail vazio) o cadastro do vendedor a um login que JÁ existe no ecossistema.
-- Quem cria login novo é só o admin (Portal / Edge Function admin-usuarios).
create or replace function metas.ligar_login(_vendedor uuid, _email text)
returns void language plpgsql security definer set search_path = metas, public, auth as $$
declare _loja uuid; _uid uuid;
begin
  select v.loja_id into _loja from metas.vendedores v where v.id = _vendedor;
  if _loja is null then raise exception 'Vendedor não encontrado.'; end if;
  if auth.uid() is not null and not public.pode('metas.vendedores', 'editar', _loja) then
    raise exception 'Você não tem permissão para fazer isso nesta unidade.';
  end if;
  if _email is null or btrim(_email) = '' then
    update metas.vendedores set user_id = null where id = _vendedor;
    return;
  end if;
  select u.id into _uid from auth.users u where lower(u.email) = lower(btrim(_email));
  if _uid is null then
    raise exception 'Não existe login com esse e-mail. Peça ao administrador para criar o login no Portal.';
  end if;
  if exists (select 1 from metas.vendedores v where v.user_id = _uid and v.id <> _vendedor) then
    raise exception 'Esse login já está ligado a outro vendedor.';
  end if;
  update metas.vendedores set user_id = _uid where id = _vendedor;
end;
$$;

-- E-mail do login de cada vendedor da unidade (só para quem pode ver a tela Vendedores)
create or replace function metas.emails_vendedores(_loja uuid)
returns table (vendedor_id uuid, email text)
language sql stable security definer set search_path = metas, public, auth as $$
  select v.id, u.email::text
  from metas.vendedores v join auth.users u on u.id = v.user_id
  where v.loja_id = _loja and public.pode('metas.vendedores', 'ver', _loja);
$$;

-- ---------- permissões (grants) ----------
grant select, insert, update on metas.vendedores, metas.configuracao_meta to authenticated;
grant select, insert, update, delete on metas.lancamentos to authenticated;
grant select, insert, delete on metas.meses_fechados to authenticated;
grant all on all tables in schema metas to service_role;

revoke all on all functions in schema metas from public, anon;
grant execute on function metas.ve_unidade(uuid), metas.mes_fechado(uuid, date), metas._eh_o_vendedor(uuid),
  metas._primeiro_dia(date), metas.ligar_login(uuid, text), metas.emails_vendedores(uuid) to authenticated, service_role;
