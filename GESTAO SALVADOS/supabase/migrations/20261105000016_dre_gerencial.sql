-- DRE GERENCIAL (vindo do projeto "marketwise-margin-map" do Lovable), UNIFICADO ao Financeiro
-- e SEPARADO POR EMPRESA (loja / CNPJ).
--
-- Como funciona:
--   * As despesas do DRE são as próprias contas a pagar do Financeiro (tabela lancamentos).
--   * Cada conta do Plano de contas aponta para uma "categoria do DRE" (CMV, Pessoal, ...).
--     Subcontas herdam a categoria da conta-pai quando não têm uma própria.
--   * Cada categoria tem um benchmark (% do faturamento). Cada empresa pode ter o seu.
--   * Faturamento do mês = total das vendas da empresa no mês (automático), ou o valor digitado
--     (dre_faturamento), que tem prioridade (meses antigos do Lovable, vendas fora do PDV).

-- ---------------------------------------------------------------------
-- 1) Categorias do DRE (iguais às do Lovable)
-- ---------------------------------------------------------------------
create table public.dre_categorias (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null unique,
  benchmark_pct  numeric(6,2) not null default 0 check (benchmark_pct >= 0),
  cor            text not null default '#3b82f6',
  ordem          int not null default 0,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_dre_categorias_updated before update on public.dre_categorias
  for each row execute function public.set_updated_at();
alter table public.dre_categorias enable row level security;
create policy "dre_cat: ler" on public.dre_categorias for select to authenticated using (public.is_gestor());
create policy "dre_cat: criar" on public.dre_categorias for insert to authenticated with check (public.is_gestor());
create policy "dre_cat: editar" on public.dre_categorias for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy "dre_cat: excluir" on public.dre_categorias for delete to authenticated using (public.is_admin());

insert into public.dre_categorias (nome, benchmark_pct, cor, ordem) values
  ('CMV',          30.0, '#ef4444',  1),
  ('Pessoal',       8.0, '#f59e0b',  2),
  ('Operacional',  10.0, '#8b5cf6',  3),
  ('Marketing',     1.2, '#ec4899',  4),
  ('ADM',           5.0, '#06b6d4',  5),
  ('Impostos',      6.0, '#64748b',  6),
  ('Investimento',  3.0, '#10b981',  7),
  ('Sócios',       10.0, '#0f1b3d',  8),
  ('Financeira',    2.0, '#f97316',  9),
  ('Perdas',        1.0, '#dc2626', 10)
on conflict (nome) do nothing;

-- ---------------------------------------------------------------------
-- 2) Benchmark próprio de cada empresa (opcional; sem linha = vale o padrão da categoria)
-- ---------------------------------------------------------------------
create table public.dre_benchmark_loja (
  loja_id        uuid not null references public.lojas(id) on delete cascade,
  categoria_id   uuid not null references public.dre_categorias(id) on delete cascade,
  benchmark_pct  numeric(6,2) not null check (benchmark_pct >= 0),
  primary key (loja_id, categoria_id)
);
alter table public.dre_benchmark_loja enable row level security;
create policy "dre_bench: ler" on public.dre_benchmark_loja for select to authenticated using (public.is_gestor() and public.pode_ver_loja(loja_id));
create policy "dre_bench: criar" on public.dre_benchmark_loja for insert to authenticated with check (public.is_gestor() and public.pode_ver_loja(loja_id));
create policy "dre_bench: editar" on public.dre_benchmark_loja for update to authenticated using (public.is_gestor() and public.pode_ver_loja(loja_id)) with check (public.is_gestor() and public.pode_ver_loja(loja_id));
create policy "dre_bench: excluir" on public.dre_benchmark_loja for delete to authenticated using (public.is_gestor() and public.pode_ver_loja(loja_id));

-- ---------------------------------------------------------------------
-- 3) Plano de contas → categoria do DRE
-- ---------------------------------------------------------------------
alter table public.plano_contas
  add column dre_categoria_id uuid references public.dre_categorias(id) on delete set null;

-- Ligação inicial do plano padrão (só onde ainda não há ligação)
update public.plano_contas p set dre_categoria_id = c.id
from (values ('2', 'CMV'), ('3.1', 'Pessoal'), ('3.2', 'Operacional'), ('3.3', 'ADM'), ('4', 'Financeira')) as v(codigo, cat)
join public.dre_categorias c on c.nome = v.cat
where p.codigo = v.codigo and p.dre_categoria_id is null;

-- ---------------------------------------------------------------------
-- 4) Faturamento digitado por empresa/mês (tem prioridade sobre o automático)
-- ---------------------------------------------------------------------
create table public.dre_faturamento (
  loja_id     uuid not null references public.lojas(id) on delete restrict,
  ano         int not null check (ano between 2000 and 2100),
  mes         int not null check (mes between 1 and 12),
  valor       numeric(14,2) not null check (valor >= 0),
  observacao  text,
  updated_by  uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (loja_id, ano, mes)
);
create trigger trg_dre_faturamento_updated before update on public.dre_faturamento
  for each row execute function public.set_updated_at();
alter table public.dre_faturamento enable row level security;
create policy "dre_fat: ler" on public.dre_faturamento for select to authenticated using (public.is_gestor() and public.pode_ver_loja(loja_id));
create policy "dre_fat: criar" on public.dre_faturamento for insert to authenticated with check (public.is_gestor() and public.pode_ver_loja(loja_id));
create policy "dre_fat: editar" on public.dre_faturamento for update to authenticated using (public.is_gestor() and public.pode_ver_loja(loja_id)) with check (public.is_gestor() and public.pode_ver_loja(loja_id));
create policy "dre_fat: excluir" on public.dre_faturamento for delete to authenticated using (public.is_gestor() and public.pode_ver_loja(loja_id));

