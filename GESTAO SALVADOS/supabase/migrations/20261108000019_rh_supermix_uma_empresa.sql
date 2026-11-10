-- =====================================================================
-- GESTÃO RH – Supermix: UMA empresa com 4 lojas + funções da tela de cadastro (só admin)
-- (só RH: não mexe no PDV)
-- 1) Apaga as empresas criadas por engano (SUPER MIX BRAZ 02, 03, 04), as lojas/unidades e as redes
--    criadas junto. PARA tudo se alguma delas tiver lançamento, histórico ou permissão.
-- 2) A empresa original volta a se chamar "Supermix Braz" (rede SUPERMIX BRAZ) e as lojas viram
--    SUPER MIX BRAZ 01 (matriz) a 04 (filiais), com os CNPJs. Os lançamentos NÃO mudam.
-- 2b) Apaga a "Loja 5" da empresa original (criada por engano), SÓ se continuar vazia.
-- 3) Cadastro de lojas pelo admin: adicionar (com CNPJ), editar, ativar/inativar e excluir (só sem histórico).
--    Regra de excluir: só MOVIMENTO bloqueia (lançamentos com valor, vendas, caixa, estoque, financeiro);
--    a auditoria do próprio cadastro não conta.
-- Conferência antes: supabase/scripts/conferir_supermix_antes.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LIMPEZA
-- ---------------------------------------------------------------------
do $$
declare
  v_original uuid;
  v_apagar uuid[];
  v_unidades uuid[];
  v_redes uuid[];
  v_lojas_extra uuid[];
  v_unidades_extra uuid[];
