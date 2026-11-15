-- =====================================================================================
-- META DE VENDAS – várias empresas, unidades e usuários (cadastro feito DENTRO do app, só pelo admin)
-- Banco: Supabase ECO-SISTEMA-TB. Aplicar DEPOIS da 0001 do META-DE-VENDAS e da 0027 do GESTAO SALVADOS
-- (os códigos de tela usados aqui vêm da 0027). NÃO APLICAR sem OK do usuário.
--
-- Empresas e unidades continuam no cadastro ÚNICO do ecossistema (public.redes e public.lojas): o app só
-- grava lá quando quem está logado é o admin (as políticas do Portal já exigem is_admin()).
--
-- Perfis do Meta de Vendas (o admin escolhe; viram telas + ações por unidade em public.usuario_permissoes):
--   vendedor  → Ranking e Meu desempenho (ver); com "lança o próprio resultado", também Meu desempenho → editar
--   gerente   → todas as telas do sistema (menos as do admin) com todas as ações, numa unidade
--   gestor    → o mesmo do gerente, em TODAS as unidades da empresa que usam o Meta de Vendas hoje
-- "Só soma e troca o do Meta de Vendas": nunca mexe em acesso de outro sistema e nunca apaga login.
-- Idempotente.
-- =====================================================================================

-- prêmio da meta mínima não pode passar o da meta 100%
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'configuracao_meta_premios_ordem') then
    alter table metas.configuracao_meta add constraint configuracao_meta_premios_ordem check (premio_meta_90 <= premio_meta_100);
  end if;
end;
$$;

-- telas + ações de cada perfil
create or replace function metas.telas_do_perfil(_perfil text, _lanca boolean default false)
returns table (tela text, acao text) language sql stable security definer set search_path = public as $$
  select ta.tela_codigo, ta.acao
  from public.tela_acoes ta join public.telas t on t.codigo = ta.tela_codigo
  where t.app = 'metas' and t.ativo and not t.somente_admin
    and case _perfil
          when 'vendedor' then (ta.tela_codigo = 'metas.ranking' and ta.acao = 'ver')
                            or (ta.tela_codigo = 'metas.meu_desempenho' and (ta.acao = 'ver' or (ta.acao = 'editar' and coalesce(_lanca, false))))
          when 'gerente' then true
          when 'gestor' then true
          else false end;
$$;

-- grava o acesso de UMA pessoa (núcleo; sem conferir quem chama – só o admin e a Edge Function usam)
create or replace function metas._definir_acesso_usuario(_usuario uuid, _nome text, _rede uuid, _loja uuid, _perfil text, _lanca boolean default false)
returns void language plpgsql security definer set search_path = metas, public as $$
declare _lojas uuid[];
begin
  if _perfil not in ('vendedor', 'gerente', 'gestor') then raise exception 'Perfil inválido.'; end if;
  if _rede is null then raise exception 'Escolha a empresa.'; end if;
  if _perfil = 'gestor' then
    select array_agg(l.id) into _lojas from public.lojas l where l.rede_id = _rede and l.ativo and 'metas' = any (l.sistemas);
    if _lojas is null then raise exception 'A empresa ainda não tem unidade que use o Meta de Vendas.'; end if;
  else
    if _loja is null then raise exception 'Escolha a unidade.'; end if;
    if not exists (select 1 from public.lojas l where l.id = _loja and l.rede_id = _rede) then raise exception 'A unidade não é desta empresa.'; end if;
    if not public.unidade_usa(_loja, 'metas') then
      raise exception 'A unidade escolhida não usa o Meta de Vendas (marque o sistema na unidade).';
    end if;
    _lojas := array[_loja];
  end if;

  -- troca o acesso do Meta de Vendas nessas unidades (outros sistemas ficam como estão)
  delete from public.usuario_permissoes
   where user_id = _usuario and unidade_id = any (_lojas) and tela_codigo like 'metas.%';
  insert into public.usuario_permissoes (user_id, unidade_id, tela_codigo, acao, permitido)
  select _usuario, l, p.tela, p.acao, true from unnest(_lojas) l cross join metas.telas_do_perfil(_perfil, _lanca) p;

  insert into public.usuario_telas (user_id, tela_codigo, permitido)
  select distinct _usuario, p.tela, true from metas.telas_do_perfil(_perfil, _lanca) p
  on conflict (user_id, tela_codigo) do update set permitido = true;

  -- vendedor precisa do cadastro de vendedor ligado ao login (para lançar e ver o próprio desempenho)
  if _perfil = 'vendedor' and not exists (select 1 from metas.vendedores v where v.user_id = _usuario) then
    insert into metas.vendedores (loja_id, user_id, nome) values (_loja, _usuario, coalesce(nullif(btrim(_nome), ''), 'Vendedor'));
  end if;
