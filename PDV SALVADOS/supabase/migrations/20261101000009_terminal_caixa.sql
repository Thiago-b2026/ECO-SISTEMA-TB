-- =====================================================================
-- Frente de loja: nome do terminal (computador/caixa) gravado no caixa,
-- para sair nos comprovantes de abertura, sangria e fechamento.
-- =====================================================================

alter table public.caixas add column terminal text;

drop function if exists public.abrir_caixa(uuid, numeric);
create or replace function public.abrir_caixa(_loja_id uuid, _valor numeric, _terminal text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not (public.pode_vender() and public.pode_ver_loja(_loja_id)) then raise exception 'Sem permissão'; end if;
  if exists (select 1 from public.caixas where loja_id = _loja_id and operador_id = auth.uid() and status = 'aberto') then
    raise exception 'Você já tem um caixa aberto nesta loja';
  end if;
  insert into public.caixas (loja_id, valor_abertura, terminal)
  values (_loja_id, coalesce(_valor, 0), nullif(trim(_terminal), ''))
  returning id into _id;
  return _id;
end;
$$;
revoke all on function public.abrir_caixa(uuid, numeric, text) from public, anon;
grant execute on function public.abrir_caixa(uuid, numeric, text) to authenticated;

-- Resumo do caixa para o comprovante de fechamento (só depois de fechado, para manter o fechamento cego)
create or replace function public.resumo_caixa(_caixa_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _c public.caixas;
begin
  select * into _c from public.caixas where id = _caixa_id;
  if not found or not public.pode_ver_loja(_c.loja_id) or not (_c.operador_id = auth.uid() or public.is_gestor()) then
    raise exception 'Caixa não encontrado';
  end if;
  if _c.status <> 'fechado' then raise exception 'O resumo só sai depois de fechar o caixa'; end if;
  return jsonb_build_object(
    'vendas', (select count(*) from public.vendas where caixa_id = _c.id and status = 'finalizada'),
    'canceladas', (select count(*) from public.vendas where caixa_id = _c.id and status = 'cancelada'),
    'total_vendas', coalesce((select sum(total) from public.vendas where caixa_id = _c.id and status = 'finalizada'), 0),
    'por_forma', coalesce((select jsonb_agg(x) from (
        select p.forma, sum(p.valor - p.troco) as valor from public.venda_pagamentos p join public.vendas v on v.id = p.venda_id
        where v.caixa_id = _c.id and v.status = 'finalizada' group by p.forma order by 2 desc) x), '[]'),
    'sangrias', coalesce((select sum(valor) from public.caixa_movimentos where caixa_id = _c.id and tipo = 'sangria'), 0),
    'suprimentos', coalesce((select sum(valor) from public.caixa_movimentos where caixa_id = _c.id and tipo = 'suprimento'), 0)
  );
end;
$$;
revoke all on function public.resumo_caixa(uuid) from public, anon;
grant execute on function public.resumo_caixa(uuid) to authenticated;
