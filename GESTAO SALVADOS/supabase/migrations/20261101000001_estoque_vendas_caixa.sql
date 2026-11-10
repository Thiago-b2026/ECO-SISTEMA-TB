-- =====================================================================
-- Fase 1: Produtos/estoque, Caixa, Vendas (PDV) e Relatórios básicos
-- Regras do projeto:
--  - estoque só muda por stock_movements (trigger mantém estoque_atual)
--  - venda + itens + pagamentos + baixa de estoque numa única RPC (atômica)
--  - só dinheiro entra no saldo da gaveta; fechamento cego
--  - tudo por loja (pode_ver_loja)
-- =====================================================================

create type public.mov_tipo as enum (
  'entrada', 'venda', 'ajuste', 'perda', 'devolucao', 'cancelamento_venda', 'transferencia_saida', 'transferencia_entrada'
);
create type public.forma_pagamento as enum ('dinheiro', 'pix', 'debito', 'credito', 'outro');
create type public.venda_status as enum ('finalizada', 'cancelada');
create type public.caixa_status as enum ('aberto', 'fechado');
create type public.caixa_mov_tipo as enum ('sangria', 'suprimento');

create or replace function public.pode_estoque()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(auth.uid(), array['admin','gerente','estoquista']::public.app_role[]);
$$;
create or replace function public.pode_vender()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(auth.uid(), array['admin','gerente','vendedor']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------
-- PRODUTOS (estoque por loja)
-- ---------------------------------------------------------------------
create table public.produtos (
  id              uuid primary key default gen_random_uuid(),
  loja_id         uuid not null references public.lojas(id),
  sku             text not null,
  codigo_barras   text,
  titulo          text not null,
  categoria       text,
  marca           text,
  grade           text not null default 'A',
  preco_venda     numeric(14,2) not null check (preco_venda >= 0),
  preco_de        numeric(14,2),            -- "De:" da etiqueta (preço de referência ML)
  custo_unit      numeric(14,2),
  foto_url        text,
  ml_link         text,
  lote_id         uuid references public.lotes(id) on delete set null,
  lote_item_id    uuid unique references public.lote_itens(id) on delete set null,
  estoque_atual   numeric(12,3) not null default 0,
  ativo           boolean not null default true,
  ncm             text,                      -- fiscal (fase 3)
  created_by      uuid references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (loja_id, sku)
);
create index produtos_loja_idx on public.produtos (loja_id, ativo);
create index produtos_ean_idx on public.produtos (codigo_barras);
create index produtos_titulo_idx on public.produtos using gin (to_tsvector('portuguese', titulo));
create trigger trg_produtos_updated before update on public.produtos
  for each row execute function public.set_updated_at();
alter table public.produtos enable row level security;
create policy "produtos: ler" on public.produtos for select to authenticated using (public.pode_ver_loja(loja_id));
create policy "produtos: criar" on public.produtos for insert to authenticated with check (public.pode_estoque() and public.pode_ver_loja(loja_id) and estoque_atual = 0);
create policy "produtos: editar" on public.produtos for update to authenticated using (public.pode_estoque() and public.pode_ver_loja(loja_id)) with check (public.pode_estoque() and public.pode_ver_loja(loja_id));

-- Ninguém altera estoque_atual direto: só o trigger de stock_movements
create or replace function public.produtos_protege_estoque()
returns trigger language plpgsql as $$
begin
  if new.estoque_atual is distinct from old.estoque_atual
     and coalesce(current_setting('app.mov_estoque', true), '') <> '1' then
    raise exception 'Estoque só muda por movimentação (stock_movements)';
  end if;
  return new;
end;
$$;
create trigger trg_produtos_protege_estoque before update on public.produtos
  for each row execute function public.produtos_protege_estoque();

create sequence public.produtos_sku_seq start 100000;

-- ---------------------------------------------------------------------
-- STOCK_MOVEMENTS
-- ---------------------------------------------------------------------
create table public.stock_movements (
  id           uuid primary key default gen_random_uuid(),
  loja_id      uuid not null references public.lojas(id),
  produto_id   uuid not null references public.produtos(id) on delete cascade,
  tipo         public.mov_tipo not null,
  quantidade   numeric(12,3) not null check (quantidade <> 0),   -- + entra, − sai
  custo_unit   numeric(14,2),
  motivo       text,
  venda_id     uuid,
  user_id      uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index stock_mov_produto_idx on public.stock_movements (produto_id, created_at desc);
create index stock_mov_loja_idx on public.stock_movements (loja_id, created_at desc);
alter table public.stock_movements enable row level security;
create policy "mov: ler" on public.stock_movements for select to authenticated using (public.pode_ver_loja(loja_id));
-- inserção só pelas RPCs (security definer); sem policy de insert/update/delete

create or replace function public.aplica_movimento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.mov_estoque', '1', true);
  update public.produtos set estoque_atual = estoque_atual + new.quantidade where id = new.produto_id;
  perform set_config('app.mov_estoque', '', true);
  return new;
end;
$$;
create trigger trg_aplica_movimento after insert on public.stock_movements
  for each row execute function public.aplica_movimento();

-- Movimentação manual (entrada avulsa, ajuste, perda, devolução)
create or replace function public.movimentar_estoque(_produto_id uuid, _tipo public.mov_tipo, _quantidade numeric, _motivo text)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  _p public.produtos;
  _q numeric;
begin
  if not public.pode_estoque() then raise exception 'Sem permissão'; end if;
  if _tipo not in ('entrada', 'ajuste', 'perda', 'devolucao') then raise exception 'Tipo inválido para movimentação manual'; end if;
  if _quantidade is null or _quantidade = 0 then raise exception 'Quantidade inválida'; end if;
  if _tipo in ('ajuste', 'perda') and coalesce(trim(_motivo), '') = '' then raise exception 'Informe o motivo'; end if;
  select * into _p from public.produtos where id = _produto_id for update;
  if not found or not public.pode_ver_loja(_p.loja_id) then raise exception 'Produto não encontrado'; end if;
  _q := case when _tipo = 'perda' then -abs(_quantidade)
             when _tipo in ('entrada', 'devolucao') then abs(_quantidade)
             else _quantidade end;  -- ajuste: sinal informado
  if _p.estoque_atual + _q < 0 then raise exception 'Estoque ficaria negativo (atual: %)', _p.estoque_atual; end if;
  insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, motivo)
  values (_p.loja_id, _p.id, _tipo, _q, _p.custo_unit, nullif(trim(_motivo), ''));
  return _p.estoque_atual + _q;
end;
$$;

-- Lança os itens aprovados de um lote no estoque da loja do lote
create or replace function public.lancar_lote_estoque(_lote_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  _l public.lotes;
  _i public.lote_itens;
  _pid uuid;
  _n int := 0;
begin
  if not (public.pode_estoque() and public.pode_ver_lote(_lote_id)) then raise exception 'Sem permissão'; end if;
  select * into _l from public.lotes where id = _lote_id for update;
  for _i in
    select * from public.lote_itens
    where lote_id = _lote_id
      and status = 'aprovado'
      and (ocorrencia is null or ocorrencia = 'avaria_parcial')
      and preco_venda is not null and preco_venda > 0
      and not exists (select 1 from public.produtos p where p.lote_item_id = lote_itens.id)
  loop
    insert into public.produtos (loja_id, sku, codigo_barras, titulo, categoria, marca, grade, preco_venda, preco_de,
                                 custo_unit, foto_url, ml_link, lote_id, lote_item_id)
    values (_l.loja_id, _i.sku, _i.codigo_barras, _i.titulo, _i.categoria, _i.marca, _i.grade, _i.preco_venda,
            coalesce(_i.preco_ml_original, _i.preco_ml), _i.custo_unit, _i.foto_url, _i.ml_link, _l.id, _i.id)
    returning id into _pid;
    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, motivo)
    values (_l.loja_id, _pid, 'entrada', _i.quantidade, _i.custo_unit, 'Entrada do lote ' || _l.nome);
    _n := _n + 1;
  end loop;
  if _n > 0 and _l.status = 'em_criacao' then
    update public.lotes set status = 'disponivel' where id = _lote_id;
  end if;
  return _n;
end;
$$;

-- Produto avulso (sem lote): cria com estoque inicial
create or replace function public.criar_produto(_loja_id uuid, _titulo text, _preco numeric, _quantidade numeric,
  _codigo_barras text default null, _categoria text default null, _custo numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _pid uuid;
begin
  if not (public.pode_estoque() and public.pode_ver_loja(_loja_id)) then raise exception 'Sem permissão'; end if;
  if coalesce(trim(_titulo), '') = '' or _preco is null or _preco < 0 then raise exception 'Título e preço são obrigatórios'; end if;
  insert into public.produtos (loja_id, sku, titulo, preco_venda, codigo_barras, categoria, custo_unit)
  values (_loja_id, 'A' || nextval('public.produtos_sku_seq'), trim(_titulo), _preco, nullif(trim(_codigo_barras), ''), _categoria, _custo)
  returning id into _pid;
  if coalesce(_quantidade, 0) > 0 then
    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, motivo)
    values (_loja_id, _pid, 'entrada', _quantidade, _custo, 'Cadastro avulso');
  end if;
  return _pid;
end;
$$;

-- ---------------------------------------------------------------------
-- CAIXA (sessões por loja e operador)
-- ---------------------------------------------------------------------
create table public.caixas (
  id               uuid primary key default gen_random_uuid(),
  loja_id          uuid not null references public.lojas(id),
  operador_id      uuid not null references auth.users(id) default auth.uid(),
  status           public.caixa_status not null default 'aberto',
  valor_abertura   numeric(14,2) not null default 0 check (valor_abertura >= 0),
  aberto_em        timestamptz not null default now(),
  fechado_em       timestamptz,
  valor_informado  numeric(14,2),
  valor_esperado   numeric(14,2),
  diferenca        numeric(14,2),
  obs_fechamento   text
);
create unique index caixas_um_aberto on public.caixas (loja_id, operador_id) where status = 'aberto';
alter table public.caixas enable row level security;
-- operador vê os próprios; gestor vê todos da loja
create policy "caixas: ler" on public.caixas for select to authenticated
  using (public.pode_ver_loja(loja_id) and (operador_id = auth.uid() or public.is_gestor()));

create table public.caixa_movimentos (
  id         uuid primary key default gen_random_uuid(),
  caixa_id   uuid not null references public.caixas(id) on delete cascade,
  tipo       public.caixa_mov_tipo not null,
  valor      numeric(14,2) not null check (valor > 0),
  motivo     text,
  user_id    uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.caixa_movimentos enable row level security;
create policy "caixa_mov: ler" on public.caixa_movimentos for select to authenticated
  using (exists (select 1 from public.caixas c where c.id = caixa_id and public.pode_ver_loja(c.loja_id) and (c.operador_id = auth.uid() or public.is_gestor())));

create or replace function public.abrir_caixa(_loja_id uuid, _valor numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not (public.pode_vender() and public.pode_ver_loja(_loja_id)) then raise exception 'Sem permissão'; end if;
  if exists (select 1 from public.caixas where loja_id = _loja_id and operador_id = auth.uid() and status = 'aberto') then
    raise exception 'Você já tem um caixa aberto nesta loja';
  end if;
  insert into public.caixas (loja_id, valor_abertura) values (_loja_id, coalesce(_valor, 0)) returning id into _id;
  return _id;
end;
$$;

create or replace function public.movimentar_caixa(_caixa_id uuid, _tipo public.caixa_mov_tipo, _valor numeric, _motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.caixas where id = _caixa_id and status = 'aberto'
                 and (operador_id = auth.uid() or public.is_gestor()) and public.pode_ver_loja(loja_id)) then
    raise exception 'Caixa não encontrado ou fechado';
  end if;
  if _valor is null or _valor <= 0 then raise exception 'Valor inválido'; end if;
  insert into public.caixa_movimentos (caixa_id, tipo, valor, motivo) values (_caixa_id, _tipo, _valor, nullif(trim(_motivo), ''));
end;
$$;

-- Fechamento cego: o operador informa o contado; o sistema calcula a diferença
create or replace function public.fechar_caixa(_caixa_id uuid, _valor_informado numeric, _obs text)
returns numeric language plpgsql security definer set search_path = public as $$
declare _esp numeric;
begin
  if not exists (select 1 from public.caixas where id = _caixa_id and status = 'aberto'
                 and (operador_id = auth.uid() or public.is_gestor()) and public.pode_ver_loja(loja_id)) then
    raise exception 'Caixa não encontrado ou já fechado';
  end if;
  if _valor_informado is null or _valor_informado < 0 then raise exception 'Informe o valor contado'; end if;
  _esp := public.caixa_esperado(_caixa_id);
  update public.caixas
     set status = 'fechado', fechado_em = now(), valor_informado = _valor_informado,
         valor_esperado = _esp, diferenca = _valor_informado - _esp, obs_fechamento = nullif(trim(_obs), '')
   where id = _caixa_id;
  return _valor_informado - _esp;
end;
$$;

-- ---------------------------------------------------------------------
-- VENDAS
-- ---------------------------------------------------------------------
create sequence public.vendas_numero_seq start 10001;  -- legado usa os números antigos (1–5380)

create table public.vendas (
  id                   uuid primary key default gen_random_uuid(),
  numero               bigint not null unique default nextval('public.vendas_numero_seq'),
  loja_id              uuid not null references public.lojas(id),
  caixa_id             uuid references public.caixas(id),
  vendedor_id          uuid references auth.users(id) default auth.uid(),
  vendedor_nome        text,                       -- legado / snapshot
  subtotal             numeric(14,2) not null,
  desconto             numeric(14,2) not null default 0 check (desconto >= 0),
  total                numeric(14,2) not null,
  status               public.venda_status not null default 'finalizada',
  origem               text not null default 'pdv' check (origem in ('pdv', 'legado')),
  data_venda           timestamptz not null default now(),
  data_suspeita        boolean not null default false,
  motivo_data_suspeita text,
  observacao           text,
  cancelado_em         timestamptz,
  cancelado_por        uuid references auth.users(id),
  motivo_cancelamento  text,
  created_at           timestamptz not null default now()
);
create index vendas_loja_data_idx on public.vendas (loja_id, data_venda desc);
create index vendas_caixa_idx on public.vendas (caixa_id);
alter table public.vendas enable row level security;
create policy "vendas: ler" on public.vendas for select to authenticated using (public.pode_ver_loja(loja_id));

create table public.venda_itens (
  id            uuid primary key default gen_random_uuid(),
  venda_id      uuid not null references public.vendas(id) on delete cascade,
  produto_id    uuid references public.produtos(id),
  descricao     text not null,
  quantidade    numeric(12,3) not null check (quantidade > 0),
  preco_unit    numeric(14,2) not null,
  desconto      numeric(14,2) not null default 0,
  total         numeric(14,2) not null,
  custo_unit    numeric(14,2)
);
create index venda_itens_venda_idx on public.venda_itens (venda_id);
create index venda_itens_produto_idx on public.venda_itens (produto_id);
alter table public.venda_itens enable row level security;
create policy "venda_itens: ler" on public.venda_itens for select to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_id and public.pode_ver_loja(v.loja_id)));

create table public.venda_pagamentos (
  id        uuid primary key default gen_random_uuid(),
  venda_id  uuid not null references public.vendas(id) on delete cascade,
  forma     public.forma_pagamento not null,
  valor     numeric(14,2) not null check (valor > 0),
  troco     numeric(14,2) not null default 0 check (troco >= 0)
);
create index venda_pag_venda_idx on public.venda_pagamentos (venda_id);
alter table public.venda_pagamentos enable row level security;
create policy "venda_pag: ler" on public.venda_pagamentos for select to authenticated
  using (exists (select 1 from public.vendas v where v.id = venda_id and public.pode_ver_loja(v.loja_id)));

-- Dinheiro esperado na gaveta: abertura + suprimentos − sangrias + dinheiro das vendas finalizadas (já sem troco).
-- Uso interno (fechamento cego): o operador NÃO pode consultar antes de fechar.
create or replace function public.caixa_esperado(_caixa_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select c.valor_abertura
       + coalesce((select sum(valor) from public.caixa_movimentos where caixa_id = c.id and tipo = 'suprimento'), 0)
       - coalesce((select sum(valor) from public.caixa_movimentos where caixa_id = c.id and tipo = 'sangria'), 0)
       + coalesce((select sum(p.valor - p.troco) from public.venda_pagamentos p join public.vendas v on v.id = p.venda_id
                   where v.caixa_id = c.id and v.status = 'finalizada' and p.forma = 'dinheiro'), 0)
  from public.caixas c where c.id = _caixa_id;
$$;
revoke all on function public.caixa_esperado(uuid) from public, anon, authenticated;

/*
  Finaliza a venda em UMA transação.
  _itens: [{ "produto_id": uuid, "quantidade": n, "preco_unit": n, "desconto": n }]
  _pagamentos: [{ "forma": "dinheiro"|"pix"|..., "valor": n }]  (troco calculado aqui)
*/
create or replace function public.finalizar_venda(_loja_id uuid, _itens jsonb, _pagamentos jsonb, _desconto numeric default 0, _observacao text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _caixa uuid;
  _venda uuid;
  _numero bigint;
  _it jsonb;
  _p public.produtos;
  _qtd numeric;
  _preco numeric;
  _desc_item numeric;
  _subtotal numeric := 0;
  _total numeric;
  _pago numeric := 0;
  _dinheiro numeric := 0;
  _troco numeric;
  _pg jsonb;
begin
  if not (public.pode_vender() and public.pode_ver_loja(_loja_id)) then raise exception 'Sem permissão'; end if;
  select id into _caixa from public.caixas where loja_id = _loja_id and operador_id = auth.uid() and status = 'aberto';
  if _caixa is null then raise exception 'Abra o caixa antes de vender'; end if;
  if jsonb_array_length(coalesce(_itens, '[]')) = 0 then raise exception 'Venda sem itens'; end if;
  if jsonb_array_length(coalesce(_pagamentos, '[]')) = 0 then raise exception 'Informe o pagamento'; end if;

  -- subtotal (validando itens e estoque com trava)
  for _it in select * from jsonb_array_elements(_itens) loop
    _qtd := (_it->>'quantidade')::numeric;
    _preco := (_it->>'preco_unit')::numeric;
    _desc_item := coalesce((_it->>'desconto')::numeric, 0);
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

  insert into public.vendas (loja_id, caixa_id, vendedor_nome, subtotal, desconto, total, observacao)
  values (_loja_id, _caixa, (select nome from public.profiles where id = auth.uid()), _subtotal, _desconto, _total, nullif(trim(_observacao), ''))
  returning id, numero into _venda, _numero;

  for _it in select * from jsonb_array_elements(_itens) loop
    select * into _p from public.produtos where id = (_it->>'produto_id')::uuid;
    _qtd := (_it->>'quantidade')::numeric;
    _preco := (_it->>'preco_unit')::numeric;
    _desc_item := coalesce((_it->>'desconto')::numeric, 0);
    insert into public.venda_itens (venda_id, produto_id, descricao, quantidade, preco_unit, desconto, total, custo_unit)
    values (_venda, _p.id, _p.titulo, _qtd, _preco, _desc_item, round(_preco * _qtd - _desc_item, 2), _p.custo_unit);
    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, venda_id, motivo)
    values (_loja_id, _p.id, 'venda', -_qtd, _p.custo_unit, _venda, 'Venda nº ' || _numero);
  end loop;

  -- troco sai do(s) pagamento(s) em dinheiro
  for _pg in select * from jsonb_array_elements(_pagamentos) loop
    insert into public.venda_pagamentos (venda_id, forma, valor, troco)
    values (_venda, (_pg->>'forma')::public.forma_pagamento, (_pg->>'valor')::numeric,
            case when _pg->>'forma' = 'dinheiro' and _troco > 0 then least(_troco, (_pg->>'valor')::numeric) else 0 end);
    if _pg->>'forma' = 'dinheiro' then _troco := greatest(_troco - (_pg->>'valor')::numeric, 0); end if;
  end loop;

  return jsonb_build_object('id', _venda, 'numero', _numero, 'total', _total, 'troco', _pago - _total);
end;
$$;

-- Cancelamento (gestor), devolvendo o estoque; trava contra clique duplo
create or replace function public.cancelar_venda(_venda_id uuid, _motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare _v public.vendas; _i public.venda_itens;
begin
  if not public.is_gestor() then raise exception 'Só gerente ou admin cancela venda'; end if;
  if coalesce(trim(_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento'; end if;
  select * into _v from public.vendas where id = _venda_id for update;
  if not found or not public.pode_ver_loja(_v.loja_id) then raise exception 'Venda não encontrada'; end if;
  if _v.status = 'cancelada' then raise exception 'Venda já está cancelada'; end if;
  update public.vendas set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = trim(_motivo)
   where id = _venda_id;
  for _i in select * from public.venda_itens where venda_id = _venda_id and produto_id is not null loop
    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, venda_id, motivo)
    values (_v.loja_id, _i.produto_id, 'cancelamento_venda', _i.quantidade, _i.custo_unit, _venda_id, 'Cancelamento venda nº ' || _v.numero);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- RELATÓRIOS BÁSICOS (usam data_venda, fuso de São Paulo)
-- ---------------------------------------------------------------------
create or replace function public.relatorio_vendas(_loja_id uuid, _de date, _ate date)
returns jsonb language sql stable security definer set search_path = public as $$
  with v as (
    select * from public.vendas
    where status = 'finalizada'
      and (_loja_id is null or loja_id = _loja_id)
      and public.pode_ver_loja(loja_id)
      and (data_venda at time zone 'America/Sao_Paulo')::date between _de and _ate
  )
  select jsonb_build_object(
    'faturamento', coalesce((select sum(total) from v), 0),
    'vendas', (select count(*) from v),
    'ticket_medio', coalesce((select round(avg(total), 2) from v), 0),
    'custo', coalesce((select sum(i.custo_unit * i.quantidade) from public.venda_itens i join v on v.id = i.venda_id), 0),
    'por_forma', coalesce((select jsonb_agg(x) from (
        select p.forma, sum(p.valor - p.troco) as valor, count(distinct p.venda_id) as vendas
        from public.venda_pagamentos p join v on v.id = p.venda_id group by p.forma order by 2 desc) x), '[]'),
    'por_dia', coalesce((select jsonb_agg(x) from (
        select (data_venda at time zone 'America/Sao_Paulo')::date as dia, sum(total) as valor, count(*) as vendas
        from v group by 1 order by 1) x), '[]'),
    'por_vendedor', coalesce((select jsonb_agg(x) from (
        select coalesce(vendedor_nome, '—') as vendedor, sum(total) as valor, count(*) as vendas
        from v group by 1 order by 2 desc) x), '[]')
  );
$$;

-- Lucro por lote: custo do lote × vendido
create or replace function public.relatorio_lotes(_loja_id uuid)
returns table (lote_id uuid, lote text, itens_entrada numeric, itens_vendidos numeric, custo_total numeric,
               receita numeric, custo_vendido numeric, lucro numeric, estoque_restante numeric)
language sql stable security definer set search_path = public as $$
  select l.id, l.nome,
         coalesce((select sum(m.quantidade) from public.stock_movements m join public.produtos p on p.id = m.produto_id
                   where p.lote_id = l.id and m.tipo = 'entrada'), 0),
         coalesce((select sum(i.quantidade) from public.venda_itens i join public.vendas v on v.id = i.venda_id
                   join public.produtos p on p.id = i.produto_id where p.lote_id = l.id and v.status = 'finalizada'), 0),
         coalesce(l.valor_pago, (select sum(custo_unit * quantidade) from public.lote_itens where lote_id = l.id), 0),
         coalesce((select sum(i.total) from public.venda_itens i join public.vendas v on v.id = i.venda_id
                   join public.produtos p on p.id = i.produto_id where p.lote_id = l.id and v.status = 'finalizada'), 0),
         coalesce((select sum(i.custo_unit * i.quantidade) from public.venda_itens i join public.vendas v on v.id = i.venda_id
                   join public.produtos p on p.id = i.produto_id where p.lote_id = l.id and v.status = 'finalizada'), 0),
         coalesce((select sum(i.total - coalesce(i.custo_unit, 0) * i.quantidade) from public.venda_itens i join public.vendas v on v.id = i.venda_id
                   join public.produtos p on p.id = i.produto_id where p.lote_id = l.id and v.status = 'finalizada'), 0),
         coalesce((select sum(estoque_atual) from public.produtos where lote_id = l.id), 0)
  from public.lotes l
  where (_loja_id is null or l.loja_id = _loja_id) and public.pode_ver_loja(l.loja_id)
    and exists (select 1 from public.produtos p where p.lote_id = l.id)
  order by l.created_at desc;
$$;

-- Itens parados: em estoque e sem venda há N dias (conta da entrada)
create or replace function public.relatorio_parados(_loja_id uuid, _dias int)
returns table (produto_id uuid, sku text, titulo text, estoque numeric, preco_venda numeric, custo_unit numeric,
               dias_parado int, ultima_venda timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.sku, p.titulo, p.estoque_atual, p.preco_venda, p.custo_unit,
         (now()::date - coalesce(uv.ultima, p.created_at)::date)::int,
         uv.ultima
  from public.produtos p
  left join lateral (select max(v.data_venda) as ultima from public.venda_itens i join public.vendas v on v.id = i.venda_id
                     where i.produto_id = p.id and v.status = 'finalizada') uv on true
  where p.ativo and p.estoque_atual > 0
    and (_loja_id is null or p.loja_id = _loja_id) and public.pode_ver_loja(p.loja_id)
    and coalesce(uv.ultima, p.created_at) < now() - make_interval(days => _dias)
  order by 7 desc
  limit 500;
$$;

-- Permissões de execução
do $$
declare f text;
begin
  foreach f in array array[
    'movimentar_estoque(uuid, public.mov_tipo, numeric, text)', 'lancar_lote_estoque(uuid)',
    'criar_produto(uuid, text, numeric, numeric, text, text, numeric)', 'abrir_caixa(uuid, numeric)',
    'movimentar_caixa(uuid, public.caixa_mov_tipo, numeric, text)',
    'fechar_caixa(uuid, numeric, text)', 'finalizar_venda(uuid, jsonb, jsonb, numeric, text)',
    'cancelar_venda(uuid, text)', 'relatorio_vendas(uuid, date, date)', 'relatorio_lotes(uuid)', 'relatorio_parados(uuid, int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
