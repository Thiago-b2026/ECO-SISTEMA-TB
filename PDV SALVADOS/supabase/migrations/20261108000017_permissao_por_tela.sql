-- =====================================================================
-- ACESSO POR TELA (ECO + Gestão RH), acima das permissões por área e das ações especiais.
--  - public.telas: catálogo de telas (espelho de src/lib/telas.ts)
--  - public.usuario_telas: flags por usuário. SEM LINHA = BLOQUEADO. Admin vê tudo.
--  - pode_ver_tela(codigo) / minhas_telas(app): usados nas políticas e pelos dois sites.
--  - Gera as flags de quem JÁ existe a partir do acesso de hoje (perfil + área com "ver",
--    e membros das empresas do RH), para ninguém perder acesso na publicação.
-- Não altera permissoes / permissoes_acoes: elas continuam valendo para inserir/editar/excluir
-- e para as ações de risco.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CATÁLOGO DE TELAS
-- ---------------------------------------------------------------------
create table public.telas (
  codigo        text primary key,
  nome          text not null,
  modulo        text not null check (modulo in ('vendas', 'caixa', 'estoque', 'cadastros', 'financeiro', 'relatorios', 'crm', 'rh')),
  rota          text not null,
  app           text not null check (app in ('eco', 'rh')),
  ordem         int  not null default 0,
  ativo         boolean not null default true,
  somente_admin boolean not null default false
);
alter table public.telas enable row level security;
create policy "telas: logados leem" on public.telas for select to authenticated using (true);
create policy "telas: admin grava" on public.telas for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.telas (codigo, nome, modulo, rota, app, ordem, somente_admin) values
  ('vendas.pdv',                 'PDV · Frente de loja',                     'vendas',     '/pdv',              'eco', 10,  false),
  ('vendas.notas',               'Vendas e notas',                           'vendas',     '/vendas',           'eco', 20,  false),
  ('caixa.movimentacoes',        'Movimentações de caixa',                   'caixa',      '/caixa',            'eco', 30,  false),
  ('estoque.produtos',           'Produtos e estoque',                       'estoque',    '/produtos',         'eco', 40,  false),
  ('estoque.lotes',              'Lotes',                                    'estoque',    '/lotes',            'eco', 50,  false),
  ('estoque.etiquetas',          'Etiquetas',                                'estoque',    '/etiquetas',        'eco', 60,  false),
  ('estoque.mercadologico',      'Mercadológico',                            'estoque',    '/mercadologico',    'eco', 70,  false),
  ('estoque.transferencias',     'Transferências',                           'estoque',    '/transferencias',   'eco', 80,  false),
  ('estoque.mercado_livre',      'Mercado Livre (busca de anúncios)',        'estoque',    '/mercado-livre',    'eco', 90,  false),
  ('cadastros.pessoas',          'Pessoas',                                  'cadastros',  '/pessoas',          'eco', 100, false),
  ('cadastros.login_acesso',     'Login de acesso',                          'cadastros',  '/usuarios',         'eco', 110, true),
  ('cadastros.pagamentos',       'Formas e meios de pagamento',              'cadastros',  '/pagamentos',       'eco', 120, false),
  ('cadastros.contas_bancarias', 'Contas bancárias',                         'cadastros',  '/contas-bancarias', 'eco', 130, false),
  ('cadastros.plano_contas',     'Plano de contas',                          'cadastros',  '/plano-contas',     'eco', 140, false),
  ('cadastros.lojas',            'Lojas e configurações',                    'cadastros',  '/lojas',            'eco', 150, true),
  ('financeiro.financeiro',      'Financeiro (pagar, receber, fluxo, DRE)',  'financeiro', '/financeiro',       'eco', 160, false),
  ('relatorios.dashboard',       'Dashboard',                                'relatorios', '/dashboard',        'eco', 170, false),
  ('relatorios.relatorios',      'Relatórios',                               'relatorios', '/relatorios',       'eco', 180, false),
  ('crm.whatsapp',               'CRM e WhatsApp',                           'crm',        '/crm',              'eco', 190, false),
  ('rh.painel',                  'Painel',                                   'rh',         '/',                 'rh',  200, false),
  ('rh.historico',               'Histórico',                                'rh',         '/historico',        'rh',  210, false),
  ('rh.global',                  'Visão Global',                             'rh',         '/global',           'rh',  220, false),
  ('rh.empresas',                'Empresas',                                 'rh',         '/empresas',         'rh',  230, false),
  ('rh.usuarios',                'Usuários do Gestão RH',                    'rh',         '/usuarios',         'rh',  240, false);

