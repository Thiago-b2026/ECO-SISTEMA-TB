-- =====================================================================
-- Etapa C: Mercadológico (Departamento → Categoria → Subcategoria)
-- Montado a partir do Mercado Livre (árvore de categorias) e das planilhas
-- (colunas Categoria/Subcategoria). Produtos e itens de lote ligam ao nó folha.
-- =====================================================================

create table public.mercadologico (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  nivel            smallint not null check (nivel between 1 and 3),  -- 1 departamento, 2 categoria, 3 subcategoria
  pai_id           uuid references public.mercadologico(id) on delete restrict,
  ml_category_id   text unique,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  check ((nivel = 1 and pai_id is null) or (nivel > 1 and pai_id is not null))
);
create unique index mercadologico_nome_unico on public.mercadologico (coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome));
alter table public.mercadologico enable row level security;
create policy "merc: ler" on public.mercadologico for select to authenticated using (true);
create policy "merc: gravar" on public.mercadologico for all to authenticated using (public.pode_estoque()) with check (public.pode_estoque());

alter table public.produtos add column mercadologico_id uuid references public.mercadologico(id) on delete set null;
alter table public.lote_itens add column mercadologico_id uuid references public.mercadologico(id) on delete set null;
alter table public.lote_itens add column subcategoria text;
create index produtos_merc_idx on public.produtos (mercadologico_id);
create index lote_itens_merc_idx on public.lote_itens (mercadologico_id);

/*
  Garante o caminho no mercadológico e devolve o id do último nível.
  _caminho: nomes do mais geral para o mais específico (até 3 são usados:
            se vier mais, usa o 1º, o 2º e o último — ex.: árvore do ML).
  _ml_id:   id da categoria do ML para o último nó (opcional).
*/
create or replace function public.garantir_mercadologico(_caminho text[], _ml_id text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _nomes text[];
  _pai uuid := null;
  _id uuid;
  _i int;
  _n text;
begin
  if not public.pode_estoque() then raise exception 'Sem permissão'; end if;
  select array_agg(trim(x)) into _nomes from unnest(_caminho) x where coalesce(trim(x), '') <> '';
  if _nomes is null or array_length(_nomes, 1) = 0 then return null; end if;
  if array_length(_nomes, 1) > 3 then _nomes := array[_nomes[1], _nomes[2], _nomes[array_length(_nomes, 1)]]; end if;
  if _ml_id is not null then
    select id into _id from public.mercadologico where ml_category_id = _ml_id;
    if _id is not null then return _id; end if;
  end if;
  for _i in 1 .. array_length(_nomes, 1) loop
    _n := _nomes[_i];
    select id into _id from public.mercadologico
     where coalesce(pai_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(_pai, '00000000-0000-0000-0000-000000000000'::uuid)
       and lower(nome) = lower(_n);
    if _id is null then
      insert into public.mercadologico (nome, nivel, pai_id) values (_n, _i, _pai) returning id into _id;
    end if;
    _pai := _id;
  end loop;
  if _ml_id is not null then
    update public.mercadologico set ml_category_id = _ml_id where id = _id and ml_category_id is null;
  end if;
  return _id;
end;
$$;

/*
  Liga itens de lote e produtos a um nó do mercadológico, pela categoria original.
  _categoria: valor guardado (id do ML "MLB1234" ou nome da planilha)
  _subcategoria: opcional (planilha)
*/
create or replace function public.vincular_mercadologico(_categoria text, _subcategoria text, _merc_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare _n int; _m int;
begin
  if not public.pode_estoque() then raise exception 'Sem permissão'; end if;
  update public.lote_itens set mercadologico_id = _merc_id
   where coalesce(categoria, '') = coalesce(_categoria, '')
     and (_subcategoria is null or coalesce(subcategoria, '') = _subcategoria)
     and public.pode_ver_lote(lote_id);
  get diagnostics _n = row_count;
  update public.produtos p set mercadologico_id = _merc_id
   where coalesce(p.categoria, '') = coalesce(_categoria, '')
     and (_subcategoria is null or exists (select 1 from public.lote_itens i where i.id = p.lote_item_id and coalesce(i.subcategoria, '') = _subcategoria))
     and public.pode_ver_loja(p.loja_id);
  get diagnostics _m = row_count;
  return _n + _m;
end;
$$;

-- Categorias ainda sem mercadológico (para montar automaticamente)
create or replace function public.categorias_pendentes()
returns table (categoria text, subcategoria text, itens bigint)
language sql stable security definer set search_path = public as $$
  select i.categoria, i.subcategoria, count(*)
  from public.lote_itens i
  where i.mercadologico_id is null and coalesce(i.categoria, '') <> '' and public.pode_ver_lote(i.lote_id)
  group by 1, 2
  union all
  select p.categoria, null, count(*)
  from public.produtos p
  where p.mercadologico_id is null and p.lote_item_id is null and coalesce(p.categoria, '') <> '' and public.pode_ver_loja(p.loja_id)
  group by 1, 2
  order by 3 desc;
$$;

-- Lançar no estoque passa a levar o mercadológico do item
create or replace function public.copiar_mercadologico_produto()
returns trigger language plpgsql as $$
begin
  if new.mercadologico_id is null and new.lote_item_id is not null then
    select mercadologico_id into new.mercadologico_id from public.lote_itens where id = new.lote_item_id;
  end if;
  return new;
end;
$$;
create trigger trg_produtos_mercadologico before insert on public.produtos
  for each row execute function public.copiar_mercadologico_produto();

do $$
declare f text;
begin
  foreach f in array array['garantir_mercadologico(text[], text)', 'vincular_mercadologico(text, text, uuid)', 'categorias_pendentes()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
