-- =====================================================================
-- Desmembramento, avaria parcial, transferência (lotes e filiais) e
-- modelos de etiqueta personalizados
-- =====================================================================

alter table public.lote_itens add column origem_item_id uuid references public.lote_itens(id) on delete set null;
alter table public.lote_itens add column tipo_derivado text check (tipo_derivado in ('desmembrado', 'avaria_parcial'));

-- ---------------------------------------------------------------------
-- DESMEMBRAR: _qtd_caixas caixas/kits do item viram unidades.
-- Ex.: 2 caixas com 6 copos, 1 copo quebrado → 11 unidades.
-- Preço/custo/ML por unidade = valor da caixa ÷ unidades por caixa (se não informar preço).
-- ---------------------------------------------------------------------
create or replace function public.desmembrar_item(_item_id uuid, _qtd_caixas int, _unidades_por_caixa int,
  _avariadas int default 0, _titulo text default null, _preco_unit numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _i public.lote_itens;
  _novo uuid;
  _un int;
begin
  select * into _i from public.lote_itens where id = _item_id for update;
  if not found or not (public.pode_lotes() and public.pode_ver_lote(_i.lote_id)) then raise exception 'Item não encontrado'; end if;
  if exists (select 1 from public.produtos where lote_item_id = _item_id) then raise exception 'Item já foi lançado no estoque'; end if;
  if _qtd_caixas is null or _qtd_caixas < 1 or _qtd_caixas > _i.quantidade then raise exception 'Quantidade de caixas inválida (máx. %)', _i.quantidade; end if;
  if _unidades_por_caixa is null or _unidades_por_caixa < 2 then raise exception 'Unidades por caixa deve ser 2 ou mais'; end if;
  _un := _qtd_caixas * _unidades_por_caixa - coalesce(_avariadas, 0);
  if coalesce(_avariadas, 0) < 0 or _un < 1 then raise exception 'Quantidade de avariadas inválida'; end if;

  insert into public.lote_itens (lote_id, pallet_id, origem, status, termo, codigo_barras, titulo, categoria, marca, grade,
    quantidade, ml_id, ml_tipo, ml_link, foto_url, preco_ml, preco_ml_original, preco_venda, custo_unit,
    origem_item_id, tipo_derivado)
  values (_i.lote_id, _i.pallet_id, _i.origem, 'aprovado', _i.termo, null,
    coalesce(nullif(trim(_titulo), ''), _i.titulo || ' (unidade)'), _i.categoria, _i.marca, _i.grade,
    _un, _i.ml_id, _i.ml_tipo, _i.ml_link, _i.foto_url,
    round(_i.preco_ml / _unidades_por_caixa, 2), round(_i.preco_ml_original / _unidades_por_caixa, 2),
    coalesce(_preco_unit, round(_i.preco_venda / _unidades_por_caixa, 2)),
    -- custo das caixas vai todo para as unidades boas (as quebradas não vendem)
    round(_i.custo_unit * _qtd_caixas / _un, 2),
    _i.id, 'desmembrado')
  returning id into _novo;

  if _qtd_caixas = _i.quantidade then
    delete from public.lote_itens where id = _i.id;
  else
    update public.lote_itens set quantidade = quantidade - _qtd_caixas where id = _i.id;
  end if;
  return _novo;
end;
$$;

-- ---------------------------------------------------------------------
-- AVARIA PARCIAL: _qtd unidades viram um item separado, com preço menor
-- e etiqueta própria (SKU novo). O custo unitário continua o mesmo.
-- ---------------------------------------------------------------------
create or replace function public.avaria_parcial_item(_item_id uuid, _qtd int, _preco numeric, _obs text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _i public.lote_itens;
  _novo uuid;
begin
  select * into _i from public.lote_itens where id = _item_id for update;
  if not found or not (public.pode_lotes() and public.pode_ver_lote(_i.lote_id)) then raise exception 'Item não encontrado'; end if;
  if exists (select 1 from public.produtos where lote_item_id = _item_id) then raise exception 'Item já foi lançado no estoque'; end if;
  if _qtd is null or _qtd < 1 or _qtd > _i.quantidade then raise exception 'Quantidade inválida (máx. %)', _i.quantidade; end if;
  if _preco is null or _preco <= 0 then raise exception 'Informe o preço do avariado'; end if;
  if _i.preco_venda is not null and _preco >= _i.preco_venda then raise exception 'O preço do avariado deve ser menor que %', _i.preco_venda; end if;

  insert into public.lote_itens (lote_id, pallet_id, origem, status, termo, codigo_barras, titulo, categoria, marca, grade,
    quantidade, ml_id, ml_tipo, ml_link, foto_url, preco_ml, preco_ml_original, preco_venda, custo_unit,
    ocorrencia, origem_item_id, tipo_derivado)
  values (_i.lote_id, _i.pallet_id, _i.origem, 'aprovado', coalesce(nullif(trim(_obs), ''), _i.termo), null,
    _i.titulo || ' (avaria parcial)', _i.categoria, _i.marca, 'AV',
    _qtd, _i.ml_id, _i.ml_tipo, _i.ml_link, _i.foto_url, _i.preco_ml, _i.preco_ml_original, _preco, _i.custo_unit,
    'avaria_parcial', _i.id, 'avaria_parcial')
  returning id into _novo;

  if _qtd = _i.quantidade then
    delete from public.lote_itens where id = _i.id;
  else
    update public.lote_itens set quantidade = quantidade - _qtd where id = _i.id;
  end if;
  return _novo;
end;
$$;

-- ---------------------------------------------------------------------
-- TRANSFERIR ITENS ENTRE LOTES (ambos em criação, itens ainda fora do estoque)
-- ---------------------------------------------------------------------
create or replace function public.transferir_itens_lote(_item_ids uuid[], _lote_destino uuid, _pallet_destino uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  if not (public.pode_lotes() and public.pode_ver_lote(_lote_destino)) then raise exception 'Sem permissão no lote de destino'; end if;
  if not exists (select 1 from public.lotes where id = _lote_destino and status = 'em_criacao') then
    raise exception 'O lote de destino precisa estar "Em criação"';
  end if;
  if _pallet_destino is not null and not exists (select 1 from public.pallets where id = _pallet_destino and lote_id = _lote_destino) then
    raise exception 'Pallet não pertence ao lote de destino';
  end if;
  if exists (select 1 from public.lote_itens i join public.lotes l on l.id = i.lote_id
             where i.id = any(_item_ids) and (not public.pode_ver_lote(i.lote_id) or l.status <> 'em_criacao')) then
    raise exception 'Só dá para transferir itens de lotes "Em criação" que você pode acessar';
  end if;
  if exists (select 1 from public.produtos where lote_item_id = any(_item_ids)) then
    raise exception 'Algum item já foi lançado no estoque';
  end if;
  update public.lote_itens set lote_id = _lote_destino, pallet_id = _pallet_destino
   where id = any(_item_ids) and lote_id <> _lote_destino;
  get diagnostics _n = row_count;
  return _n;
end;
$$;

-- ---------------------------------------------------------------------
-- TRANSFERÊNCIA ENTRE FILIAIS (estoque): envia (sai da origem) → recebe (entra no destino)
-- ---------------------------------------------------------------------
create type public.transf_status as enum ('em_transito', 'recebida', 'cancelada');

create table public.transferencias (
  id            uuid primary key default gen_random_uuid(),
  numero        bigserial unique,
  loja_origem   uuid not null references public.lojas(id),
  loja_destino  uuid not null references public.lojas(id),
  status        public.transf_status not null default 'em_transito',
  observacao    text,
  enviado_por   uuid references auth.users(id) default auth.uid(),
  enviado_em    timestamptz not null default now(),
  recebido_por  uuid references auth.users(id),
  recebido_em   timestamptz,
  check (loja_origem <> loja_destino)
);
alter table public.transferencias enable row level security;
create policy "transf: ler" on public.transferencias for select to authenticated
  using (public.pode_ver_loja(loja_origem) or public.pode_ver_loja(loja_destino));

create table public.transferencia_itens (
  id                uuid primary key default gen_random_uuid(),
  transferencia_id  uuid not null references public.transferencias(id) on delete cascade,
  produto_id        uuid not null references public.produtos(id),
  quantidade        numeric(12,3) not null check (quantidade > 0),
  produto_destino   uuid references public.produtos(id)
);
alter table public.transferencia_itens enable row level security;
create policy "transf_itens: ler" on public.transferencia_itens for select to authenticated
  using (exists (select 1 from public.transferencias t where t.id = transferencia_id
                 and (public.pode_ver_loja(t.loja_origem) or public.pode_ver_loja(t.loja_destino))));

-- _itens: [{ "produto_id": uuid, "quantidade": n }]
create or replace function public.enviar_transferencia(_origem uuid, _destino uuid, _itens jsonb, _obs text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare _t uuid; _num bigint; _it jsonb; _p public.produtos; _q numeric;
begin
  if not (public.pode_estoque() and public.pode_ver_loja(_origem)) then raise exception 'Sem permissão na loja de origem'; end if;
  if _origem = _destino then raise exception 'Origem e destino iguais'; end if;
  if not exists (select 1 from public.lojas where id = _destino and ativo) then raise exception 'Loja de destino inválida'; end if;
  if jsonb_array_length(coalesce(_itens, '[]')) = 0 then raise exception 'Nenhum item'; end if;
  insert into public.transferencias (loja_origem, loja_destino, observacao) values (_origem, _destino, nullif(trim(_obs), ''))
  returning id, numero into _t, _num;
  for _it in select * from jsonb_array_elements(_itens) loop
    _q := (_it->>'quantidade')::numeric;
    select * into _p from public.produtos where id = (_it->>'produto_id')::uuid and loja_id = _origem for update;
    if not found then raise exception 'Produto não está na loja de origem'; end if;
    if _q is null or _q <= 0 or _q > _p.estoque_atual then raise exception 'Quantidade inválida para "%" (estoque %)', _p.titulo, _p.estoque_atual; end if;
    insert into public.transferencia_itens (transferencia_id, produto_id, quantidade) values (_t, _p.id, _q);
    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, motivo)
    values (_origem, _p.id, 'transferencia_saida', -_q, _p.custo_unit, 'Transferência nº ' || _num);
  end loop;
  return _num;
end;
$$;

create or replace function public.receber_transferencia(_transf_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare _t public.transferencias; _ti public.transferencia_itens; _p public.produtos; _dest uuid; _n int := 0;
begin
  select * into _t from public.transferencias where id = _transf_id for update;
  if not found or not (public.pode_estoque() and public.pode_ver_loja(_t.loja_destino)) then raise exception 'Sem permissão na loja de destino'; end if;
  if _t.status <> 'em_transito' then raise exception 'Transferência já %', _t.status; end if;
  for _ti in select * from public.transferencia_itens where transferencia_id = _transf_id loop
    select * into _p from public.produtos where id = _ti.produto_id;
    select id into _dest from public.produtos where loja_id = _t.loja_destino and sku = _p.sku;
    if _dest is null then
      insert into public.produtos (loja_id, sku, codigo_barras, titulo, categoria, marca, grade, preco_venda, preco_de,
                                   custo_unit, foto_url, ml_link, lote_id)
      values (_t.loja_destino, _p.sku, _p.codigo_barras, _p.titulo, _p.categoria, _p.marca, _p.grade, _p.preco_venda, _p.preco_de,
              _p.custo_unit, _p.foto_url, _p.ml_link, _p.lote_id)
      returning id into _dest;
    end if;
    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, motivo)
    values (_t.loja_destino, _dest, 'transferencia_entrada', _ti.quantidade, _p.custo_unit, 'Transferência nº ' || _t.numero);
    update public.transferencia_itens set produto_destino = _dest where id = _ti.id;
    _n := _n + 1;
  end loop;
  update public.transferencias set status = 'recebida', recebido_por = auth.uid(), recebido_em = now() where id = _transf_id;
  return _n;
end;
$$;

-- Nomes de todas as lojas ativas (destino de transferência), sem outros dados
create or replace function public.lojas_ativas()
returns table (id uuid, nome text) language sql stable security definer set search_path = public as $$
  select l.id, l.nome from public.lojas l where l.ativo and auth.uid() is not null order by l.nome;
$$;

-- Cancela uma transferência ainda em trânsito: estoque volta para a origem
create or replace function public.cancelar_transferencia(_transf_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _t public.transferencias; _ti public.transferencia_itens;
begin
  select * into _t from public.transferencias where id = _transf_id for update;
  if not found or not (public.pode_estoque() and public.pode_ver_loja(_t.loja_origem)) then raise exception 'Sem permissão na loja de origem'; end if;
  if _t.status <> 'em_transito' then raise exception 'Transferência já %', _t.status; end if;
  for _ti in select * from public.transferencia_itens where transferencia_id = _transf_id loop
    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, motivo)
    values (_t.loja_origem, _ti.produto_id, 'transferencia_entrada', _ti.quantidade, 'Cancelamento transferência nº ' || _t.numero);
  end loop;
  update public.transferencias set status = 'cancelada' where id = _transf_id;
end;
$$;

-- ---------------------------------------------------------------------
-- MODELOS DE ETIQUETA personalizados (editor)
-- ---------------------------------------------------------------------
create table public.modelos_etiqueta (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  config      jsonb not null,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_modelos_etiqueta_updated before update on public.modelos_etiqueta
  for each row execute function public.set_updated_at();
alter table public.modelos_etiqueta enable row level security;
create policy "etiq: ler" on public.modelos_etiqueta for select to authenticated using (true);
create policy "etiq: gestor cria" on public.modelos_etiqueta for insert to authenticated with check (public.is_gestor());
create policy "etiq: gestor edita" on public.modelos_etiqueta for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy "etiq: gestor exclui" on public.modelos_etiqueta for delete to authenticated using (public.is_gestor());

do $$
declare f text;
begin
  foreach f in array array[
    'desmembrar_item(uuid, int, int, int, text, numeric)', 'avaria_parcial_item(uuid, int, numeric, text)',
    'transferir_itens_lote(uuid[], uuid, uuid)', 'enviar_transferencia(uuid, uuid, jsonb, text)',
    'receber_transferencia(uuid)', 'cancelar_transferencia(uuid)', 'lojas_ativas()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
