-- Etiquetas impressas por item de lote (ícone cinza/amarelo/verde e "x/y impressos" na tela do lote).
alter table public.lote_itens add column if not exists etiquetas_impressas integer not null default 0 check (etiquetas_impressas >= 0);

-- Soma as cópias impressas. SECURITY INVOKER: vale a RLS de lote_itens (só quem pode editar o lote).
create or replace function public.registrar_etiquetas_lote(_itens jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  update public.lote_itens li
     set etiquetas_impressas = li.etiquetas_impressas + x.copias
    from (select (i ->> 'item_id')::uuid as id, sum(greatest(1, coalesce((i ->> 'copias')::int, 1)))::int as copias
            from jsonb_array_elements(coalesce(_itens, '[]'::jsonb)) i group by 1) x
   where li.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.registrar_etiquetas_lote(jsonb) from public, anon;
grant execute on function public.registrar_etiquetas_lote(jsonb) to authenticated;
