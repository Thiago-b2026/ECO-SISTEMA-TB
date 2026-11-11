-- =====================================================================
-- CHECK LIST OPERACIONAL – etapa 12 (multiempresa): tela "Empresas e lojas", só do Admin.
-- Espelho no front: src/lib/telas.ts (o npm test confere). Aplicar DEPOIS da 0023.
-- NÃO APLICAR sem OK do usuário.
--  - somente_admin = true: não tem checkbox no editor de permissões; só o admin entra.
--  - O editor de checklists fica dentro de "Modelos de checklist" e o cadastro de colaboradores
--    dentro de "Equipe e perfis" (telas que já existem na 0023).
-- =====================================================================

insert into public.telas (codigo, nome, app, grupo, rota, ordem, somente_admin) values
  ('checklist.empresas',     'Empresas e lojas',          'checklist', 'cadastros',  '/empresas',     90, true)
on conflict (codigo) do update set nome = excluded.nome, grupo = excluded.grupo, rota = excluded.rota,
  ordem = excluded.ordem, somente_admin = excluded.somente_admin, ativo = true;

insert into public.tela_acoes (tela_codigo, acao)
select t, unnest(a) from (values
  ('checklist.empresas',     array['ver','inserir','editar'])
) as x(t, a)
on conflict do nothing;
