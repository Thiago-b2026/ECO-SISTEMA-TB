-- =====================================================================
-- META DE VENDAS E PREMIAÇÃO entra no Ecossistema TB (sistema → grupos → telas + ações por unidade)
-- Regra do CLAUDE.md da raiz, passo 4. Espelho no front: src/lib/telas.ts (o npm test confere).
-- As tabelas do próprio sistema ficam em
-- "META-DE-VENDAS/supabase/migrations/20261115000001_metas_schema.sql"
-- (aplicar AQUELA primeiro, depois esta). Vem depois da 0026 (Portal: POP e Precificação).
-- NÃO APLICAR sem OK do usuário.
--  - Telas sem flag = bloqueadas: ninguém ganha acesso automático; o admin libera nas Permissões.
--  - A url fica nula até a publicação na Vercel (cadastrar depois em public.sistemas).
--  - Para a unidade aparecer no Meta de Vendas, o admin marca "metas" na unidade (lojas.sistemas).
--  - Ação nova no catálogo: "fechar_mes" (fechar e reabrir o mês da unidade).
--  - "Empresas e lojas" e "Usuários e acessos" são só do admin (sem checkbox): cadastro único do ecossistema.
-- =====================================================================

insert into public.sistemas (codigo, nome, url, ordem, ativo) values
  ('metas', 'Meta de Vendas e Premiação', null, 45, true)
on conflict (codigo) do update set nome = excluded.nome, ordem = excluded.ordem, ativo = true;

insert into public.acoes (codigo, nome, ordem, especial) values
  ('fechar_mes', 'Fechar / reabrir mês', 130, true)
on conflict (codigo) do update set nome = excluded.nome, ordem = excluded.ordem, especial = excluded.especial;

insert into public.grupos (sistema, codigo, nome, ordem) values
  ('metas', 'acompanhamento', 'Acompanhamento', 10),
  ('metas', 'lancamentos',    'Lançamentos',    20),
  ('metas', 'cadastros',      'Cadastros',      30)
on conflict (sistema, codigo) do update set nome = excluded.nome, ordem = excluded.ordem;

insert into public.telas (codigo, nome, app, grupo, rota, ordem, somente_admin) values
  ('metas.dashboard',      'Dashboard',               'metas', 'acompanhamento', '/dashboard',      10, false),
  ('metas.ranking',        'Ranking',                 'metas', 'acompanhamento', '/ranking',        20, false),
  ('metas.meu_desempenho', 'Meu desempenho',          'metas', 'acompanhamento', '/meu-desempenho', 30, false),
  ('metas.historico',      'Histórico',               'metas', 'acompanhamento', '/historico',      40, false),
  ('metas.lancamentos',    'Lançamentos do mês',      'metas', 'lancamentos',    '/lancamentos',    50, false),
  ('metas.vendedores',     'Vendedores',              'metas', 'cadastros',      '/vendedores',     60, false),
  ('metas.configuracao',   'Meta e fechamento do mês', 'metas', 'cadastros',     '/configuracao',   70, false),
  ('metas.empresas',       'Empresas e lojas',        'metas', 'cadastros',      '/empresas',       80, true),
  ('metas.usuarios',       'Usuários e acessos',      'metas', 'cadastros',      '/usuarios',       90, true)
on conflict (codigo) do update set nome = excluded.nome, grupo = excluded.grupo, rota = excluded.rota,
  ordem = excluded.ordem, somente_admin = excluded.somente_admin, ativo = true;

insert into public.tela_acoes (tela_codigo, acao)
select t, unnest(a) from (values
  ('metas.dashboard',      array['ver']),
  ('metas.ranking',        array['ver']),
  ('metas.meu_desempenho', array['ver','editar']),
  ('metas.historico',      array['ver','exportar']),
  ('metas.lancamentos',    array['ver','inserir','editar','excluir']),
  ('metas.vendedores',     array['ver','inserir','editar']),
  ('metas.configuracao',   array['ver','editar','fechar_mes']),
  ('metas.empresas',       array['ver','inserir','editar']),
  ('metas.usuarios',       array['ver','inserir','editar'])
) as x(t, a)
on conflict do nothing;
