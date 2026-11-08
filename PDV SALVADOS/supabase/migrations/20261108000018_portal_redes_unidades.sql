-- =====================================================================
-- PORTAL – FASE 1 (banco): Grupo TB → REDE → UNIDADE  e permissões POR UNIDADE
--   sistema → grupo → tela → AÇÃO, para cada unidade.
-- Princípios:
--   * NENHUM comportamento muda: PDV e Gestão RH continuam usando as regras de hoje
--     (usuario_telas, permissoes, permissoes_acoes, papéis do RH) até a fase 3.
--   * NENHUM dado é movido: vendas, caixa, estoque e lançamentos do RH ficam onde estão.
--   * A conversão das permissões fica numa função (sincronizar_permissoes_legado) que pode
--     ser rodada de novo ANTES da fase 3. Depois que o Portal virar a fonte, NÃO rodar.
-- Unidade = a tabela public.lojas que já existe (tem CNPJ e dados fiscais; 14 tabelas apontam para ela).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. REDES
-- ---------------------------------------------------------------------
create table public.redes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ordem      int  not null default 0,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.redes enable row level security;
create policy "redes: logados leem" on public.redes for select to authenticated using (true);
create policy "redes: admin grava" on public.redes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger trg_auditoria after insert or update or delete on public.redes
  for each row execute function public.registra_auditoria();

-- ---------------------------------------------------------------------
-- 2. UNIDADES (= public.lojas) ganham rede, tipo e sistemas
-- ---------------------------------------------------------------------
alter table public.lojas
  add column rede_id  uuid references public.redes(id),
  -- regra automática pelo CNPJ: final /0001 = matriz; outro final = filial; sem CNPJ = indefinido
  add column tipo     text generated always as (
    case when cnpj ~ '^[0-9]{14}$' then case when substr(cnpj, 9, 4) = '0001' then 'matriz' else 'filial' end end
  ) stored,
  -- em quais sistemas a unidade aparece (as unidades "só RH" não aparecem no PDV)
  add column sistemas text[] not null default array['pdv'];

create or replace function public.lojas_valida_sistemas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from unnest(new.sistemas) s where not exists (select 1 from public.sistemas x where x.codigo = s)) then
    raise exception 'Sistema inválido na unidade %: %', new.nome, new.sistemas;
  end if;
  return new;
end;
$$;
create trigger trg_lojas_valida_sistemas before insert or update of sistemas on public.lojas
  for each row execute function public.lojas_valida_sistemas();

create or replace function public.unidade_usa(_unidade uuid, _sistema text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lojas l where l.id = _unidade and _sistema = any (l.sistemas));
$$;
grant execute on function public.unidade_usa(uuid, text) to authenticated;

-- O PDV só enxerga as unidades que usam o PDV (mesmas funções de antes + o filtro)
create or replace function public.minhas_lojas()
returns setof public.lojas language sql stable security definer set search_path = public as $$
  select l.* from public.lojas l
  where l.ativo and 'pdv' = any (l.sistemas) and public.pode_ver_loja(l.id)
  order by l.nome;
$$;

create or replace function public.lojas_ativas()
returns table (id uuid, nome text) language sql stable security definer set search_path = public as $$
  select l.id, l.nome from public.lojas l where l.ativo and 'pdv' = any (l.sistemas) and auth.uid() is not null order by l.nome;
$$;

create or replace function public.relatorio_por_loja(_de date, _ate date)
returns table (loja_id uuid, loja text, faturamento numeric, vendas bigint, ticket numeric, custo numeric)
language sql stable security definer set search_path = public as $$
  select lj.id, lj.nome, coalesce(sum(v.total), 0), count(v.id), coalesce(round(avg(v.total), 2), 0),
         coalesce((select sum(i.custo_unit * i.quantidade) from public.venda_itens i join public.vendas v2 on v2.id = i.venda_id
                   where v2.loja_id = lj.id and v2.status = 'finalizada'
                     and (v2.data_venda at time zone 'America/Sao_Paulo')::date between _de and _ate), 0)
  from public.lojas lj
  left join public.vendas v on v.loja_id = lj.id and v.status = 'finalizada'
       and (v.data_venda at time zone 'America/Sao_Paulo')::date between _de and _ate
  where lj.ativo and 'pdv' = any (lj.sistemas) and public.pode_ver_loja(lj.id)
  group by lj.id, lj.nome
  order by 3 desc;
$$;

-- ---------------------------------------------------------------------
-- 3. DADOS: rede SALVADOS LP (Monte Sinai e Eldorado) e rede SUPERMIX BRAZ
--    Só o NOME das unidades muda; vendas, caixa e estoque continuam iguais.
-- ---------------------------------------------------------------------
insert into public.redes (nome, ordem) values ('SALVADOS LP', 10), ('SUPERMIX BRAZ', 20);

update public.lojas set nome = 'Monte Sinai', rede_id = (select id from public.redes where nome = 'SALVADOS LP')
 where cnpj = '65297057000140';