begin
  select e.id into v_original from rh.empresas e
   where exists (select 1 from rh.rh_entries x where x.empresa_id = e.id)
     and e.rede_id = (select id from public.redes where nome = 'SUPERMIX BRAZ');
  if v_original is null then raise exception 'Empresa original da Supermix (com lançamentos) não encontrada.'; end if;

  select array_agg(e.id) into v_apagar from rh.empresas e
   where e.nome ~* '^super ?mix braz 0[2-4]$' and e.id <> v_original;

  if v_apagar is not null then
    if exists (select 1 from rh.rh_entries x where x.empresa_id = any (v_apagar))
       or exists (select 1 from rh.rh_entries_log x where x.empresa_id = any (v_apagar))
       or exists (select 1 from public.usuario_permissoes up join rh.lojas l on l.unidade_id = up.unidade_id where l.empresa_id = any (v_apagar)) then
      raise exception 'Uma das empresas a apagar tem lançamento, histórico ou permissão. Nada foi feito.';
    end if;

    select array_agg(l.unidade_id) into v_unidades from rh.lojas l where l.empresa_id = any (v_apagar) and l.unidade_id is not null;
    select array_agg(distinct e.rede_id) into v_redes from rh.empresas e where e.id = any (v_apagar) and e.rede_id is not null;

    -- empresas (lojas e membros saem junto, por cascata)
    delete from rh.empresas where id = any (v_apagar);
    -- unidades criadas junto (só se não tiverem nenhum movimento em outro sistema)
    if v_unidades is not null then
      if exists (select 1 from public.vendas x where x.loja_id = any (v_unidades))
         or exists (select 1 from public.caixas x where x.loja_id = any (v_unidades))
         or exists (select 1 from public.produtos x where x.loja_id = any (v_unidades))
         or exists (select 1 from public.stock_movements x where x.loja_id = any (v_unidades))
         or exists (select 1 from public.lancamentos x where x.loja_id = any (v_unidades)) then
        raise exception 'Uma das unidades a apagar tem movimento no PDV. Nada foi feito.';
      end if;
      delete from public.lojas where id = any (v_unidades);
    end if;
    -- redes criadas junto, se ficaram vazias (a SUPERMIX BRAZ nunca é apagada)
    if v_redes is not null then
      delete from public.redes r
       where r.id = any (v_redes) and r.nome <> 'SUPERMIX BRAZ'
         and not exists (select 1 from public.lojas u where u.rede_id = r.id)
         and not exists (select 1 from rh.empresas e where e.rede_id = r.id);
    end if;
  end if;

  -- 2b. lojas além da 04 na empresa original: apagar só se vazias (nenhum valor lançado na coluna e nada no PDV).
  --     Ordem: primeiro a loja do RH (que aponta para a unidade), depois a unidade.
  select array_agg(l.id), array_agg(l.unidade_id) filter (where l.unidade_id is not null)
    into v_lojas_extra, v_unidades_extra
  from rh.lojas l
  where l.empresa_id = v_original and l.codigo not in ('loja1', 'loja2', 'loja3', 'loja4')
    and not exists (select 1 from rh.rh_entries e where e.empresa_id = l.empresa_id
                      and (coalesce((e.data->'faturamento'->>l.codigo)::numeric, 0) <> 0
                           or exists (select 1 from jsonb_array_elements(coalesce(e.data->'items', '[]'::jsonb)) it
                                      where coalesce((it->>l.codigo)::numeric, 0) <> 0)))
    and (l.unidade_id is null or (
              not exists (select 1 from public.vendas x where x.loja_id = l.unidade_id)
          and not exists (select 1 from public.caixas x where x.loja_id = l.unidade_id)
          and not exists (select 1 from public.produtos x where x.loja_id = l.unidade_id)
          and not exists (select 1 from public.stock_movements x where x.loja_id = l.unidade_id)
          and not exists (select 1 from public.lancamentos x where x.loja_id = l.unidade_id)));
  if v_lojas_extra is not null then
    delete from rh.lojas where id = any (v_lojas_extra);
    if v_unidades_extra is not null then delete from public.lojas where id = any (v_unidades_extra); end if;
  end if;

  -- 2. nomes e CNPJs
  update rh.empresas set nome = 'Supermix Braz', cnpj = '17890178000158' where id = v_original;
  update rh.lojas l set nome = n.nome
    from (values ('loja1', 'SUPER MIX BRAZ 01'), ('loja2', 'SUPER MIX BRAZ 02'),
                 ('loja3', 'SUPER MIX BRAZ 03'), ('loja4', 'SUPER MIX BRAZ 04')) as n(codigo, nome)
   where l.empresa_id = v_original and l.codigo = n.codigo;
  update public.lojas u set nome = n.nome, cnpj = n.cnpj
    from rh.lojas l,
         (values ('loja1', 'SUPER MIX BRAZ 01', '17890178000158'), ('loja2', 'SUPER MIX BRAZ 02', '17890178000310'),
                 ('loja3', 'SUPER MIX BRAZ 03', '17890178000409'), ('loja4', 'SUPER MIX BRAZ 04', '17890178000581')) as n(codigo, nome, cnpj)
   where l.empresa_id = v_original and l.codigo = n.codigo and u.id = l.unidade_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. CADASTRO DE LOJAS (só admin)
-- ---------------------------------------------------------------------
-- Loja nova vira unidade com O NOME DIGITADO (sem prefixo automático)
create or replace function rh.loja_cria_unidade()
returns trigger language plpgsql security definer set search_path = rh, public as $$
declare v_rede uuid; v_emp text; v_un uuid;
begin
  if new.unidade_id is not null then return new; end if;
  select e.rede_id, e.nome into v_rede, v_emp from rh.empresas e where e.id = new.empresa_id;
  if v_rede is null then
    insert into public.redes (nome, ordem) values (upper(v_emp), 90) on conflict (nome) do nothing;
    select id into v_rede from public.redes where nome = upper(v_emp);
    update rh.empresas set rede_id = v_rede where id = new.empresa_id;
  end if;
  insert into public.lojas (nome, rede_id, sistemas, ativo)
  values (new.nome, v_rede, array['rh'], true)
  returning id into v_un;
  new.unidade_id := v_un;
  return new;
end $$;

create or replace function rh._cnpj_ou_nulo(p_cnpj text)
returns text language plpgsql immutable as $$
declare d text := nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), '');
begin
  if d is not null and length(d) <> 14 then raise exception 'CNPJ precisa ter 14 números.'; end if;
  return d;
