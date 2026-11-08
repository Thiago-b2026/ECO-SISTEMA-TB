-- SÓ LEITURA. Rode ANTES de aplicar a migration 20261108000018_portal_redes_unidades.sql.
-- Mostra, por usuário, como as permissões de HOJE viram permissões POR UNIDADE (fase 1 do Portal):
--   unidades do PDV e do RH, e as ações por tela que ele terá em cada unidade.
-- As regras abaixo são CÓPIA EXATA das da migration (um teste confere).
-- Colunas: confere (OK / ATENÇÃO), alerta_admin (mais de 1 admin) e destaque (Natália).
-- A loja "SUPER MIX BRAZ" do PDV (CNPJ 17.890.178/0001-58, sem movimento) vira a unidade "Supermix Loja 1" (só RH).
with
regra_pdv (tela, acao, perfis, area, area_acao, chave) as (values
    ('pdv.pdv',              'ver',             array['admin','gerente','vendedor'],               'vendas',                'ver',     null),
    ('pdv.pdv',              'inserir',         array['admin','gerente','vendedor'],               'vendas',                'inserir', null),
    ('pdv.pdv',              'desconto',        array['admin','gerente','vendedor'],               'vendas',                'inserir', 'vendas.desconto'),
    ('pdv.pdv',              'sangria',         array['admin','gerente','vendedor'],               'caixa',                 'inserir', 'caixa.sangria'),
    ('pdv.pdv',              'suprimento',      array['admin','gerente','vendedor'],               'caixa',                 'inserir', 'caixa.suprimento'),
    ('pdv.vendas',           'ver',             array['admin','gerente','vendedor'],               'vendas',                'ver',     null),
    ('pdv.vendas',           'cancelar',        array['admin','gerente'],                          'vendas',                'ver',     'vendas.cancelar'),
    ('pdv.vendas',           'exportar',        array['admin','gerente','vendedor'],               'vendas',                'ver',     'dados.exportar'),
    ('pdv.caixa',            'ver',             array['admin','gerente','vendedor'],               'caixa',                 'ver',     null),
    ('pdv.caixa',            'inserir',         array['admin','gerente','vendedor'],               'caixa',                 'inserir', null),
    ('pdv.caixa',            'editar',          array['admin','gerente','vendedor'],               'caixa',                 'editar',  null),
    ('pdv.caixa',            'sangria',         array['admin','gerente','vendedor'],               'caixa',                 'inserir', 'caixa.sangria'),
    ('pdv.caixa',            'suprimento',      array['admin','gerente','vendedor'],               'caixa',                 'inserir', 'caixa.suprimento'),
    ('pdv.caixa',            'exportar',        array['admin','gerente','vendedor'],               'caixa',                 'ver',     'dados.exportar'),
    ('pdv.produtos',         'ver',             array['admin','gerente','vendedor','estoquista'],  'produtos',              'ver',     null),
    ('pdv.produtos',         'inserir',         array['admin','gerente','estoquista'],             'produtos',              'inserir', null),
    ('pdv.produtos',         'editar',          array['admin','gerente','estoquista'],             'produtos',              'editar',  null),
    ('pdv.produtos',         'alterar_preco',   array['admin','gerente','estoquista'],             'produtos',              'editar',  'produtos.alterar_preco'),
    ('pdv.produtos',         'ajustar_estoque', array['admin','gerente','estoquista'],             'produtos',              'inserir', 'produtos.ajustar_estoque'),
    ('pdv.produtos',         'ver_custo',       array['admin','gerente','vendedor','estoquista'],  'produtos',              'ver',     'produtos.ver_custo'),
    ('pdv.produtos',         'exportar',        array['admin','gerente','vendedor','estoquista'],  'produtos',              'ver',     'dados.exportar'),
    ('pdv.lotes',            'ver',             array['admin','gerente','estoquista'],             'lotes',                 'ver',     null),
    ('pdv.lotes',            'inserir',         array['admin','gerente','estoquista'],             'lotes',                 'inserir', null),
    ('pdv.lotes',            'editar',          array['admin','gerente','estoquista'],             'lotes',                 'editar',  null),
    ('pdv.lotes',            'excluir',         array['admin','gerente'],                          'lotes',                 'excluir', null),
    ('pdv.lotes',            'exportar',        array['admin','gerente','estoquista'],             'lotes',                 'ver',     'dados.exportar'),
    ('pdv.etiquetas',        'ver',             array['admin','gerente'],                          'produtos',              'ver',     null),
    ('pdv.etiquetas',        'inserir',         array['admin','gerente'],                          'produtos',              'inserir', null),
    ('pdv.etiquetas',        'editar',          array['admin','gerente'],                          'produtos',              'editar',  null),
    ('pdv.etiquetas',        'excluir',         array['admin','gerente'],                          'produtos',              'excluir', null),
    ('pdv.mercadologico',    'ver',             array['admin','gerente','estoquista'],             'produtos',              'ver',     null),
    ('pdv.mercadologico',    'inserir',         array['admin','gerente','estoquista'],             'produtos',              'inserir', null),
    ('pdv.mercadologico',    'editar',          array['admin','gerente','estoquista'],             'produtos',              'editar',  null),
    ('pdv.mercadologico',    'excluir',         array['admin','gerente','estoquista'],             'produtos',              'excluir', null),
    ('pdv.transferencias',   'ver',             array['admin','gerente','estoquista'],             'produtos',              'ver',     null),
    ('pdv.transferencias',   'inserir',         array['admin','gerente','estoquista'],             'produtos',              'inserir', null),
    ('pdv.transferencias',   'editar',          array['admin','gerente','estoquista'],             'produtos',              'editar',  null),
    ('pdv.mercado_livre',    'ver',             array['admin','gerente','estoquista'],             null,                    null,      null),
    ('pdv.pessoas',          'ver',             array['admin','gerente','vendedor','estoquista'],  'pessoas',               'ver',     null),
    ('pdv.pessoas',          'inserir',         array['admin','gerente','vendedor'],               'pessoas',               'inserir', null),
    ('pdv.pessoas',          'editar',          array['admin','gerente','vendedor'],               'pessoas',               'editar',  null),
    ('pdv.pessoas',          'excluir',         array['admin'],                                    'pessoas',               'excluir', null),
    ('pdv.pessoas',          'exportar',        array['admin','gerente','vendedor','estoquista'],  'pessoas',               'ver',     'dados.exportar'),
    ('pdv.pagamentos',       'ver',             array['admin','gerente'],                          'cadastros_financeiros', 'ver',     null),
    ('pdv.pagamentos',       'inserir',         array['admin','gerente'],                          'cadastros_financeiros', 'inserir', null),
    ('pdv.pagamentos',       'editar',          array['admin','gerente'],                          'cadastros_financeiros', 'editar',  null),
    ('pdv.pagamentos',       'excluir',         array['admin','gerente'],                          'cadastros_financeiros', 'excluir', null),
    ('pdv.contas_bancarias', 'ver',             array['admin','gerente'],                          'cadastros_financeiros', 'ver',     null),
    ('pdv.contas_bancarias', 'inserir',         array['admin','gerente'],                          'cadastros_financeiros', 'inserir', null),
    ('pdv.contas_bancarias', 'editar',          array['admin','gerente'],                          'cadastros_financeiros', 'editar',  null),
    ('pdv.plano_contas',     'ver',             array['admin','gerente'],                          'cadastros_financeiros', 'ver',     null),
    ('pdv.plano_contas',     'inserir',         array['admin','gerente'],                          'cadastros_financeiros', 'inserir', null),
    ('pdv.plano_contas',     'editar',          array['admin','gerente'],                          'cadastros_financeiros', 'editar',  null),
    ('pdv.plano_contas',     'excluir',         array['admin'],                                    'cadastros_financeiros', 'excluir', null),
    ('pdv.financeiro',       'ver',             array['admin','gerente'],                          'financeiro',            'ver',     null),
    ('pdv.financeiro',       'inserir',         array['admin','gerente'],                          'financeiro',            'inserir', null),
    ('pdv.financeiro',       'editar',          array['admin','gerente'],                          'financeiro',            'editar',  null),
    ('pdv.financeiro',       'exportar',        array['admin','gerente'],                          'financeiro',            'ver',     'dados.exportar'),
    ('pdv.dashboard',        'ver',             array['admin','gerente','vendedor','estoquista'],  null,                    null,      null),
    ('pdv.relatorios',       'ver',             array['admin','gerente'],                          'relatorios',            'ver',     null),
    ('pdv.relatorios',       'exportar',        array['admin','gerente'],                          'relatorios',            'ver',     'dados.exportar'),
    ('pdv.crm',              'ver',             array['admin','gerente','vendedor'],               'crm',                   'ver',     null),
    ('pdv.crm',              'inserir',         array['admin','gerente','vendedor'],               'crm',                   'inserir', null),
    ('pdv.crm',              'editar',          array['admin','gerente','vendedor'],               'crm',                   'editar',  null),
    ('pdv.crm',              'excluir',         array['admin','gerente'],                          'crm',                   'excluir', null),
    ('pdv.crm',              'exportar',        array['admin','gerente','vendedor'],               'crm',                   'ver',     'dados.exportar')
  ),
