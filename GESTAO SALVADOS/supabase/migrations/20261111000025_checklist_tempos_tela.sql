-- =====================================================================
-- CHECK LIST OPERACIONAL – etapa 13: tela "Tempos de execução" (supervisor ou acima no Check List).
-- Espelho no front: GESTAO SALVADOS/src/lib/telas.ts e CHECK LIST OPERACIONAL/app-checklist-mobile/src/lib/telas.ts
-- (o npm test dos dois confere). Aplicar DEPOIS da 0023 e da 0024, e junto com
-- CHECK LIST OPERACIONAL/app-checklist-mobile/supabase/migrations/20261111000002_checklist_tempos.sql.
-- IDEMPOTENTE. NÃO APLICAR sem OK do usuário.
--  - Ninguém recebe a tela automaticamente: o admin libera em Login de acesso → Permissões.
--  - Os dados vêm de checklist.dados_tempos (só unidades em que a pessoa é supervisor ou gestor).
-- =====================================================================

insert into public.telas (codigo, nome, app, grupo, rota, ordem, somente_admin) values
  ('checklist.tempos',       'Tempos de execução',        'checklist', 'supervisao', '/tempos',       55, false)
on conflict (codigo) do update set nome = excluded.nome, grupo = excluded.grupo, rota = excluded.rota,
  ordem = excluded.ordem, somente_admin = excluded.somente_admin, ativo = true;

insert into public.tela_acoes (tela_codigo, acao)
select t, unnest(a) from (values
  ('checklist.tempos',       array['ver','exportar'])
) as x(t, a)
on conflict do nothing;