end $$;

-- Adicionar LOJA (filial) dentro da empresa, com CNPJ opcional
drop function if exists rh.adicionar_loja(uuid, text);
create or replace function rh.adicionar_loja(p_empresa uuid, p_nome text, p_cnpj text default null)
returns uuid language plpgsql security definer set search_path = rh, public as $$
declare v_n int; v_id uuid; v_cnpj text := rh._cnpj_ou_nulo(p_cnpj);
begin
  if not public.is_admin() then raise exception 'Só o administrador adiciona lojas.'; end if;
  if v_cnpj is not null and exists (select 1 from public.lojas where cnpj = v_cnpj) then
    raise exception 'Já existe uma loja com esse CNPJ.';
  end if;
  select coalesce(max(nullif(regexp_replace(codigo, '\D', '', 'g'), '')::int), 0) + 1
    into v_n from rh.lojas where empresa_id = p_empresa;
  insert into rh.lojas (empresa_id, codigo, nome, ordem)
  values (p_empresa, 'loja' || v_n, coalesce(nullif(trim(p_nome), ''), 'Loja ' || v_n), v_n)
  returning id into v_id;
  update public.lojas set cnpj = v_cnpj where id = (select unidade_id from rh.lojas where id = v_id);
  return v_id;
end $$;

-- Editar nome e CNPJ (o nome é o mesmo no RH, no PDV e no Portal)
create or replace function rh.editar_loja(p_loja uuid, p_nome text, p_cnpj text)
returns void language plpgsql security definer set search_path = rh, public as $$
declare v_un uuid; v_cnpj text := rh._cnpj_ou_nulo(p_cnpj);
begin
  if not public.is_admin() then raise exception 'Só o administrador edita lojas.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome da loja.'; end if;
  select unidade_id into v_un from rh.lojas where id = p_loja;
  if v_cnpj is not null and exists (select 1 from public.lojas where cnpj = v_cnpj and id is distinct from v_un) then
    raise exception 'Já existe outra loja com esse CNPJ.';
  end if;
  update rh.lojas set nome = trim(p_nome) where id = p_loja;
  update public.lojas set nome = trim(p_nome), cnpj = v_cnpj where id = v_un;
end $$;

