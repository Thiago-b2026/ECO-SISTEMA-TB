-- =====================================================================
-- Permissões de AÇÕES ESPECIAIS por usuário (flags que o admin liga/desliga).
-- Complementa public.permissoes (ver/inserir/editar/excluir por área).
-- Sem linha = liberado (vale o perfil). Admin sempre pode tudo.
-- As ações críticas são barradas no BANCO por gatilhos.
-- =====================================================================
create table public.permissoes_acoes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  chave      text not null check (chave in (
               'vendas.cancelar', 'vendas.desconto', 'caixa.sangria', 'caixa.suprimento',
               'produtos.alterar_preco', 'produtos.ajustar_estoque', 'produtos.ver_custo', 'dados.exportar')),
  permitido  boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, chave)
);
alter table public.permissoes_acoes enable row level security;
create policy "acoes: ver as minhas ou admin" on public.permissoes_acoes for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "acoes: admin grava" on public.permissoes_acoes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.permite_acao(_chave text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
      or public.is_admin()
      or coalesce((select a.permitido from public.permissoes_acoes a where a.user_id = auth.uid() and a.chave = _chave), true);
$$;
grant execute on function public.permite_acao(text) to authenticated;

-- Cancelar venda passa a ser uma ação própria (não mais "excluir vendas")
create or replace function public.checa_permissao()
returns trigger language plpgsql security definer set search_path = public as $$
declare _mod text := tg_argv[0]; _acao text;
begin
  _acao := case tg_op when 'INSERT' then 'inserir' when 'DELETE' then 'excluir' else 'editar' end;
  if tg_table_name = 'vendas' and tg_op = 'UPDATE' and new.status = 'cancelada' and old.status <> 'cancelada' then
    return new; -- tratado por checa_acoes (vendas.cancelar)
  end if;
  if not public.permite(_mod, _acao) then
    raise exception 'Sem permissão para % em %', _acao, _mod;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.checa_acoes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'vendas' then
    if tg_op = 'INSERT' and coalesce(new.desconto, 0) > 0 and not public.permite_acao('vendas.desconto') then
      raise exception 'Sem permissão para dar desconto. Peça a um gerente.';
    end if;
    if tg_op = 'UPDATE' and new.status = 'cancelada' and old.status <> 'cancelada' and not public.permite_acao('vendas.cancelar') then
      raise exception 'Sem permissão para cancelar venda. Peça a um gerente.';
    end if;
  elsif tg_table_name = 'caixa_movimentos' then
    if new.tipo = 'sangria' and not public.permite_acao('caixa.sangria') then
      raise exception 'Sem permissão para fazer sangria.';
    end if;
    if new.tipo = 'suprimento' and not public.permite_acao('caixa.suprimento') then
      raise exception 'Sem permissão para fazer suprimento.';
    end if;
  elsif tg_table_name = 'produtos' then
    if tg_op = 'UPDATE' and new.preco_venda is distinct from old.preco_venda and not public.permite_acao('produtos.alterar_preco') then
      raise exception 'Sem permissão para alterar preço de venda.';
    end if;
  elsif tg_table_name = 'stock_movements' then
    if new.venda_id is null and new.tipo in ('ajuste', 'perda', 'devolucao') and not public.permite_acao('produtos.ajustar_estoque') then
      raise exception 'Sem permissão para ajustar estoque.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_acoes before insert or update on public.vendas for each row execute function public.checa_acoes();
create trigger trg_acoes before insert on public.caixa_movimentos for each row execute function public.checa_acoes();
create trigger trg_acoes before update on public.produtos for each row execute function public.checa_acoes();
create trigger trg_acoes before insert on public.stock_movements for each row execute function public.checa_acoes();

-- auditoria também registra mudanças nessas flags
create trigger trg_auditoria after insert or update or delete on public.permissoes_acoes for each row execute function public.registra_auditoria();

-- O PDV sempre precisa LER formas e meios de pagamento (não é dado sensível).
-- A restrição de "ver" nessas duas tabelas sai; inserir/editar/excluir continuam controlados.
drop policy if exists "perm: ver" on public.formas_pagamento;
drop policy if exists "perm: ver" on public.meios_pagamento;
