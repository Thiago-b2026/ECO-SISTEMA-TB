-- SÓ LEITURA. Rode ANTES da migration 20261108000019_rh_supermix_uma_empresa.sql.
-- Mostra o que a limpeza vai fazer com a Supermix no Gestão RH:
--   APAGAR  = empresas criadas por engano (SUPER MIX BRAZ 02, 03, 04), as lojas/unidades e as redes criadas junto
--   MANTER  = a empresa original (com os lançamentos), que volta a se chamar "Supermix Braz"
--   APAGAR loja = lojas além da 04 na empresa original (ex.: "Loja 5"), só se vazias
--   TELA    = telas do PDV renomeadas (Caixa, Formas de pagamento)
--   LOJA    = como fica cada loja da empresa original (nome novo, CNPJ, matriz/filial) e o faturamento que NÃO pode mudar
-- Coluna "seguro": tem que dizer OK em todas as linhas APAGAR (sem lançamentos, sem histórico, sem permissões).
with
original as (
  select e.id from rh.empresas e
  where exists (select 1 from rh.rh_entries x where x.empresa_id = e.id)
    and e.rede_id = (select id from public.redes where nome = 'SUPERMIX BRAZ')
),
apagar as (
  select e.* from rh.empresas e
  where e.nome ~* '^super ?mix braz 0[2-4]$' and e.id not in (select id from original)
),
novos (codigo, nome, cnpj) as (values
  ('loja1', 'SUPER MIX BRAZ 01', '17890178000158'),
  ('loja2', 'SUPER MIX BRAZ 02', '17890178000310'),
  ('loja3', 'SUPER MIX BRAZ 03', '17890178000409'),
  ('loja4', 'SUPER MIX BRAZ 04', '17890178000581')
)
select 'APAGAR empresa' as acao, e.nome as item,
       coalesce(r.nome, '-') as rede,
       (select string_agg(l.nome || ' -> unidade ' || coalesce(u.nome, '-'), ', ') from rh.lojas l left join public.lojas u on u.id = l.unidade_id where l.empresa_id = e.id) as detalhe,
       case when (select count(*) from rh.rh_entries x where x.empresa_id = e.id) = 0
             and (select count(*) from rh.rh_entries_log x where x.empresa_id = e.id) = 0
             and (select count(*) from public.usuario_permissoes up join rh.lojas l on l.unidade_id = up.unidade_id where l.empresa_id = e.id) = 0
            then 'OK' else 'NÃO – tem movimento, a migration vai parar' end as seguro
from apagar e left join public.redes r on r.id = e.rede_id
union all
select 'APAGAR rede', r.nome, r.nome,
       (select count(*) from public.lojas u where u.rede_id = r.id)::text || ' unidade(s), todas das empresas apagadas',
       case when not exists (select 1 from public.lojas u where u.rede_id = r.id
                             and u.id not in (select l.unidade_id from rh.lojas l where l.empresa_id in (select id from apagar)))
            then 'OK' else 'NÃO – tem unidade de fora' end
from public.redes r
where r.id in (select rede_id from apagar) and r.nome <> 'SUPERMIX BRAZ'
union all
select 'MANTER empresa', e.nome || '  →  Supermix Braz', coalesce(r.nome, '-'),
       (select count(*) from rh.rh_entries x where x.empresa_id = e.id)::text || ' lançamentos (não mudam)', 'OK'
from rh.empresas e join original o on o.id = e.id left join public.redes r on r.id = e.rede_id
union all
select 'LOJA ' || l.codigo, coalesce(u.nome, '-') || '  →  ' || n.nome,
       'SUPERMIX BRAZ',
       'CNPJ ' || n.cnpj || ' (' || case when substr(n.cnpj, 9, 4) = '0001' then 'matriz' else 'filial' end || ')'
         || ' | faturamento lançado: ' || coalesce((select sum((x.data->'faturamento'->>l.codigo)::numeric)::text from rh.rh_entries x where x.empresa_id = l.empresa_id), '0'),
       case when exists (select 1 from public.lojas z where z.cnpj = n.cnpj and z.id <> l.unidade_id
                         and z.id not in (select l2.unidade_id from rh.lojas l2 where l2.empresa_id in (select id from apagar)))
            then 'NÃO – CNPJ já usado em outra unidade' else 'OK' end
from rh.lojas l join original o on o.id = l.empresa_id
left join public.lojas u on u.id = l.unidade_id
join novos n on n.codigo = l.codigo
union all
select 'APAGAR loja (vazia)', l.nome || ' (' || l.codigo || ')', 'SUPERMIX BRAZ',
       'unidade ' || coalesce(u.nome, '-') || ' | meses com valor: ' ||
         (select count(*) from rh.rh_entries e where e.empresa_id = l.empresa_id
            and (coalesce((e.data->'faturamento'->>l.codigo)::numeric, 0) <> 0
                 or exists (select 1 from jsonb_array_elements(coalesce(e.data->'items', '[]'::jsonb)) it where coalesce((it->>l.codigo)::numeric, 0) <> 0)))::text,
       case when exists (select 1 from rh.rh_entries e where e.empresa_id = l.empresa_id
                           and (coalesce((e.data->'faturamento'->>l.codigo)::numeric, 0) <> 0
                                or exists (select 1 from jsonb_array_elements(coalesce(e.data->'items', '[]'::jsonb)) it where coalesce((it->>l.codigo)::numeric, 0) <> 0)))
            then 'NÃO – tem valor lançado: NÃO será apagada' else 'OK' end
from rh.lojas l join original o on o.id = l.empresa_id left join public.lojas u on u.id = l.unidade_id
where l.codigo not in ('loja1', 'loja2', 'loja3', 'loja4')
union all
select 'TELA renomeada', t.codigo, 'PDV', t.nome || '  →  ' || x.nome, 'OK'
from public.telas t join (values ('pdv.caixa', 'Caixa'), ('pdv.pagamentos', 'Formas de pagamento')) as x(codigo, nome) on x.codigo = t.codigo
order by 1, 2;
