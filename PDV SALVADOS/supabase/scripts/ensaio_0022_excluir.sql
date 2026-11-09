-- ENSAIO da migration 0022: roda tudo numa transação e DESFAZ no final (o erro "ENSAIO 0022" é proposital).
-- Gerado a partir de migrations/20261108000022_excluir_produto_usuario.sql — se mudar a migration, gere de novo.
begin;
-- =====================================================================
-- PDV (Gestão Salvados): EXCLUIR PRODUTO e EXCLUIR USUÁRIO só quando nunca houve movimento.
-- Só cria FUNÇÕES. Não altera nenhuma tabela, não mexe no schema rh (só lê) nem no Portal.
--
-- Produto (só o admin): bloqueia se já foi VENDIDO, TRANSFERIDO ou VEIO DE LOTE.
--   Entrada/ajuste manual não bloqueia (o histórico de estoque do produto sai junto).
-- Usuário (só o admin, pela função de servidor admin-usuarios): bloqueia se tem venda, caixa,
--   sangria/suprimento, lançamento financeiro, transferência, movimento de estoque, lote/triagem,
--   produto cadastrado, CRM, faturamento do DRE, modelo de etiqueta ou se usa o Gestão RH.
-- =====================================================================

-- ---------- PRODUTO ----------
create or replace function public.motivos_nao_excluir_produto(_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when exists (select 1 from public.venda_itens where produto_id = _id) then 'já foi vendido' end,
    case when exists (select 1 from public.transferencia_itens where produto_id = _id or produto_destino = _id) then 'já foi transferido' end,
    case when exists (select 1 from public.produtos where id = _id and (lote_id is not null or lote_item_id is not null)) then 'veio de lote' end
  ], null);
$$;

-- Produtos que o admin pode excluir (para mostrar o botão só neles). _loja_id null = todas as lojas.
create or replace function public.produtos_excluiveis(_loja_id uuid default null)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.produtos p
  where public.is_admin()
    and (_loja_id is null or p.loja_id = _loja_id)
    and p.lote_id is null and p.lote_item_id is null
    and not exists (select 1 from public.venda_itens v where v.produto_id = p.id)
    and not exists (select 1 from public.transferencia_itens t where t.produto_id = p.id or t.produto_destino = p.id);
$$;

