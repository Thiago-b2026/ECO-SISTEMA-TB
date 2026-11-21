-- =====================================================================
-- EXCLUIR CADASTRO DE PESSOA (cliente, fornecedor, funcionário) que NUNCA teve movimento.
-- Regra do sistema: nunca apagar histórico. Quem tem histórico é Inativado.
--  - Só o admin.
--  - Quem tem login precisa ter o login excluído antes (botão "Excluir usuário", que tem as regras do login).
--  - "Movimento" = qualquer linha, em qualquer tabela de qualquer schema, com chave estrangeira para public.pessoas
--    (vendas, financeiro, CRM, e o que vier depois). A lista é lida do próprio banco (pg_constraint),
--    então tabela nova que apontar para pessoas já entra na regra sem mexer aqui.
-- =====================================================================

create or replace function public.motivos_excluir_pessoa(_pessoa_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  r record;
  n bigint;
  motivos text[] := '{}';
  p public.pessoas%rowtype;
begin
  if not public.is_admin() then
    return array['só o administrador exclui cadastros'];
  end if;
  select * into p from public.pessoas where id = _pessoa_id;
  if not found then
    return array['cadastro não encontrado'];
  end if;
  if p.user_id is not null then
    motivos := motivos || 'tem login de acesso (exclua o usuário primeiro)'::text;
  end if;

  for r in
    select n2.nspname as esquema, c2.relname as tabela, a.attname as coluna
      from pg_constraint k
      join pg_class c2 on c2.oid = k.conrelid
      join pg_namespace n2 on n2.oid = c2.relnamespace
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     where k.contype = 'f'
       and k.confrelid = 'public.pessoas'::regclass
       and array_length(k.conkey, 1) = 1
  loop
    execute format('select count(*) from %I.%I where %I = $1', r.esquema, r.tabela, r.coluna) into n using _pessoa_id;
    if n > 0 then
      motivos := motivos || format('%s registro(s) em %s', n, case when r.esquema = 'public' then r.tabela else r.esquema || '.' || r.tabela end);
    end if;
  end loop;
  return motivos;
end;
$$;

create or replace function public.excluir_pessoa(_pessoa_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  motivos text[];
begin
  if not public.is_admin() then
    raise exception 'Só o administrador exclui cadastros.';
  end if;
  -- trava a linha para ninguém lançar movimento no meio da conferência
  perform 1 from public.pessoas where id = _pessoa_id for update;
  motivos := public.motivos_excluir_pessoa(_pessoa_id);
  if array_length(motivos, 1) > 0 then
    raise exception 'Não pode excluir: %. Use Inativar.', array_to_string(motivos, '; ');
  end if;
  delete from public.pessoas where id = _pessoa_id;
end;
$$;

revoke all on function public.motivos_excluir_pessoa(uuid) from public, anon;
revoke all on function public.excluir_pessoa(uuid) from public, anon;
grant execute on function public.motivos_excluir_pessoa(uuid) to authenticated;
grant execute on function public.excluir_pessoa(uuid) to authenticated;
