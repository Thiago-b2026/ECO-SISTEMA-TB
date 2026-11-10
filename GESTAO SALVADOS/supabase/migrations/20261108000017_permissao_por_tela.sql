-- =====================================================================
-- PERMISSÕES DO ECOSSISTEMA TB: SISTEMA → GRUPO → TELA
-- (camada acima das permissões por área e das ações especiais do PDV, que continuam valendo
--  para inserir/editar/excluir e para as ações de risco)
--  - public.sistemas: cada sistema do ecossistema (espelho de MEU SUPERVISOR/sistemas.json)
--  - public.grupos:   grupos de telas dentro de cada sistema
--  - public.telas:    cada tela, código "<sistema>.<tela>" (espelho de src/lib/telas.ts)
--  - public.usuario_telas: flags por usuário. SEM LINHA = BLOQUEADO. Admin vê tudo.
--  - pode_ver_tela(codigo) / minhas_telas(app) / meus_sistemas()
--  - Gera as flags de quem JÁ existe a partir do acesso de hoje (ninguém perde acesso).
--  - Gestão RH: só o admin cria empresas e dá acessos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- SISTEMAS
-- ---------------------------------------------------------------------
create table public.sistemas (
  codigo text primary key check (codigo ~ '^[a-z][a-z0-9_]*$'),
  nome   text not null,
  url    text,
  ordem  int  not null default 0,
  ativo  boolean not null default true
);
alter table public.sistemas enable row level security;
create policy "sistemas: logados leem" on public.sistemas for select to authenticated using (true);
create policy "sistemas: admin grava" on public.sistemas for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.sistemas (codigo, nome, url, ordem, ativo) values
  ('pdv',        'PDV Salvados',           'https://eco-sistema-tb.vercel.app', 10, true),
  ('rh',         'Gestão RH',              'https://gestao-rh-tau.vercel.app',  20, true),
  ('crm',        'CRM Super Mix Braz',     null,                                30, false),
  ('checklist',  'Check List Operacional', null,                                40, false),
  ('pop',        'Treinamentos com POP',   null,                                50, false),
  ('supervisor', 'Meu Supervisor',         null,                                90, false);

-- ---------------------------------------------------------------------
-- GRUPOS (nível do meio)
-- ---------------------------------------------------------------------
create table public.grupos (
  sistema text not null references public.sistemas(codigo) on update cascade on delete cascade,
  codigo  text not null,
  nome    text not null,
  ordem   int  not null default 0,
  primary key (sistema, codigo)
);
alter table public.grupos enable row level security;
create policy "grupos: logados leem" on public.grupos for select to authenticated using (true);
create policy "grupos: admin grava" on public.grupos for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.grupos (sistema, codigo, nome, ordem) values
  ('pdv', 'vendas',      'Vendas',      10),
  ('pdv', 'caixa',       'Caixa',       20),
  ('pdv', 'estoque',     'Estoque',     30),
  ('pdv', 'cadastros',   'Cadastros',   40),
  ('pdv', 'financeiro',  'Financeiro',  50),
  ('pdv', 'relatorios',  'Relatórios',  60),
  ('pdv', 'crm',         'CRM',         70),
  ('rh',  'lancamentos', 'Lançamentos', 10),
  ('rh',  'consolidado', 'Consolidado', 20);