end;
$$;

-- o admin dá (ou troca) o acesso de quem JÁ tem login no ecossistema, pelo e-mail
create or replace function metas.definir_acesso(_email text, _nome text, _rede uuid, _loja uuid, _perfil text, _lanca boolean default false)
returns uuid language plpgsql security definer set search_path = metas, public, auth as $$
declare _uid uuid;
begin
  if not public.is_admin() then raise exception 'Só o admin dá acessos (regra do Ecossistema).'; end if;
  select u.id into _uid from auth.users u where lower(u.email) = lower(btrim(_email));
  if _uid is null then raise exception 'Não existe login com esse e-mail. Use "Criar login novo".'; end if;
  perform metas._definir_acesso_usuario(_uid, _nome, _rede, _loja, _perfil, _lanca);
  return _uid;
end;
$$;

-- o admin tira o acesso ao Meta de Vendas numa unidade (o login e o histórico continuam)
create or replace function metas.remover_acesso(_usuario uuid, _loja uuid)
returns void language plpgsql security definer set search_path = metas, public as $$
begin
  if not public.is_admin() then raise exception 'Só o admin tira acessos (regra do Ecossistema).'; end if;
  delete from public.usuario_permissoes where user_id = _usuario and unidade_id = _loja and tela_codigo like 'metas.%';
  -- sem nenhuma unidade no sistema: as telas do Meta de Vendas saem do menu dele
  if not exists (select 1 from public.usuario_permissoes where user_id = _usuario and tela_codigo like 'metas.%' and permitido) then
    update public.usuario_telas set permitido = false where user_id = _usuario and tela_codigo like 'metas.%';
  end if;
end;
$$;

-- quem tem acesso ao Meta de Vendas numa empresa, por unidade, com o perfil reconhecido (só o admin)
create or replace function metas.usuarios_da_empresa(_rede uuid)
returns table (user_id uuid, email text, nome text, loja_id uuid, loja text, perfil text, lanca boolean)
language sql stable security definer set search_path = metas, public, auth as $$
  with p as (
    select up.user_id, up.unidade_id,
           bool_or(up.tela_codigo = 'metas.configuracao' and up.acao = 'editar') as gerente,
           bool_or(up.tela_codigo = 'metas.meu_desempenho' and up.acao = 'ver') as vendedor,
           bool_or(up.tela_codigo = 'metas.meu_desempenho' and up.acao = 'editar') as lanca
    from public.usuario_permissoes up
    where up.tela_codigo like 'metas.%' and up.permitido
    group by up.user_id, up.unidade_id
  )
  select p.user_id, u.email::text,
         coalesce((select v.nome from metas.vendedores v where v.user_id = p.user_id limit 1), u.raw_user_meta_data ->> 'nome', u.email::text),
         l.id, l.nome,
         case when p.gerente then 'gerente' when p.vendedor then 'vendedor' else 'personalizado' end,
         p.lanca
  from p
  join public.lojas l on l.id = p.unidade_id and l.rede_id = _rede
  join auth.users u on u.id = p.user_id
  where public.is_admin()
  order by 3, l.nome;
$$;

