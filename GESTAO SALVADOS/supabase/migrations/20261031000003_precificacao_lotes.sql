-- =====================================================================
-- Precificação de lotes (estilo PrecificaLote, com busca no Mercado Livre)
-- Dois tipos de lote:
--   manual   → bipando/buscando produto por produto
--   planilha → sobe o Excel e o robô busca todos os itens
-- Rateio de custo escolhido por lote:
--   percentual → custo = preço de referência × % de custo
--   valor_pago → valor pago no lote dividido pelos itens, proporcional ao preço ML × qtd
-- Os itens aqui ainda NÃO são estoque: entram no estoque na Fase 1 (stock_movements).
-- =====================================================================

create type public.lote_tipo as enum ('manual', 'planilha');
create type public.lote_status as enum ('em_criacao', 'disponivel', 'vendido');
create type public.lote_rateio as enum ('percentual', 'valor_pago');
create type public.item_status as enum ('pendente', 'sucesso', 'similar', 'nao_encontrado', 'aprovado', 'erro');
create type public.item_origem as enum ('busca', 'manual', 'planilha');
create type public.item_ocorrencia as enum ('nao_chegou', 'avaria_total', 'avaria_parcial');

-- Quem trabalha com lotes
create or replace function public.pode_lotes()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(auth.uid(), array['admin','gerente','estoquista']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------
-- LOTES
-- ---------------------------------------------------------------------
create table public.lotes (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  observacao         text,
  tipo               public.lote_tipo not null,
  status             public.lote_status not null default 'em_criacao',
  rateio             public.lote_rateio not null default 'percentual',
  perc_custo         numeric(6,2) not null default 30 check (perc_custo >= 0 and perc_custo <= 100),
  perc_desconto      numeric(6,2) not null default 0 check (perc_desconto >= 0 and perc_desconto < 100),
  valor_pago         numeric(14,2) check (valor_pago is null or valor_pago >= 0),
  similaridade_min   int not null default 70 check (similaridade_min between 0 and 100),
  arquivo_nome       text,
  created_by         uuid references auth.users(id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_lotes_updated before update on public.lotes
  for each row execute function public.set_updated_at();
alter table public.lotes enable row level security;
create policy "lotes: ler" on public.lotes for select to authenticated using (public.pode_lotes());
create policy "lotes: criar" on public.lotes for insert to authenticated with check (public.pode_lotes());
create policy "lotes: editar" on public.lotes for update to authenticated using (public.pode_lotes()) with check (public.pode_lotes());
create policy "lotes: excluir" on public.lotes for delete to authenticated using (public.is_gestor());

-- ---------------------------------------------------------------------
-- PALLETS (dentro de um lote)
-- ---------------------------------------------------------------------
create table public.pallets (
  id          uuid primary key default gen_random_uuid(),
  lote_id     uuid not null references public.lotes(id) on delete cascade,
  codigo      text not null check (codigo ~ '^[A-Za-z0-9_-]{1,15}$'),
  created_at  timestamptz not null default now(),
  unique (lote_id, codigo)
);
alter table public.pallets enable row level security;
create policy "pallets: ler" on public.pallets for select to authenticated using (public.pode_lotes());
create policy "pallets: criar" on public.pallets for insert to authenticated with check (public.pode_lotes());
create policy "pallets: editar" on public.pallets for update to authenticated using (public.pode_lotes()) with check (public.pode_lotes());
create policy "pallets: excluir" on public.pallets for delete to authenticated using (public.pode_lotes());

-- ---------------------------------------------------------------------
-- ITENS DO LOTE
-- ---------------------------------------------------------------------
create sequence public.lote_itens_sku_seq start 1000;

create table public.lote_itens (
  id                 uuid primary key default gen_random_uuid(),
  lote_id            uuid not null references public.lotes(id) on delete cascade,
  pallet_id          uuid references public.pallets(id) on delete set null,
  sku                text not null unique default ('P' || nextval('public.lote_itens_sku_seq')),
  origem             public.item_origem not null,
  status             public.item_status not null default 'aprovado',
  termo              text,                       -- o que foi buscado / nome na planilha
  codigo_barras      text,
  titulo             text not null,
  categoria          text,
  marca              text,
  grade              text not null default 'A',  -- condição física: A, B, C...
  quantidade         int not null default 1 check (quantidade > 0),
  ml_id              text,
  ml_tipo            text,
  ml_link            text,
  foto_url           text,
  preco_ml           numeric(14,2),
  preco_ml_original  numeric(14,2),
  valor_planilha     numeric(14,2),             -- só itens de planilha
  preco_venda        numeric(14,2),             -- preço final (editável)
  custo_unit         numeric(14,2),
  similaridade       int,
  candidatos         jsonb,                      -- opções devolvidas pela busca
  ocorrencia         public.item_ocorrencia,
  qtd_impressa       int not null default 0,
  operador_id        uuid references auth.users(id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index lote_itens_lote_idx on public.lote_itens (lote_id);
create index lote_itens_status_idx on public.lote_itens (lote_id, status);
create index lote_itens_ean_idx on public.lote_itens (codigo_barras);
create trigger trg_lote_itens_updated before update on public.lote_itens
  for each row execute function public.set_updated_at();
alter table public.lote_itens enable row level security;
create policy "itens: ler" on public.lote_itens for select to authenticated using (public.pode_lotes());
create policy "itens: criar" on public.lote_itens for insert to authenticated with check (public.pode_lotes());
create policy "itens: editar" on public.lote_itens for update to authenticated using (public.pode_lotes()) with check (public.pode_lotes());
create policy "itens: excluir" on public.lote_itens for delete to authenticated using (public.pode_lotes());

-- ---------------------------------------------------------------------
-- CONFIGURAÇÃO DE PREÇO (uma linha para a loja)
-- arredondamento: { ativo, direcao: 'cima'|'baixo', centavos: 0|0.90|0.99,
--                   faixas: [{ ate: 50, passo: 1 }, { ate: 100, passo: 10 }, ...] }
-- ---------------------------------------------------------------------
create table public.config_precificacao (
  id              smallint primary key default 1 check (id = 1),
  arredondamento  jsonb not null default '{
    "ativo": true, "direcao": "cima", "centavos": 0.99,
    "faixas": [
      {"ate": 50, "passo": 1}, {"ate": 100, "passo": 10}, {"ate": 500, "passo": 10},
      {"ate": 1000, "passo": 10}, {"ate": null, "passo": 100}
    ]}'::jsonb,
  updated_at      timestamptz not null default now()
);
insert into public.config_precificacao (id) values (1);
create trigger trg_config_prec_updated before update on public.config_precificacao
  for each row execute function public.set_updated_at();
alter table public.config_precificacao enable row level security;
create policy "config: ler" on public.config_precificacao for select to authenticated using (public.pode_lotes());
create policy "config: gestor edita" on public.config_precificacao for update to authenticated using (public.is_gestor()) with check (public.is_gestor());

-- ---------------------------------------------------------------------
-- RESUMO DOS LOTES (para a lista, sem baixar todos os itens)
-- ---------------------------------------------------------------------
create or replace view public.lotes_resumo with (security_invoker = true) as
select
  l.*,
  coalesce(sum(i.quantidade) filter (where i.ocorrencia is null or i.ocorrencia = 'avaria_parcial'), 0)::int as total_itens,
  count(i.id)::int as produtos_unicos,
  count(distinct i.categoria)::int as categorias,
  (select count(*) from public.pallets p where p.lote_id = l.id)::int as qtd_pallets,
  coalesce(sum(i.preco_venda * i.quantidade) filter (where i.ocorrencia is null or i.ocorrencia = 'avaria_parcial'), 0)::numeric(14,2) as valor_venda,
  coalesce(sum(i.custo_unit * i.quantidade), 0)::numeric(14,2) as valor_custo,
  count(i.id) filter (where i.status = 'pendente')::int as qtd_pendente,
  count(i.id) filter (where i.status = 'sucesso')::int as qtd_sucesso,
  count(i.id) filter (where i.status = 'similar')::int as qtd_similar,
  count(i.id) filter (where i.status = 'nao_encontrado')::int as qtd_nao_encontrado,
  count(i.id) filter (where i.status = 'aprovado')::int as qtd_aprovado
from public.lotes l
left join public.lote_itens i on i.lote_id = l.id
group by l.id;

-- ---------------------------------------------------------------------
-- RATEIO PELO VALOR PAGO: recalcula custo_unit de todos os itens do lote
-- custo_unit = valor_pago × preço_ref / Σ(preço_ref × qtd)
-- preço_ref = preco_ml (ou preco_venda se não houver). Itens que "não chegaram"
-- ou "avaria total" continuam somando no rateio (o custo fica no lote).
-- ---------------------------------------------------------------------
create or replace function public.recalcular_custo_lote(_lote_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _valor numeric;
  _base  numeric;
  _n     int;
begin
  if not public.pode_lotes() then
    raise exception 'Sem permissão';
  end if;
  select valor_pago into _valor from public.lotes where id = _lote_id for update;
  if _valor is null then
    raise exception 'Informe o valor pago no lote antes de recalcular';
  end if;
  select sum(coalesce(preco_ml, preco_venda, 0) * quantidade) into _base
  from public.lote_itens where lote_id = _lote_id;
  if coalesce(_base, 0) = 0 then
    raise exception 'Nenhum item com preço para ratear';
  end if;
  update public.lote_itens
     set custo_unit = round(_valor * coalesce(preco_ml, preco_venda, 0) / _base, 2)
   where lote_id = _lote_id;
  get diagnostics _n = row_count;
  update public.lotes set rateio = 'valor_pago' where id = _lote_id;
  return _n;
end;
$$;
revoke all on function public.recalcular_custo_lote(uuid) from public, anon;
grant execute on function public.recalcular_custo_lote(uuid) to authenticated;
