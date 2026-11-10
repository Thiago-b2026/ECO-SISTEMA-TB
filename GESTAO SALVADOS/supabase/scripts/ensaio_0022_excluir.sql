-- ENSAIO da migration 0022: roda tudo numa transação e DESFAZ no final (o erro "ENSAIO 0022" é proposital).
-- Gerado a partir de migrations/20261108000022_excluir_produto_usuario.sql; se mudar a migration, gere de novo.
begin;
-- =====================================================================
-- PDV (Gestão Salvados): EXCLUIR PRODUTO e EXCLUIR USUÁRIO só quando NUNCA houve nenhum movimento.
-- Regra 6 do CLAUDE.md do PDV: NUNCA apagar histórico de estoque. Por isso qualquer registro bloqueia:
-- quem tem histórico só pode ser INATIVADO (produto) ou DESATIVADO (usuário).
--
-- O que esta migration faz:
--   1. Nova tabela public.etiquetas_impressas: registra, a partir de agora, as etiquetas impressas pela tela Produtos.
--   2. Ação "Excluir" no catálogo da tela Produtos (public.tela_acoes) + permissão por unidade igual à de hoje
--      (admin e gerente com a área Produtos → Excluir).
--   3. Funções de checagem e de exclusão (produto e usuário).
-- Não altera nenhuma tabela que já existe. Do schema rh só LÊ (para bloquear quem usa o Gestão RH).
-- =====================================================================

