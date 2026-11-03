-- =====================================================================
-- Multiloja (filiais da mesma empresa)
-- - lojas: cadastro das filiais
-- - usuario_lojas: em quais lojas cada usuário trabalha (pode ser mais de uma)
-- - admin vê TODAS as lojas; os demais só as lojas ligadas a eles
-- - lotes passam a ter loja_id; pallets e itens herdam o acesso pelo lote
-- - Conexão do Mercado Livre e arredondamento continuam únicos (da empresa)
-- Regra para tabelas futuras (estoque, vendas, caixa): ter loja_id e usar
-- public.pode_ver_loja(loja_id) nas policies.
-- =====================================================================

create table public.lojas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  codigo      text unique check (codigo is null or codigo ~ '^[A-Za-z0-9_-]{1,10}$'),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_lojas_updated before update on public.lojas
  for each row execute function public.set_updated_at();
alter table public.lojas enable row level security;

create table public.usuario_lojas (
  user_id     uuid not null references auth.users(id) on delete cascade,
  loja_id     uuid not null references public.lojas(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, loja_id)
);
create index usuario_lojas_loja_idx on public.usuario_lojas (loja_id);
alter table public.usuario_lojas enable row level security;

-- ---------------------------------------------------------------------
-- Loja inicial: tudo o que já existe vai para a "Matriz"
-- (antes das funções, que já usam lotes.loja_id)
-- ---------------------------------------------------------------------
insert into public.lojas (nome, codigo) values ('Matriz', 'MATRIZ');
insert into public.usuario_lojas (user_id, loja_id)
select p.id, (select id from public.lojas where codigo = 'MATRIZ') from public.profiles p
on conflict do nothing;

alter table public.lotes add column loja_id uuid references public.lojas(id);
update public.lotes set loja_id = (select id from public.lojas where codigo = 'MATRIZ') where loja_id is null;
alter table public.lotes alter column loja_id set not null;
create index lotes_loja_idx on public.lotes (loja_id);

-- ---------------------------------------------------------------------
-- Funções de acesso (SECURITY DEFINER evita recursão no RLS)
-- ---------------------------------------------------------------------
create or replace function public.pode_ver_loja(_loja_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.usuario_lojas ul where ul.user_id = auth.uid() and ul.loja_id = _loja_id);
$$;

create or replace function public.pode_ver_lote(_lote_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lotes l where l.id = _lote_id and public.pode_ver_loja(l.loja_id));
$$;

-- Lojas que o usuário logado pode usar (para o seletor do menu)
create or replace function public.minhas_lojas()
returns setof public.lojas language sql stable security definer set search_path = public as $$
  select l.* from public.lojas l
  where l.ativo and public.pode_ver_loja(l.id)
  order by l.nome;
$$;
revoke all on function public.minhas_lojas() from public, anon;
grant execute on function public.minhas_lojas() to authenticated;

-- Policies de lojas / vínculos
create policy "lojas: ler as minhas" on public.lojas for select to authenticated using (public.pode_ver_loja(id));
create policy "lojas: admin cria" on public.lojas for insert to authenticated with check (public.is_admin());
create policy "lojas: admin edita" on public.lojas for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "lojas: admin exclui" on public.lojas for delete to authenticated using (public.is_admin());

create policy "vinculos: ler próprios ou admin" on public.usuario_lojas for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "vinculos: admin cria" on public.usuario_lojas for insert to authenticated with check (public.is_admin());
create policy "vinculos: admin exclui" on public.usuario_lojas for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- LOTES por loja (policies)
-- ---------------------------------------------------------------------
drop policy "lotes: ler" on public.lotes;
drop policy "lotes: criar" on public.lotes;
drop policy "lotes: editar" on public.lotes;
drop policy "lotes: excluir" on public.lotes;
create policy "lotes: ler" on public.lotes for select to authenticated
  using (public.pode_lotes() and public.pode_ver_loja(loja_id));
create policy "lotes: criar" on public.lotes for insert to authenticated
  with check (public.pode_lotes() and public.pode_ver_loja(loja_id));
create policy "lotes: editar" on public.lotes for update to authenticated
  using (public.pode_lotes() and public.pode_ver_loja(loja_id))
  with check (public.pode_lotes() and public.pode_ver_loja(loja_id));
create policy "lotes: excluir" on public.lotes for delete to authenticated
  using (public.is_gestor() and public.pode_ver_loja(loja_id));

