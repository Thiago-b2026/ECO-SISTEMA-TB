-- =====================================================================
-- Campos fiscais dos produtos (preparação para NFC-e/NF-e) e
-- ligação das vendedoras do sistema antigo aos usuários novos
-- =====================================================================

alter table public.produtos
  add column cest      text check (cest is null or cest ~ '^\d{7}$'),
  add column cfop      text not null default '5102' check (cfop ~ '^\d{4}$'),
  add column origem    smallint not null default 0 check (origem between 0 and 8),
  add column unidade   text not null default 'UN';
alter table public.produtos add constraint produtos_ncm_formato check (ncm is null or ncm ~ '^\d{8}$');

-- Aplica NCM/CEST/CFOP/origem a todos os produtos de uma categoria (na loja ou em todas)
create or replace function public.aplicar_fiscal_categoria(_categoria text, _loja_id uuid, _ncm text, _cest text, _cfop text, _origem smallint)
returns int language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  if not public.is_gestor() then raise exception 'Só gerente ou admin'; end if;
  update public.produtos
     set ncm = nullif(_ncm, ''), cest = nullif(_cest, ''), cfop = coalesce(nullif(_cfop, ''), cfop), origem = coalesce(_origem, origem)
   where coalesce(categoria, '') = coalesce(_categoria, '')
     and (_loja_id is null or loja_id = _loja_id)
     and public.pode_ver_loja(loja_id);
  get diagnostics _n = row_count;
  return _n;
end;
$$;

-- Nomes de vendedores do histórico (sistema antigo) e se já estão ligados
create or replace function public.vendedores_legado()
returns table (vendedor_nome text, vendas bigint, total numeric, vendedor_id uuid)
language sql stable security definer set search_path = public as $$
  select v.vendedor_nome, count(*), sum(v.total), max(v.vendedor_id::text)::uuid
  from public.vendas v
  where v.origem = 'legado' and v.vendedor_nome is not null and public.is_admin()
  group by v.vendedor_nome
  order by 2 desc;
$$;

create or replace function public.vincular_vendedor_legado(_nome text, _user_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  if not public.is_admin() then raise exception 'Só admin'; end if;
  update public.vendas set vendedor_id = _user_id
   where origem = 'legado' and vendedor_nome = _nome;
  get diagnostics _n = row_count;
  return _n;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'aplicar_fiscal_categoria(text, uuid, text, text, text, smallint)', 'vendedores_legado()', 'vincular_vendedor_legado(text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
