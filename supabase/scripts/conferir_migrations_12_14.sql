-- Confere se as migrations 12, 13 e 14 estão aplicadas (só leitura, não altera nada).
select item, case when ok then 'OK' else 'FALTA' end as situacao from (values
  ('12 - comparativo só lojas ativas',  exists (select 1 from pg_proc where proname = 'relatorio_por_loja' and prosrc ilike '%lj.ativo%')),
  ('13 - tabela permissoes',            to_regclass('public.permissoes') is not null),
  ('13 - tabela auditoria',             to_regclass('public.auditoria') is not null),
  ('13 - auditoria ligada nas vendas',  exists (select 1 from pg_trigger where tgname = 'trg_auditoria' and tgrelid = 'public.vendas'::regclass)),
  ('13 - usuário novo sem loja automática', not exists (select 1 from pg_trigger where tgname = 'on_profile_vincula_loja')),
  ('14 - tabela permissoes_acoes',      to_regclass('public.permissoes_acoes') is not null),
  ('14 - bloqueio de desconto/cancelamento', exists (select 1 from pg_trigger where tgname = 'trg_acoes' and tgrelid = 'public.vendas'::regclass))
) as t(item, ok);
