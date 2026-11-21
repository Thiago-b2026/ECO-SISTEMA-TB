-- =====================================================================
-- 1) TRAVA DE DUPLICADO NO BANCO (lote_itens)
--    A tela já trava (src/lib/duplicados.ts), mas uma aba aberta antes da publicação roda a versão antiga.
--    Agora o banco também recusa, no MESMO lote, item com o mesmo código de barras (8+ dígitos) ou o mesmo nome
--    (normalizar_nome, criado na 0030). Só vale para cadastro feito direto pela tela (usuário "authenticated"):
--    funções do sistema (desmembrar, avaria, transferir, importar planilha) rodam como dono e não são barradas.
--    Itens derivados (desmembrado/avaria) e de planilha ficam de fora.
--
-- 2) VENDA RETROATIVA
--    - Ação especial nova "vendas.retroativa" no editor de permissões (Pessoas → Login e permissões).
--      DESLIGADA para todos até o admin liberar (admin sempre pode). Diferente das outras ações, sem linha = NÃO pode.
--    - lancar_venda_retroativa(): mesmas validações da finalizar_venda (estoque, desconto, pagamento, troco),
--      com data e hora informadas (até 30 dias para trás, nunca no futuro), motivo obrigatório,
--      SEM caixa (o dinheiro já foi contado no dia) e marcada como retroativa (quem lançou = vendedor_id, quando = created_at).
-- =====================================================================

-- ---------- 1) trava de duplicado ----------
create or replace function public.trava_item_duplicado()
returns trigger language plpgsql set search_path = public as $$
declare
  _ean text;
  _dup public.lote_itens;
begin
  if current_user <> 'authenticated' then return new; end if;           -- funções do sistema passam
  if new.origem = 'planilha' or new.tipo_derivado is not null then return new; end if;
  if tg_op = 'UPDATE' and new.titulo is not distinct from old.titulo and new.codigo_barras is not distinct from old.codigo_barras then
    return new;
  end if;
  _ean := nullif(regexp_replace(coalesce(new.codigo_barras, ''), '\D', '', 'g'), '');
  if _ean is not null and length(_ean) >= 8 then
    select * into _dup from public.lote_itens
     where lote_id = new.lote_id and id <> new.id
       and regexp_replace(coalesce(codigo_barras, ''), '\D', '', 'g') = _ean
     limit 1;
    if found then
      raise exception 'Produto já cadastrado neste lote (% · %), mesmo código de barras. Some a quantidade no existente.', _dup.sku, _dup.titulo;
    end if;
  end if;
  if length(public.normalizar_nome(new.titulo)) >= 3 then
    select * into _dup from public.lote_itens
     where lote_id = new.lote_id and id <> new.id
       and public.normalizar_nome(titulo) = public.normalizar_nome(new.titulo)
     limit 1;
    if found then
      raise exception 'Produto já cadastrado neste lote (% · %), mesmo nome. Some a quantidade no existente ou mude o nome.', _dup.sku, _dup.titulo;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trava_item_duplicado on public.lote_itens;
create trigger trg_trava_item_duplicado before insert or update of titulo, codigo_barras on public.lote_itens
  for each row execute function public.trava_item_duplicado();

-- ---------- 2) venda retroativa ----------
-- ação especial nova no catálogo do editor de permissões
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.permissoes_acoes'::regclass and contype = 'c' loop
    execute format('alter table public.permissoes_acoes drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.permissoes_acoes add constraint permissoes_acoes_chave_check check (chave in (
  'vendas.cancelar', 'vendas.desconto', 'vendas.retroativa', 'caixa.sangria', 'caixa.suprimento',
  'produtos.alterar_preco', 'produtos.ajustar_estoque', 'produtos.ver_custo', 'dados.exportar'));

-- catálogo por unidade (Portal), para a ação aparecer junto da tela Vendas
insert into public.acoes (codigo, nome, ordem, especial) values ('venda_retroativa', 'Lançar venda retroativa', 75, true)
on conflict (codigo) do update set nome = excluded.nome, ordem = excluded.ordem, especial = true;
insert into public.tela_acoes (tela_codigo, acao) values ('pdv.vendas', 'venda_retroativa') on conflict do nothing;

alter table public.vendas add column if not exists retroativa boolean not null default false;
alter table public.vendas add column if not exists motivo_retroativa text;

-- só quem o admin liberou (sem linha = NÃO pode)
create or replace function public.pode_venda_retroativa()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.permissoes_acoes a
                  where a.user_id = auth.uid() and a.chave = 'vendas.retroativa' and a.permitido);
$$;
grant execute on function public.pode_venda_retroativa() to authenticated;