drop policy "pallets: ler" on public.pallets;
drop policy "pallets: criar" on public.pallets;
drop policy "pallets: editar" on public.pallets;
drop policy "pallets: excluir" on public.pallets;
create policy "pallets: ler" on public.pallets for select to authenticated using (public.pode_lotes() and public.pode_ver_lote(lote_id));
create policy "pallets: criar" on public.pallets for insert to authenticated with check (public.pode_lotes() and public.pode_ver_lote(lote_id));
create policy "pallets: editar" on public.pallets for update to authenticated using (public.pode_lotes() and public.pode_ver_lote(lote_id)) with check (public.pode_lotes() and public.pode_ver_lote(lote_id));
create policy "pallets: excluir" on public.pallets for delete to authenticated using (public.pode_lotes() and public.pode_ver_lote(lote_id));

drop policy "itens: ler" on public.lote_itens;
drop policy "itens: criar" on public.lote_itens;
drop policy "itens: editar" on public.lote_itens;
drop policy "itens: excluir" on public.lote_itens;
create policy "itens: ler" on public.lote_itens for select to authenticated using (public.pode_lotes() and public.pode_ver_lote(lote_id));
create policy "itens: criar" on public.lote_itens for insert to authenticated with check (public.pode_lotes() and public.pode_ver_lote(lote_id));
create policy "itens: editar" on public.lote_itens for update to authenticated using (public.pode_lotes() and public.pode_ver_lote(lote_id)) with check (public.pode_lotes() and public.pode_ver_lote(lote_id));
create policy "itens: excluir" on public.lote_itens for delete to authenticated using (public.pode_lotes() and public.pode_ver_lote(lote_id));

-- Resumo passa a trazer a loja (recriado porque usa l.*)
drop view public.lotes_resumo;
create view public.lotes_resumo with (security_invoker = true) as
select
  l.*,
  lj.nome as loja_nome,
  coalesce(sum(i.quantidade) filter (where i.ocorrencia is null or i.ocorrencia = 'avaria_parcial'), 0)::int as total_itens,
  count(i.id)::int as produtos_unicos,
  count(distinct i.categoria)::int as categorias,
  (select count(*) from public.pallets p where p.lote_id = l.id)::int as qtd_pallets,
  coalesce(sum(i.preco_venda * i.quantidade) filter (where i.ocorrencia is null or i.ocorrencia = 'avaria_parcial'), 0)::numeric(14,2) as valor_venda,
  coalesce(sum(i.custo_unit * i.quantidade), 0)::numeric(14,2) as valor_custo,
  count(i.id) filter (where i.status = 'pendente')::int as qtd_pendente,
  count(i.id) filter (where i.status = 'sucesso')::int as qtd_sucesso,
  count(i.id) filter (where i.status = 'similar')::int as qtd_similar,
  count(i.id) filter (where i.status = 'nao_encontrado')::int as qtd_nao_encontrado,
  count(i.id) filter (where i.status = 'aprovado')::int as qtd_aprovado
from public.lotes l
join public.lojas lj on lj.id = l.loja_id
left join public.lote_itens i on i.lote_id = l.id
group by l.id, lj.nome;

-- Recalcular custo: também confere a loja
create or replace function public.recalcular_custo_lote(_lote_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _valor numeric;
  _base  numeric;
  _n     int;
begin
  if not (public.pode_lotes() and public.pode_ver_lote(_lote_id)) then
    raise exception 'Sem permissão';
  end if;
  select valor_pago into _valor from public.lotes where id = _lote_id for update;
  if _valor is null then
    raise exception 'Informe o valor pago no lote antes de recalcular';
  end if;
  select sum(coalesce(preco_ml, preco_venda, 0) * quantidade) into _base
  from public.lote_itens where lote_id = _lote_id;
  if coalesce(_base, 0) = 0 then
    raise exception 'Nenhum item com preço para ratear';
  end if;
  update public.lote_itens
     set custo_unit = round(_valor * coalesce(preco_ml, preco_venda, 0) / _base, 2)
   where lote_id = _lote_id;
  get diagnostics _n = row_count;
  update public.lotes set rateio = 'valor_pago' where id = _lote_id;
  return _n;
end;
$$;

-- Novo usuário entra na Matriz por padrão (o admin muda depois na tela Lojas)
create or replace function public.vincular_loja_padrao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuario_lojas (user_id, loja_id)
  select new.id, id from public.lojas where codigo = 'MATRIZ'
  on conflict do nothing;
  return new;
end;
$$;
create trigger on_profile_vincula_loja
  after insert on public.profiles
  for each row execute function public.vincular_loja_padrao();