regra_rh (tela, acao, so_gestor) as (values
  ('rh.painel',    'ver',      false),
  ('rh.painel',    'inserir',  false),
  ('rh.painel',    'editar',   false),
  ('rh.painel',    'exportar', false),
  ('rh.historico', 'ver',      false),
  ('rh.historico', 'editar',   false),
  ('rh.global',    'ver',      false),
  ('rh.global',    'exportar', false),
  ('rh.empresas',  'ver',      false),
  ('rh.empresas',  'editar',   true)
),
nomes (tela, nome, ordem) as (select codigo, nome, ordem from public.telas),
usuarios as (
  select u.id, coalesce(pr.nome, u.email) as nome, u.email, ur.role::text as perfil,
         exists (select 1 from public.usuario_telas ut join public.telas t on t.codigo = ut.tela_codigo
                 where ut.user_id = u.id and ut.permitido and t.app = 'pdv') as tem_pdv,
         exists (select 1 from public.usuario_telas ut join public.telas t on t.codigo = ut.tela_codigo
                 where ut.user_id = u.id and ut.permitido and t.app = 'rh') as tem_tela_rh,
         exists (select 1 from public.usuario_telas ut join public.telas t on t.codigo = ut.tela_codigo
                 where ut.user_id = u.id and t.app = 'rh') as tem_linha_rh
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  left join public.user_roles ur on ur.user_id = u.id
),
-- PDV: o que a migration vai gravar como permitido (mesma regra)
pdv_depois as (
  select us.id as user_id, r.tela, r.acao
  from usuarios us cross join regra_pdv r
  where us.perfil is not null and us.perfil <> 'admin' and us.tem_pdv
    and coalesce((select ut.permitido from public.usuario_telas ut where ut.user_id = us.id and ut.tela_codigo = r.tela), false)
    and us.perfil = any (r.perfis)
    and (r.area is null or coalesce((
          select case r.area_acao when 'ver' then p.ver when 'inserir' then p.inserir when 'editar' then p.editar when 'excluir' then p.excluir end
          from public.permissoes p where p.user_id = us.id and p.modulo = r.area), true))
    and (r.chave is null or coalesce((select a.permitido from public.permissoes_acoes a where a.user_id = us.id and a.chave = r.chave), true))
),
pdv_unidades as (
  select us.id as user_id, string_agg(l.nome, ', ' order by l.nome) as nomes, count(*) as n
  from usuarios us join public.usuario_lojas ul on ul.user_id = us.id join public.lojas l on l.id = ul.loja_id and l.ativo
  where us.tem_pdv and us.perfil <> 'admin'
  group by us.id
),
-- RH: unidades da rede = lojas da empresa (viram "Supermix Loja 1/2/3")
rh_membro as (
  select m.user_id, m.papel::text as papel, e.nome as empresa,
         (select string_agg(split_part(e.nome, ' ', 1) || ' ' || rl.nome, ', ' order by rl.ordem) from rh.lojas rl where rl.empresa_id = e.id) as unidades
  from rh.empresa_membros m join rh.empresas e on e.id = m.empresa_id
),
rh_depois as (
  select m.user_id, r.tela, r.acao
  from rh_membro m cross join regra_rh r
  where not exists (select 1 from public.user_roles ur where ur.user_id = m.user_id and ur.role = 'admin')
    and (coalesce((select ut.permitido from public.usuario_telas ut where ut.user_id = m.user_id and ut.tela_codigo = r.tela), false)
         -- regra 3c: membro sem nenhuma tela de RH recebe Painel e Histórico
         or (r.tela in ('rh.painel', 'rh.historico')
             and not exists (select 1 from public.usuario_telas ut join public.telas t on t.codigo = ut.tela_codigo
                             where ut.user_id = m.user_id and t.app = 'rh')))
    and (not r.so_gestor or m.papel in ('owner', 'admin'))
),
resumo_acoes as (
  select x.user_id, string_agg(n.nome || ' (' || x.acoes || ')', '; ' order by n.ordem) as texto
  from (select user_id, tela, string_agg(acao, ', ' order by acao) as acoes
        from (select * from pdv_depois union all select * from rh_depois) z group by user_id, tela) x
  join nomes n on n.tela = x.tela
  group by x.user_id
),
admins as (select count(*) as n from public.user_roles where role = 'admin')
select
  us.nome                                                                  as usuario,
  us.email,
  coalesce(us.perfil, 'SEM PERFIL')                                        as perfil,
  case when us.perfil = 'admin' then 'TODAS (admin)'
       else coalesce('PDV: ' || pu.nomes, '') ||
            case when pu.nomes is not null and rm.unidades is not null then ' | ' else '' end ||
            coalesce('RH: ' || rm.unidades, '') end                        as unidades_depois,
  case when us.perfil = 'admin' then 'TUDO (admin)' else coalesce(ra.texto, '(nada)') end
                                                                           as telas_e_acoes_em_cada_unidade,
  case
    when us.perfil = 'admin' then 'OK'
    when us.tem_pdv and pu.n is null then 'ATENÇÃO: tem tela do PDV mas nenhuma unidade (marque a empresa dele)'
    when us.tem_tela_rh and rm.user_id is null then 'ATENÇÃO: tem tela do RH mas não está em nenhuma empresa do RH'
    when rm.user_id is not null and not us.tem_linha_rh then 'OK – sem tela de RH hoje: ganha Painel e Histórico (regra 3c)'
    else 'OK'
  end                                                                      as confere,
  case when (select n from admins) > 1 and us.perfil = 'admin'
       then 'ATENÇÃO: existem ' || (select n from admins) || ' usuários com perfil admin (o certo é só 1)'
       when (select n from admins) = 0 then 'ATENÇÃO: nenhum admin cadastrado'
       else '' end                                                         as alerta_admin,
  case when us.nome ~* 'nat(h)?alia' then '*** NATÁLIA: deve ter SÓ RH (Painel e Histórico) nas unidades da Supermix e NENHUMA unidade do PDV ***'
       else '' end                                                         as destaque
from usuarios us
left join pdv_unidades pu on pu.user_id = us.id
left join rh_membro rm on rm.user_id = us.id
left join resumo_acoes ra on ra.user_id = us.id
order by (us.perfil = 'admin') desc nulls last, us.nome ~* 'nat(h)?alia' desc, perfil, usuario;