create or replace function public.lancar_venda_retroativa(
  _loja_id uuid, _data_venda timestamptz, _itens jsonb, _pagamentos jsonb,
  _desconto numeric default 0, _motivo text default null, _vendedor_nome text default null, _observacao text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _venda uuid; _numero bigint; _it jsonb; _p public.produtos;
  _qtd numeric; _preco numeric; _desc_item numeric; _subtotal numeric := 0; _total numeric;
  _pago numeric := 0; _dinheiro numeric := 0; _troco numeric; _pg jsonb;
begin
  if not (public.pode_vender() and public.pode_ver_loja(_loja_id)) then raise exception 'Sem permissão'; end if;
  if not public.pode_venda_retroativa() then raise exception 'Sem permissão para lançar venda retroativa (o administrador libera em Pessoas → Login e permissões).'; end if;
  if _data_venda is null then raise exception 'Informe a data e a hora da venda'; end if;
  if _data_venda > now() + interval '1 minute' then raise exception 'A data da venda não pode ser no futuro'; end if;
  if _data_venda < now() - interval '30 days' then raise exception 'Venda retroativa só até 30 dias para trás'; end if;
  if coalesce(trim(_motivo), '') = '' then raise exception 'Informe o motivo da venda retroativa'; end if;
  if jsonb_array_length(coalesce(_itens, '[]')) = 0 then raise exception 'Venda sem itens'; end if;
  if jsonb_array_length(coalesce(_pagamentos, '[]')) = 0 then raise exception 'Informe o pagamento'; end if;

  for _it in select * from jsonb_array_elements(_itens) loop
    _qtd := (_it->>'quantidade')::numeric; _preco := (_it->>'preco_unit')::numeric; _desc_item := coalesce((_it->>'desconto')::numeric, 0);
    if _qtd is null or _qtd <= 0 or _preco is null or _preco < 0 or _desc_item < 0 then raise exception 'Item inválido'; end if;
    select * into _p from public.produtos where id = (_it->>'produto_id')::uuid and loja_id = _loja_id for update;
    if not found then raise exception 'Produto não encontrado nesta loja'; end if;
    if _p.estoque_atual < _qtd then raise exception 'Estoque insuficiente para "%" (disponível: %)', _p.titulo, _p.estoque_atual; end if;
    if _desc_item > _preco * _qtd then raise exception 'Desconto maior que o item "%"', _p.titulo; end if;
    _subtotal := _subtotal + round(_preco * _qtd - _desc_item, 2);
  end loop;
  _desconto := coalesce(_desconto, 0);
  if _desconto < 0 or _desconto > _subtotal then raise exception 'Desconto inválido'; end if;
  _total := _subtotal - _desconto;

  for _pg in select * from jsonb_array_elements(_pagamentos) loop
    if (_pg->>'valor')::numeric <= 0 then raise exception 'Pagamento com valor inválido'; end if;
    _pago := _pago + (_pg->>'valor')::numeric;
    if _pg->>'forma' = 'dinheiro' then _dinheiro := _dinheiro + (_pg->>'valor')::numeric; end if;
  end loop;
  if _pago < _total then raise exception 'Pagamento (%) menor que o total (%)', _pago, _total; end if;
  _troco := _pago - _total;
  if _troco > _dinheiro then raise exception 'Troco só pode sair de pagamento em dinheiro'; end if;

  -- sem caixa: o dinheiro já foi contado no dia; relatórios e financeiro usam data_venda
  insert into public.vendas (loja_id, caixa_id, vendedor_nome, subtotal, desconto, total, observacao, data_venda, retroativa, motivo_retroativa)
  values (_loja_id, null, coalesce(nullif(trim(_vendedor_nome), ''), (select nome from public.profiles where id = auth.uid())),
          _subtotal, _desconto, _total, nullif(trim(_observacao), ''), _data_venda, true, trim(_motivo))
  returning id, numero into _venda, _numero;

  for _it in select * from jsonb_array_elements(_itens) loop
    select * into _p from public.produtos where id = (_it->>'produto_id')::uuid;
    _qtd := (_it->>'quantidade')::numeric; _preco := (_it->>'preco_unit')::numeric; _desc_item := coalesce((_it->>'desconto')::numeric, 0);
    insert into public.venda_itens (venda_id, produto_id, descricao, quantidade, preco_unit, desconto, total, custo_unit)
    values (_venda, _p.id, _p.titulo, _qtd, _preco, _desc_item, round(_preco * _qtd - _desc_item, 2), _p.custo_unit);
    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, venda_id, motivo)
    values (_loja_id, _p.id, 'venda', -_qtd, _p.custo_unit, _venda, 'Venda retroativa nº ' || _numero);
  end loop;

  for _pg in select * from jsonb_array_elements(_pagamentos) loop
    insert into public.venda_pagamentos (venda_id, forma, valor, troco, meio_id)
    values (_venda, (_pg->>'forma')::public.forma_pagamento, (_pg->>'valor')::numeric,
            case when _pg->>'forma' = 'dinheiro' and _troco > 0 then least(_troco, (_pg->>'valor')::numeric) else 0 end,
            nullif(_pg->>'meio_id', '')::uuid);
    if _pg->>'forma' = 'dinheiro' then _troco := greatest(_troco - (_pg->>'valor')::numeric, 0); end if;
  end loop;

  return jsonb_build_object('id', _venda, 'numero', _numero, 'total', _total, 'troco', _pago - _total);
end;
$$;

revoke all on function public.lancar_venda_retroativa(uuid, timestamptz, jsonb, jsonb, numeric, text, text, text) from public, anon;
grant execute on function public.lancar_venda_retroativa(uuid, timestamptz, jsonb, jsonb, numeric, text, text, text) to authenticated;
