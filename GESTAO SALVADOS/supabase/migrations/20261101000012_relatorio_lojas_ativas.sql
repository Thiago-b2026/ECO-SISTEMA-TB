-- Comparativo por loja: só lojas ATIVAS (a "duplicada" desativada não aparece)
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
  where lj.ativo and public.pode_ver_loja(lj.id)
  group by lj.id, lj.nome
  order by 3 desc;
$$;