-- ---------------------------------------------------------------------
-- FLAGS POR USUÁRIO
-- ---------------------------------------------------------------------
create table public.usuario_telas (
  user_id        uuid not null references auth.users(id) on delete cascade,
  tela_codigo    text not null references public.telas(codigo) on update cascade on delete cascade,
  permitido      boolean not null default false,
  atualizado_por uuid references auth.users(id) on delete set null default auth.uid(),
  atualizado_em  timestamptz not null default now(),
  primary key (user_id, tela_codigo)
);
create index usuario_telas_tela_idx on public.usuario_telas (tela_codigo);
alter table public.usuario_telas enable row level security;
-- cada um lê só as próprias linhas; o admin lê e grava todas
create policy "utelas: ver as minhas ou admin" on public.usuario_telas for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "utelas: admin grava" on public.usuario_telas for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Carimbo de quem alterou + travas
create or replace function public.usuario_telas_protege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.user_id = auth.uid() and old.tela_codigo = 'cadastros.login_acesso' then
      raise exception 'Você não pode tirar o seu próprio acesso à tela Login de acesso.';
    end if;
    return old;
  end if;
  if new.user_id = auth.uid() and new.tela_codigo = 'cadastros.login_acesso' and not new.permitido then
    raise exception 'Você não pode tirar o seu próprio acesso à tela Login de acesso.';
  end if;
  if exists (select 1 from public.telas t where t.codigo = new.tela_codigo and t.somente_admin) then
    raise exception 'A tela % é exclusiva do Admin e não recebe permissão individual.', new.tela_codigo;
  end if;
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger trg_usuario_telas_protege before insert or update or delete on public.usuario_telas
  for each row execute function public.usuario_telas_protege();

-- Toda alteração vai para a auditoria que já existe
create trigger trg_auditoria after insert or update or delete on public.usuario_telas
  for each row execute function public.registra_auditoria();