update public.lojas set nome = 'Eldorado', rede_id = (select id from public.redes where nome = 'SALVADOS LP')
 where cnpj = '61387931000189';
-- A "SALVADOS LP MS (duplicada)" (desativada, sem CNPJ) fica sem rede e fora do Portal.

-- Gestão RH: a empresa vira a rede e cada loja do RH vira uma unidade (nomes provisórios,
-- renomeie pelo Portal). Os lançamentos NÃO mudam: o JSON continua com loja1/loja2/loja3,
-- e rh.lojas.unidade_id diz qual unidade cada chave representa.
do $$
declare e record; l record; v_rede uuid; v_un uuid;
begin
  if to_regclass('rh.lojas') is null then return; end if;
  execute 'alter table rh.empresas add column if not exists rede_id uuid references public.redes(id)';
  execute 'alter table rh.lojas add column if not exists unidade_id uuid references public.lojas(id)';
  for e in execute 'select id, nome from rh.empresas order by created_at' loop
    insert into public.redes (nome, ordem) values (upper(e.nome), 90) on conflict (nome) do nothing;
    select id into v_rede from public.redes where nome = upper(e.nome);
    execute 'update rh.empresas set rede_id = $1 where id = $2' using v_rede, e.id;
    for l in execute 'select id, nome, codigo from rh.lojas where empresa_id = $1 order by ordem' using e.id loop
      v_un := null;
      -- A loja "SUPER MIX BRAZ" criada no PDV em 08/11 (CNPJ 17.890.178/0001-58, sem nenhum movimento)
      -- é REAPROVEITADA como a unidade da loja1 do RH: sai do PDV (só RH) e não vira unidade duplicada.
      if e.nome = 'Supermix Braz' and l.codigo = 'loja1' then
        update public.lojas
           set nome = split_part(e.nome, ' ', 1) || ' ' || l.nome, rede_id = v_rede, sistemas = array['rh']
         where cnpj = '17890178000158'
           and not exists (select 1 from public.vendas x where x.loja_id = lojas.id)
           and not exists (select 1 from public.caixas x where x.loja_id = lojas.id)
           and not exists (select 1 from public.produtos x where x.loja_id = lojas.id)
           and not exists (select 1 from public.stock_movements x where x.loja_id = lojas.id)
           and not exists (select 1 from public.lotes x where x.loja_id = lojas.id)
           and not exists (select 1 from public.lancamentos x where x.loja_id = lojas.id)
        returning id into v_un;
      end if;
      if v_un is null then
        insert into public.lojas (nome, rede_id, sistemas, ativo)
        values (split_part(e.nome, ' ', 1) || ' ' || l.nome, v_rede, array['rh'], true)
        returning id into v_un;
      end if;
      execute 'update rh.lojas set unidade_id = $1 where id = $2' using v_un, l.id;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3b. GRUPOS DO PDV = ORGANIZAÇÃO NOVA DO MENU (só agrupamento: cada tela mantém
--     o seu código e o seu flag; ninguém perde nem ganha acesso). A troca do menu na
--     tela do PDV fica para a fase 3.
-- ---------------------------------------------------------------------
insert into public.grupos (sistema, codigo, nome, ordem) values
  ('pdv', 'dashboard',  'Dashboard',            10),
  ('pdv', 'frente',     'PDV · Frente de loja', 20),
  ('pdv', 'produtos',   'Produtos',             30),
  ('pdv', 'financeiro', 'Financeiro',           40),
  ('pdv', 'cadastros',  'Cadastros',            50),
  ('pdv', 'crm',        'CRM e WhatsApp',       60)
on conflict (sistema, codigo) do update set nome = excluded.nome, ordem = excluded.ordem;

-- REGRUPAMENTO_PDV (código da tela, grupo, nome, ordem)
update public.telas t set grupo = x.grupo, nome = x.nome, ordem = x.ordem
from (values
  ('pdv.dashboard',        'dashboard',  'Dashboard',                                10),
  ('pdv.relatorios',       'dashboard',  'Relatórios',                               20),
  ('pdv.pdv',              'frente',     'PDV',                                      30),
  ('pdv.vendas',           'frente',     'Vendas e notas',                           40),
  ('pdv.produtos',         'produtos',   'Cadastro de produtos',                     50),
  ('pdv.mercadologico',    'produtos',   'Mercadológico',                            60),
  ('pdv.lotes',            'produtos',   'Lotes',                                    70),
  ('pdv.etiquetas',        'produtos',   'Etiquetas',                                80),
  ('pdv.transferencias',   'produtos',   'Transferências',                           90),
  ('pdv.mercado_livre',    'produtos',   'Mercado Livre (busca de anúncios)',        100),
  ('pdv.financeiro',       'financeiro', 'Financeiro (pagar, receber, fluxo, DRE)',  110),
  ('pdv.caixa',            'financeiro', 'Movimentações de caixa',                   120),
  ('pdv.pagamentos',       'financeiro', 'Formas e meios de pagamento',              130),
  ('pdv.contas_bancarias', 'financeiro', 'Contas bancárias',                         140),
  ('pdv.plano_contas',     'financeiro', 'Plano de contas',                          150),
  ('pdv.lojas',            'cadastros',  'Empresas',                                 160),
  ('pdv.pessoas',          'cadastros',  'Pessoas',                                  170),
  ('pdv.login_acesso',     'cadastros',  'Login de acesso',                          180),
  ('pdv.crm',              'crm',        'CRM',                                      190)
) as x(codigo, grupo, nome, ordem)
where t.codigo = x.codigo;
-- FIM_REGRUPAMENTO_PDV
delete from public.grupos g
 where g.sistema = 'pdv' and g.codigo in ('vendas', 'caixa', 'estoque', 'relatorios')
   and not exists (select 1 from public.telas t where t.app = g.sistema and t.grupo = g.codigo);