-- ---------- 1. ETIQUETAS IMPRESSAS (a partir de agora) ----------
create table public.etiquetas_impressas (
  id          bigserial primary key,
  -- sem apagar em cascata: produto com etiqueta impressa não pode ser apagado
  produto_id  uuid not null references public.produtos(id),
  loja_id     uuid not null references public.lojas(id),
  copias      int not null check (copias > 0),
  -- sem apagar em cascata: quem imprimiu etiqueta não pode ser apagado
  user_id     uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index etiquetas_impressas_produto_idx on public.etiquetas_impressas (produto_id);
create index etiquetas_impressas_user_idx on public.etiquetas_impressas (user_id);
alter table public.etiquetas_impressas enable row level security;
create policy "etiquetas_impressas: ler" on public.etiquetas_impressas for select to authenticated using (public.pode_ver_loja(loja_id));
-- sem políticas de insert/update/delete: grava só pela função abaixo e ninguém altera nem apaga

-- _itens = [{ "produto_id": "...", "copias": 3 }, ...]
create or replace function public.registrar_etiquetas(_itens jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  insert into public.etiquetas_impressas (produto_id, loja_id, copias, user_id)
  select p.id, p.loja_id, greatest(1, coalesce((i ->> 'copias')::int, 1)), auth.uid()
  from jsonb_array_elements(coalesce(_itens, '[]'::jsonb)) i
  join public.produtos p on p.id = (i ->> 'produto_id')::uuid
  where public.pode_ver_loja(p.loja_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- 2. "EXCLUIR" NO CATÁLOGO DA TELA PRODUTOS ----------
insert into public.tela_acoes (tela_codigo, acao) values ('pdv.produtos', 'excluir') on conflict do nothing;

-- Permissão por unidade (usada pelo Portal na fase 3), igual ao que vale hoje:
-- gerente com a tela Produtos e a área Produtos → Excluir. Admin pode tudo (não precisa de linha).
insert into public.usuario_permissoes (user_id, unidade_id, tela_codigo, acao, permitido, atualizado_por)
select ur.user_id, ul.loja_id, 'pdv.produtos', 'excluir',
       coalesce((select ut.permitido from public.usuario_telas ut where ut.user_id = ur.user_id and ut.tela_codigo = 'pdv.produtos'), false)
       and ur.role::text = 'gerente'
       and coalesce((select p.excluir from public.permissoes p where p.user_id = ur.user_id and p.modulo = 'produtos'), true),
       null
from public.user_roles ur
join public.usuario_lojas ul on ul.user_id = ur.user_id
join public.lojas l on l.id = ul.loja_id and l.ativo and 'pdv' = any (l.sistemas)
where ur.role <> 'admin'
  and exists (select 1 from public.usuario_telas ut join public.telas t on t.codigo = ut.tela_codigo
              where ut.user_id = ur.user_id and ut.permitido and t.app = 'pdv')
on conflict (user_id, unidade_id, tela_codigo, acao) do nothing;

-- Quem pode excluir produto: admin, ou gerente com a tela Produtos e a área Produtos → Excluir
create or replace function public.pode_excluir_produto()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.has_role(auth.uid(), 'gerente') and public.pode_ver_tela('pdv.produtos') and public.permite('produtos', 'excluir'));
$$;

-- ---------- 3a. PRODUTO ----------
-- Qualquer registro bloqueia. Só pode excluir produto que foi SÓ cadastrado.
create or replace function public.motivos_nao_excluir_produto(_id uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when exists (select 1 from public.stock_movements where produto_id = _id) then 'tem movimento de estoque (entrada, ajuste, perda, devolução, venda ou transferência)' end,
    case when exists (select 1 from public.venda_itens where produto_id = _id) then 'já foi vendido' end,
    case when exists (select 1 from public.transferencia_itens where produto_id = _id or produto_destino = _id) then 'já foi transferido' end,
    case when exists (select 1 from public.produtos where id = _id and (lote_id is not null or lote_item_id is not null)) then 'é item de lote' end,
    case when exists (select 1 from public.etiquetas_impressas where produto_id = _id) then 'já teve etiqueta impressa' end,
    case when exists (select 1 from public.crm_pedidos where produto_id = _id) then 'tem pedido no CRM' end,
    case when exists (select 1 from public.produtos where id = _id and estoque_atual <> 0) then 'tem estoque' end
  ], null);
$$;

-- Produtos que quem chama pode excluir (para mostrar o botão só neles). _loja_id null = todas as lojas dele.
create or replace function public.produtos_excluiveis(_loja_id uuid default null)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.produtos p
  where public.pode_excluir_produto()
    and public.pode_ver_loja(p.loja_id)
    and (_loja_id is null or p.loja_id = _loja_id)
    and p.estoque_atual = 0
    and p.lote_id is null and p.lote_item_id is null
    and not exists (select 1 from public.stock_movements m where m.produto_id = p.id)
    and not exists (select 1 from public.venda_itens v where v.produto_id = p.id)
    and not exists (select 1 from public.transferencia_itens t where t.produto_id = p.id or t.produto_destino = p.id)
    and not exists (select 1 from public.etiquetas_impressas e where e.produto_id = p.id)
    and not exists (select 1 from public.crm_pedidos c where c.produto_id = p.id);
$$;

create or replace function public.excluir_produto(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _m text[]; _loja uuid;
begin
  if not public.pode_excluir_produto() then raise exception 'Sem permissão para excluir produto.'; end if;
  select loja_id into _loja from public.produtos where id = _id for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if not public.pode_ver_loja(_loja) then raise exception 'Sem permissão nesta empresa.'; end if;
  _m := public.motivos_nao_excluir_produto(_id);
  if cardinality(_m) > 0 then
    raise exception 'Não pode excluir, já tem histórico (%). Use Inativar.', array_to_string(_m, '; ');
  end if;
  delete from public.produtos where id = _id;
end $$;

-- ---------- 3b. USUÁRIO ----------
-- Qualquer registro bloqueia. Só pode excluir quem NUNCA fez nenhum movimento.
create or replace function public.motivos_nao_excluir_usuario(_uid uuid)
returns text[] language plpgsql stable security definer set search_path = public as $$
declare _m text[] := array[]::text[]; _rh boolean := false;
begin
  -- pelo site, só o admin; a função de servidor (service_role) não tem auth.uid()
  if auth.uid() is not null and not public.is_admin() then raise exception 'Só o admin.'; end if;

  if exists (select 1 from public.vendas where vendedor_id = _uid or cancelado_por = _uid) then _m := _m || 'vendas'::text; end if;
  if exists (select 1 from public.caixas where operador_id = _uid) then _m := _m || 'caixa'::text; end if;
  if exists (select 1 from public.caixa_movimentos where user_id = _uid) then _m := _m || 'sangria/suprimento'::text; end if;
  if exists (select 1 from public.lancamentos where created_by = _uid) then _m := _m || 'lançamentos financeiros'::text; end if;
  if exists (select 1 from public.transferencias where enviado_por = _uid or recebido_por = _uid) then _m := _m || 'transferências'::text; end if;
  if exists (select 1 from public.stock_movements where user_id = _uid) then _m := _m || 'entrada/ajuste/movimento de estoque'::text; end if;
  if exists (select 1 from public.lotes where created_by = _uid) or exists (select 1 from public.lote_itens where operador_id = _uid) then _m := _m || 'lotes/triagem'::text; end if;
  if exists (select 1 from public.produtos where created_by = _uid) then _m := _m || 'produtos cadastrados'::text; end if;
  if exists (select 1 from public.etiquetas_impressas where user_id = _uid) or exists (select 1 from public.modelos_etiqueta where created_by = _uid) then _m := _m || 'etiquetas'::text; end if;
  if exists (select 1 from public.crm_campanhas where created_by = _uid) or exists (select 1 from public.crm_envios where enviado_por = _uid)
     or exists (select 1 from public.crm_pedidos where created_by = _uid) then _m := _m || 'CRM'::text; end if;
  if exists (select 1 from public.dre_faturamento where updated_by = _uid) then _m := _m || 'DRE'::text; end if;
  if exists (select 1 from public.pessoas where created_by = _uid and user_id is distinct from _uid) then _m := _m || 'pessoas cadastradas'::text; end if;
  if exists (select 1 from public.ml_conexao where conectado_por = _uid) then _m := _m || 'conexão do Mercado Livre'::text; end if;
  if exists (select 1 from public.usuario_telas where atualizado_por = _uid) or exists (select 1 from public.usuario_permissoes where atualizado_por = _uid) then _m := _m || 'alterou permissões'::text; end if;
  if exists (select 1 from public.auditoria where user_id = _uid) then _m := _m || 'registros na auditoria'::text; end if;

  -- Gestão RH (mesmo login): telas do RH liberadas, membro de empresa ou qualquer lançamento/alteração no RH
  _rh := exists (select 1 from public.usuario_telas where user_id = _uid and permitido and tela_codigo like 'rh.%');
  if not _rh and to_regclass('rh.empresa_membros') is not null then
    execute 'select exists (select 1 from rh.empresa_membros where user_id = $1)
                 or exists (select 1 from rh.rh_entries where updated_by = $1)
                 or exists (select 1 from rh.rh_entries_log where alterado_por = $1)'
      into _rh using _uid;
  end if;
  if _rh then _m := _m || 'usa o Gestão RH'::text; end if;

  return _m;
end $$;

revoke all on function public.registrar_etiquetas(jsonb) from public, anon;
revoke all on function public.pode_excluir_produto() from public, anon;
revoke all on function public.motivos_nao_excluir_produto(uuid) from public, anon;
revoke all on function public.produtos_excluiveis(uuid) from public, anon;
revoke all on function public.excluir_produto(uuid) from public, anon;
revoke all on function public.motivos_nao_excluir_usuario(uuid) from public, anon;
grant execute on function public.registrar_etiquetas(jsonb) to authenticated;
grant execute on function public.pode_excluir_produto() to authenticated;
grant execute on function public.motivos_nao_excluir_produto(uuid) to authenticated, service_role;
grant execute on function public.produtos_excluiveis(uuid) to authenticated;
grant execute on function public.excluir_produto(uuid) to authenticated;
grant execute on function public.motivos_nao_excluir_usuario(uuid) to authenticated, service_role;
grant select on public.etiquetas_impressas to authenticated;

-- ===================== TESTES (tudo é desfeito pelo erro no final) =====================
do $$
declare
  r text := ''; _admin uuid; _loja uuid; _p1 uuid; _p2 uuid; _p3 uuid; _pv uuid; _x record; _ok boolean;
begin
  select user_id into _admin from public.user_roles where role = 'admin' order by user_id limit 1;
  perform set_config('request.jwt.claim.sub', _admin::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', _admin, 'role', 'authenticated')::text, true);
  select id into _loja from public.lojas where ativo and 'pdv' = any (sistemas) order by nome limit 1;

  r := r || 'Produtos no banco: ' || (select count(*) from public.produtos);
  for _x in select l.nome, (select count(*) from public.produtos p where p.loja_id = l.id) tot,
                   (select count(*) from public.produtos_excluiveis(l.id)) exc
            from public.lojas l order by l.nome loop
    if _x.tot > 0 then r := r || E'\n  ' || _x.nome || ': ' || _x.tot || ' produtos, ' || _x.exc || ' podem ser excluídos (nunca tiveram movimento)'; end if;
  end loop;

  -- P1: só cadastrado (quantidade 0) -> PODE excluir
  _p1 := public.criar_produto(_loja, 'ENSAIO só cadastrado', 10, 0, null, null, null);
  -- P2: cadastrado com ENTRADA de estoque -> BARRADO
  _p2 := public.criar_produto(_loja, 'ENSAIO com entrada', 10, 0, null, null, null);
  perform public.movimentar_estoque(_p2, 'entrada', 3, 'ensaio');
  -- P3: só cadastrado, mas com ETIQUETA impressa -> BARRADO
  _p3 := public.criar_produto(_loja, 'ENSAIO com etiqueta', 10, 0, null, null, null);
  perform public.registrar_etiquetas(jsonb_build_array(jsonb_build_object('produto_id', _p3, 'copias', 2)));

  r := r || E'\n\nPRODUTOS DE TESTE (criados e apagados dentro do ensaio):';
  begin
    perform public.excluir_produto(_p2);
    r := r || E'\n  ERRO: excluiu produto COM ENTRADA de estoque!';
  exception when others then r := r || E'\n  OK produto com ENTRADA de estoque BARRADO: ' || sqlerrm; end;
  r := r || E'\n     (movimentos de estoque dele continuam: ' || (select count(*) from public.stock_movements where produto_id = _p2) || ')';
  begin
    perform public.excluir_produto(_p3);
    r := r || E'\n  ERRO: excluiu produto COM ETIQUETA impressa!';
  exception when others then r := r || E'\n  OK produto com ETIQUETA impressa BARRADO: ' || sqlerrm; end;
  perform public.excluir_produto(_p1);
  r := r || E'\n  OK produto só cadastrado, sem movimento: ' || case when exists (select 1 from public.produtos where id = _p1) then 'NÃO excluiu (ERRO)' else 'excluído' end;

  select produto_id into _pv from public.venda_itens where produto_id is not null limit 1;
  if _pv is not null then
    begin
      perform public.excluir_produto(_pv);
      r := r || E'\n  ERRO: excluiu um produto vendido!';
    exception when others then r := r || E'\n  OK produto VENDIDO (real) BARRADO: ' || sqlerrm; end;
  end if;

  -- quem pode excluir: admin e gerente; vendedor/estoquista não
  for _x in select ur.user_id, ur.role::text papel, coalesce(pr.nome, '?') nome from public.user_roles ur left join public.profiles pr on pr.id = ur.user_id
            where ur.role::text in ('gerente', 'vendedor', 'estoquista') order by ur.role, pr.nome loop
    perform set_config('request.jwt.claim.sub', _x.user_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', _x.user_id, 'role', 'authenticated')::text, true);
    _ok := public.pode_excluir_produto();
    r := r || E'\n  ' || _x.nome || ' (' || _x.papel || '): ' || case when _ok then 'pode excluir produto' else 'NÃO pode excluir produto' end;
    if not _ok then
      begin
        perform public.excluir_produto(coalesce(_pv, _p2));
        r := r || ' — ERRO: conseguiu!';
      exception when others then r := r || ' (barrado: ' || sqlerrm || ')'; end;
    end if;
  end loop;

  -- usuários: como a função de servidor (sem auth.uid)
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  r := r || E'\n\nUSUÁRIOS (regra rígida: qualquer registro bloqueia):';
  for _x in select coalesce(pr.nome, ur.user_id::text) nome, ur.role::text papel, public.motivos_nao_excluir_usuario(ur.user_id) m
            from public.user_roles ur left join public.profiles pr on pr.id = ur.user_id order by 1 loop
    r := r || E'\n  ' || _x.nome || ' (' || _x.papel || '): ' ||
         case when _x.papel = 'admin' then 'admin, NÃO pode ser excluído'
              when cardinality(_x.m) = 0 then 'PODE excluir (nunca fez nenhum movimento)'
              else 'BARRADO, já tem histórico: ' || array_to_string(_x.m, ', ') end;
  end loop;
  -- prova: o admin que fez os produtos de teste agora tem movimento -> barrado
  r := r || E'\n  Prova: depois do teste, o admin tem: ' || array_to_string(public.motivos_nao_excluir_usuario(_admin), ', ');

  r := r || E'\n\nCatálogo: tela Produtos tem a ação Excluir? ' || case when exists (select 1 from public.tela_acoes where tela_codigo = 'pdv.produtos' and acao = 'excluir') then 'sim' else 'NÃO' end;
  r := r || E'\nPermissões por unidade criadas para Excluir produto: ' || (select count(*) from public.usuario_permissoes where tela_codigo = 'pdv.produtos' and acao = 'excluir')
         || ' (liberadas: ' || (select count(*) from public.usuario_permissoes where tela_codigo = 'pdv.produtos' and acao = 'excluir' and permitido) || ')';

  raise exception E'ENSAIO 0022 (NADA FOI GRAVADO):\n%', r;
end $$;
rollback;
