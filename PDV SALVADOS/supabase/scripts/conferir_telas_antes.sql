-- SÓ LEITURA. Rode ANTES de aplicar a migration 20261108000017_permissao_por_tela.sql.
-- Uma linha por usuário: perfil, sistemas, grupos e telas de HOJE x DEPOIS da migration,
-- a coluna "confere" e o alerta se houver mais de um admin.
--   HOJE   = o que ele vê agora (PDV: perfil + área com "ver"; RH: membro de empresa, Usuários se Dono/Admin)
--   DEPOIS = o que a migration grava (mesma regra; "Usuários do Gestão RH" passa a ser só do Admin)
with catalogo (codigo, nome, sistema, sistema_nome, grupo_nome, ordem, perfis, area) as (values
  ('pdv.pdv',              'PDV',                 'pdv', 'PDV Salvados', 'Vendas',      10,  array['admin','gerente','vendedor'],              'vendas'),
  ('pdv.vendas',           'Vendas e notas',      'pdv', 'PDV Salvados', 'Vendas',      20,  array['admin','gerente','vendedor'],              'vendas'),
  ('pdv.caixa',            'Caixa',               'pdv', 'PDV Salvados', 'Caixa',       30,  array['admin','gerente','vendedor'],              'caixa'),
  ('pdv.produtos',         'Produtos',            'pdv', 'PDV Salvados', 'Estoque',     40,  array['admin','gerente','vendedor','estoquista'], 'produtos'),
  ('pdv.lotes',            'Lotes',               'pdv', 'PDV Salvados', 'Estoque',     50,  array['admin','gerente','estoquista'],            'lotes'),
  ('pdv.etiquetas',        'Etiquetas',           'pdv', 'PDV Salvados', 'Estoque',     60,  array['admin','gerente'],                         'produtos'),
  ('pdv.mercadologico',    'Mercadológico',       'pdv', 'PDV Salvados', 'Estoque',     70,  array['admin','gerente','estoquista'],            'produtos'),
  ('pdv.transferencias',   'Transferências',      'pdv', 'PDV Salvados', 'Estoque',     80,  array['admin','gerente','estoquista'],            'produtos'),
  ('pdv.mercado_livre',    'Mercado Livre',       'pdv', 'PDV Salvados', 'Estoque',     90,  array['admin','gerente','estoquista'],            null),
  ('pdv.pessoas',          'Pessoas',             'pdv', 'PDV Salvados', 'Cadastros',   100, array['admin'],                                   'pessoas'),
  ('pdv.pagamentos',       'Formas de pagamento', 'pdv', 'PDV Salvados', 'Cadastros',   120, array['admin','gerente'],                         'cadastros_financeiros'),
  ('pdv.contas_bancarias', 'Contas bancárias',    'pdv', 'PDV Salvados', 'Cadastros',   130, array['admin','gerente'],                         'cadastros_financeiros'),
  ('pdv.plano_contas',     'Plano de contas',     'pdv', 'PDV Salvados', 'Cadastros',   140, array['admin','gerente'],                         'cadastros_financeiros'),
  ('pdv.financeiro',       'Financeiro',          'pdv', 'PDV Salvados', 'Financeiro',  160, array['admin','gerente'],                         'financeiro'),
  ('pdv.dashboard',        'Dashboard',           'pdv', 'PDV Salvados', 'Relatórios',  170, array['admin','gerente','vendedor','estoquista'], null),
  ('pdv.relatorios',       'Relatórios',          'pdv', 'PDV Salvados', 'Relatórios',  180, array['admin','gerente'],                         'relatorios'),
  ('pdv.crm',              'CRM',                 'pdv', 'PDV Salvados', 'CRM',         190, array['admin','gerente','vendedor'],              'crm'),
  ('rh.painel',            'Painel',              'rh',  'Gestão RH',    'Lançamentos', 210, array[]::text[],                              null),
  ('rh.historico',         'Histórico',           'rh',  'Gestão RH',    'Lançamentos', 220, array[]::text[],                              null),
  ('rh.global',            'Visão Global',        'rh',  'Gestão RH',    'Consolidado', 230, array[]::text[],                              null),
  ('rh.empresas',          'Empresas',            'rh',  'Gestão RH',    'Consolidado', 240, array[]::text[],                              null),
  ('rh.usuarios',          'Usuários do RH',      'rh',  'Gestão RH',    'Consolidado', 250, array[]::text[],                              null)
),
usuarios as (
  select u.id, coalesce(pr.nome, u.email) as nome, u.email, ur.role::text as perfil,
         exists (select 1 from rh.empresa_membros m where m.user_id = u.id) as membro_rh,
         exists (select 1 from rh.empresa_membros m where m.user_id = u.id and m.papel in ('owner', 'admin')) as gestor_rh
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  left join public.user_roles ur on ur.user_id = u.id
),
regra_pdv as (
  select us.id as user_id, c.codigo
  from usuarios us cross join catalogo c
  where c.sistema = 'pdv' and us.perfil = any (c.perfis)
    and (c.area is null or coalesce((select p.ver from public.permissoes p where p.user_id = us.id and p.modulo = c.area), true))
),
hoje as (
  select user_id, codigo from regra_pdv
  union all
  select us.id, c.codigo from usuarios us cross join catalogo c
  where c.sistema = 'rh' and us.perfil is not null and us.perfil <> 'admin' and us.membro_rh
    and (c.codigo <> 'rh.usuarios' or us.gestor_rh)
),
depois as (
  select user_id, codigo from regra_pdv
  union all
  select us.id, c.codigo from usuarios us cross join catalogo c
  where c.sistema = 'rh' and c.codigo <> 'rh.usuarios' and us.perfil is not null and us.perfil <> 'admin' and us.membro_rh
),
resumo as (
  select us.*,
    (select string_agg(distinct c.sistema_nome, ', ') from hoje h join catalogo c using (codigo) where h.user_id = us.id)                         as sist_hoje,
    (select string_agg(distinct c.sistema_nome, ', ') from depois d join catalogo c using (codigo) where d.user_id = us.id)                       as sist_depois,
    (select string_agg(distinct c.sistema || ':' || c.grupo_nome, ', ') from hoje h join catalogo c using (codigo) where h.user_id = us.id)       as grup_hoje,
    (select string_agg(distinct c.sistema || ':' || c.grupo_nome, ', ') from depois d join catalogo c using (codigo) where d.user_id = us.id)     as grup_depois,
    (select string_agg(c.nome, ', ' order by c.ordem) from hoje h join catalogo c using (codigo) where h.user_id = us.id)                         as tel_hoje,
    (select string_agg(c.nome, ', ' order by c.ordem) from depois d join catalogo c using (codigo) where d.user_id = us.id)                       as tel_depois,
    (select string_agg(h.codigo, ',' order by h.codigo) from hoje h where h.user_id = us.id and h.codigo <> 'rh.usuarios')                      as chave_hoje,
    (select string_agg(d.codigo, ',' order by d.codigo) from depois d where d.user_id = us.id)                                                  as chave_depois
  from usuarios us
),
admins as (select count(*) as n from public.user_roles where role = 'admin')
select
  r.nome                                                           as usuario,
  r.email,
  coalesce(r.perfil, 'SEM PERFIL')                                 as perfil,
  case when r.perfil = 'admin' then 'TODOS (admin)' else coalesce(r.sist_hoje, '(nenhum)') end     as sistemas_hoje,
  case when r.perfil = 'admin' then 'TODOS (admin)' else coalesce(r.sist_depois, '(nenhum)') end   as sistemas_depois,
  case when r.perfil = 'admin' then 'TODOS (admin)' else coalesce(r.grup_hoje, '(nenhum)') end     as grupos_hoje,
  case when r.perfil = 'admin' then 'TODOS (admin)' else coalesce(r.grup_depois, '(nenhum)') end   as grupos_depois,
  case when r.perfil = 'admin' then 'TODAS (admin)' else coalesce(r.tel_hoje, '(nenhuma)') end     as telas_hoje,
  case when r.perfil = 'admin' then 'TODAS (admin)' else coalesce(r.tel_depois, '(nenhuma)') end   as telas_depois,
  case
    when r.perfil = 'admin' then 'OK'
    when r.chave_hoje is not distinct from r.chave_depois and r.gestor_rh then 'OK – Usuários do RH agora só Admin'
    when r.chave_hoje is not distinct from r.chave_depois then 'OK'
    else 'DIFERENTE – me avise'
  end                                                              as confere,
  case when (select n from admins) > 1 and r.perfil = 'admin'
       then 'ATENÇÃO: existem ' || (select n from admins) || ' usuários com perfil admin (o certo é só 1)'
       when (select n from admins) = 0 then 'ATENÇÃO: nenhum admin cadastrado'
       else '' end                                                 as alerta_admin
from resumo r
order by (r.perfil = 'admin') desc nulls last, perfil, usuario;
