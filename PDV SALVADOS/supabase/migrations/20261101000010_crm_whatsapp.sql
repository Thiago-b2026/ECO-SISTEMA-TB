-- =====================================================================
-- CRM + campanhas de WhatsApp (envio manual por enquanto; depois uazapi)
-- - listas/grupos de contatos (pessoas) e grupos de WhatsApp (link)
-- - campanhas: mensagem com {nome}, lista, produtos em destaque
-- - envios: um por contato, com situação (enviado / respondeu / comprou)
-- - pedidos: o que o cliente pediu pelo WhatsApp (mede produtos e valor)
-- =====================================================================

alter table public.pessoas add column aceita_whatsapp boolean not null default true;

create table public.crm_listas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  descricao   text,
  tipo        text not null default 'lista' check (tipo in ('lista', 'grupo_whatsapp')),
  link_grupo  text,                       -- convite do grupo (chat.whatsapp.com/…)
  created_at  timestamptz not null default now()
);

create table public.crm_lista_membros (
  lista_id   uuid not null references public.crm_listas(id) on delete cascade,
  pessoa_id  uuid not null references public.pessoas(id) on delete cascade,
  primary key (lista_id, pessoa_id)
);

create table public.crm_campanhas (
  id           uuid primary key default gen_random_uuid(),
  loja_id      uuid references public.lojas(id),
  nome         text not null,
  mensagem     text not null,
  lista_id     uuid references public.crm_listas(id) on delete set null,
  produtos     uuid[] not null default '{}',
  status       text not null default 'rascunho' check (status in ('rascunho', 'enviando', 'concluida')),
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create table public.crm_envios (
  id           uuid primary key default gen_random_uuid(),
  campanha_id  uuid not null references public.crm_campanhas(id) on delete cascade,
  pessoa_id    uuid references public.pessoas(id) on delete set null,
  destino      text not null,              -- telefone (55DDDNÚMERO) ou "grupo:<lista>"
  nome         text,
  status       text not null default 'pendente' check (status in ('pendente', 'enviado', 'respondeu', 'comprou', 'erro')),
  enviado_em   timestamptz,
  enviado_por  uuid references auth.users(id) on delete set null,
  observacao   text,
  unique (campanha_id, destino)
);

create table public.crm_pedidos (
  id           uuid primary key default gen_random_uuid(),
  loja_id      uuid references public.lojas(id),
  campanha_id  uuid references public.crm_campanhas(id) on delete set null,
  pessoa_id    uuid references public.pessoas(id) on delete set null,
  produto_id   uuid references public.produtos(id) on delete set null,
  descricao    text not null,
  quantidade   numeric(12,3) not null default 1 check (quantidade > 0),
  valor        numeric(14,2),
  status       text not null default 'novo' check (status in ('novo', 'separado', 'vendido', 'cancelado')),
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index crm_pedidos_camp_idx on public.crm_pedidos (campanha_id);

-- Quem usa o CRM: admin, gerente e vendedor
create or replace function public.pode_crm()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(auth.uid(), array['admin','gerente','vendedor']::public.app_role[]);
$$;

do $$
declare t text;
begin
  foreach t in array array['crm_listas', 'crm_lista_membros', 'crm_campanhas', 'crm_envios', 'crm_pedidos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "crm: ler" on public.%I for select to authenticated using (public.pode_crm())', t);
    execute format('create policy "crm: gravar" on public.%I for insert to authenticated with check (public.pode_crm())', t);
    execute format('create policy "crm: editar" on public.%I for update to authenticated using (public.pode_crm()) with check (public.pode_crm())', t);
    execute format('create policy "crm: excluir" on public.%I for delete to authenticated using (public.is_gestor())', t);
  end loop;
end $$;

-- Gera a fila de envios da campanha a partir da lista (contatos com celular e que aceitam WhatsApp)
create or replace function public.preparar_envios(_campanha_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare _c public.crm_campanhas; _l public.crm_listas; _n int;
begin
  if not public.pode_crm() then raise exception 'Sem permissão'; end if;
  select * into _c from public.crm_campanhas where id = _campanha_id;
  if not found then raise exception 'Campanha não encontrada'; end if;
  select * into _l from public.crm_listas where id = _c.lista_id;
  if _l.id is null then raise exception 'Escolha a lista da campanha'; end if;
  if _l.tipo = 'grupo_whatsapp' then
    insert into public.crm_envios (campanha_id, destino, nome) values (_c.id, 'grupo:' || _l.id, _l.nome)
    on conflict do nothing;
  else
    insert into public.crm_envios (campanha_id, pessoa_id, destino, nome)
    select _c.id, p.id,
           case when length(regexp_replace(coalesce(p.celular, p.telefone), '\D', '', 'g')) <= 11
                then '55' || regexp_replace(coalesce(p.celular, p.telefone), '\D', '', 'g')
                else regexp_replace(coalesce(p.celular, p.telefone), '\D', '', 'g') end,
           p.nome
    from public.crm_lista_membros m join public.pessoas p on p.id = m.pessoa_id
    where m.lista_id = _l.id and p.ativo and p.aceita_whatsapp
      and length(regexp_replace(coalesce(p.celular, p.telefone, ''), '\D', '', 'g')) >= 10
    on conflict do nothing;
  end if;
  get diagnostics _n = row_count;
  update public.crm_campanhas set status = 'enviando' where id = _c.id and status = 'rascunho';
  return _n;
end;
$$;

-- Métricas por campanha
create or replace function public.crm_metricas()
returns table (campanha_id uuid, nome text, criada timestamptz, status text, envios bigint, enviados bigint, responderam bigint,
               compraram bigint, pedidos bigint, valor_pedidos numeric)
language sql stable security definer set search_path = public as $$
  select c.id, c.nome, c.created_at, c.status,
    (select count(*) from public.crm_envios e where e.campanha_id = c.id),
    (select count(*) from public.crm_envios e where e.campanha_id = c.id and e.status in ('enviado', 'respondeu', 'comprou')),
    (select count(*) from public.crm_envios e where e.campanha_id = c.id and e.status in ('respondeu', 'comprou')),
    (select count(*) from public.crm_envios e where e.campanha_id = c.id and e.status = 'comprou'),
    (select count(*) from public.crm_pedidos p where p.campanha_id = c.id and p.status <> 'cancelado'),
    (select coalesce(sum(coalesce(p.valor, 0) * p.quantidade), 0) from public.crm_pedidos p where p.campanha_id = c.id and p.status <> 'cancelado')
  from public.crm_campanhas c
  where public.pode_crm()
  order by c.created_at desc;
$$;

do $$
declare f text;
begin
  foreach f in array array['preparar_envios(uuid)', 'crm_metricas()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
