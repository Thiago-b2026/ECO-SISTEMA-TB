-- =====================================================================
-- 1) Usuário novo NÃO entra mais automaticamente em nenhuma loja
--    (cada um é ligado só à loja/empresa dele, na criação do login).
-- 2) Permissões por usuário e módulo: ver / inserir / editar / excluir.
--    Sem linha cadastrada = vale o padrão do perfil (como era antes).
--    Admin sempre pode tudo. Aplicado no BANCO com políticas restritivas
--    (somam-se às regras de perfil/loja que já existem) e em gatilhos.
-- 3) Auditoria: quem inseriu, alterou ou excluiu o quê, e quando.
-- =====================================================================

drop trigger if exists on_profile_vincula_loja on public.profiles;
drop function if exists public.vincular_loja_padrao();

-- ---------------------------------------------------------------------
-- PERMISSÕES
-- ---------------------------------------------------------------------
create table public.permissoes (
  user_id   uuid not null references auth.users(id) on delete cascade,
  modulo    text not null check (modulo in ('pessoas', 'produtos', 'lotes', 'vendas', 'caixa', 'financeiro', 'cadastros_financeiros', 'crm', 'relatorios')),
  ver       boolean not null default true,
  inserir   boolean not null default true,
  editar    boolean not null default true,
  excluir   boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, modulo)
);
alter table public.permissoes enable row level security;
create policy "perm: ver as minhas ou admin" on public.permissoes for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "perm: admin grava" on public.permissoes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- true = pode. Sem usuário (scripts do sistema) ou admin: pode. Sem linha: pode (vale o perfil).
create or replace function public.permite(_modulo text, _acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
      or public.is_admin()
      or coalesce((
        select case _acao when 'ver' then p.ver when 'inserir' then p.inserir when 'editar' then p.editar when 'excluir' then p.excluir end
        from public.permissoes p where p.user_id = auth.uid() and p.modulo = _modulo
      ), true);
$$;
grant execute on function public.permite(text, text) to authenticated;

-- Políticas RESTRITIVAS: além das regras atuais, exigem a permissão do módulo.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('pessoas', 'pessoas'),
    ('produtos', 'produtos'),
    ('lotes', 'lotes'), ('lote_itens', 'lotes'), ('pallets', 'lotes'),
    ('lancamentos', 'financeiro'),
    ('contas_bancarias', 'cadastros_financeiros'), ('formas_pagamento', 'cadastros_financeiros'),
    ('meios_pagamento', 'cadastros_financeiros'), ('plano_contas', 'cadastros_financeiros'),
    ('crm_listas', 'crm'), ('crm_lista_membros', 'crm'), ('crm_campanhas', 'crm'), ('crm_envios', 'crm'), ('crm_pedidos', 'crm')
  ) as t(tabela, modulo) loop
    execute format('create policy "perm: ver" on public.%I as restrictive for select to authenticated using (public.permite(%L, ''ver''))', r.tabela, r.modulo);
    execute format('create policy "perm: inserir" on public.%I as restrictive for insert to authenticated with check (public.permite(%L, ''inserir''))', r.tabela, r.modulo);
    execute format('create policy "perm: editar" on public.%I as restrictive for update to authenticated using (public.permite(%L, ''editar''))', r.tabela, r.modulo);
    execute format('create policy "perm: excluir" on public.%I as restrictive for delete to authenticated using (public.permite(%L, ''excluir''))', r.tabela, r.modulo);
  end loop;
end $$;

-- Operações feitas por funções (venda, cancelamento, caixa, estoque): checagem por gatilho
create or replace function public.checa_permissao()
returns trigger language plpgsql security definer set search_path = public as $$
declare _mod text := tg_argv[0]; _acao text;
begin
  _acao := case tg_op when 'INSERT' then 'inserir' when 'DELETE' then 'excluir' else 'editar' end;
  -- cancelar venda conta como "excluir" em vendas
  if tg_table_name = 'vendas' and tg_op = 'UPDATE' and new.status = 'cancelada' and old.status <> 'cancelada' then _acao := 'excluir'; end if;
  if not public.permite(_mod, _acao) then
    raise exception 'Sem permissão para % em %', _acao, _mod;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_perm_vendas before insert or update or delete on public.vendas for each row execute function public.checa_permissao('vendas');
