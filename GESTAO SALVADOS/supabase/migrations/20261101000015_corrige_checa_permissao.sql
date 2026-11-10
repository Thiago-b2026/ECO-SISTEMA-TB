-- CORREÇÃO: a checagem de permissão comparava "status = 'cancelada'" em qualquer tabela.
-- Em caixas (status aberto/fechado) isso dava "invalid input value for enum caixa_status",
-- e em caixa_movimentos / stock_movements (sem coluna status) daria erro de campo inexistente.
-- Agora a parte de vendas só é avaliada quando a tabela é vendas.
create or replace function public.checa_permissao()
returns trigger language plpgsql security definer set search_path = public as $$
declare _mod text := tg_argv[0]; _acao text;
begin
  _acao := case tg_op when 'INSERT' then 'inserir' when 'DELETE' then 'excluir' else 'editar' end;
  if tg_table_name = 'vendas' and tg_op = 'UPDATE' then
    -- cancelar venda é a ação especial "vendas.cancelar" (checada em checa_acoes)
    if to_jsonb(new) ->> 'status' = 'cancelada' and to_jsonb(old) ->> 'status' <> 'cancelada' then
      return new;
    end if;
  end if;
  if not public.permite(_mod, _acao) then
    raise exception 'Sem permissão para % em %', _acao, _mod;
  end if;
  return coalesce(new, old);
end;
$$;

-- Mesma proteção na checagem das ações especiais (cada tabela só lê os próprios campos).
create or replace function public.checa_acoes()
returns trigger language plpgsql security definer set search_path = public as $$
declare _n jsonb := to_jsonb(new); _o jsonb;
begin
  if tg_op = 'UPDATE' then _o := to_jsonb(old); end if;
  if tg_table_name = 'vendas' then
    if tg_op = 'INSERT' and coalesce((_n ->> 'desconto')::numeric, 0) > 0 and not public.permite_acao('vendas.desconto') then
      raise exception 'Sem permissão para dar desconto. Peça a um gerente.';
    end if;
    if tg_op = 'UPDATE' and _n ->> 'status' = 'cancelada' and _o ->> 'status' <> 'cancelada' and not public.permite_acao('vendas.cancelar') then
      raise exception 'Sem permissão para cancelar venda. Peça a um gerente.';
    end if;
  elsif tg_table_name = 'caixa_movimentos' then
    if _n ->> 'tipo' = 'sangria' and not public.permite_acao('caixa.sangria') then
      raise exception 'Sem permissão para fazer sangria.';
    end if;
    if _n ->> 'tipo' = 'suprimento' and not public.permite_acao('caixa.suprimento') then
      raise exception 'Sem permissão para fazer suprimento.';
    end if;
  elsif tg_table_name = 'produtos' then
    if tg_op = 'UPDATE' and (_n -> 'preco_venda') is distinct from (_o -> 'preco_venda') and not public.permite_acao('produtos.alterar_preco') then
      raise exception 'Sem permissão para alterar preço de venda.';
    end if;
  elsif tg_table_name = 'stock_movements' then
    if _n ->> 'venda_id' is null and _n ->> 'tipo' in ('ajuste', 'perda', 'devolucao') and not public.permite_acao('produtos.ajustar_estoque') then
      raise exception 'Sem permissão para ajustar estoque.';
    end if;
  end if;
  return new;
end;
$$;