-- ---------------------------------------------------------------------
-- 3c. Membro do Gestão RH sem nenhuma tela de RH (entrou depois da 0017, ex.: Natália)
--     recebe Painel e Histórico, para continuar entrando no RH como hoje.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('rh.empresa_membros') is null then return; end if;
  execute $q$
    insert into public.usuario_telas (user_id, tela_codigo, permitido, atualizado_por)
    select distinct m.user_id, t.codigo, true, null::uuid
    from rh.empresa_membros m cross join (values ('rh.painel'), ('rh.historico')) as t(codigo)
    where not exists (select 1 from public.user_roles r where r.user_id = m.user_id and r.role = 'admin')
      and not exists (select 1 from public.usuario_telas ut join public.telas tt on tt.codigo = ut.tela_codigo
                      where ut.user_id = m.user_id and tt.app = 'rh')
    on conflict (user_id, tela_codigo) do nothing
  $q$;
end $$;

-- ---------------------------------------------------------------------
-- 3d. GESTÃO RH: LOJA NOVA = UNIDADE NOVA DA REDE (automático) e só o ADMIN cria lojas/empresas
--     * Loja adicionada no RH vira unidade da rede da empresa (só RH) e entra nas análises
--       por loja e global (o RH lê as lojas da empresa).
--     * Unidade nova NÃO libera ninguém: não ganha linhas em usuario_permissoes. O admin libera
--       pelo Portal (fase 2: "copiar permissões da Loja 1 para a loja nova" = copiar_permissoes).
--       Até a fase 3, o Gestão RH ainda mostra todas as lojas da empresa para quem é membro dela.
-- ---------------------------------------------------------------------
do $do$
begin
  if to_regclass('rh.lojas') is null then return; end if;

  execute $fn$
    create or replace function rh.loja_cria_unidade()
    returns trigger language plpgsql security definer set search_path = rh, public as $body$
    declare v_rede uuid; v_emp text; v_un uuid;
    begin
      if new.unidade_id is not null then return new; end if;
      select e.rede_id, e.nome into v_rede, v_emp from rh.empresas e where e.id = new.empresa_id;
      if v_rede is null then
        insert into public.redes (nome, ordem) values (upper(v_emp), 90) on conflict (nome) do nothing;
        select id into v_rede from public.redes where nome = upper(v_emp);
        update rh.empresas set rede_id = v_rede where id = new.empresa_id;
      end if;
      insert into public.lojas (nome, rede_id, sistemas, ativo)
      values (split_part(v_emp, ' ', 1) || ' ' || new.nome, v_rede, array['rh'], true)
      returning id into v_un;
      new.unidade_id := v_un;
      return new;
    end $body$;
  $fn$;
  execute 'drop trigger if exists trg_rh_loja_cria_unidade on rh.lojas';
  execute 'create trigger trg_rh_loja_cria_unidade before insert on rh.lojas for each row execute function rh.loja_cria_unidade()';

  -- Adicionar loja: só o admin (lojas fazem parte do cadastro de redes/unidades)
  execute $fn$
    create or replace function rh.adicionar_loja(p_empresa uuid, p_nome text)
    returns uuid language plpgsql security definer set search_path = rh, public as $body$
    declare
      v_n int;
      v_id uuid;
    begin
      if not public.is_admin() then
        raise exception 'Só o administrador adiciona lojas.';
      end if;
      select coalesce(max(nullif(regexp_replace(codigo, '\D', '', 'g'), '')::int), 0) + 1
        into v_n from rh.lojas where empresa_id = p_empresa;
      insert into rh.lojas (empresa_id, codigo, nome, ordem)
      values (p_empresa, 'loja' || v_n, coalesce(nullif(trim(p_nome), ''), 'Loja ' || v_n), v_n)
      returning id into v_id;
      return v_id;
    end $body$;
  $fn$;

  -- Criar empresa (só admin, como na 0017) agora também cria a rede antes das lojas
  execute $fn$
    create or replace function rh.criar_empresa(p_nome text, p_cnpj text, p_lojas text[])
    returns uuid language plpgsql security definer set search_path = rh, public as $body$
    declare
      v_id uuid;
      v_rede uuid;
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

      insert into public.redes (nome, ordem) values (upper(trim(p_nome)), 90) on conflict (nome) do nothing;
      select id into v_rede from public.redes where nome = upper(trim(p_nome));

      insert into rh.empresas (nome, cnpj, rede_id) values (trim(p_nome), nullif(trim(p_cnpj), ''), v_rede)
      returning id into v_id;

      for i in 1 .. array_length(p_lojas, 1) loop
        insert into rh.lojas (empresa_id, codigo, nome, ordem)
        values (v_id, 'loja' || i, coalesce(nullif(trim(p_lojas[i]), ''), 'Loja ' || i), i);
      end loop;

      insert into rh.empresa_membros (empresa_id, user_id, papel) values (v_id, auth.uid(), 'owner');
      return v_id;
    end $body$;
  $fn$;