create trigger trg_perm_caixas before insert or update or delete on public.caixas for each row execute function public.checa_permissao('caixa');
create trigger trg_perm_caixa_mov before insert or update or delete on public.caixa_movimentos for each row execute function public.checa_permissao('caixa');
create trigger trg_perm_estoque before insert on public.stock_movements for each row
  when (new.tipo in ('ajuste', 'perda', 'devolucao', 'entrada') and new.venda_id is null)
  execute function public.checa_permissao('produtos');

-- ---------------------------------------------------------------------
-- AUDITORIA
-- ---------------------------------------------------------------------
create table public.auditoria (
  id          bigserial primary key,
  quando      timestamptz not null default now(),
  user_id     uuid,
  usuario     text,
  loja_id     uuid,
  tabela      text not null,
  registro_id text,
  acao        text not null check (acao in ('inserir', 'alterar', 'excluir')),
  antes       jsonb,
  depois      jsonb,
  campos      text[]
);
create index auditoria_quando_idx on public.auditoria (quando desc);
create index auditoria_user_idx on public.auditoria (user_id, quando desc);
create index auditoria_tabela_idx on public.auditoria (tabela, quando desc);
alter table public.auditoria enable row level security;
-- só o admin lê; ninguém grava direto (só o gatilho)
create policy "auditoria: admin lê" on public.auditoria for select to authenticated using (public.is_admin());

create or replace function public.registra_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _antes jsonb; _depois jsonb; _campos text[]; _loja uuid; _id text; _k text;
  _ignorar text[] := array['updated_at', 'estoque_atual'];
begin
  if tg_op <> 'INSERT' then _antes := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then _depois := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    select array_agg(k) into _campos from jsonb_object_keys(_depois) k
     where (_antes -> k) is distinct from (_depois -> k) and not (k = any(_ignorar));
    if _campos is null then return new; end if;   -- nada relevante mudou
    -- guarda só o que mudou
    select jsonb_object_agg(k, _antes -> k), jsonb_object_agg(k, _depois -> k) into _antes, _depois from unnest(_campos) k;
  end if;
  _id := coalesce(_depois ->> 'id', _antes ->> 'id', coalesce(_depois, _antes) ->> 'user_id');
  begin
    _loja := coalesce((_depois ->> 'loja_id')::uuid, (_antes ->> 'loja_id')::uuid);
  exception when others then _loja := null;
  end;
  insert into public.auditoria (user_id, usuario, loja_id, tabela, registro_id, acao, antes, depois, campos)
  values (auth.uid(), (select nome from public.profiles where id = auth.uid()), _loja, tg_table_name, _id,
          case tg_op when 'INSERT' then 'inserir' when 'UPDATE' then 'alterar' else 'excluir' end, _antes, _depois, _campos);
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['pessoas', 'produtos', 'lotes', 'pallets', 'vendas', 'caixas', 'caixa_movimentos', 'lancamentos',
    'contas_bancarias', 'formas_pagamento', 'meios_pagamento', 'plano_contas', 'lojas', 'usuario_lojas', 'user_roles', 'profiles',
    'permissoes', 'crm_campanhas', 'crm_pedidos', 'crm_listas', 'modelos_etiqueta', 'config_precificacao', 'transferencias', 'mercadologico'] loop
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I for each row execute function public.registra_auditoria()', t);
  end loop;
end $$;
-- itens de lote mudam muito (robô): audita só exclusões
create trigger trg_auditoria after delete on public.lote_itens for each row execute function public.registra_auditoria();
