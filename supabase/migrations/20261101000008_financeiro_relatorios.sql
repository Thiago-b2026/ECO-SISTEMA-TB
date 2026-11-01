-- =====================================================================
-- Etapa D: Financeiro (contas a pagar/receber, baixa, fluxo de caixa,
-- extrato por conta) + relatórios (comparativo de lojas e curva ABC)
-- =====================================================================

create table public.lancamentos (
  id               uuid primary key default gen_random_uuid(),
  loja_id          uuid not null references public.lojas(id),
  tipo             text not null check (tipo in ('pagar', 'receber')),
  descricao        text not null,
  pessoa_id        uuid references public.pessoas(id) on delete set null,
  plano_conta_id   uuid references public.plano_contas(id) on delete set null,
  conta_bancaria_id uuid references public.contas_bancarias(id) on delete set null,
  valor            numeric(14,2) not null check (valor > 0),
  vencimento       date not null,
  competencia      date not null default current_date,
  status           text not null default 'aberto' check (status in ('aberto', 'pago', 'cancelado')),
  data_pagamento   date,
  valor_pago       numeric(14,2),
  documento        text,
  parcela          int not null default 1,
  parcelas         int not null default 1,
  origem           text not null default 'manual' check (origem in ('manual', 'venda')),
  venda_id         uuid references public.vendas(id) on delete cascade,
  venda_pagamento_id uuid unique references public.venda_pagamentos(id) on delete cascade,
  observacao       text,
  created_by       uuid references auth.users(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  check (status <> 'pago' or (data_pagamento is not null and valor_pago is not null))
);
create index lanc_loja_venc_idx on public.lancamentos (loja_id, vencimento);
create index lanc_conta_idx on public.lancamentos (conta_bancaria_id, data_pagamento);
alter table public.lancamentos enable row level security;
create policy "lanc: ler" on public.lancamentos for select to authenticated using (public.is_gestor() and public.pode_ver_loja(loja_id));
create policy "lanc: criar" on public.lancamentos for insert to authenticated with check (public.is_gestor() and public.pode_ver_loja(loja_id) and origem = 'manual');
create policy "lanc: editar" on public.lancamentos for update to authenticated using (public.is_gestor() and public.pode_ver_loja(loja_id)) with check (public.is_gestor() and public.pode_ver_loja(loja_id));

-- Venda com cartão/pix + meio cadastrado → conta a receber (líquido de taxa, no prazo do meio)
create or replace function public.receber_da_venda()
returns trigger language plpgsql security definer set search_path = public as $$
declare _m public.meios_pagamento; _v public.vendas; _liq numeric; _conta uuid;
begin
  if new.meio_id is null then return new; end if;
  select * into _m from public.meios_pagamento where id = new.meio_id;
  select * into _v from public.vendas where id = new.venda_id;
  if _v.origem <> 'pdv' then return new; end if;
  _liq := round(new.valor - new.troco - (new.valor - new.troco) * _m.taxa_percentual / 100 - _m.taxa_fixa, 2);
  if _liq <= 0 then return new; end if;
  _conta := _m.conta_bancaria_id;
  insert into public.lancamentos (loja_id, tipo, descricao, plano_conta_id, conta_bancaria_id, valor, vencimento, competencia,
                                  status, data_pagamento, valor_pago, origem, venda_id, venda_pagamento_id, documento)
  values (_v.loja_id, 'receber', 'Venda nº ' || _v.numero || ' · ' || _m.nome,
          (select id from public.plano_contas where codigo = '1.1.01'), _conta, _liq,
          ((_v.data_venda at time zone 'America/Sao_Paulo')::date + _m.dias_recebimento),
          (_v.data_venda at time zone 'America/Sao_Paulo')::date,
          case when _m.dias_recebimento = 0 then 'pago' else 'aberto' end,
          case when _m.dias_recebimento = 0 then (_v.data_venda at time zone 'America/Sao_Paulo')::date end,
          case when _m.dias_recebimento = 0 then _liq end,
          'venda', _v.id, new.id, 'Venda ' || _v.numero);
  return new;
end;
$$;
create trigger trg_receber_da_venda after insert on public.venda_pagamentos
  for each row execute function public.receber_da_venda();

-- Venda cancelada → recebíveis dela cancelados
create or replace function public.cancelar_receber_da_venda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelada' and old.status <> 'cancelada' then
    update public.lancamentos set status = 'cancelado' where venda_id = new.id and status <> 'cancelado';
  end if;
  return new;
end;
$$;
create trigger trg_cancelar_receber after update of status on public.vendas
  for each row execute function public.cancelar_receber_da_venda();

-- Baixa (pagamento/recebimento) de um lançamento
create or replace function public.baixar_lancamento(_id uuid, _data date, _valor numeric, _conta uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _l public.lancamentos;
begin
  select * into _l from public.lancamentos where id = _id for update;
  if not found or not (public.is_gestor() and public.pode_ver_loja(_l.loja_id)) then raise exception 'Lançamento não encontrado'; end if;
  if _l.status <> 'aberto' then raise exception 'Lançamento já está %', _l.status; end if;
  if _valor is null or _valor <= 0 then raise exception 'Valor inválido'; end if;
  if _conta is null then raise exception 'Informe a conta bancária'; end if;
  update public.lancamentos set status = 'pago', data_pagamento = coalesce(_data, current_date), valor_pago = _valor, conta_bancaria_id = _conta
   where id = _id;
end;
$$;

-- Estorna a baixa (volta para aberto)
create or replace function public.estornar_lancamento(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _l public.lancamentos;
begin
  select * into _l from public.lancamentos where id = _id for update;
  if not found or not (public.is_gestor() and public.pode_ver_loja(_l.loja_id)) then raise exception 'Lançamento não encontrado'; end if;
  if _l.status <> 'pago' then raise exception 'Só dá para estornar lançamento pago'; end if;
  update public.lancamentos set status = 'aberto', data_pagamento = null, valor_pago = null where id = _id;
end;
$$;

-- Fluxo de caixa diário: realizado (pagos) e previsto (abertos pelo vencimento)
create or replace function public.fluxo_caixa(_loja_id uuid, _de date, _ate date)
returns table (dia date, entradas numeric, saidas numeric, entradas_previstas numeric, saidas_previstas numeric)
language sql stable security definer set search_path = public as $$
  with l as (
    select * from public.lancamentos
    where status <> 'cancelado' and public.is_gestor() and public.pode_ver_loja(loja_id)
      and (_loja_id is null or loja_id = _loja_id)
  ), dias as (select generate_series(_de, _ate, interval '1 day')::date as dia)
  select d.dia,
    coalesce((select sum(valor_pago) from l where status = 'pago' and tipo = 'receber' and data_pagamento = d.dia), 0),
    coalesce((select sum(valor_pago) from l where status = 'pago' and tipo = 'pagar' and data_pagamento = d.dia), 0),
    coalesce((select sum(valor) from l where status = 'aberto' and tipo = 'receber' and vencimento = d.dia), 0),
    coalesce((select sum(valor) from l where status = 'aberto' and tipo = 'pagar' and vencimento = d.dia), 0)
  from dias d order by 1;
$$;

-- Saldo atual de cada conta: saldo inicial + recebido − pago (desde a data do saldo)
create or replace function public.saldos_contas(_loja_id uuid)
returns table (conta_id uuid, nome text, loja_id uuid, saldo_inicial numeric, entradas numeric, saidas numeric, saldo numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, c.loja_id, c.saldo_inicial,
    coalesce(sum(l.valor_pago) filter (where l.tipo = 'receber'), 0),
    coalesce(sum(l.valor_pago) filter (where l.tipo = 'pagar'), 0),
    c.saldo_inicial + coalesce(sum(l.valor_pago) filter (where l.tipo = 'receber'), 0) - coalesce(sum(l.valor_pago) filter (where l.tipo = 'pagar'), 0)
  from public.contas_bancarias c
  left join public.lancamentos l on l.conta_bancaria_id = c.id and l.status = 'pago' and l.data_pagamento >= c.data_saldo
  where c.ativo and public.is_gestor() and public.pode_ver_loja(c.loja_id) and (_loja_id is null or c.loja_id = _loja_id)
  group by c.id
  order by c.nome;
$$;

-- RELATÓRIOS: faturamento por loja (comparativo) e curva ABC de produtos
create or replace function public.relatorio_por_loja(_de date, _ate date)
returns table (loja_id uuid, loja text, faturamento numeric, vendas bigint, ticket numeric, custo numeric)
language sql stable security definer set search_path = public as $$
  select lj.id, lj.nome, coalesce(sum(v.total), 0), count(v.id), coalesce(round(avg(v.total), 2), 0),
         coalesce((select sum(i.custo_unit * i.quantidade) from public.venda_itens i join public.vendas v2 on v2.id = i.venda_id
                   where v2.loja_id = lj.id and v2.status = 'finalizada'
                     and (v2.data_venda at time zone 'America/Sao_Paulo')::date between _de and _ate), 0)
  from public.lojas lj
  left join public.vendas v on v.loja_id = lj.id and v.status = 'finalizada'
       and (v.data_venda at time zone 'America/Sao_Paulo')::date between _de and _ate
  where public.pode_ver_loja(lj.id)
  group by lj.id, lj.nome
  order by 3 desc;
$$;

create or replace function public.relatorio_abc(_loja_id uuid, _de date, _ate date)
returns table (descricao text, quantidade numeric, receita numeric, lucro numeric, perc numeric, perc_acumulado numeric, classe text)
language sql stable security definer set search_path = public as $$
  with base as (
    select coalesce(p.titulo, i.descricao) as descricao, sum(i.quantidade) as quantidade, sum(i.total) as receita,
           sum(i.total - coalesce(i.custo_unit, 0) * i.quantidade) as lucro
    from public.venda_itens i
    join public.vendas v on v.id = i.venda_id
    left join public.produtos p on p.id = i.produto_id
    where v.status = 'finalizada' and public.pode_ver_loja(v.loja_id)
      and (_loja_id is null or v.loja_id = _loja_id)
      and (v.data_venda at time zone 'America/Sao_Paulo')::date between _de and _ate
    group by 1
  ), tot as (select nullif(sum(receita), 0) as t from base),
  ac as (
    select b.*, round(b.receita / tot.t * 100, 2) as perc,
           round(sum(b.receita) over (order by b.receita desc rows unbounded preceding) / tot.t * 100, 2) as perc_acumulado
    from base b, tot
  )
  select descricao, quantidade, receita, lucro, perc, perc_acumulado,
         case when perc_acumulado - perc < 80 then 'A' when perc_acumulado - perc < 95 then 'B' else 'C' end
  from ac order by receita desc limit 300;
$$;

do $$
declare f text;
begin
  foreach f in array array['baixar_lancamento(uuid, date, numeric, uuid)', 'estornar_lancamento(uuid)', 'fluxo_caixa(uuid, date, date)',
    'saldos_contas(uuid)', 'relatorio_por_loja(date, date)', 'relatorio_abc(uuid, date, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