end $do$;

-- ---------------------------------------------------------------------
-- 4. SISTEMA PORTAL (inativo até a fase 2) e suas telas (exclusivas do Admin)
-- ---------------------------------------------------------------------
insert into public.sistemas (codigo, nome, url, ordem, ativo)
values ('portal', 'Portal Grupo TB', 'https://portal-grupotb.vercel.app', 5, false);
insert into public.grupos (sistema, codigo, nome, ordem) values ('portal', 'acessos', 'Acessos', 10);
insert into public.telas (codigo, nome, app, grupo, rota, ordem, somente_admin) values
  ('portal.usuarios',   'Usuários',          'portal', 'acessos', '/usuarios',   10, true),
  ('portal.redes',      'Redes e unidades',  'portal', 'acessos', '/redes',      20, true),
  ('portal.permissoes', 'Permissões',        'portal', 'acessos', '/permissoes', 30, true);

-- ---------------------------------------------------------------------
-- 5. AÇÕES (catálogo extensível) e quais ações valem em cada tela
-- ---------------------------------------------------------------------
create table public.acoes (
  codigo   text primary key check (codigo ~ '^[a-z][a-z0-9_]*$'),
  nome     text not null,
  ordem    int  not null default 0,
  especial boolean not null default false
);
alter table public.acoes enable row level security;
create policy "acoes: logados leem" on public.acoes for select to authenticated using (true);
create policy "acoes: admin grava" on public.acoes for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.acoes (codigo, nome, ordem, especial) values
  ('ver',             'Ver',                    10,  false),
  ('inserir',         'Inserir',                20,  false),
  ('editar',          'Editar',                 30,  false),
  ('excluir',         'Excluir',                40,  false),
  ('exportar',        'Exportar Excel / PDF',   50,  true),
  ('desconto',        'Dar desconto',           60,  true),
  ('cancelar',        'Cancelar venda',         70,  true),
  ('sangria',         'Fazer sangria',          80,  true),
  ('suprimento',      'Fazer suprimento',       90,  true),
  ('alterar_preco',   'Alterar preço de venda', 100, true),
  ('ajustar_estoque', 'Ajustar estoque',        110, true),
  ('ver_custo',       'Ver custo',              120, true);

create table public.tela_acoes (
  tela_codigo text not null references public.telas(codigo) on update cascade on delete cascade,
  acao        text not null references public.acoes(codigo) on update cascade on delete cascade,
  primary key (tela_codigo, acao)
);
alter table public.tela_acoes enable row level security;
create policy "tela_acoes: logados leem" on public.tela_acoes for select to authenticated using (true);
create policy "tela_acoes: admin grava" on public.tela_acoes for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.tela_acoes (tela_codigo, acao)
select t, unnest(a) from (values
  ('pdv.pdv',              array['ver','inserir','desconto','sangria','suprimento']),
  ('pdv.vendas',           array['ver','cancelar','exportar']),
  ('pdv.caixa',            array['ver','inserir','editar','sangria','suprimento','exportar']),
  ('pdv.produtos',         array['ver','inserir','editar','alterar_preco','ajustar_estoque','ver_custo','exportar']),
  ('pdv.lotes',            array['ver','inserir','editar','excluir','exportar']),
  ('pdv.etiquetas',        array['ver','inserir','editar','excluir']),
  ('pdv.mercadologico',    array['ver','inserir','editar','excluir']),
  ('pdv.transferencias',   array['ver','inserir','editar']),
  ('pdv.mercado_livre',    array['ver']),
  ('pdv.pessoas',          array['ver','inserir','editar','excluir','exportar']),
  ('pdv.login_acesso',     array['ver','inserir','editar','excluir']),
  ('pdv.pagamentos',       array['ver','inserir','editar','excluir']),
  ('pdv.contas_bancarias', array['ver','inserir','editar']),
  ('pdv.plano_contas',     array['ver','inserir','editar','excluir']),
  ('pdv.lojas',            array['ver','inserir','editar','excluir']),
  ('pdv.financeiro',       array['ver','inserir','editar','exportar']),
  ('pdv.dashboard',        array['ver']),
  ('pdv.relatorios',       array['ver','exportar']),
  ('pdv.crm',              array['ver','inserir','editar','excluir','exportar']),
  ('rh.painel',            array['ver','inserir','editar','exportar']),
  ('rh.historico',         array['ver','editar']),
  ('rh.global',            array['ver','exportar']),
  ('rh.empresas',          array['ver','editar']),
  ('rh.usuarios',          array['ver','inserir','editar','excluir']),
  ('portal.usuarios',      array['ver','inserir','editar','excluir']),
  ('portal.redes',         array['ver','inserir','editar','excluir']),
  ('portal.permissoes',    array['ver','inserir','editar','excluir'])
) as x(t, a);