-- Ativar / inativar (inativa some da tela de lançar; os meses antigos continuam nos relatórios)
create or replace function rh.ativar_loja(p_loja uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = rh, public as $$
begin
  if not public.is_admin() then raise exception 'Só o administrador ativa ou inativa lojas.'; end if;
  update public.lojas set ativo = p_ativo where id = (select unidade_id from rh.lojas where id = p_loja);
end $$;

-- Pode excluir? Só sem movimento: nenhum valor lançado na coluna da loja e nada no PDV.
create or replace function rh.pode_excluir_loja(p_loja uuid)
returns boolean language sql stable security definer set search_path = rh, public as $$
  select exists (select 1 from rh.lojas where id = p_loja)
     and not exists (
       select 1 from rh.lojas l join rh.rh_entries e on e.empresa_id = l.empresa_id
       where l.id = p_loja
         and (coalesce((e.data->'faturamento'->>l.codigo)::numeric, 0) <> 0
              or exists (select 1 from jsonb_array_elements(coalesce(e.data->'items', '[]'::jsonb)) it
                         where coalesce((it->>l.codigo)::numeric, 0) <> 0)))
     and not exists (
       select 1 from rh.lojas l
       where l.id = p_loja and l.unidade_id is not null
         and (exists (select 1 from public.vendas x where x.loja_id = l.unidade_id)
              or exists (select 1 from public.caixas x where x.loja_id = l.unidade_id)
              or exists (select 1 from public.produtos x where x.loja_id = l.unidade_id)
              or exists (select 1 from public.stock_movements x where x.loja_id = l.unidade_id)
              or exists (select 1 from public.lancamentos x where x.loja_id = l.unidade_id)));
$$;

create or replace function rh.excluir_loja(p_loja uuid)
returns void language plpgsql security definer set search_path = rh, public as $$
declare v_un uuid;
begin
  if not public.is_admin() then raise exception 'Só o administrador exclui lojas.'; end if;
  if not rh.pode_excluir_loja(p_loja) then raise exception 'Não pode excluir, já tem histórico. Use Inativar.'; end if;
  select unidade_id into v_un from rh.lojas where id = p_loja;
  delete from rh.lojas where id = p_loja;
  if v_un is not null and not exists (select 1 from rh.lojas where unidade_id = v_un) then
    delete from public.lojas where id = v_un;
  end if;
end $$;

-- Empresa: excluir só sem nenhum lançamento (apaga junto as lojas e a rede, se ficar vazia)
create or replace function rh.pode_excluir_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path = rh, public as $$
  select exists (select 1 from rh.empresas where id = p_empresa)
     and not exists (select 1 from rh.rh_entries where empresa_id = p_empresa)
     and not exists (select 1 from rh.rh_entries_log where empresa_id = p_empresa)
     and not exists (select 1 from rh.lojas l where l.empresa_id = p_empresa and not rh.pode_excluir_loja(l.id));
$$;

create or replace function rh.excluir_empresa(p_empresa uuid)
returns void language plpgsql security definer set search_path = rh, public as $$
declare v_rede uuid; v_uns uuid[];
begin
  if not public.is_admin() then raise exception 'Só o administrador exclui empresas.'; end if;
  if not rh.pode_excluir_empresa(p_empresa) then raise exception 'Não pode excluir, já tem histórico. Use Inativar.'; end if;
  select rede_id into v_rede from rh.empresas where id = p_empresa;
  select array_agg(unidade_id) into v_uns from rh.lojas where empresa_id = p_empresa and unidade_id is not null;
  delete from rh.empresas where id = p_empresa;
  if v_uns is not null then delete from public.lojas where id = any (v_uns); end if;
  if v_rede is not null then
    delete from public.redes r where r.id = v_rede
      and not exists (select 1 from public.lojas u where u.rede_id = r.id)
      and not exists (select 1 from rh.empresas e where e.rede_id = r.id);
  end if;
end $$;

-- Lojas da empresa com os dados da unidade (nome, CNPJ, matriz/filial, ativa) para a tela do RH
create or replace function rh.lojas_da_empresa(p_empresa uuid)
returns table (id uuid, codigo text, nome text, ordem int, unidade_id uuid, cnpj text, tipo text, ativo boolean, pode_excluir boolean)
language sql stable security definer set search_path = rh, public as $$
  select l.id, l.codigo, l.nome, l.ordem, l.unidade_id, u.cnpj, u.tipo, coalesce(u.ativo, true),
         public.is_admin() and rh.pode_excluir_loja(l.id)
  from rh.lojas l left join public.lojas u on u.id = l.unidade_id
  where l.empresa_id = p_empresa and rh.is_membro(p_empresa)
  order by l.ordem;
$$;

revoke all on function rh.adicionar_loja(uuid, text, text) from public, anon;
revoke all on function rh.editar_loja(uuid, text, text) from public, anon;
revoke all on function rh.ativar_loja(uuid, boolean) from public, anon;
revoke all on function rh.pode_excluir_loja(uuid) from public, anon;
revoke all on function rh.excluir_loja(uuid) from public, anon;
revoke all on function rh.pode_excluir_empresa(uuid) from public, anon;
revoke all on function rh.excluir_empresa(uuid) from public, anon;
revoke all on function rh.lojas_da_empresa(uuid) from public, anon;
grant execute on function rh.adicionar_loja(uuid, text, text), rh.editar_loja(uuid, text, text), rh.ativar_loja(uuid, boolean),
  rh.pode_excluir_loja(uuid), rh.excluir_loja(uuid), rh.pode_excluir_empresa(uuid), rh.excluir_empresa(uuid),
  rh.lojas_da_empresa(uuid) to authenticated;
