-- =====================================================================
-- Etapa B: Funcionário em Pessoas, formas e meios de pagamento,
-- contas bancárias e plano de contas
-- =====================================================================

-- ---------------------------------------------------------------------
-- PESSOAS: marcação Funcionário (separada do login de acesso)
-- ---------------------------------------------------------------------
alter table public.pessoas add column eh_funcionario boolean not null default false;
alter table public.pessoas add column cargo text;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.pessoas'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%eh_cliente OR%'
  loop
    execute format('alter table public.pessoas drop constraint %I', c);
  end loop;
end $$;
alter table public.pessoas add constraint pessoas_tem_papel
  check (eh_cliente or eh_fornecedor or eh_usuario or eh_funcionario);

-- funcionários marcados para quem já tem login
update public.pessoas set eh_funcionario = true where eh_usuario;

drop policy "pessoas: criar" on public.pessoas;
drop policy "pessoas: editar" on public.pessoas;
create policy "pessoas: criar" on public.pessoas for insert to authenticated
  with check (user_id is null and (public.is_gestor()
    or (public.pode_vender() and eh_cliente and not eh_fornecedor and not eh_usuario and not eh_funcionario)));
create policy "pessoas: editar" on public.pessoas for update to authenticated
  using (public.is_gestor() or (public.pode_vender() and eh_cliente and not eh_fornecedor and not eh_usuario and not eh_funcionario))
  with check (public.is_gestor() or (public.pode_vender() and eh_cliente and not eh_fornecedor and not eh_usuario and not eh_funcionario));

-- ---------------------------------------------------------------------
-- CONTAS BANCÁRIAS (por loja)
-- ---------------------------------------------------------------------
create table public.contas_bancarias (
  id             uuid primary key default gen_random_uuid(),
  loja_id        uuid not null references public.lojas(id),
  nome           text not null,                -- apelido: "Itaú Matriz", "Caixa da loja"
  tipo           text not null default 'corrente' check (tipo in ('corrente', 'poupanca', 'pagamento', 'caixa')),
  banco_codigo   text,
  banco_nome     text,
  agencia        text,
  conta          text,
  pix_chave      text,
  saldo_inicial  numeric(14,2) not null default 0,
  data_saldo     date not null default current_date,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (loja_id, nome)
);
alter table public.contas_bancarias enable row level security;
create policy "contas: ler" on public.contas_bancarias for select to authenticated using (public.is_gestor() and public.pode_ver_loja(loja_id));
create policy "contas: criar" on public.contas_bancarias for insert to authenticated with check (public.is_gestor() and public.pode_ver_loja(loja_id));
create policy "contas: editar" on public.contas_bancarias for update to authenticated using (public.is_gestor() and public.pode_ver_loja(loja_id)) with check (public.is_gestor() and public.pode_ver_loja(loja_id));