-- ---------------------------------------------------------------------
-- FUNÇÕES
-- ---------------------------------------------------------------------
-- true = pode ver a tela. Sem usuário (scripts do sistema) ou admin: pode. Sem linha: NÃO pode.
create or replace function public.pode_ver_tela(_codigo text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
      or public.is_admin()
      or exists (
        select 1
        from public.usuario_telas ut
        join public.telas t on t.codigo = ut.tela_codigo
        where ut.user_id = auth.uid() and ut.tela_codigo = _codigo
          and ut.permitido and t.ativo and not t.somente_admin
      );
$$;
revoke all on function public.pode_ver_tela(text) from public, anon;
grant execute on function public.pode_ver_tela(text) to authenticated;

-- Códigos das telas que o usuário logado pode ver (app 'eco', 'rh' ou null = todos)
create or replace function public.minhas_telas(_app text default null)
returns setof text language sql stable security definer set search_path = public as $$
  select t.codigo
  from public.telas t
  where t.ativo
    and (_app is null or t.app = _app)
    and auth.uid() is not null
    and (
      public.is_admin()
      or (not t.somente_admin and exists (
            select 1 from public.usuario_telas ut
            where ut.user_id = auth.uid() and ut.tela_codigo = t.codigo and ut.permitido))
    )
  order by t.ordem;
$$;
revoke all on function public.minhas_telas(text) from public, anon;
grant execute on function public.minhas_telas(text) to authenticated;

-- ---------------------------------------------------------------------
-- POLÍTICAS: gravar em tabelas que pertencem a UMA tela só exige a tela.
-- (Leitura continua pela área: o PDV e outras telas precisam consultar esses dados.)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select * from (values
    ('modelos_etiqueta',   'estoque.etiquetas'),
    ('mercadologico',      'estoque.mercadologico'),
    ('crm_listas',         'crm.whatsapp'),
    ('crm_lista_membros',  'crm.whatsapp'),
    ('crm_campanhas',      'crm.whatsapp'),
    ('crm_envios',         'crm.whatsapp'),
    ('crm_pedidos',        'crm.whatsapp'),
    ('lancamentos',        'financeiro.financeiro'),
    ('dre_categorias',     'financeiro.financeiro'),
    ('dre_benchmark_loja', 'financeiro.financeiro'),
    ('dre_faturamento',    'financeiro.financeiro'),
    ('formas_pagamento',   'cadastros.pagamentos'),
    ('meios_pagamento',    'cadastros.pagamentos'),
    ('contas_bancarias',   'cadastros.contas_bancarias'),
    ('plano_contas',       'cadastros.plano_contas')
  ) as t(tabela, tela) loop
    execute format('create policy "tela: inserir" on public.%I as restrictive for insert to authenticated with check (public.pode_ver_tela(%L))', r.tabela, r.tela);
    execute format('create policy "tela: editar" on public.%I as restrictive for update to authenticated using (public.pode_ver_tela(%L))', r.tabela, r.tela);
    execute format('create policy "tela: excluir" on public.%I as restrictive for delete to authenticated using (public.pode_ver_tela(%L))', r.tabela, r.tela);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- MIGRAÇÃO DOS USUÁRIOS ATUAIS (ninguém perde acesso)
-- Mesma regra de src/lib/telas.ts → telasLegado():
--   ECO: o perfil estava na lista da tela E a área da tela tinha "ver" (sem linha = tinha)
--   RH : membro de alguma empresa do RH → Painel, Histórico, Visão Global, Empresas;
--        Dono/Admin em alguma empresa → também Usuários do Gestão RH
-- Admin não precisa de linhas (vê tudo). Grava true E false, para ficar explícito.
-- ---------------------------------------------------------------------
with _regra_tela (codigo, perfis, area) as (values
  ('vendas.pdv',                 array['admin','gerente','vendedor'],               'vendas'),
  ('vendas.notas',               array['admin','gerente','vendedor'],               'vendas'),
  ('caixa.movimentacoes',        array['admin','gerente','vendedor'],               'caixa'),
  ('estoque.produtos',           array['admin','gerente','vendedor','estoquista'],  'produtos'),
  ('estoque.lotes',              array['admin','gerente','estoquista'],             'lotes'),
  ('estoque.etiquetas',          array['admin','gerente'],                          'produtos'),
  ('estoque.mercadologico',      array['admin','gerente','estoquista'],             'produtos'),
  ('estoque.transferencias',     array['admin','gerente','estoquista'],             'produtos'),
  ('estoque.mercado_livre',      array['admin','gerente','estoquista'],             null),
  ('cadastros.pessoas',          array['admin'],                                    'pessoas'),
  ('cadastros.pagamentos',       array['admin','gerente'],                          'cadastros_financeiros'),
  ('cadastros.contas_bancarias', array['admin','gerente'],                          'cadastros_financeiros'),
  ('cadastros.plano_contas',     array['admin','gerente'],                          'cadastros_financeiros'),
  ('financeiro.financeiro',      array['admin','gerente'],                          'financeiro'),
  ('relatorios.dashboard',       array['admin','gerente','vendedor','estoquista'],  null),
  ('relatorios.relatorios',      array['admin','gerente'],                          'relatorios'),
  ('crm.whatsapp',               array['admin','gerente','vendedor'],               'crm')
)
insert into public.usuario_telas (user_id, tela_codigo, permitido, atualizado_por)
select ur.user_id, r.codigo,
       ur.role::text = any (r.perfis)
         and (r.area is null or coalesce((select p.ver from public.permissoes p where p.user_id = ur.user_id and p.modulo = r.area), true)),
       null
from public.user_roles ur
cross join _regra_tela r
where ur.role <> 'admin'
on conflict (user_id, tela_codigo) do nothing;

do $$
begin
  if to_regclass('rh.empresa_membros') is not null then
    insert into public.usuario_telas (user_id, tela_codigo, permitido, atualizado_por)
    select u.id, t.codigo,
           exists (select 1 from rh.empresa_membros m where m.user_id = u.id)
             and (t.codigo <> 'rh.usuarios'
                  or exists (select 1 from rh.empresa_membros m where m.user_id = u.id and m.papel in ('owner', 'admin'))),
           null
    from auth.users u
    cross join public.telas t
    where t.app = 'rh'
      and not exists (select 1 from public.user_roles ur where ur.user_id = u.id and ur.role = 'admin')
    on conflict (user_id, tela_codigo) do nothing;
  end if;
end $$;
