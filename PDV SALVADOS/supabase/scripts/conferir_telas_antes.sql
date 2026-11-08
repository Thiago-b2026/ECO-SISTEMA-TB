-- SÓ LEITURA. Rode ANTES de aplicar a migration 20261108000017_permissao_por_tela.sql.
-- Mostra, para cada usuário, as telas que ele VAI TER depois da migration, lado a lado com
-- as telas que ele vê HOJE pelo menu (perfil + área com "ver"). As duas colunas devem ser iguais:
-- a coluna "confere" mostra OK quando ninguém perde nem ganha tela.
with regra (codigo, nome, ordem, perfis, area) as (values
  ('vendas.pdv',                 'PDV',                    10,  array['admin','gerente','vendedor'],              'vendas'),
  ('vendas.notas',               'Vendas e notas',         20,  array['admin','gerente','vendedor'],              'vendas'),
  ('caixa.movimentacoes',        'Caixa',                  30,  array['admin','gerente','vendedor'],              'caixa'),
  ('estoque.produtos',           'Produtos',               40,  array['admin','gerente','vendedor','estoquista'], 'produtos'),
  ('estoque.lotes',              'Lotes',                  50,  array['admin','gerente','estoquista'],            'lotes'),
  ('estoque.etiquetas',          'Etiquetas',              60,  array['admin','gerente'],                         'produtos'),
  ('estoque.mercadologico',      'Mercadológico',          70,  array['admin','gerente','estoquista'],            'produtos'),
  ('estoque.transferencias',     'Transferências',         80,  array['admin','gerente','estoquista'],            'produtos'),
  ('estoque.mercado_livre',      'Mercado Livre',          90,  array['admin','gerente','estoquista'],            null),
  ('cadastros.pessoas',          'Pessoas',                100, array['admin'],                                   'pessoas'),
  ('cadastros.pagamentos',       'Formas de pagamento',    120, array['admin','gerente'],                         'cadastros_financeiros'),
  ('cadastros.contas_bancarias', 'Contas bancárias',       130, array['admin','gerente'],                         'cadastros_financeiros'),
  ('cadastros.plano_contas',     'Plano de contas',        140, array['admin','gerente'],                         'cadastros_financeiros'),
  ('financeiro.financeiro',      'Financeiro',             160, array['admin','gerente'],                         'financeiro'),
  ('relatorios.dashboard',       'Dashboard',              170, array['admin','gerente','vendedor','estoquista'], null),
  ('relatorios.relatorios',      'Relatórios',             180, array['admin','gerente'],                         'relatorios'),
  ('crm.whatsapp',               'CRM',                    190, array['admin','gerente','vendedor'],              'crm')
),
-- o que o menu mostra HOJE (mesma checagem do nav.ts: perfil na lista + pode(área, 'ver'))
hoje as (
  select ur.user_id, r.nome, r.ordem
  from public.user_roles ur cross join regra r
  where ur.role::text = any (r.perfis)
    and (r.area is null or coalesce((select p.ver from public.permissoes p where p.user_id = ur.user_id and p.modulo = r.area), true))
),
-- o que a migration vai gravar como permitido (mesma regra, escrita como na migration)
depois as (
  select ur.user_id, r.nome, r.ordem
  from public.user_roles ur cross join regra r
  where ur.role <> 'admin'
    and ur.role::text = any (r.perfis)
    and (r.area is null or coalesce((select p.ver from public.permissoes p where p.user_id = ur.user_id and p.modulo = r.area), true))
),
rh as (
  select m.user_id,
         string_agg(distinct e.nome || ' (' || m.papel::text || ')', ', ') as empresas,
         bool_or(m.papel in ('owner', 'admin')) as gestor
  from rh.empresa_membros m join rh.empresas e on e.id = m.empresa_id
  group by m.user_id
)
select
  coalesce(pr.nome, u.email)                                  as usuario,
  u.email,
  coalesce(ur.role::text, 'SEM PERFIL')                       as perfil,
  case when ur.role = 'admin' then 'TODAS (admin)'
       else coalesce((select string_agg(h.nome, ', ' order by h.ordem) from hoje h where h.user_id = u.id), '(nenhuma)') end
                                                              as telas_eco_hoje,
  case when ur.role = 'admin' then 'TODAS (admin)'
       else coalesce((select string_agg(d.nome, ', ' order by d.ordem) from depois d where d.user_id = u.id), '(nenhuma)') end
                                                              as telas_eco_depois,
  case when ur.role = 'admin' then 'TODAS (admin)'
       when rh.user_id is null then '(nenhuma)'
       when rh.gestor then 'Painel, Histórico, Visão Global, Empresas, Usuários'
       else 'Painel, Histórico, Visão Global, Empresas' end    as telas_rh_depois,
  coalesce(rh.empresas, '—')                                  as empresas_rh_hoje,
  case when ur.role = 'admin' then 'OK'
       when (select string_agg(h.nome, ',' order by h.ordem) from hoje h where h.user_id = u.id)
            is not distinct from
            (select string_agg(d.nome, ',' order by d.ordem) from depois d where d.user_id = u.id) then 'OK'
       else 'DIFERENTE – me avise' end                       as confere
from auth.users u
left join public.profiles pr on pr.id = u.id
left join public.user_roles ur on ur.user_id = u.id
left join rh on rh.user_id = u.id
order by (ur.role = 'admin') desc nulls last, perfil, usuario;
