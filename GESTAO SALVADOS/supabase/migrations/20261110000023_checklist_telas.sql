-- =====================================================================
-- CHECK LIST OPERACIONAL entra no Ecossistema TB (sistema → grupos → telas + ações por unidade)
-- Regra do CLAUDE.md da raiz, passo 4. Espelho no front: src/lib/telas.ts (o npm test confere).
-- As tabelas do próprio sistema ficam em
-- "CHECK LIST OPERACIONAL/app-checklist-mobile/supabase/migrations/20261110000001_checklist_schema.sql"
-- (aplicar AQUELA primeiro, depois esta). NÃO APLICAR sem OK do usuário.
--  - Telas sem flag = bloqueadas: ninguém ganha acesso automático; o admin libera no Portal.
--  - A url fica nula até a publicação na Vercel (o usuário cadastra depois).
--  - Para a unidade aparecer no Check List, o admin marca "checklist" em Redes e unidades (lojas.sistemas).
-- =====================================================================

update public.sistemas set ativo = true, ordem = 40 where codigo = 'checklist';

insert into public.grupos (sistema, codigo, nome, ordem) values
  ('checklist', 'operacao',   'Operação',   10),
  ('checklist', 'supervisao', 'Supervisão', 20),
  ('checklist', 'cadastros',  'Cadastros',  30)
on conflict (sistema, codigo) do update set nome = excluded.nome, ordem = excluded.ordem;

insert into public.telas (codigo, nome, app, grupo, rota, ordem, somente_admin) values
  ('checklist.hoje',         'Minhas tarefas',            'checklist', 'operacao',   '/',             10, false),
  ('checklist.planos',       'Planos de ação',            'checklist', 'operacao',   '/planos',       20, false),
  ('checklist.loja',         'Tarefas da loja',           'checklist', 'supervisao', '/loja',         30, false),
  ('checklist.dashboard',    'Dashboard',                 'checklist', 'supervisao', '/dashboard',    40, false),
  ('checklist.relatorios',   'Relatórios',                'checklist', 'supervisao', '/relatorios',   50, false),
  ('checklist.agendamentos', 'Agendamentos',              'checklist', 'cadastros',  '/agendamentos', 60, false),
  ('checklist.modelos',      'Modelos de checklist',      'checklist', 'cadastros',  '/modelos',      70, false),
  ('checklist.equipe',       'Equipe e perfis',           'checklist', 'cadastros',  '/equipe',       80, false)
on conflict (codigo) do update set nome = excluded.nome, grupo = excluded.grupo, rota = excluded.rota,
  ordem = excluded.ordem, somente_admin = excluded.somente_admin, ativo = true;

insert into public.tela_acoes (tela_codigo, acao)
select t, unnest(a) from (values
  ('checklist.hoje',         array['ver','inserir','editar']),
  ('checklist.planos',       array['ver','inserir','editar']),
  ('checklist.loja',         array['ver','editar']),
  ('checklist.dashboard',    array['ver']),
  ('checklist.relatorios',   array['ver','exportar']),
  ('checklist.agendamentos', array['ver','inserir','editar']),
  ('checklist.modelos',      array['ver','inserir','editar']),
  ('checklist.equipe',       array['ver','inserir','editar'])
) as x(t, a)
on conflict do nothing;
