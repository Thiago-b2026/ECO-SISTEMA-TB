-- =====================================================================
-- Ajuste pontual (01/11/2026): a loja "Matriz" (onde está toda a
-- movimentação) é a SALVADOS LP MS, CNPJ 65.297.057/0001-40.
-- Já existia um cadastro duplicado "SALVADOS LP MS" com esse CNPJ e SEM
-- movimento. Este script:
--   1) confere que o duplicado está vazio (se não estiver, para sem mudar nada)
--   2) copia os dados cadastrais do duplicado para a loja com movimento
--   3) desativa o duplicado (não apaga nada)
-- Rodar uma vez só. Tudo numa transação.
-- =====================================================================
begin;

do $$
declare
  _mov uuid;   -- loja com movimento (código MATRIZ)
  _dup uuid;   -- cadastro duplicado com o CNPJ
  _uso int;
begin
  select id into _mov from public.lojas where codigo = 'MATRIZ';
  select id into _dup from public.lojas where cnpj = '65297057000140';
  if _mov is null then raise exception 'Loja com movimento (MATRIZ) não encontrada'; end if;
  if _dup is null then raise exception 'Nenhuma loja com o CNPJ 65297057000140'; end if;
  if _dup = _mov then raise notice 'Já está certo: a loja com movimento já tem esse CNPJ.'; return; end if;

  select (select count(*) from public.vendas where loja_id = _dup)
       + (select count(*) from public.produtos where loja_id = _dup)
       + (select count(*) from public.lotes where loja_id = _dup)
       + (select count(*) from public.caixas where loja_id = _dup)
       + (select count(*) from public.contas_bancarias where loja_id = _dup)
       + (select count(*) from public.lancamentos where loja_id = _dup)
    into _uso;
  if _uso > 0 then
    raise exception 'A loja duplicada tem % registros de movimento. Nada foi alterado — avise o suporte.', _uso;
  end if;

  -- copia os dados cadastrais e libera o CNPJ do duplicado
  update public.lojas d set cnpj = null, nome = d.nome || ' (duplicada)', ativo = false where d.id = _dup;
  update public.lojas m set
    nome = 'SALVADOS LP MS',
    cnpj = '65297057000140',
    razao_social = s.razao_social, nome_fantasia = s.nome_fantasia, ie = s.ie, im = s.im,
    regime_tributario = s.regime_tributario, email = s.email, telefone = s.telefone, cep = s.cep,
    logradouro = s.logradouro, numero = s.numero, complemento = s.complemento, bairro = s.bairro,
    cidade = s.cidade, uf = s.uf, cod_ibge = s.cod_ibge, situacao_cadastral = s.situacao_cadastral, atividade = s.atividade
  from public.lojas s
  where m.id = _mov and s.id = _dup;

  -- quem estava ligado ao duplicado passa a trabalhar na loja com movimento
  insert into public.usuario_lojas (user_id, loja_id)
  select user_id, _mov from public.usuario_lojas where loja_id = _dup
  on conflict do nothing;
  delete from public.usuario_lojas where loja_id = _dup;

  raise notice 'Pronto: movimento agora está na SALVADOS LP MS (CNPJ 65.297.057/0001-40).';
end $$;

commit;