-- ---------------------------------------------------------------------
-- 6. PERMISSÕES POR UNIDADE: usuário + unidade + tela + ação. SEM LINHA = BLOQUEADO.
-- ---------------------------------------------------------------------
create table public.usuario_permissoes (
  user_id        uuid not null references auth.users(id) on delete cascade,
  unidade_id     uuid not null references public.lojas(id) on delete cascade,
  tela_codigo    text not null,
  acao           text not null,
  permitido      boolean not null default false,
  atualizado_por uuid references auth.users(id) on delete set null default auth.uid(),
  atualizado_em  timestamptz not null default now(),
  primary key (user_id, unidade_id, tela_codigo, acao),
  foreign key (tela_codigo, acao) references public.tela_acoes(tela_codigo, acao) on update cascade on delete cascade
);
create index usuario_permissoes_unidade_idx on public.usuario_permissoes (unidade_id);
create index usuario_permissoes_tela_idx on public.usuario_permissoes (tela_codigo);
alter table public.usuario_permissoes enable row level security;
-- cada um lê só as próprias linhas; só o admin lê e grava todas (só o admin dá acessos)
create policy "uperm: ver as minhas ou admin" on public.usuario_permissoes for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "uperm: admin grava" on public.usuario_permissoes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.usuario_permissoes_protege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  if exists (select 1 from public.telas t where t.codigo = new.tela_codigo and t.somente_admin) then
    raise exception 'A tela % é exclusiva do Admin e não recebe permissão individual.', new.tela_codigo;
  end if;
  if not exists (select 1 from public.telas t join public.lojas u on u.id = new.unidade_id
                 where t.codigo = new.tela_codigo and t.app = any (u.sistemas)) then
    raise exception 'A unidade não usa o sistema da tela %.', new.tela_codigo;
  end if;
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger trg_usuario_permissoes_protege before insert or update or delete on public.usuario_permissoes
  for each row execute function public.usuario_permissoes_protege();
create trigger trg_auditoria after insert or update or delete on public.usuario_permissoes
  for each row execute function public.registra_auditoria();

