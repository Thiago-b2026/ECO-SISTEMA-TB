-- =====================================================================
-- AUDITORIA POR LOJA (somente leitura — não altera nada)
-- Confere se logins e movimentações estão separados corretamente por CNPJ.
-- Resultado: uma linha por verificação, com OK / ATENÇÃO / PROBLEMA.
-- =====================================================================
with lojas as (select id, nome, cnpj from public.lojas where ativo),
resumo as (
  -- 1) Vendas por loja (quantidade, finalizadas, faturamento, suspeitas, período)
  select 1 as ord, l.nome as loja, 'Vendas: total / finalizadas / canceladas' as verificacao,
         count(v.id)::text || ' / ' || count(v.id) filter (where v.status = 'finalizada') || ' / ' || count(v.id) filter (where v.status = 'cancelada') as valor,
         'INFO' as situacao
  from lojas l left join public.vendas v on v.loja_id = l.id group by l.id, l.nome
  union all
  select 2, l.nome, 'Vendas: faturamento (finalizadas)', to_char(coalesce(sum(v.total) filter (where v.status = 'finalizada'), 0), 'FM999G999G990D00'), 'INFO'
  from lojas l left join public.vendas v on v.loja_id = l.id group by l.id, l.nome
  union all
  select 3, l.nome, 'Vendas: período (data da venda)',
         coalesce(to_char(min(v.data_venda) filter (where not v.data_suspeita) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), '-') || ' a ' ||
         coalesce(to_char(max(v.data_venda) filter (where not v.data_suspeita) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), '-'), 'INFO'
  from lojas l left join public.vendas v on v.loja_id = l.id group by l.id, l.nome
  union all
  select 4, l.nome, 'Vendas: com data suspeita', count(v.id) filter (where v.data_suspeita)::text, 'INFO'
  from lojas l left join public.vendas v on v.loja_id = l.id group by l.id, l.nome
  union all
  select 5, l.nome, 'Vendas: por vendedor', coalesce(string_agg(x.vendedor || ' ' || x.n, ', ' order by x.n desc), '-'), 'INFO'
  from lojas l left join lateral (
    select coalesce(trim(v.vendedor_nome), '—') as vendedor, count(*) as n from public.vendas v
    where v.loja_id = l.id and v.status = 'finalizada' group by 1) x on true
  group by l.id, l.nome

  -- 2) Integridade das vendas
  union all
  select 10, '(todas)', 'Número de venda repetido dentro da mesma loja',
         count(*)::text, case when count(*) = 0 then 'OK' else 'PROBLEMA' end
  from (select loja_id, numero from public.vendas group by 1, 2 having count(*) > 1) d
  union all
  select 11, '(todas)', 'Vendas finalizadas sem nenhum item',
         count(*)::text, case when count(*) = 0 then 'OK' else 'ATENÇÃO' end
  from public.vendas v where v.status = 'finalizada' and not exists (select 1 from public.venda_itens i where i.venda_id = v.id)
  union all
  select 12, '(todas)', 'Vendas finalizadas sem pagamento',
         count(*)::text, case when count(*) = 0 then 'OK' else 'ATENÇÃO' end
  from public.vendas v where v.status = 'finalizada' and v.total > 0 and not exists (select 1 from public.venda_pagamentos p where p.venda_id = v.id)
  union all
  select 13, '(todas)', 'Vendas do PDV: pagamento (sem troco) diferente do total',
         count(*)::text, case when count(*) = 0 then 'OK' else 'PROBLEMA' end
  from public.vendas v where v.origem = 'pdv' and v.status = 'finalizada'
    and abs(v.total - (select coalesce(sum(p.valor - p.troco), 0) from public.venda_pagamentos p where p.venda_id = v.id)) > 0.01
  union all
  select 14, '(todas)', 'Vendas do PDV: soma dos itens diferente do subtotal',
         count(*)::text, case when count(*) = 0 then 'OK' else 'PROBLEMA' end
  from public.vendas v where v.origem = 'pdv'
    and abs(v.subtotal - (select coalesce(sum(i.total), 0) from public.venda_itens i where i.venda_id = v.id)) > 0.01

  -- 3) Nada de uma loja "vazando" para a outra
  union all
  select 20, '(todas)', 'Venda num caixa de OUTRA loja',
         count(*)::text, case when count(*) = 0 then 'OK' else 'PROBLEMA' end
  from public.vendas v join public.caixas c on c.id = v.caixa_id where c.loja_id <> v.loja_id
  union all
  select 21, '(todas)', 'Item vendido de produto de OUTRA loja',
         count(*)::text, case when count(*) = 0 then 'OK' else 'PROBLEMA' end
  from public.venda_itens i join public.vendas v on v.id = i.venda_id join public.produtos p on p.id = i.produto_id where p.loja_id <> v.loja_id
  union all
  select 22, '(todas)', 'Movimento de estoque em loja diferente da do produto',
         count(*)::text, case when count(*) = 0 then 'OK' else 'PROBLEMA' end
  from public.stock_movements m join public.produtos p on p.id = m.produto_id where p.loja_id <> m.loja_id
  union all
  select 23, '(todas)', 'Conta a receber de venda lançada em outra loja',
         count(*)::text, case when count(*) = 0 then 'OK' else 'PROBLEMA' end
  from public.lancamentos f join public.vendas v on v.id = f.venda_id where f.loja_id <> v.loja_id
  union all
  select 24, '(todas)', 'Lançamento em conta bancária de outra loja',
         count(*)::text, case when count(*) = 0 then 'OK' else 'PROBLEMA' end
  from public.lancamentos f join public.contas_bancarias c on c.id = f.conta_bancaria_id where c.loja_id <> f.loja_id
  union all
  select 25, '(todas)', 'Estoque calculado diferente do saldo das movimentações',
         count(*)::text, case when count(*) = 0 then 'OK' else 'PROBLEMA' end
  from public.produtos p where abs(p.estoque_atual - (select coalesce(sum(m.quantidade), 0) from public.stock_movements m where m.produto_id = p.id)) > 0.001
  union all
  select 26, '(todas)', 'Itens de venda sem venda (órfãos)',
         count(*)::text, case when count(*) = 0 then 'OK' else 'PROBLEMA' end
  from public.venda_itens i where not exists (select 1 from public.vendas v where v.id = i.venda_id)

  -- 4) Outras movimentações por loja
  union all
  select 30, l.nome, 'Caixas (abertos / fechados)',
         count(c.id) filter (where c.status = 'aberto') || ' / ' || count(c.id) filter (where c.status = 'fechado'), 'INFO'
  from lojas l left join public.caixas c on c.loja_id = l.id group by l.id, l.nome
  union all
  select 31, l.nome, 'Produtos ativos / unidades em estoque',
         count(p.id) filter (where p.ativo) || ' / ' || coalesce(sum(p.estoque_atual) filter (where p.ativo), 0), 'INFO'
  from lojas l left join public.produtos p on p.loja_id = l.id group by l.id, l.nome
  union all
  select 32, l.nome, 'Lotes / contas bancárias / lançamentos',
         (select count(*) from public.lotes x where x.loja_id = l.id) || ' / ' ||
         (select count(*) from public.contas_bancarias x where x.loja_id = l.id) || ' / ' ||
         (select count(*) from public.lancamentos x where x.loja_id = l.id), 'INFO'
  from lojas l

  -- 5) Logins de acesso
  union all
  select 40, l.nome, 'Usuários com acesso a esta loja',
         coalesce(string_agg(pr.nome || ' (' || coalesce(ur.role::text, 'sem perfil') || case when pr.ativo then '' else ', DESATIVADO' end || ')', ', ' order by pr.nome), '-'), 'INFO'
  from lojas l left join public.usuario_lojas ul on ul.loja_id = l.id
  left join public.profiles pr on pr.id = ul.user_id left join public.user_roles ur on ur.user_id = ul.user_id
  group by l.id, l.nome
  union all
  select 41, '(todas)', 'Login ativo sem nenhuma loja (não-admin)',
         coalesce(string_agg(pr.nome, ', '), '0'), case when count(*) = 0 then 'OK' else 'ATENÇÃO' end
  from public.profiles pr join public.user_roles ur on ur.user_id = pr.id
  where pr.ativo and ur.role <> 'admin' and not exists (select 1 from public.usuario_lojas ul where ul.user_id = pr.id)
  union all
  select 42, '(todas)', 'Login sem perfil (admin/gerente/vendedor/estoquista)',
         coalesce(string_agg(pr.nome, ', '), '0'), case when count(*) = 0 then 'OK' else 'ATENÇÃO' end
  from public.profiles pr where not exists (select 1 from public.user_roles ur where ur.user_id = pr.id)
  union all
  select 43, '(todas)', 'Cadastros marcados "Usuário" com login ainda não criado',
         coalesce(string_agg(p.nome, ', '), '0'), case when count(*) = 0 then 'OK' else 'ATENÇÃO' end
  from public.pessoas p where p.eh_usuario and p.user_id is null and p.ativo
  union all
  select 44, '(todas)', 'Vendas antigas ainda sem vendedor ligado a um login',
         coalesce(string_agg(x.nome || ' ' || x.n, ', '), '0'), case when count(*) = 0 then 'OK' else 'ATENÇÃO' end
  from (select l.nome || ': ' || trim(v.vendedor_nome) as nome, count(*) as n from public.vendas v join public.lojas l on l.id = v.loja_id
        where v.origem = 'legado' and v.vendedor_id is null and v.vendedor_nome is not null group by 1) x
)
select verificacao, loja, valor, situacao from resumo order by ord, loja;