create or replace function public.excluir_produto(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _m text[];
begin
  if not public.is_admin() then raise exception 'Só o admin pode excluir produto.'; end if;
  perform 1 from public.produtos where id = _id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  _m := public.motivos_nao_excluir_produto(_id);
  if cardinality(_m) > 0 then
    raise exception 'Não pode excluir, já tem histórico (%). Use Inativar.', array_to_string(_m, ', ');
  end if;
  delete from public.produtos where id = _id;
end $$;

-- ---------- USUÁRIO ----------
create or replace function public.motivos_nao_excluir_usuario(_uid uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare _m text[] := array[]::text[]; _rh boolean := false;
begin
  -- quem chama pelo site precisa ser admin; a função de servidor (service_role) não tem auth.uid()
  if auth.uid() is not null and not public.is_admin() then raise exception 'Só o admin.'; end if;

  if exists (select 1 from public.vendas where vendedor_id = _uid or cancelado_por = _uid) then _m := _m || 'vendas'; end if;
  if exists (select 1 from public.caixas where operador_id = _uid) then _m := _m || 'caixa'; end if;
  if exists (select 1 from public.caixa_movimentos where user_id = _uid) then _m := _m || 'sangria/suprimento'; end if;
  if exists (select 1 from public.lancamentos where created_by = _uid) then _m := _m || 'lançamentos financeiros'; end if;
  if exists (select 1 from public.transferencias where enviado_por = _uid or recebido_por = _uid) then _m := _m || 'transferências'; end if;
  if exists (select 1 from public.stock_movements where user_id = _uid) then _m := _m || 'movimentos de estoque'; end if;
  if exists (select 1 from public.lotes where created_by = _uid) or exists (select 1 from public.lote_itens where operador_id = _uid) then _m := _m || 'lotes/triagem'; end if;
  if exists (select 1 from public.produtos where created_by = _uid) then _m := _m || 'produtos cadastrados'; end if;
  if exists (select 1 from public.crm_campanhas where created_by = _uid) or exists (select 1 from public.crm_envios where enviado_por = _uid)
     or exists (select 1 from public.crm_pedidos where created_by = _uid) then _m := _m || 'CRM'; end if;
  if exists (select 1 from public.dre_faturamento where updated_by = _uid) then _m := _m || 'faturamento do DRE'; end if;
  if exists (select 1 from public.modelos_etiqueta where created_by = _uid) then _m := _m || 'modelos de etiqueta'; end if;

  -- Gestão RH (mesmo login): telas do RH liberadas, membro de empresa ou histórico de lançamentos
  _rh := exists (select 1 from public.usuario_telas where user_id = _uid and permitido and tela_codigo like 'rh.%');
  if not _rh and to_regclass('rh.empresa_membros') is not null then
    execute 'select exists (select 1 from rh.empresa_membros where user_id = $1)
                 or exists (select 1 from rh.rh_entries where updated_by = $1)
                 or exists (select 1 from rh.rh_entries_log where alterado_por = $1)'
      into _rh using _uid;
  end if;
  if _rh then _m := _m || 'usa o Gestão RH'; end if;

  return _m;
end $$;

revoke all on function public.motivos_nao_excluir_produto(uuid) from public, anon;
revoke all on function public.produtos_excluiveis(uuid) from public, anon;
revoke all on function public.excluir_produto(uuid) from public, anon;
revoke all on function public.motivos_nao_excluir_usuario(uuid) from public, anon;
grant execute on function public.motivos_nao_excluir_produto(uuid) to authenticated, service_role;
grant execute on function public.produtos_excluiveis(uuid) to authenticated, service_role;
grant execute on function public.excluir_produto(uuid) to authenticated, service_role;
grant execute on function public.motivos_nao_excluir_usuario(uuid) to authenticated, service_role;

-- ===================== TESTES (tudo é desfeito pelo erro no final) =====================
do $$
declare r text := ''; _admin uuid; _p uuid; _pv uuid; _n int; _x record;
begin
  select count(*) into _n from public.produtos;
  r := r || 'Produtos no banco: ' || _n;
  select user_id into _admin from public.user_roles where role = 'admin' order by user_id limit 1;
  perform set_config('request.jwt.claim.sub', _admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', _admin, 'role', 'authenticated')::text, true);

  for _x in select l.nome, (select count(*) from public.produtos p where p.loja_id = l.id) tot,
                   (select count(*) from public.produtos_excluiveis(l.id)) exc
            from public.lojas l order by l.nome loop
    if _x.tot > 0 then r := r || E'\n  ' || _x.nome || ': ' || _x.tot || ' produtos, ' || _x.exc || ' podem ser excluídos'; end if;
  end loop;

  select produto_id into _pv from public.venda_itens where produto_id is not null limit 1;
  if _pv is not null then
    begin
      perform public.excluir_produto(_pv);
      r := r || E'\nERRO: excluiu um produto vendido!';
    exception when others then r := r || E'\nOK produto vendido barrado: ' || sqlerrm; end;
  end if;

  select id into _p from public.produtos_excluiveis(null) limit 1;
  if _p is not null then
    perform public.excluir_produto(_p);
    r := r || E'\nOK excluiu um produto sem histórico: ' || case when exists (select 1 from public.produtos where id = _p) then 'NÃO (ERRO)' else 'sim (desfeito)' end;
  else
    r := r || E'\n(nenhum produto sem histórico para testar a exclusão)';
  end if;

  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.excluir_produto(coalesce(_pv, _p));
    r := r || E'\nERRO: quem não é admin conseguiu excluir!';
  exception when others then r := r || E'\nOK não-admin barrado: ' || sqlerrm; end;

  -- usuários: como a função de servidor (sem auth.uid)
  perform set_config('request.jwt.claim.sub', '', true);
  r := r || E'\nUsuários:';
  for _x in select coalesce(pr.nome, ur.user_id::text) nome, ur.role, public.motivos_nao_excluir_usuario(ur.user_id) m
            from public.user_roles ur left join public.profiles pr on pr.id = ur.user_id order by 1 loop
    r := r || E'\n  ' || _x.nome || ' (' || _x.role || '): ' ||
         case when _x.role = 'admin' then 'admin, não pode ser excluído'
              when cardinality(_x.m) = 0 then 'PODE excluir' else 'bloqueado: ' || array_to_string(_x.m, ', ') end;
  end loop;

  raise exception E'ENSAIO 0022 (NADA FOI GRAVADO):\n%', r;
end $$;
rollback;