-- ---------- EXCLUIR (só o que nunca foi usado; com histórico, o caminho é INATIVAR) ----------
-- vendedor sem lançamento (quem pode editar vendedores na unidade)
create or replace function metas.excluir_vendedor(_vendedor uuid)
returns void language plpgsql security definer set search_path = metas, public as $$
declare _loja uuid;
begin
  select v.loja_id into _loja from metas.vendedores v where v.id = _vendedor;
  if _loja is null then raise exception 'Vendedor não encontrado.'; end if;
  if auth.uid() is not null and not public.pode('metas.vendedores', 'editar', _loja) then
    raise exception 'Você não tem permissão para fazer isso nesta unidade.';
  end if;
  if exists (select 1 from metas.lancamentos l where l.vendedor_id = _vendedor) then
    raise exception 'Este vendedor já tem lançamentos: use Inativar (o histórico continua).';
  end if;
  delete from metas.vendedores where id = _vendedor;
end;
$$;

-- unidade sem nenhum dado e que não é usada por outro sistema (só o admin)
create or replace function metas.excluir_unidade(_loja uuid)
returns void language plpgsql security definer set search_path = metas, public as $$
declare _outros text[];
begin
  if not public.is_admin() then raise exception 'Só o admin exclui unidades (regra do Ecossistema).'; end if;
  select array(select s from unnest(l.sistemas) s where s <> 'metas') into _outros from public.lojas l where l.id = _loja;
  if _outros is null then raise exception 'Unidade não encontrada.'; end if;
  if cardinality(_outros) > 0 then
    raise exception 'A unidade também é usada em outro sistema (%): desmarque o Meta de Vendas ou inative.', array_to_string(_outros, ', ');
  end if;
  if exists (select 1 from metas.vendedores where loja_id = _loja) or exists (select 1 from metas.lancamentos where loja_id = _loja)
     or exists (select 1 from metas.configuracao_meta where loja_id = _loja) or exists (select 1 from metas.meses_fechados where loja_id = _loja) then
    raise exception 'A unidade já tem vendedores, metas ou lançamentos: use Inativar (o histórico continua).';
  end if;
  delete from public.usuario_permissoes where unidade_id = _loja;
  begin
    delete from public.lojas where id = _loja;
  exception when foreign_key_violation then
    raise exception 'A unidade tem registros em outro sistema: use Inativar.';
  end;
end;
$$;

-- empresa sem unidades (só o admin)
create or replace function metas.excluir_empresa(_rede uuid)
returns void language plpgsql security definer set search_path = metas, public as $$
begin
  if not public.is_admin() then raise exception 'Só o admin exclui empresas (regra do Ecossistema).'; end if;
  if exists (select 1 from public.lojas where rede_id = _rede) then
    raise exception 'Exclua (ou passe para outra empresa) as unidades antes de excluir a empresa.';
  end if;
  begin
    delete from public.redes where id = _rede;
  exception when foreign_key_violation then
    raise exception 'A empresa tem registros em outro sistema: use Inativar.';
  end;
end;
$$;

revoke all on function metas.excluir_vendedor(uuid), metas.excluir_unidade(uuid), metas.excluir_empresa(uuid) from public, anon;
grant execute on function metas.excluir_vendedor(uuid), metas.excluir_unidade(uuid), metas.excluir_empresa(uuid) to authenticated, service_role;

revoke all on function metas.telas_do_perfil(text, boolean), metas._definir_acesso_usuario(uuid, text, uuid, uuid, text, boolean),
  metas.definir_acesso(text, text, uuid, uuid, text, boolean), metas.remover_acesso(uuid, uuid), metas.usuarios_da_empresa(uuid)
  from public, anon;
grant execute on function metas.telas_do_perfil(text, boolean), metas.definir_acesso(text, text, uuid, uuid, text, boolean),
  metas.remover_acesso(uuid, uuid), metas.usuarios_da_empresa(uuid) to authenticated, service_role;
-- o núcleo só a Edge Function admin-usuarios usa (service_role), logo depois de criar o login
revoke execute on function metas._definir_acesso_usuario(uuid, text, uuid, uuid, text, boolean) from authenticated;
grant execute on function metas._definir_acesso_usuario(uuid, text, uuid, uuid, text, boolean) to service_role;