-- ---------------------------------------------------------------------
-- PLANO DE CONTAS (em níveis: 3 · 3.1 · 3.1.01)
-- ---------------------------------------------------------------------
create table public.plano_contas (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique check (codigo ~ '^\d+(\.\d+)*$'),
  nome         text not null,
  tipo         text not null check (tipo in ('receita', 'despesa')),
  pai_id       uuid references public.plano_contas(id) on delete restrict,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.plano_contas enable row level security;
create policy "plano: ler" on public.plano_contas for select to authenticated using (public.is_gestor());
create policy "plano: criar" on public.plano_contas for insert to authenticated with check (public.is_gestor());
create policy "plano: editar" on public.plano_contas for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy "plano: excluir" on public.plano_contas for delete to authenticated using (public.is_admin());

-- Plano padrão para varejo (pode editar depois)
insert into public.plano_contas (codigo, nome, tipo) values
  ('1', 'Receitas', 'receita'),
  ('2', 'Custos', 'despesa'),
  ('3', 'Despesas operacionais', 'despesa'),
  ('4', 'Despesas financeiras', 'despesa');
insert into public.plano_contas (codigo, nome, tipo, pai_id)
select v.codigo, v.nome, v.tipo, (select id from public.plano_contas p where p.codigo = v.pai)
from (values
  ('1.1', 'Vendas de mercadorias', 'receita', '1'),
  ('1.2', 'Outras receitas', 'receita', '1'),
  ('2.1', 'Compra de lotes / mercadorias', 'despesa', '2'),
  ('2.2', 'Frete de compras', 'despesa', '2'),
  ('3.1', 'Pessoal', 'despesa', '3'),
  ('3.2', 'Ocupação', 'despesa', '3'),
  ('3.3', 'Administrativas', 'despesa', '3'),
  ('4.1', 'Tarifas e taxas', 'despesa', '4')
) as v(codigo, nome, tipo, pai);
insert into public.plano_contas (codigo, nome, tipo, pai_id)
select v.codigo, v.nome, v.tipo, (select id from public.plano_contas p where p.codigo = v.pai)
from (values
  ('1.1.01', 'Vendas no PDV', 'receita', '1.1'),
  ('1.1.02', 'Vendas online / marketplace', 'receita', '1.1'),
  ('1.2.01', 'Receitas diversas', 'receita', '1.2'),
  ('2.1.01', 'Lotes de salvados', 'despesa', '2.1'),
  ('2.1.02', 'Mercadorias avulsas', 'despesa', '2.1'),
  ('2.2.01', 'Frete de lotes', 'despesa', '2.2'),
  ('3.1.01', 'Salários', 'despesa', '3.1'),
  ('3.1.02', 'Encargos e benefícios', 'despesa', '3.1'),
  ('3.1.03', 'Comissões', 'despesa', '3.1'),
  ('3.2.01', 'Aluguel', 'despesa', '3.2'),
  ('3.2.02', 'Energia e água', 'despesa', '3.2'),
  ('3.2.03', 'Internet e telefone', 'despesa', '3.2'),
  ('3.3.01', 'Contabilidade', 'despesa', '3.3'),
  ('3.3.02', 'Sistemas e assinaturas', 'despesa', '3.3'),
  ('3.3.03', 'Material de uso e consumo', 'despesa', '3.3'),
  ('4.1.01', 'Taxas de cartão / maquininha', 'despesa', '4.1'),
  ('4.1.02', 'Tarifas bancárias', 'despesa', '4.1')
) as v(codigo, nome, tipo, pai);

-- ---------------------------------------------------------------------
-- FORMAS E MEIOS DE PAGAMENTO
-- forma = o que o cliente usa (Dinheiro, Pix, Débito, Crédito…), ligada ao tipo base
-- meio  = por onde entra (maquininha/bandeira/banco), com taxa % e prazo de recebimento
-- ---------------------------------------------------------------------
create table public.formas_pagamento (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  tipo      public.forma_pagamento not null,
  ordem     int not null default 0,
  ativo     boolean not null default true
);
alter table public.formas_pagamento enable row level security;
create policy "formas: ler" on public.formas_pagamento for select to authenticated using (true);
create policy "formas: gestor grava" on public.formas_pagamento for all to authenticated using (public.is_gestor()) with check (public.is_gestor());
insert into public.formas_pagamento (nome, tipo, ordem) values
  ('Dinheiro', 'dinheiro', 1), ('Pix', 'pix', 2), ('Débito', 'debito', 3), ('Crédito', 'credito', 4), ('Outro', 'outro', 9);

create table public.meios_pagamento (
  id                 uuid primary key default gen_random_uuid(),
  forma_id           uuid not null references public.formas_pagamento(id) on delete cascade,
  nome               text not null,                -- "Stone Visa", "Cielo Master", "Pix Itaú"
  taxa_percentual    numeric(6,3) not null default 0 check (taxa_percentual >= 0 and taxa_percentual < 100),
  taxa_fixa          numeric(10,2) not null default 0 check (taxa_fixa >= 0),
  dias_recebimento   int not null default 0 check (dias_recebimento >= 0),
  conta_bancaria_id  uuid references public.contas_bancarias(id) on delete set null,
  loja_id            uuid references public.lojas(id),  -- null = todas as lojas
  ativo              boolean not null default true,
  unique (forma_id, nome)
);
alter table public.meios_pagamento enable row level security;
create policy "meios: ler" on public.meios_pagamento for select to authenticated using (loja_id is null or public.pode_ver_loja(loja_id));
create policy "meios: gestor grava" on public.meios_pagamento for all to authenticated using (public.is_gestor()) with check (public.is_gestor());

alter table public.venda_pagamentos add column meio_id uuid references public.meios_pagamento(id) on delete set null;

-- finalizar_venda: agora grava também o meio (opcional) de cada pagamento
create or replace function public.finalizar_venda(_loja_id uuid, _itens jsonb, _pagamentos jsonb, _desconto numeric default 0, _observacao text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  _caixa uuid; _venda uuid; _numero bigint; _it jsonb; _p public.produtos;
  _qtd numeric; _preco numeric; _desc_item numeric; _subtotal numeric := 0; _total numeric;
  _pago numeric := 0; _dinheiro numeric := 0; _troco numeric; _pg jsonb;
begin
  if not (public.pode_vender() and public.pode_ver_loja(_loja_id)) then raise exception 'Sem permissão'; end if;
  select id into _caixa from public.caixas where loja_id = _loja_id and operador_id = auth.uid() and status = 'aberto';
  if _caixa is null then raise exception 'Abra o caixa antes de vender'; end if;
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

  insert into public.vendas (loja_id, caixa_id, vendedor_nome, subtotal, desconto, total, observacao, cliente_id)
  values (_loja_id, _caixa, (select nome from public.profiles where id = auth.uid()), _subtotal, _desconto, _total,
          nullif(trim(_observacao), ''), null)
  returning id, numero into _venda, _numero;

  for _it in select * from jsonb_array_elements(_itens) loop
    select * into _p from public.produtos where id = (_it->>'produto_id')::uuid;
    _qtd := (_it->>'quantidade')::numeric; _preco := (_it->>'preco_unit')::numeric; _desc_item := coalesce((_it->>'desconto')::numeric, 0);
    insert into public.venda_itens (venda_id, produto_id, descricao, quantidade, preco_unit, desconto, total, custo_unit)
    values (_venda, _p.id, _p.titulo, _qtd, _preco, _desc_item, round(_preco * _qtd - _desc_item, 2), _p.custo_unit);
    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, venda_id, motivo)
    values (_loja_id, _p.id, 'venda', -_qtd, _p.custo_unit, _venda, 'Venda nº ' || _numero);
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
