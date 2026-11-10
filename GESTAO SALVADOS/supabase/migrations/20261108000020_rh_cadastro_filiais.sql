-- =====================================================================
-- GESTÃO RH – cadastro SIMPLES de filiais (só admin). Aplicar DEPOIS da 0019.
--  * FLAG "mostrar" em cada filial: marcado = a filial aparece nos resultados (coluna no Painel e
--    na Visão Global); desmarcado = some dos resultados, mas o histórico fica guardado e volta ao marcar.
--  * + ADICIONAR FILIAL usa rh.adicionar_loja(empresa, nome, cnpj) da 0019 (já entra marcada).
--  * + NOVA EMPRESA: rh.nova_empresa(nome, nome da 1ª loja, cnpj da 1ª loja).
--  * Editar / Excluir (só sem histórico): rh.editar_loja e rh.excluir_loja da 0019.
-- =====================================================================

alter table rh.lojas add column if not exists mostrar boolean not null default true;

-- Marcar / desmarcar a filial nos resultados
create or replace function rh.mostrar_loja(p_loja uuid, p_mostrar boolean)
returns void language plpgsql security definer set search_path = rh, public as $$
begin
  if not public.is_admin() then raise exception 'Só o administrador marca ou desmarca filiais.'; end if;
  update rh.lojas set mostrar = coalesce(p_mostrar, true) where id = p_loja;
  if not found then raise exception 'Filial não encontrada.'; end if;
end $$;

-- Nova EMPRESA (não usar para loja da mesma empresa: para isso existe + ADICIONAR FILIAL)
create or replace function rh.nova_empresa(p_nome text, p_loja_nome text, p_loja_cnpj text default null)
returns uuid language plpgsql security definer set search_path = rh, public as $$
declare v_id uuid; v_rede uuid;
begin
  if auth.uid() is null then raise exception 'Faça login para cadastrar uma empresa.'; end if;
  if not public.is_admin() then raise exception 'Só o administrador cadastra empresas.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome da empresa.'; end if;
  if exists (select 1 from rh.empresas where upper(trim(nome)) = upper(trim(p_nome))) then
    raise exception 'Já existe uma empresa com esse nome. Para loja da mesma empresa, use + ADICIONAR FILIAL.';
  end if;
  insert into public.redes (nome, ordem) values (upper(trim(p_nome)), 90) on conflict (nome) do nothing;
  select id into v_rede from public.redes where nome = upper(trim(p_nome));
  insert into rh.empresas (nome, cnpj, rede_id) values (trim(p_nome), rh._cnpj_ou_nulo(p_loja_cnpj), v_rede)
  returning id into v_id;
  insert into rh.empresa_membros (empresa_id, user_id, papel) values (v_id, auth.uid(), 'owner');
  perform rh.adicionar_loja(v_id, coalesce(nullif(trim(p_loja_nome), ''), trim(p_nome)), p_loja_cnpj);
  return v_id;
end $$;

-- Lista das filiais para a tela Empresas (com o flag e se pode excluir)
drop function if exists rh.lojas_da_empresa(uuid);
create or replace function rh.lojas_da_empresa(p_empresa uuid)
returns table (id uuid, codigo text, nome text, ordem int, unidade_id uuid, cnpj text, tipo text, mostrar boolean, pode_excluir boolean)
language sql stable security definer set search_path = rh, public as $$
  select l.id, l.codigo, l.nome, l.ordem, l.unidade_id, u.cnpj, u.tipo, l.mostrar,
         public.is_admin() and rh.pode_excluir_loja(l.id)
  from rh.lojas l left join public.lojas u on u.id = l.unidade_id
  where l.empresa_id = p_empresa and rh.is_membro(p_empresa)
  order by l.ordem;
$$;

revoke all on function rh.mostrar_loja(uuid, boolean) from public, anon;
revoke all on function rh.nova_empresa(text, text, text) from public, anon;
revoke all on function rh.lojas_da_empresa(uuid) from public, anon;
grant execute on function rh.mostrar_loja(uuid, boolean), rh.nova_empresa(text, text, text), rh.lojas_da_empresa(uuid) to authenticated;

notify pgrst, 'reload schema';