-- ---------------------------------------------------------------------
-- TELAS (app = código do sistema)
-- ---------------------------------------------------------------------
create table public.telas (
  codigo        text primary key,
  nome          text not null,
  app           text not null references public.sistemas(codigo) on update cascade on delete cascade,
  grupo         text not null,
  rota          text not null,
  ordem         int  not null default 0,
  ativo         boolean not null default true,
  somente_admin boolean not null default false,
  foreign key (app, grupo) references public.grupos(sistema, codigo) on update cascade,
  check (codigo like app || '.%')
);
alter table public.telas enable row level security;
create policy "telas: logados leem" on public.telas for select to authenticated using (true);
create policy "telas: admin grava" on public.telas for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.telas (codigo, nome, app, grupo, rota, ordem, somente_admin) values
  ('pdv.pdv',             'PDV · Frente de loja',                    'pdv', 'vendas',      '/pdv',              10,  false),
  ('pdv.vendas',          'Vendas e notas',                          'pdv', 'vendas',      '/vendas',           20,  false),
  ('pdv.caixa',           'Movimentações de caixa',                  'pdv', 'caixa',       '/caixa',            30,  false),
  ('pdv.produtos',        'Produtos e estoque',                      'pdv', 'estoque',     '/produtos',         40,  false),
  ('pdv.lotes',           'Lotes',                                   'pdv', 'estoque',     '/lotes',            50,  false),
  ('pdv.etiquetas',       'Etiquetas',                               'pdv', 'estoque',     '/etiquetas',        60,  false),
  ('pdv.mercadologico',   'Mercadológico',                           'pdv', 'estoque',     '/mercadologico',    70,  false),
  ('pdv.transferencias',  'Transferências',                          'pdv', 'estoque',     '/transferencias',   80,  false),
  ('pdv.mercado_livre',   'Mercado Livre (busca de anúncios)',       'pdv', 'estoque',     '/mercado-livre',    90,  false),
  ('pdv.pessoas',         'Pessoas',                                 'pdv', 'cadastros',   '/pessoas',          100, false),
  ('pdv.login_acesso',    'Login de acesso',                         'pdv', 'cadastros',   '/usuarios',         110, true),
  ('pdv.pagamentos',      'Formas e meios de pagamento',             'pdv', 'cadastros',   '/pagamentos',       120, false),
  ('pdv.contas_bancarias', 'Contas bancárias',                       'pdv', 'cadastros',   '/contas-bancarias', 130, false),
  ('pdv.plano_contas',    'Plano de contas',                         'pdv', 'cadastros',   '/plano-contas',     140, false),
  ('pdv.lojas',           'Lojas e configurações',                   'pdv', 'cadastros',   '/lojas',            150, true),
  ('pdv.financeiro',      'Financeiro (pagar, receber, fluxo, DRE)', 'pdv', 'financeiro',  '/financeiro',       160, false),
  ('pdv.dashboard',       'Dashboard',                               'pdv', 'relatorios',  '/dashboard',        170, false),
  ('pdv.relatorios',      'Relatórios',                              'pdv', 'relatorios',  '/relatorios',       180, false),
  ('pdv.crm',             'CRM e WhatsApp',                          'pdv', 'crm',         '/crm',              190, false),
  ('rh.painel',           'Painel',                                  'rh',  'lancamentos', '/',                 10,  false),
  ('rh.historico',        'Histórico',                               'rh',  'lancamentos', '/historico',        20,  false),
  ('rh.global',           'Visão Global',                            'rh',  'consolidado', '/global',           30,  false),
  ('rh.empresas',         'Empresas',                                'rh',  'consolidado', '/empresas',         40,  false),
  ('rh.usuarios',         'Usuários do Gestão RH',                   'rh',  'consolidado', '/usuarios',         50,  true);

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
-- cada um lê só as próprias linhas; só o admin lê e grava todas (só o admin dá acessos)
create policy "utelas: ver as minhas ou admin" on public.usuario_telas for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "utelas: admin grava" on public.usuario_telas for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Carimbo de quem alterou + travas
create or replace function public.usuario_telas_protege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.user_id = auth.uid() and old.tela_codigo = 'pdv.login_acesso' then
      raise exception 'Você não pode tirar o seu próprio acesso à tela Login de acesso.';
    end if;
    return old;
  end if;
  if new.user_id = auth.uid() and new.tela_codigo = 'pdv.login_acesso' and not new.permitido then
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
        join public.sistemas s on s.codigo = t.app
        where ut.user_id = auth.uid() and ut.tela_codigo = _codigo
          and ut.permitido and t.ativo and s.ativo and not t.somente_admin
      );
$$;
revoke all on function public.pode_ver_tela(text) from public, anon;
grant execute on function public.pode_ver_tela(text) to authenticated;

-- Códigos das telas que o usuário logado pode ver (de um sistema, ou null = todos)
create or replace function public.minhas_telas(_app text default null)
returns setof text language sql stable security definer set search_path = public as $$
  select t.codigo
  from public.telas t
  join public.sistemas s on s.codigo = t.app
  where t.ativo and s.ativo
    and (_app is null or t.app = _app)
    and auth.uid() is not null
    and (
      public.is_admin()
      or (not t.somente_admin and exists (
            select 1 from public.usuario_telas ut
            where ut.user_id = auth.uid() and ut.tela_codigo = t.codigo and ut.permitido))
    )
  order by s.ordem, t.ordem;
$$;
revoke all on function public.minhas_telas(text) from public, anon;
grant execute on function public.minhas_telas(text) to authenticated;

-- Sistemas em que o usuário logado tem pelo menos uma tela (admin: todos os ativos). Usado no menu "Sistemas".
create or replace function public.meus_sistemas()
returns table (codigo text, nome text, url text, ordem int) language sql stable security definer set search_path = public as $$
  select s.codigo, s.nome, s.url, s.ordem
  from public.sistemas s
  where s.ativo and auth.uid() is not null
    and (public.is_admin() or exists (select 1 from public.minhas_telas(s.codigo)))
  order by s.ordem;
$$;
revoke all on function public.meus_sistemas() from public, anon;
grant execute on function public.meus_sistemas() to authenticated;

