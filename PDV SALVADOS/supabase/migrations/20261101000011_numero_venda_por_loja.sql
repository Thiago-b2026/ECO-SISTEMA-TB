-- =====================================================================
-- Número da venda é por LOJA (cada CNPJ tem a sua sequência no histórico).
-- Antes era único no sistema todo e as duas lojas antigas começam do nº 1.
-- Vendas novas do PDV continuam usando a sequência (10001, 10002…).
-- =====================================================================
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.vendas'::regclass and contype = 'u'
             and pg_get_constraintdef(oid) = 'UNIQUE (numero)'
  loop
    execute format('alter table public.vendas drop constraint %I', c);
  end loop;
end $$;
alter table public.vendas add constraint vendas_loja_numero_unico unique (loja_id, numero);

-- sequência acima de qualquer número já existente
select setval('public.vendas_numero_seq', greatest((select coalesce(max(numero), 0) from public.vendas) + 1, 10001), false);