-- Permissões por área (mesmo padrão da migration 0013)
do $$
declare r record;
begin
  for r in select * from (values
    ('dre_categorias', 'cadastros_financeiros'),
    ('dre_benchmark_loja', 'financeiro'),
    ('dre_faturamento', 'financeiro')
  ) as t(tabela, modulo) loop
    execute format('create policy "perm: ver" on public.%I as restrictive for select to authenticated using (public.permite(%L, ''ver''))', r.tabela, r.modulo);
    execute format('create policy "perm: inserir" on public.%I as restrictive for insert to authenticated with check (public.permite(%L, ''inserir''))', r.tabela, r.modulo);
    execute format('create policy "perm: editar" on public.%I as restrictive for update to authenticated using (public.permite(%L, ''editar''))', r.tabela, r.modulo);
    execute format('create policy "perm: excluir" on public.%I as restrictive for delete to authenticated using (public.permite(%L, ''excluir''))', r.tabela, r.modulo);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.registra_auditoria()', r.tabela);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5) Lançamentos trazidos do Lovable ficam marcados como "importacao"
-- ---------------------------------------------------------------------
alter table public.lancamentos drop constraint if exists lancamentos_origem_check;
alter table public.lancamentos add constraint lancamentos_origem_check check (origem in ('manual', 'venda', 'importacao'));
create index if not exists lanc_loja_comp_idx on public.lancamentos (loja_id, competencia);

-- ---------------------------------------------------------------------
-- 6) Cálculo do DRE
-- ---------------------------------------------------------------------
-- Despesas do ano por empresa, mês e categoria do DRE.
--   regime 'competencia': todos os lançamentos não cancelados, pelo mês de competência (valor).
--   regime 'caixa': só os pagos, pelo mês do pagamento (valor pago).
--   "a pagar" soma; "a receber" numa conta de despesa abate (ex.: estorno, reembolso).
--   "a pagar" sem categoria vem com categoria_id nulo (aparece como "Sem categoria").
create or replace function public.dre_despesas_ano(_loja_id uuid, _ano int, _regime text default 'competencia')
returns table (loja_id uuid, mes int, categoria_id uuid, valor numeric)
language sql stable security definer set search_path = public as $$
  with recursive ef as (
    select p.id, p.dre_categoria_id as cat from public.plano_contas p where p.pai_id is null
    union all
    select f.id, coalesce(f.dre_categoria_id, ef.cat) from public.plano_contas f join ef on f.pai_id = ef.id
  ),
  base as (
    select l.loja_id, l.tipo, ef.cat,
           case when _regime = 'caixa' then l.data_pagamento else l.competencia end as dt,
           case when _regime = 'caixa' then l.valor_pago else l.valor end as v
    from public.lancamentos l
    left join ef on ef.id = l.plano_conta_id
    where public.is_gestor() and public.permite('financeiro', 'ver')
      and public.pode_ver_loja(l.loja_id)
      and (_loja_id is null or l.loja_id = _loja_id)
      and l.status <> 'cancelado'
      and (_regime <> 'caixa' or l.status = 'pago')
      and (l.tipo = 'pagar' or ef.cat is not null)
  )
  select b.loja_id, extract(month from b.dt)::int, b.cat,
         sum(case when b.tipo = 'pagar' then b.v else -b.v end)
  from base b
  where b.dt >= make_date(_ano, 1, 1) and b.dt < make_date(_ano + 1, 1, 1)
  group by 1, 2, 3;
$$;

-- Faturamento do ano por empresa e mês: automático (vendas finalizadas) e digitado.
create or replace function public.dre_faturamento_ano(_loja_id uuid, _ano int)
returns table (loja_id uuid, mes int, automatico numeric, manual numeric)
language sql stable security definer set search_path = public as $$
  with v as (
    select v.loja_id, extract(month from v.data_venda at time zone 'America/Sao_Paulo')::int as mes, sum(v.total) as t
    from public.vendas v
    where public.is_gestor() and public.permite('financeiro', 'ver')
      and public.pode_ver_loja(v.loja_id)
      and (_loja_id is null or v.loja_id = _loja_id)
      and v.status = 'finalizada'
      and v.data_venda >= make_timestamptz(_ano, 1, 1, 0, 0, 0, 'America/Sao_Paulo')
      and v.data_venda <  make_timestamptz(_ano + 1, 1, 1, 0, 0, 0, 'America/Sao_Paulo')
    group by 1, 2
  ),
  f as (
    select d.loja_id, d.mes, d.valor
    from public.dre_faturamento d
    where public.is_gestor() and public.permite('financeiro', 'ver')
      and public.pode_ver_loja(d.loja_id)
      and (_loja_id is null or d.loja_id = _loja_id)
      and d.ano = _ano
  )
  select coalesce(v.loja_id, f.loja_id), coalesce(v.mes, f.mes), coalesce(v.t, 0), f.valor
  from v full join f on f.loja_id = v.loja_id and f.mes = v.mes;
$$;

revoke all on function public.dre_despesas_ano(uuid, int, text) from public, anon;
revoke all on function public.dre_faturamento_ano(uuid, int) from public, anon;
grant execute on function public.dre_despesas_ano(uuid, int, text) to authenticated;
grant execute on function public.dre_faturamento_ano(uuid, int) to authenticated;
