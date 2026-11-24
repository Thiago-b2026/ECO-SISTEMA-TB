-- "De" da etiqueta = preço ATUAL achado no Mercado Livre (o mesmo que gera o preço de venda, menos o desconto do lote),
-- como no PrecificaLote. Antes usava o preço cheio (sem promoção), e o % OFF saía diferente do desconto configurado.
-- Vale para os próximos lançamentos; produtos já lançados não são alterados aqui.
create or replace function public.lancar_lote_estoque(_lote_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _l public.lotes;
  _i public.lote_itens;
  _p public.produtos;
  _pid uuid;
  _ean text;
  _novos int := 0;
  _somados int := 0;
  _estoque numeric;
begin
  if not (public.pode_estoque() and public.pode_ver_lote(_lote_id)) then raise exception 'Sem permissão'; end if;
  select * into _l from public.lotes where id = _lote_id for update;
  for _i in
    select * from public.lote_itens
    where lote_id = _lote_id
      and status = 'aprovado'
      and (ocorrencia is null or ocorrencia = 'avaria_parcial')
      and preco_venda is not null and preco_venda > 0
      and lancado_produto_id is null
      and not exists (select 1 from public.produtos p where p.lote_item_id = lote_itens.id)
    for update
  loop
    _ean := nullif(regexp_replace(coalesce(_i.codigo_barras, ''), '\D', '', 'g'), '');
    _p := null;
    -- mesmo produto na loja: código de barras primeiro, depois nome
    if _ean is not null and length(_ean) >= 8 then
      select * into _p from public.produtos
       where loja_id = _l.loja_id and ativo
         and regexp_replace(coalesce(codigo_barras, ''), '\D', '', 'g') = _ean
       order by created_at limit 1 for update;
    end if;
    if _p.id is null and length(public.normalizar_nome(_i.titulo)) >= 3 then
      select * into _p from public.produtos
       where loja_id = _l.loja_id and ativo
         and public.normalizar_nome(titulo) = public.normalizar_nome(_i.titulo)
       order by created_at limit 1 for update;
    end if;

    if _p.id is not null then
      -- soma no existente: custo médio ponderado (quando os dois custos existem)
      _estoque := greatest(coalesce(_p.estoque_atual, 0), 0);
      if _i.custo_unit is not null then
        update public.produtos
           set custo_unit = case when custo_unit is null or _estoque + _i.quantidade <= 0 then _i.custo_unit
                                 else round((_estoque * custo_unit + _i.quantidade * _i.custo_unit) / (_estoque + _i.quantidade), 2) end,
               codigo_barras = coalesce(codigo_barras, _ean)
         where id = _p.id;
      end if;
      -- produto que não tinha "De": passa a ter o preço achado no ML
      if _p.preco_de is null and _i.preco_ml is not null then
        update public.produtos set preco_de = _i.preco_ml where id = _p.id;
      end if;
      _pid := _p.id;
      _somados := _somados + 1;
    else
      insert into public.produtos (loja_id, sku, codigo_barras, titulo, categoria, marca, grade, preco_venda, preco_de,
                                   custo_unit, foto_url, ml_link, lote_id, lote_item_id)
      values (_l.loja_id, _i.sku, _i.codigo_barras, _i.titulo, _i.categoria, _i.marca, _i.grade, _i.preco_venda,
              _i.preco_ml, _i.custo_unit, _i.foto_url, _i.ml_link, _l.id, _i.id)
      returning id into _pid;
      _novos := _novos + 1;
    end if;

    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, motivo)
    values (_l.loja_id, _pid, 'entrada', _i.quantidade, _i.custo_unit,
            'Entrada do lote ' || _l.nome || case when _p.id is not null then ' (somado ao produto já cadastrado)' else '' end);
    update public.lote_itens set lancado_produto_id = _pid where id = _i.id;
  end loop;
  if _novos + _somados > 0 and _l.status = 'em_criacao' then
    update public.lotes set status = 'disponivel' where id = _lote_id;
  end if;
  return jsonb_build_object('novos', _novos, 'somados', _somados);
end;
$$;

revoke all on function public.lancar_lote_estoque(uuid) from public, anon;
grant execute on function public.lancar_lote_estoque(uuid) to authenticated;
