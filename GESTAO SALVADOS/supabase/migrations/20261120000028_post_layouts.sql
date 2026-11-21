-- =====================================================================
-- POST DE PRODUTO (imagem + legenda para WhatsApp/redes), como o "Editor de post" do PrecificaLote.
-- Cada loja guarda os seus layouts. O layout é um JSON com as camadas (fundo, logo, foto, textos);
-- a logo vai dentro do JSON (imagem pequena, já reduzida no navegador).
-- Quem pode: quem trabalha com lotes (pode_lotes) e enxerga a loja. Excluir layout: só gestor.
-- =====================================================================

create table public.post_layouts (
  id          uuid primary key default gen_random_uuid(),
  loja_id     uuid not null references public.lojas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) between 1 and 60),
  config      jsonb not null default '{}'::jsonb,
  legenda     text not null default '',
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (loja_id, nome)
);
create index post_layouts_loja_idx on public.post_layouts (loja_id);
create trigger trg_post_layouts_updated before update on public.post_layouts
  for each row execute function public.set_updated_at();

alter table public.post_layouts enable row level security;
create policy "post_layouts: ler" on public.post_layouts for select to authenticated
  using (public.pode_lotes() and public.pode_ver_loja(loja_id));
create policy "post_layouts: criar" on public.post_layouts for insert to authenticated
  with check (public.pode_lotes() and public.pode_ver_loja(loja_id));
create policy "post_layouts: editar" on public.post_layouts for update to authenticated
  using (public.pode_lotes() and public.pode_ver_loja(loja_id))
  with check (public.pode_lotes() and public.pode_ver_loja(loja_id));
create policy "post_layouts: excluir" on public.post_layouts for delete to authenticated
  using (public.is_gestor() and public.pode_ver_loja(loja_id));

grant select, insert, update, delete on public.post_layouts to authenticated;
