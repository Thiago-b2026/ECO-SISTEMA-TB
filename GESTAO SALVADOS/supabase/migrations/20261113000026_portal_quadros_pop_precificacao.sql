-- =====================================================================
-- QUADRO GERAL (Portal ECO SISTEMA TB): POP e PRECIFICAÇÃO viram quadros DENTRO do Portal
-- Pedido do usuário em 12–13/11/2026. Espelho no front: src/lib/telas.ts (o npm test confere).
--  - Cada pessoa vê só os quadros que tem liberados (public.meus_sistemas(), igual aos outros sistemas).
--  - Telas sem flag = bloqueadas: ninguém ganha acesso automático; o admin libera em
--    PDV → Cadastros → Login de acesso → Permissões. (Combinado: Precificação, no início, só o Thiago = admin.)
--  - Os arquivos ficam no bucket PRIVADO "portal-arquivos", numa pasta por sistema:
--      pop/...           → só quem tem tela liberada do sistema "pop"
--      precificacao/...  → só quem tem tela liberada do sistema "precificacao"
--    Só o admin envia, troca ou apaga arquivos. Link solto não abre sem login.
-- NÃO APLICAR sem OK do usuário. Aplicar com:
--   npx supabase db query --remote=blqgmueqsqqpflorusrm --yes -f "supabase/migrations/20261113000026_portal_quadros_pop_precificacao.sql"
-- =====================================================================

-- 1) Sistemas: POP passa a ativo; Precificação é sistema novo. Os dois abrem DENTRO do Portal.
update public.sistemas
   set ativo = true, ordem = 50, nome = 'Treinamentos com POP',
       url = 'https://portal-grupotb.vercel.app/pop'
 where codigo = 'pop';

insert into public.sistemas (codigo, nome, url, ordem, ativo) values
  ('precificacao', 'Precificação', 'https://portal-grupotb.vercel.app/precificacao', 60, true)
on conflict (codigo) do update set nome = excluded.nome, url = excluded.url, ordem = excluded.ordem, ativo = true;

-- 2) Grupos e telas (uma tela por quadro)
insert into public.grupos (sistema, codigo, nome, ordem) values
  ('pop',          'treinamentos', 'Treinamentos', 10),
  ('precificacao', 'resultados',   'Resultados',   10)
on conflict (sistema, codigo) do update set nome = excluded.nome, ordem = excluded.ordem;

insert into public.telas (codigo, nome, app, grupo, rota, ordem, somente_admin) values
  ('pop.treinamentos',        'POPs, fluxos e workbooks',              'pop',          'treinamentos', '/pop',          10, false),
  ('precificacao.resultados', 'Plano, relatório e listas de preço',    'precificacao', 'resultados',   '/precificacao', 10, false)
on conflict (codigo) do update set nome = excluded.nome, grupo = excluded.grupo, rota = excluded.rota,
  ordem = excluded.ordem, somente_admin = excluded.somente_admin, ativo = true;

insert into public.tela_acoes (tela_codigo, acao)
select t, unnest(a) from (values
  ('pop.treinamentos',        array['ver']),
  ('precificacao.resultados', array['ver'])
) as x(t, a)
on conflict do nothing;

-- 3) Bucket privado dos arquivos do Portal (até 50 MB por arquivo: limite do plano grátis)
insert into storage.buckets (id, name, public, file_size_limit)
values ('portal-arquivos', 'portal-arquivos', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Quem pode LER uma pasta: logado + (admin ou tem pelo menos uma tela liberada daquele sistema).
-- (Não usa pode_ver_tela porque ela libera quando não há usuário logado.)
create or replace function public.portal_pode_ler_pasta(_pasta text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null
     and _pasta in ('pop', 'precificacao')
     and (public.is_admin() or exists (select 1 from public.minhas_telas(_pasta)));
$$;
revoke all on function public.portal_pode_ler_pasta(text) from public, anon;
grant execute on function public.portal_pode_ler_pasta(text) to authenticated;

drop policy if exists "portal arquivos: le quem tem acesso" on storage.objects;
create policy "portal arquivos: le quem tem acesso" on storage.objects for select to authenticated
  using (bucket_id = 'portal-arquivos' and public.portal_pode_ler_pasta(split_part(name, '/', 1)));

drop policy if exists "portal arquivos: admin envia" on storage.objects;
create policy "portal arquivos: admin envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-arquivos' and public.is_admin());

drop policy if exists "portal arquivos: admin troca" on storage.objects;
create policy "portal arquivos: admin troca" on storage.objects for update to authenticated
  using (bucket_id = 'portal-arquivos' and public.is_admin())
  with check (bucket_id = 'portal-arquivos' and public.is_admin());

drop policy if exists "portal arquivos: admin apaga" on storage.objects;
create policy "portal arquivos: admin apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'portal-arquivos' and public.is_admin());