-- ---------------------------------------------------------------------
-- POLÍTICAS: gravar em tabelas que pertencem a UMA tela só exige a tela.
-- (Leitura continua pela área: o PDV e outras telas precisam consultar esses dados.)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select * from (values
    ('modelos_etiqueta',   'pdv.etiquetas'),
    ('mercadologico',      'pdv.mercadologico'),
    ('crm_listas',         'pdv.crm'),
    ('crm_lista_membros',  'pdv.crm'),
    ('crm_campanhas',      'pdv.crm'),
    ('crm_envios',         'pdv.crm'),
    ('crm_pedidos',        'pdv.crm'),
    ('lancamentos',        'pdv.financeiro'),
    ('dre_categorias',     'pdv.financeiro'),
    ('dre_benchmark_loja', 'pdv.financeiro'),
    ('dre_faturamento',    'pdv.financeiro'),
    ('formas_pagamento',   'pdv.pagamentos'),
    ('meios_pagamento',    'pdv.pagamentos'),
    ('contas_bancarias',   'pdv.contas_bancarias'),
    ('plano_contas',       'pdv.plano_contas')
  ) as t(tabela, tela) loop
    execute format('create policy "tela: inserir" on public.%I as restrictive for insert to authenticated with check (public.pode_ver_tela(%L))', r.tabela, r.tela);
    execute format('create policy "tela: editar" on public.%I as restrictive for update to authenticated using (public.pode_ver_tela(%L))', r.tabela, r.tela);
    execute format('create policy "tela: excluir" on public.%I as restrictive for delete to authenticated using (public.pode_ver_tela(%L))', r.tabela, r.tela);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- MIGRAÇÃO DOS USUÁRIOS ATUAIS (ninguém perde acesso)
-- Mesma regra de src/lib/telas.ts → telasLegado() e de supabase/scripts/conferir_telas_antes.sql:
--   PDV: o perfil estava na lista da tela E a área da tela tinha "ver" (sem linha = tinha)
--   RH : membro de alguma empresa do RH → Painel, Histórico, Visão Global e Empresas
--        (Usuários do Gestão RH agora é só do Admin)
-- Admin não precisa de linhas (vê tudo). Grava true E false, para ficar explícito.
-- ---------------------------------------------------------------------
with _regra_tela (codigo, perfis, area) as (values
  ('pdv.pdv',              array['admin','gerente','vendedor'],               'vendas'),
  ('pdv.vendas',           array['admin','gerente','vendedor'],               'vendas'),
  ('pdv.caixa',            array['admin','gerente','vendedor'],               'caixa'),
  ('pdv.produtos',         array['admin','gerente','vendedor','estoquista'],  'produtos'),
  ('pdv.lotes',            array['admin','gerente','estoquista'],             'lotes'),
  ('pdv.etiquetas',        array['admin','gerente'],                          'produtos'),
  ('pdv.mercadologico',    array['admin','gerente','estoquista'],             'produtos'),
  ('pdv.transferencias',   array['admin','gerente','estoquista'],             'produtos'),
  ('pdv.mercado_livre',    array['admin','gerente','estoquista'],             null),
  ('pdv.pessoas',          array['admin'],                                    'pessoas'),
  ('pdv.pagamentos',       array['admin','gerente'],                          'cadastros_financeiros'),
  ('pdv.contas_bancarias', array['admin','gerente'],                          'cadastros_financeiros'),
  ('pdv.plano_contas',     array['admin','gerente'],                          'cadastros_financeiros'),
  ('pdv.financeiro',       array['admin','gerente'],                          'financeiro'),
  ('pdv.dashboard',        array['admin','gerente','vendedor','estoquista'],  null),
  ('pdv.relatorios',       array['admin','gerente'],                          'relatorios'),
  ('pdv.crm',              array['admin','gerente','vendedor'],               'crm')
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
           exists (select 1 from rh.empresa_membros m where m.user_id = u.id),
           null
    from auth.users u
    cross join public.telas t
    where t.app = 'rh' and not t.somente_admin
      and not exists (select 1 from public.user_roles ur where ur.user_id = u.id and ur.role = 'admin')
    on conflict (user_id, tela_codigo) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- GESTÃO RH (schema rh): só o admin cria empresas.
-- (Dar acesso no RH já é só pela tela "Usuários do Gestão RH", exclusiva do admin,
--  e pela função de servidor api/admin-users.ts, que passa a exigir admin.)
-- ---------------------------------------------------------------------
do $do$
begin
  if to_regprocedure('rh.criar_empresa(text,text,text[])') is not null then
    execute $fn$
      create or replace function rh.criar_empresa(p_nome text, p_cnpj text, p_lojas text[])
      returns uuid language plpgsql security definer set search_path = rh, public as $body$
      declare
        v_id uuid;
        i int;
      begin
        if auth.uid() is null then
          raise exception 'Faça login para cadastrar uma empresa';
        end if;
        if not public.is_admin() then
          raise exception 'Só o administrador cadastra empresas.';
        end if;
        if coalesce(trim(p_nome), '') = '' then
          raise exception 'Informe o nome da empresa';
        end if;
        if p_lojas is null or array_length(p_lojas, 1) is null then
          p_lojas := array['Loja 1'];
        end if;

        insert into rh.empresas (nome, cnpj) values (trim(p_nome), nullif(trim(p_cnpj), ''))
        returning id into v_id;

        for i in 1 .. array_length(p_lojas, 1) loop
          insert into rh.lojas (empresa_id, codigo, nome, ordem)
          values (v_id, 'loja' || i, coalesce(nullif(trim(p_lojas[i]), ''), 'Loja ' || i), i);
        end loop;

        insert into rh.empresa_membros (empresa_id, user_id, papel) values (v_id, auth.uid(), 'owner');
        return v_id;
      end $body$;
    $fn$;
  end if;
end $do$;