-- ---------------------------------------------------------------------
-- 7. FUNÇÕES (usadas pelo Portal na fase 2 e pelos sistemas na fase 3)
-- ---------------------------------------------------------------------
-- Pode fazer <ação> na <tela> desta <unidade>? Sem usuário (scripts) ou admin: pode.
create or replace function public.pode(_tela text, _acao text, _unidade uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
      or public.is_admin()
      or exists (
        select 1
        from public.usuario_permissoes up
        join public.telas t on t.codigo = up.tela_codigo
        join public.sistemas s on s.codigo = t.app
        join public.lojas u on u.id = up.unidade_id
        where up.user_id = auth.uid() and up.tela_codigo = _tela and up.acao = _acao and up.unidade_id = _unidade
          and up.permitido and t.ativo and s.ativo and not t.somente_admin and u.ativo and t.app = any (u.sistemas)
      );
$$;
revoke all on function public.pode(text, text, uuid) from public, anon;
grant execute on function public.pode(text, text, uuid) to authenticated;

-- Unidades em que o usuário logado pode VER alguma tela do sistema (admin: todas as unidades ativas do sistema)
create or replace function public.minhas_unidades(_sistema text)
returns table (id uuid, nome text, rede_id uuid, rede text, tipo text, cnpj text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nome, u.rede_id, r.nome, u.tipo, u.cnpj
  from public.lojas u
  left join public.redes r on r.id = u.rede_id
  where u.ativo and _sistema = any (u.sistemas) and auth.uid() is not null
    and (public.is_admin() or exists (
      select 1 from public.usuario_permissoes up join public.telas t on t.codigo = up.tela_codigo
      where up.user_id = auth.uid() and up.unidade_id = u.id and up.acao = 'ver' and up.permitido
        and t.app = _sistema and t.ativo and not t.somente_admin))
  order by r.ordem nulls last, r.nome, u.nome;
$$;
revoke all on function public.minhas_unidades(text) from public, anon;
grant execute on function public.minhas_unidades(text) to authenticated;

-- Permissões do usuário logado numa unidade (tela + ação). Admin: todas as do sistema.
create or replace function public.minhas_permissoes(_sistema text, _unidade uuid)
returns table (tela_codigo text, acao text)
language sql stable security definer set search_path = public as $$
  select ta.tela_codigo, ta.acao
  from public.tela_acoes ta
  join public.telas t on t.codigo = ta.tela_codigo
  join public.sistemas s on s.codigo = t.app
  where t.app = _sistema and t.ativo and s.ativo and auth.uid() is not null
    and public.unidade_usa(_unidade, _sistema)
    and (public.is_admin() or (not t.somente_admin and exists (
      select 1 from public.usuario_permissoes up
      where up.user_id = auth.uid() and up.unidade_id = _unidade
        and up.tela_codigo = ta.tela_codigo and up.acao = ta.acao and up.permitido)))
  order by t.ordem, ta.acao;
$$;
revoke all on function public.minhas_permissoes(text, uuid) from public, anon;
grant execute on function public.minhas_permissoes(text, uuid) to authenticated;

-- Copia as permissões de um usuário de uma unidade para outra (só admin). Só copia as telas dos
-- sistemas que a unidade de destino usa. Substitui o que havia no destino.
create or replace function public.copiar_permissoes(_user uuid, _de uuid, _para uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Só o administrador copia permissões.'; end if;
  if _de = _para then raise exception 'Escolha unidades diferentes.'; end if;
  delete from public.usuario_permissoes where user_id = _user and unidade_id = _para;
  insert into public.usuario_permissoes (user_id, unidade_id, tela_codigo, acao, permitido)
  select up.user_id, _para, up.tela_codigo, up.acao, up.permitido
  from public.usuario_permissoes up join public.telas t on t.codigo = up.tela_codigo
  where up.user_id = _user and up.unidade_id = _de and public.unidade_usa(_para, t.app);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.copiar_permissoes(uuid, uuid, uuid) from public, anon;
grant execute on function public.copiar_permissoes(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. CONVERSÃO DAS PERMISSÕES DE HOJE (ninguém perde, ninguém ganha)
--   PDV: para cada unidade do PDV em que trabalha (usuario_lojas) e cada tela/ação:
--        tem a tela (usuario_telas) E o PERFIL consegue no banco E a ÁREA permite E a ação especial está ligada.
--        Quem não tem nenhuma tela do PDV não recebe unidade do PDV (ex.: Natália, só RH).
--   RH : para cada empresa em que é membro → unidades dessa rede, com as telas de RH que tem;
--        Operador: ver/inserir/editar/exportar; Dono/Admin da empresa: + editar Empresas.
--   Admin não recebe linhas (pode tudo). Grava true E false, para ficar explícito.
--   Pode ser rodada de novo ANTES da fase 3 (apaga e recalcula as linhas de quem não é admin).
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_permissoes_legado()
returns int language plpgsql security definer set search_path = public as $$
declare n_pdv int := 0; n_rh int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Só o administrador sincroniza permissões.';
  end if;

  delete from public.usuario_permissoes up
  where not exists (select 1 from public.user_roles r where r.user_id = up.user_id and r.role = 'admin');

  -- REGRA_LEGADO_PDV (tela, ação, perfis que conseguem no banco hoje, área, coluna da área, ação especial)
  with regra (tela, acao, perfis, area, area_acao, chave) as (values
    ('pdv.pdv',              'ver',             array['admin','gerente','vendedor'],               'vendas',                'ver',     null),
    ('pdv.pdv',              'inserir',         array['admin','gerente','vendedor'],               'vendas',                'inserir', null),
    ('pdv.pdv',              'desconto',        array['admin','gerente','vendedor'],               'vendas',                'inserir', 'vendas.desconto'),
    ('pdv.pdv',              'sangria',         array['admin','gerente','vendedor'],               'caixa',                 'inserir', 'caixa.sangria'),
    ('pdv.pdv',              'suprimento',      array['admin','gerente','vendedor'],               'caixa',                 'inserir', 'caixa.suprimento'),
    ('pdv.vendas',           'ver',             array['admin','gerente','vendedor'],               'vendas',                'ver',     null),
    ('pdv.vendas',           'cancelar',        array['admin','gerente'],                          'vendas',                'ver',     'vendas.cancelar'),
    ('pdv.vendas',           'exportar',        array['admin','gerente','vendedor'],               'vendas',                'ver',     'dados.exportar'),
    ('pdv.caixa',            'ver',             array['admin','gerente','vendedor'],               'caixa',                 'ver',     null),
    ('pdv.caixa',            'inserir',         array['admin','gerente','vendedor'],               'caixa',                 'inserir', null),
    ('pdv.caixa',            'editar',          array['admin','gerente','vendedor'],               'caixa',                 'editar',  null),
    ('pdv.caixa',            'sangria',         array['admin','gerente','vendedor'],               'caixa',                 'inserir', 'caixa.sangria'),
    ('pdv.caixa',            'suprimento',      array['admin','gerente','vendedor'],               'caixa',                 'inserir', 'caixa.suprimento'),
    ('pdv.caixa',            'exportar',        array['admin','gerente','vendedor'],               'caixa',                 'ver',     'dados.exportar'),
    ('pdv.produtos',         'ver',             array['admin','gerente','vendedor','estoquista'],  'produtos',              'ver',     null),
    ('pdv.produtos',         'inserir',         array['admin','gerente','estoquista'],             'produtos',              'inserir', null),
    ('pdv.produtos',         'editar',          array['admin','gerente','estoquista'],             'produtos',              'editar',  null),
    ('pdv.produtos',         'alterar_preco',   array['admin','gerente','estoquista'],             'produtos',              'editar',  'produtos.alterar_preco'),
    ('pdv.produtos',         'ajustar_estoque', array['admin','gerente','estoquista'],             'produtos',              'inserir', 'produtos.ajustar_estoque'),
    ('pdv.produtos',         'ver_custo',       array['admin','gerente','vendedor','estoquista'],  'produtos',              'ver',     'produtos.ver_custo'),
    ('pdv.produtos',         'exportar',        array['admin','gerente','vendedor','estoquista'],  'produtos',              'ver',     'dados.exportar'),
    ('pdv.lotes',            'ver',             array['admin','gerente','estoquista'],             'lotes',                 'ver',     null),
    ('pdv.lotes',            'inserir',         array['admin','gerente','estoquista'],             'lotes',                 'inserir', null),
    ('pdv.lotes',            'editar',          array['admin','gerente','estoquista'],             'lotes',                 'editar',  null),
    ('pdv.lotes',            'excluir',         array['admin','gerente'],                          'lotes',                 'excluir', null),
    ('pdv.lotes',            'exportar',        array['admin','gerente','estoquista'],             'lotes',                 'ver',     'dados.exportar'),
    ('pdv.etiquetas',        'ver',             array['admin','gerente'],                          'produtos',              'ver',     null),
    ('pdv.etiquetas',        'inserir',         array['admin','gerente'],                          'produtos',              'inserir', null),
    ('pdv.etiquetas',        'editar',          array['admin','gerente'],                          'produtos',              'editar',  null),
    ('pdv.etiquetas',        'excluir',         array['admin','gerente'],                          'produtos',              'excluir', null),
    ('pdv.mercadologico',    'ver',             array['admin','gerente','estoquista'],             'produtos',              'ver',     null),
    ('pdv.mercadologico',    'inserir',         array['admin','gerente','estoquista'],             'produtos',              'inserir', null),
    ('pdv.mercadologico',    'editar',          array['admin','gerente','estoquista'],             'produtos',              'editar',  null),
    ('pdv.mercadologico',    'excluir',         array['admin','gerente','estoquista'],             'produtos',              'excluir', null),
    ('pdv.transferencias',   'ver',             array['admin','gerente','estoquista'],             'produtos',              'ver',     null),
    ('pdv.transferencias',   'inserir',         array['admin','gerente','estoquista'],             'produtos',              'inserir', null),
    ('pdv.transferencias',   'editar',          array['admin','gerente','estoquista'],             'produtos',              'editar',  null),
    ('pdv.mercado_livre',    'ver',             array['admin','gerente','estoquista'],             null,                    null,      null),
    ('pdv.pessoas',          'ver',             array['admin','gerente','vendedor','estoquista'],  'pessoas',               'ver',     null),
    ('pdv.pessoas',          'inserir',         array['admin','gerente','vendedor'],               'pessoas',               'inserir', null),
    ('pdv.pessoas',          'editar',          array['admin','gerente','vendedor'],               'pessoas',               'editar',  null),
    ('pdv.pessoas',          'excluir',         array['admin'],                                    'pessoas',               'excluir', null),
    ('pdv.pessoas',          'exportar',        array['admin','gerente','vendedor','estoquista'],  'pessoas',               'ver',     'dados.exportar'),
    ('pdv.pagamentos',       'ver',             array['admin','gerente'],                          'cadastros_financeiros', 'ver',     null),
    ('pdv.pagamentos',       'inserir',         array['admin','gerente'],                          'cadastros_financeiros', 'inserir', null),
    ('pdv.pagamentos',       'editar',          array['admin','gerente'],                          'cadastros_financeiros', 'editar',  null),
    ('pdv.pagamentos',       'excluir',         array['admin','gerente'],                          'cadastros_financeiros', 'excluir', null),
    ('pdv.contas_bancarias', 'ver',             array['admin','gerente'],                          'cadastros_financeiros', 'ver',     null),
    ('pdv.contas_bancarias', 'inserir',         array['admin','gerente'],                          'cadastros_financeiros', 'inserir', null),
    ('pdv.contas_bancarias', 'editar',          array['admin','gerente'],                          'cadastros_financeiros', 'editar',  null),
    ('pdv.plano_contas',     'ver',             array['admin','gerente'],                          'cadastros_financeiros', 'ver',     null),
    ('pdv.plano_contas',     'inserir',         array['admin','gerente'],                          'cadastros_financeiros', 'inserir', null),
    ('pdv.plano_contas',     'editar',          array['admin','gerente'],                          'cadastros_financeiros', 'editar',  null),
    ('pdv.plano_contas',     'excluir',         array['admin'],                                    'cadastros_financeiros', 'excluir', null),
    ('pdv.financeiro',       'ver',             array['admin','gerente'],                          'financeiro',            'ver',     null),
    ('pdv.financeiro',       'inserir',         array['admin','gerente'],                          'financeiro',            'inserir', null),
    ('pdv.financeiro',       'editar',          array['admin','gerente'],                          'financeiro',            'editar',  null),
    ('pdv.financeiro',       'exportar',        array['admin','gerente'],                          'financeiro',            'ver',     'dados.exportar'),
    ('pdv.dashboard',        'ver',             array['admin','gerente','vendedor','estoquista'],  null,                    null,      null),
    ('pdv.relatorios',       'ver',             array['admin','gerente'],                          'relatorios',            'ver',     null),
    ('pdv.relatorios',       'exportar',        array['admin','gerente'],                          'relatorios',            'ver',     'dados.exportar'),
    ('pdv.crm',              'ver',             array['admin','gerente','vendedor'],               'crm',                   'ver',     null),
    ('pdv.crm',              'inserir',         array['admin','gerente','vendedor'],               'crm',                   'inserir', null),
    ('pdv.crm',              'editar',          array['admin','gerente','vendedor'],               'crm',                   'editar',  null),
    ('pdv.crm',              'excluir',         array['admin','gerente'],                          'crm',                   'excluir', null),
    ('pdv.crm',              'exportar',        array['admin','gerente','vendedor'],               'crm',                   'ver',     'dados.exportar')
  )
  -- FIM_REGRA_LEGADO_PDV
  insert into public.usuario_permissoes (user_id, unidade_id, tela_codigo, acao, permitido, atualizado_por)
  select ur.user_id, ul.loja_id, r.tela, r.acao,
         coalesce((select ut.permitido from public.usuario_telas ut where ut.user_id = ur.user_id and ut.tela_codigo = r.tela), false)
         and ur.role::text = any (r.perfis)
         and (r.area is null or coalesce((
               select case r.area_acao when 'ver' then p.ver when 'inserir' then p.inserir when 'editar' then p.editar when 'excluir' then p.excluir end
               from public.permissoes p where p.user_id = ur.user_id and p.modulo = r.area), true))
         and (r.chave is null or coalesce((select a.permitido from public.permissoes_acoes a where a.user_id = ur.user_id and a.chave = r.chave), true)),
         null
  from public.user_roles ur
  join public.usuario_lojas ul on ul.user_id = ur.user_id
  join public.lojas l on l.id = ul.loja_id and l.ativo and 'pdv' = any (l.sistemas)
  cross join regra r
  where ur.role <> 'admin'
    and exists (select 1 from public.usuario_telas ut join public.telas t on t.codigo = ut.tela_codigo
                where ut.user_id = ur.user_id and ut.permitido and t.app = 'pdv');
  get diagnostics n_pdv = row_count;

  if to_regclass('rh.empresa_membros') is not null then
    -- REGRA_LEGADO_RH (tela, ação, só Dono/Admin da empresa?)
    execute $q$
      with regra (tela, acao, so_gestor) as (values
        ('rh.painel',    'ver',      false),
        ('rh.painel',    'inserir',  false),
        ('rh.painel',    'editar',   false),
        ('rh.painel',    'exportar', false),
        ('rh.historico', 'ver',      false),
        ('rh.historico', 'editar',   false),
        ('rh.global',    'ver',      false),
        ('rh.global',    'exportar', false),
        ('rh.empresas',  'ver',      false),
        ('rh.empresas',  'editar',   true)
      )
      insert into public.usuario_permissoes (user_id, unidade_id, tela_codigo, acao, permitido, atualizado_por)
      select m.user_id, rl.unidade_id, r.tela, r.acao,
             coalesce((select ut.permitido from public.usuario_telas ut where ut.user_id = m.user_id and ut.tela_codigo = r.tela), false)
             and (not r.so_gestor or m.papel in ('owner', 'admin')),
             null
      from rh.empresa_membros m
      join rh.lojas rl on rl.empresa_id = m.empresa_id and rl.unidade_id is not null
      cross join regra r
      where not exists (select 1 from public.user_roles ur where ur.user_id = m.user_id and ur.role = 'admin')
      on conflict (user_id, unidade_id, tela_codigo, acao) do update set permitido = public.usuario_permissoes.permitido or excluded.permitido
    $q$;
    get diagnostics n_rh = row_count;
  end if;

  return n_pdv + n_rh;
end;
$$;
revoke all on function public.sincronizar_permissoes_legado() from public, anon;
grant execute on function public.sincronizar_permissoes_legado() to authenticated;

select public.sincronizar_permissoes_legado();
