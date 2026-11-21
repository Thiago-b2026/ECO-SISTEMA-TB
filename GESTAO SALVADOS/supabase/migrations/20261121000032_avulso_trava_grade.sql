-- =====================================================================
-- PRODUTO AVULSO: trava de duplicado no banco + grade
--  - normalizar_nome agora iguala unidades escritas de jeitos diferentes ("1,8LT", "1,8 L", "1,8 litros" → "1 8l"),
--    igual a src/lib/duplicados.ts (caso CHALEIRA ZENTRA 1,8L × 1,8LT, cadastrados duplicados em 21/11).
--  - criar_produto recusa produto ATIVO na mesma loja com o mesmo código de barras (8+ dígitos) ou o mesmo nome.
--    Nome só parecido não é barrado aqui (a tela pede confirmação "É outro produto").
--  - criar_produto recebe a grade (A, B, C, D…; padrão A).
-- =====================================================================

create or replace function public.normalizar_nome(_t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(lower(coalesce(_t, '')),
          'áàâãäåéèêëíìîïóòôõöúùûüçñý',
          'aaaaaaeeeeiiiiooooouuuucny'),
        '(\d)\s*(litros?|ltrs?|lts?|l)(?![a-z])', '\1l', 'g'),
      '[^a-z0-9]+', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

drop function if exists public.criar_produto(uuid, text, numeric, numeric, text, text, numeric);

create function public.criar_produto(_loja_id uuid, _titulo text, _preco numeric, _quantidade numeric,
  _codigo_barras text default null, _categoria text default null, _custo numeric default null, _grade text default 'A')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _pid uuid;
  _ean text := nullif(regexp_replace(coalesce(_codigo_barras, ''), '\D', '', 'g'), '');
  _dup public.produtos;
begin
  if not (public.pode_estoque() and public.pode_ver_loja(_loja_id)) then raise exception 'Sem permissão'; end if;
  if coalesce(trim(_titulo), '') = '' or _preco is null or _preco < 0 then raise exception 'Título e preço são obrigatórios'; end if;
  if _ean is not null and length(_ean) >= 8 then
    select * into _dup from public.produtos
     where loja_id = _loja_id and ativo and regexp_replace(coalesce(codigo_barras, ''), '\D', '', 'g') = _ean limit 1;
    if found then raise exception 'Produto já cadastrado nesta loja (% · %), mesmo código de barras. Dê entrada no existente.', _dup.sku, _dup.titulo; end if;
  end if;
  select * into _dup from public.produtos
   where loja_id = _loja_id and ativo and public.normalizar_nome(titulo) = public.normalizar_nome(_titulo) limit 1;
  if found then raise exception 'Produto já cadastrado nesta loja (% · %), mesmo nome. Dê entrada no existente ou mude o nome.', _dup.sku, _dup.titulo; end if;

  insert into public.produtos (loja_id, sku, titulo, preco_venda, codigo_barras, categoria, custo_unit, grade)
  values (_loja_id, 'A' || nextval('public.produtos_sku_seq'), trim(_titulo), _preco, _ean, _categoria, _custo,
          coalesce(nullif(upper(trim(_grade)), ''), 'A'))
  returning id into _pid;
  if coalesce(_quantidade, 0) > 0 then
    insert into public.stock_movements (loja_id, produto_id, tipo, quantidade, custo_unit, motivo)
    values (_loja_id, _pid, 'entrada', _quantidade, _custo, 'Cadastro avulso');
  end if;
  return _pid;
end;
$$;

revoke all on function public.criar_produto(uuid, text, numeric, numeric, text, text, numeric, text) from public, anon;
grant execute on function public.criar_produto(uuid, text, numeric, numeric, text, text, numeric, text) to authenticated;

-- EDITAR PRODUTO (tela Cadastro de produtos): não deixa renomear/trocar código para o de outro produto ATIVO da mesma loja.
-- Só para alteração feita pela tela (usuário "authenticated"); funções do sistema passam.
create or replace function public.trava_produto_duplicado()
returns trigger language plpgsql set search_path = public as $$
declare
  _ean text;
  _dup public.produtos;
begin
  if current_user <> 'authenticated' or not new.ativo then return new; end if;
  if new.titulo is not distinct from old.titulo and new.codigo_barras is not distinct from old.codigo_barras and new.ativo = old.ativo then
    return new;
  end if;
  _ean := nullif(regexp_replace(coalesce(new.codigo_barras, ''), '\D', '', 'g'), '');
  if _ean is not null and length(_ean) >= 8 then
    select * into _dup from public.produtos
     where loja_id = new.loja_id and ativo and id <> new.id
       and regexp_replace(coalesce(codigo_barras, ''), '\D', '', 'g') = _ean limit 1;
    if found then raise exception 'Já existe outro produto com esse código de barras (% · %).', _dup.sku, _dup.titulo; end if;
  end if;
  select * into _dup from public.produtos
   where loja_id = new.loja_id and ativo and id <> new.id
     and public.normalizar_nome(titulo) = public.normalizar_nome(new.titulo) limit 1;
  if found then raise exception 'Já existe outro produto com esse nome (% · %).', _dup.sku, _dup.titulo; end if;
  return new;
end;
$$;

drop trigger if exists trg_trava_produto_duplicado on public.produtos;
create trigger trg_trava_produto_duplicado before update of titulo, codigo_barras, ativo on public.produtos
  for each row execute function public.trava_produto_duplicado();
