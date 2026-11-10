-- =====================================================================
-- CHECK LIST OPERACIONAL – schema "checklist" (Ecossistema TB)
-- Banco: Supabase ECO-SISTEMA-TB. NÃO APLICAR sem OK do usuário.
-- Depende do que já existe no banco: auth.users, auth.uid(), public.lojas, public.is_admin(),
-- storage.buckets / storage.objects. As telas e o sistema ficam na migration do PDV
-- (GESTAO SALVADOS/supabase/migrations/20261110000023_checklist_telas.sql).
--
-- Regras (docs/plano-app-checklist-mobile.md, seção 7):
--  A versões de modelo imutáveis depois de publicadas
--  B pontuação 100 × Σ(peso×fator) ÷ Σ(pesos aplicáveis); sem aplicável = null
--  C "atrasada" é CALCULADA (views v_tarefas / v_planos), nunca gravada
--  D plano: aberto → em_andamento → aguardando_validacao → concluido (+ cancelado); só por funções
--  E checklist.historico; nada com histórico é apagado
--  F concluir só sem pendências (o banco confere de novo)
--  I timestamptz (UTC); data de referência em America/Sao_Paulo; bucket privado de fotos
-- =====================================================================

create schema if not exists checklist;

-- ---------------------------------------------------------------------
-- 1. PERFIS (membros por unidade)
-- ---------------------------------------------------------------------
create table checklist.membros (
  usuario_id uuid not null references auth.users(id),
  loja_id    uuid not null references public.lojas(id),
  perfil     text not null check (perfil in ('operador', 'supervisor', 'gestor')),
  nome       text not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  primary key (usuario_id, loja_id)
);
create index membros_loja_idx on checklist.membros (loja_id);

create or replace function checklist.nivel(_perfil text)
returns int language sql immutable as $$
  select case _perfil when 'operador' then 1 when 'supervisor' then 2 when 'gestor' then 3 else 0 end;
$$;

-- perfil do usuário logado na unidade (admin do Ecossistema = gestor em todas)
create or replace function checklist.meu_perfil(_loja uuid)
returns text language sql stable security definer set search_path = checklist, public as $$
  select case
    when auth.uid() is null then null
    when public.is_admin() then 'gestor'
    else (select m.perfil from checklist.membros m where m.usuario_id = auth.uid() and m.loja_id = _loja and m.ativo)
  end;
$$;

create or replace function checklist.pode(_loja uuid, _minimo text)
returns boolean language sql stable security definer set search_path = checklist, public as $$
  select coalesce(checklist.nivel(checklist.meu_perfil(_loja)) >= checklist.nivel(_minimo), false);
$$;

-- gestor em alguma unidade (ou admin): administra os modelos
create or replace function checklist.e_gestor()
returns boolean language sql stable security definer set search_path = checklist, public as $$
  select auth.uid() is not null and (public.is_admin() or exists (
    select 1 from checklist.membros m where m.usuario_id = auth.uid() and m.perfil = 'gestor' and m.ativo));
$$;

-- unidades do usuário logado no Check List, com o perfil
create or replace function checklist.minhas_lojas()
returns table (loja_id uuid, nome text, perfil text) language sql stable security definer set search_path = checklist, public as $$
  select l.id, l.nome, checklist.meu_perfil(l.id)
  from public.lojas l
  where l.ativo and checklist.meu_perfil(l.id) is not null
  order by l.nome;
$$;

-- coloca alguém (que JÁ tem login no Ecossistema) na equipe de uma unidade. Só o gestor.
-- Não cria conta: quem cria usuário é o admin, no Portal.
create or replace function checklist.definir_membro(_email text, _loja uuid, _perfil text, _nome text, _ativo boolean default true)
returns uuid language plpgsql security definer set search_path = checklist, public, auth as $$
declare v_user uuid;
begin
  if not checklist.pode(_loja, 'gestor') then raise exception 'Só o gestor define a equipe.' using errcode = '42501'; end if;
  if _perfil not in ('operador', 'supervisor', 'gestor') then raise exception 'Perfil inválido.' using errcode = 'P0001'; end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(_email));
  if v_user is null then
    raise exception 'Não existe login com o e-mail %. Peça ao admin para criar o usuário no Portal.', _email using errcode = 'P0002';
  end if;
  insert into checklist.membros (usuario_id, loja_id, perfil, nome, ativo)
  values (v_user, _loja, _perfil, coalesce(nullif(trim(_nome), ''), _email), coalesce(_ativo, true))
  on conflict (usuario_id, loja_id) do update set perfil = excluded.perfil, nome = excluded.nome, ativo = excluded.ativo;
  return v_user;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. HISTÓRICO (regra E) – só se insere por funções/gatilhos
-- ---------------------------------------------------------------------
create table checklist.historico (
  id            bigint generated always as identity primary key,
  tabela        text not null,
  registro_id   uuid not null,
  loja_id       uuid,
  acao          text not null,
  autor         uuid default auth.uid(),
  data          timestamptz not null default now(),
  antes         jsonb,
  depois        jsonb,
  justificativa text
);
create index historico_registro_idx on checklist.historico (registro_id);

create or replace function checklist._hist(_tabela text, _id uuid, _loja uuid, _acao text, _antes jsonb, _depois jsonb, _just text default null)
returns void language sql security definer set search_path = checklist, public as $$
  insert into checklist.historico (tabela, registro_id, loja_id, acao, autor, antes, depois, justificativa)
  values (_tabela, _id, _loja, _acao, auth.uid(), _antes, _depois, nullif(trim(coalesce(_just, '')), ''));
$$;

-- nada com histórico é apagado / histórico não muda
create or replace function checklist._bloqueia_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Registros do Check List não são apagados: arquive, desative ou cancele.' using errcode = 'P0001';
end;
$$;
create or replace function checklist._historico_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'O histórico não pode ser alterado.' using errcode = 'P0001';
end;
$$;
create trigger trg_historico_imutavel before update or delete on checklist.historico
  for each row execute function checklist._historico_imutavel();
create trigger trg_membros_sem_delete before delete on checklist.membros
  for each row execute function checklist._bloqueia_delete();

-- ---------------------------------------------------------------------
-- 3. MODELOS VERSIONADOS (regra A)
-- ---------------------------------------------------------------------
create table checklist.modelos (
  id              uuid primary key default gen_random_uuid(),
  codigo          text unique,
  nome            text not null,
  descricao       text,
  categoria       text not null default 'rotina',
  perfil_executor text not null default 'operador' check (perfil_executor in ('operador', 'supervisor', 'gestor')),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  criado_por      uuid default auth.uid()
);
create trigger trg_modelos_sem_delete before delete on checklist.modelos
  for each row execute function checklist._bloqueia_delete();

create table checklist.modelo_versoes (
  id            uuid primary key default gen_random_uuid(),
  modelo_id     uuid not null references checklist.modelos(id),
  numero        int  not null check (numero > 0),
  status        text not null default 'rascunho' check (status in ('rascunho', 'publicada', 'arquivada')),
  conteudo      jsonb not null check (jsonb_typeof(conteudo -> 'secoes') = 'array'),
  criado_em     timestamptz not null default now(),
  criado_por    uuid default auth.uid(),
  publicada_em  timestamptz,
  publicada_por uuid,
  unique (modelo_id, numero)
);
-- no máximo UMA versão publicada por modelo
create unique index modelo_versoes_uma_publicada on checklist.modelo_versoes (modelo_id) where status = 'publicada';

create or replace function checklist._versao_imutavel()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'Versão % já publicada: não pode ser apagada (só arquivada).', old.numero using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status <> 'rascunho' and (new.conteudo is distinct from old.conteudo or new.numero <> old.numero or new.modelo_id <> old.modelo_id) then
    raise exception 'Versão % já publicada: não pode ser alterada. Crie um rascunho.', old.numero using errcode = 'P0001';
  end if;
  if old.status = 'arquivada' and new.status <> 'arquivada' then
    raise exception 'Versão arquivada não volta a ser publicada.' using errcode = 'P0001';
  end if;
  if old.status = 'publicada' and new.status not in ('publicada', 'arquivada') then
    raise exception 'Versão publicada só pode ser arquivada.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_versao_imutavel before update or delete on checklist.modelo_versoes
  for each row execute function checklist._versao_imutavel();

-- cria um rascunho copiando a última versão (ou devolve o rascunho que já existe)
create or replace function checklist.criar_rascunho(_modelo uuid)
returns uuid language plpgsql security definer set search_path = checklist, public as $$
declare v_id uuid; v_ult record;
begin
  if not checklist.e_gestor() then raise exception 'Só o gestor edita modelos.' using errcode = '42501'; end if;
  select id into v_id from checklist.modelo_versoes where modelo_id = _modelo and status = 'rascunho';
  if v_id is not null then return v_id; end if;
  select * into v_ult from checklist.modelo_versoes where modelo_id = _modelo order by numero desc limit 1;
  insert into checklist.modelo_versoes (modelo_id, numero, status, conteudo)
  values (_modelo, coalesce(v_ult.numero, 0) + 1, 'rascunho', coalesce(v_ult.conteudo, '{"secoes": []}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function checklist.publicar_versao(_versao uuid)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare v record; v_ant record;
begin
  if not checklist.e_gestor() then raise exception 'Só o gestor publica modelos.' using errcode = '42501'; end if;
  select * into v from checklist.modelo_versoes where id = _versao for update;
  if v is null then raise exception 'Versão não encontrada.'; end if;
  if v.status = 'publicada' then return; end if; -- idempotente
  if v.status <> 'rascunho' then raise exception 'Só um rascunho pode ser publicado.' using errcode = 'P0001'; end if;
  if not exists (select 1 from jsonb_array_elements(v.conteudo -> 'secoes') s, jsonb_array_elements(s -> 'itens') i) then
    raise exception 'O modelo precisa de pelo menos um item.' using errcode = 'P0001';
  end if;
  select * into v_ant from checklist.modelo_versoes where modelo_id = v.modelo_id and status = 'publicada' for update;
  if v_ant is not null then
    update checklist.modelo_versoes set status = 'arquivada' where id = v_ant.id;
  end if;
  update checklist.modelo_versoes set status = 'publicada', publicada_em = now(), publicada_por = auth.uid() where id = _versao;
  perform checklist._hist('modelo_versoes', _versao, null, 'publicada',
    case when v_ant is null then null else jsonb_build_object('versao_anterior', v_ant.numero) end,
    jsonb_build_object('modelo_id', v.modelo_id, 'numero', v.numero));
end;
$$;

-- ---------------------------------------------------------------------
-- 4. REGRAS DE ITEM EM SQL (iguais a src/domain/regras.ts)
-- ---------------------------------------------------------------------
-- itens de um conteúdo, com a seção e o setor herdado da seção
create or replace function checklist._itens(_conteudo jsonb)
returns table (secao_id text, ordem bigint, item jsonb)
language sql immutable as $$
  select s.value ->> 'id',
         (s.ordinality * 1000 + i.ordinality),
         case when i.value ? 'setor' or not (s.value ? 'setor') then i.value
              else i.value || jsonb_build_object('setor', s.value -> 'setor') end
  from jsonb_array_elements(_conteudo -> 'secoes') with ordinality s
  cross join lateral jsonb_array_elements(s.value -> 'itens') with ordinality i;
$$;

create or replace function checklist._sem_resposta(_valor jsonb)
returns boolean language sql immutable as $$
  select case
    when _valor is null or _valor = 'null'::jsonb or not (_valor ? 'v') then true
    when _valor ->> 'tipo' = 'texto' then trim(coalesce(_valor ->> 'v', '')) = ''
    when _valor ->> 'tipo' = 'multipla' then jsonb_array_length(coalesce(_valor -> 'v', '[]')) = 0
    when _valor ->> 'tipo' = 'assinatura' then coalesce(_valor ->> 'v', '') = ''
    else false
  end;
$$;

-- fator 0..1; null = fora do cálculo
create or replace function checklist._fator(_item jsonb, _valor jsonb)
returns numeric language plpgsql immutable as $$
declare t text := _item ->> 'tipo'; v jsonb; esperado boolean; n numeric;
begin
  if not coalesce((_item ->> 'pontua')::boolean, false) or checklist._sem_resposta(_valor) then return null; end if;
  v := _valor -> 'v';
  if t = 'conformidade' then
    return case v #>> '{}' when 'conforme' then 1 when 'parcial' then 0.5 when 'nao_conforme' then 0 else null end;
  elsif t = 'sim_nao' then
    if v = '"na"'::jsonb then return null; end if;
    esperado := coalesce((_item ->> 'resposta_esperada')::boolean, true);
    return case when v = to_jsonb(esperado) then 1 else 0 end;
  elsif t = 'numero' then
    if (_item -> 'min') is null and (_item -> 'max') is null then return null; end if;
    n := (v #>> '{}')::numeric;
    return case when ((_item -> 'min') is null or n >= (_item ->> 'min')::numeric)
                 and ((_item -> 'max') is null or n <= (_item ->> 'max')::numeric) then 1 else 0 end;
  end if;
  return null;
end;
$$;

create or replace function checklist._nao_conforme(_item jsonb, _valor jsonb)
returns boolean language plpgsql immutable as $$
declare t text := _item ->> 'tipo'; v jsonb;
begin
  if checklist._sem_resposta(_valor) then return false; end if;
  v := _valor -> 'v';
  if t = 'conformidade' then return v #>> '{}' in ('nao_conforme', 'parcial'); end if;
  if t = 'sim_nao' then
    return v <> '"na"'::jsonb and v <> to_jsonb(coalesce((_item ->> 'resposta_esperada')::boolean, true));
  end if;
  if t = 'numero' then return checklist._fator(_item || '{"pontua": true}', _valor) = 0; end if;
  return false;
end;
$$;

-- visível? (_itens: objeto id→item · _resp: objeto item_id→valor · _dow: 0=domingo)
create or replace function checklist._visivel(_item jsonb, _itens jsonb, _resp jsonb, _dow int, _prof int default 0)
returns boolean language plpgsql immutable as $$
declare cond jsonb; ref jsonb; v jsonb;
begin
  if jsonb_typeof(_item -> 'dias_semana') = 'array' and jsonb_array_length(_item -> 'dias_semana') > 0
     and not (_item -> 'dias_semana') @> to_jsonb(_dow) then
    return false;
  end if;
  cond := _item -> 'condicao';
  if cond is null or cond = 'null'::jsonb then return true; end if;
  if _prof > 20 then return false; end if;
  ref := _itens -> (cond ->> 'item_id');
  if ref is null or not checklist._visivel(ref, _itens, _resp, _dow, _prof + 1) then return false; end if;
  v := _resp -> (ref ->> 'id') -> 'v';
  if v is null or v = 'null'::jsonb then return false; end if;
  if ref ->> 'tipo' = 'multipla' then
    return exists (select 1 from jsonb_array_elements(cond -> 'valores') x where v @> jsonb_build_array(x.value));
  end if;
  return exists (select 1 from jsonb_array_elements(cond -> 'valores') x where x.value = v);
end;
$$;

-- pontuação de um conteúdo com respostas (objeto item_id→valor)
create or replace function checklist.calcular_pontuacao(_conteudo jsonb, _resp jsonb, _dow int)
returns table (percentual numeric, obtidos numeric, possiveis numeric)
language sql immutable as $$
  with it as (select item from checklist._itens(_conteudo)),
       mapa as (select coalesce(jsonb_object_agg(item ->> 'id', item), '{}') m from it),
       calc as (
         select (it.item ->> 'peso')::numeric peso, checklist._fator(it.item, _resp -> (it.item ->> 'id')) f
         from it, mapa
         where checklist._visivel(it.item, mapa.m, _resp, _dow)
       ),
       soma as (
         select coalesce(sum(peso * f) filter (where f is not null and peso > 0), 0) o,
                coalesce(sum(peso) filter (where f is not null and peso > 0), 0) p
         from calc
       )
  select case when p = 0 then null else round(100 * o / p, 2) end, o, p from soma;
$$;

-- ---------------------------------------------------------------------
-- 5. SETORES, AGENDAMENTOS, TAREFAS
-- ---------------------------------------------------------------------
create table checklist.setores (
  codigo text primary key,
  nome   text not null,
  ativo  boolean not null default true
);

create table checklist.agendamentos (
  id                 uuid primary key default gen_random_uuid(),
  modelo_id          uuid not null references checklist.modelos(id),
  loja_id            uuid not null references public.lojas(id),
  responsavel_id     uuid references auth.users(id),
  perfil_responsavel text check (perfil_responsavel in ('operador', 'supervisor', 'gestor')),
  frequencia         text not null check (frequencia in ('diaria', 'semanal', 'mensal')),
  dias_semana        int[] check (dias_semana <@ array[0,1,2,3,4,5,6]),
  dia_mes            int check (dia_mes between 1 and 31),
  dias_antes_fim_mes int check (dias_antes_fim_mes between 0 and 27),
  hora_inicio        time not null default '07:00',
  hora_limite        time not null default '18:00',
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now(),
  criado_por         uuid default auth.uid(),
  check (responsavel_id is not null or perfil_responsavel is not null),
  check (frequencia <> 'semanal' or coalesce(array_length(dias_semana, 1), 0) > 0),
  check (frequencia <> 'mensal' or dia_mes is not null or dias_antes_fim_mes is not null),
  check (hora_limite > hora_inicio)
);
create index agendamentos_loja_idx on checklist.agendamentos (loja_id);
create trigger trg_agendamentos_sem_delete before delete on checklist.agendamentos
  for each row execute function checklist._bloqueia_delete();

create table checklist.tarefas (
  id                  uuid primary key default gen_random_uuid(),
  agendamento_id      uuid references checklist.agendamentos(id),
  modelo_id           uuid not null references checklist.modelos(id),
  loja_id             uuid not null references public.lojas(id),
  responsavel_id      uuid references auth.users(id),
  perfil_responsavel  text check (perfil_responsavel in ('operador', 'supervisor', 'gestor')),
  data_ref            date not null,
  inicio_previsto     timestamptz,
  prazo               timestamptz not null,
  execucao_id         uuid,
  concluida_em        timestamptz,
  cancelada_em        timestamptz,
  motivo_cancelamento text,
  criado_em           timestamptz not null default now(),
  unique (agendamento_id, data_ref)
);
create index tarefas_loja_data_idx on checklist.tarefas (loja_id, data_ref);
create trigger trg_tarefas_sem_delete before delete on checklist.tarefas
  for each row execute function checklist._bloqueia_delete();

-- o agendamento vale para a data? (data local de São Paulo)
create or replace function checklist.agenda_vale(_a checklist.agendamentos, _data date)
returns boolean language sql immutable as $$
  select case _a.frequencia
    when 'diaria' then true
    when 'semanal' then extract(dow from _data)::int = any (_a.dias_semana)
    when 'mensal' then
      case when _a.dias_antes_fim_mes is not null
           then _data = ((date_trunc('month', _data) + interval '1 month - 1 day')::date - _a.dias_antes_fim_mes)
           else extract(day from _data)::int = least(_a.dia_mes,
                  extract(day from (date_trunc('month', _data) + interval '1 month - 1 day'))::int)
      end
    else false end;
$$;

-- gera as tarefas do dia (idempotente). Sem usuário (pg_cron) = todas as unidades.
create or replace function checklist.gerar_tarefas(_data date default null, _loja uuid default null)
returns int language plpgsql security definer set search_path = checklist, public as $$
declare d date := coalesce(_data, (now() at time zone 'America/Sao_Paulo')::date); n int;
begin
  insert into checklist.tarefas (agendamento_id, modelo_id, loja_id, responsavel_id, perfil_responsavel, data_ref, inicio_previsto, prazo)
  select a.id, a.modelo_id, a.loja_id, a.responsavel_id, a.perfil_responsavel, d,
         (d + a.hora_inicio) at time zone 'America/Sao_Paulo',
         (d + a.hora_limite) at time zone 'America/Sao_Paulo'
  from checklist.agendamentos a
  join checklist.modelos m on m.id = a.modelo_id and m.ativo
  where a.ativo
    and (_loja is null or a.loja_id = _loja)
    and (auth.uid() is null or checklist.meu_perfil(a.loja_id) is not null)
    and checklist.agenda_vale(a, d)
    and exists (select 1 from checklist.modelo_versoes v where v.modelo_id = a.modelo_id and v.status = 'publicada')
  on conflict (agendamento_id, data_ref) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function checklist.cancelar_tarefa(_id uuid, _motivo text)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare t record;
begin
  select * into t from checklist.tarefas where id = _id for update;
  if t is null then raise exception 'Tarefa não encontrada.'; end if;
  if not checklist.pode(t.loja_id, 'supervisor') then raise exception 'Só supervisor ou gestor cancela tarefa.' using errcode = '42501'; end if;
  if trim(coalesce(_motivo, '')) = '' then raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001'; end if;
  if t.cancelada_em is not null then return; end if;
  if t.concluida_em is not null then raise exception 'Tarefa já concluída não pode ser cancelada.' using errcode = 'P0001'; end if;
  update checklist.tarefas set cancelada_em = now(), motivo_cancelamento = trim(_motivo) where id = _id;
  perform checklist._hist('tarefas', _id, t.loja_id, 'cancelada', null, null, _motivo);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. EXECUÇÕES, RESPOSTAS, FOTOS (ids gerados no celular: reenvio não duplica)
-- ---------------------------------------------------------------------
create table checklist.execucoes (
  id                  uuid primary key,
  tarefa_id           uuid references checklist.tarefas(id),
  modelo_id           uuid not null references checklist.modelos(id),
  versao_id           uuid not null references checklist.modelo_versoes(id),
  loja_id             uuid not null references public.lojas(id),
  usuario_id          uuid not null references auth.users(id) default auth.uid(),
  inicio_em           timestamptz not null,
  fim_em              timestamptz,
  duracao_seg         int generated always as (case when fim_em is null then null else greatest(0, extract(epoch from (fim_em - inicio_em)))::int end) stored,
  status              text not null default 'em_andamento' check (status in ('em_andamento', 'concluida', 'validada', 'devolvida', 'cancelada')),
  pontuacao           numeric,
  pontos_obtidos      numeric,
  pontos_possiveis    numeric,
  lat                 double precision,
  lng                 double precision,
  precisao_m          double precision,
  assinatura_path     text,
  validado_por        uuid,
  validado_em         timestamptz,
  motivo_devolucao    text,
  motivo_cancelamento text,
  sincronizado_em     timestamptz not null default now(),
  check (fim_em is null or fim_em >= inicio_em)
);
create index execucoes_loja_idx on checklist.execucoes (loja_id, inicio_em);
create index execucoes_usuario_idx on checklist.execucoes (usuario_id);
create trigger trg_execucoes_sem_delete before delete on checklist.execucoes
  for each row execute function checklist._bloqueia_delete();
alter table checklist.tarefas add constraint tarefas_execucao_fk foreign key (execucao_id) references checklist.execucoes(id);

-- campos fixos depois de criada (quem, onde, qual versão)
create or replace function checklist._execucao_protege()
returns trigger language plpgsql as $$
begin
  if new.usuario_id <> old.usuario_id or new.loja_id <> old.loja_id or new.versao_id <> old.versao_id
     or new.modelo_id <> old.modelo_id or new.inicio_em <> old.inicio_em then
    raise exception 'Execução: usuário, unidade, versão e início não mudam.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_execucao_protege before update on checklist.execucoes
  for each row execute function checklist._execucao_protege();

-- a versão precisa ser a publicada do modelo no momento em que a execução é criada
create or replace function checklist._execucao_valida()
returns trigger language plpgsql security definer set search_path = checklist, public as $$
begin
  if not exists (select 1 from checklist.modelo_versoes v where v.id = new.versao_id and v.modelo_id = new.modelo_id and v.status in ('publicada', 'arquivada')) then
    raise exception 'Versão de modelo inválida.' using errcode = 'P0001';
  end if;
  if new.tarefa_id is not null and not exists (select 1 from checklist.tarefas t where t.id = new.tarefa_id and t.loja_id = new.loja_id and t.modelo_id = new.modelo_id) then
    raise exception 'Tarefa não confere com a execução.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_execucao_valida before insert on checklist.execucoes
  for each row execute function checklist._execucao_valida();

create table checklist.respostas (
  id            uuid primary key,
  execucao_id   uuid not null references checklist.execucoes(id),
  item_id       text not null,
  valor         jsonb,
  observacao    text,
  respondido_em timestamptz not null default now(),
  lat           double precision,
  lng           double precision,
  -- preenchidos pelo servidor ao concluir
  visivel       boolean,
  fator         numeric,
  peso          numeric,
  setor         text,
  nao_conforme  boolean,
  unique (execucao_id, item_id)
);
create trigger trg_respostas_sem_delete before delete on checklist.respostas
  for each row execute function checklist._bloqueia_delete();

create table checklist.planos_acao (
  id                  uuid primary key,
  execucao_id         uuid references checklist.execucoes(id),
  item_id             text,
  loja_id             uuid not null references public.lojas(id),
  setor               text,
  titulo              text not null,
  descricao           text,
  responsavel_id      uuid references auth.users(id),
  prazo               timestamptz not null,
  status              text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'aguardando_validacao', 'concluido', 'cancelado')),
  solucao             text,
  executado_por       uuid,
  enviado_em          timestamptz,
  validado_por        uuid,
  validado_em         timestamptz,
  motivo_cancelamento text,
  criado_por          uuid default auth.uid(),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create unique index planos_execucao_item_uq on checklist.planos_acao (execucao_id, item_id) where execucao_id is not null and item_id is not null;
create index planos_loja_idx on checklist.planos_acao (loja_id, status);
create trigger trg_planos_sem_delete before delete on checklist.planos_acao
  for each row execute function checklist._bloqueia_delete();

create table checklist.fotos (
  id           uuid primary key,
  execucao_id  uuid references checklist.execucoes(id),
  item_id      text,
  plano_id     uuid references checklist.planos_acao(id),
  loja_id      uuid not null references public.lojas(id),
  storage_path text not null unique,
  mime         text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes        int  not null check (bytes > 0 and bytes <= 5242880),
  tirada_em    timestamptz not null,
  lat          double precision,
  lng          double precision,
  precisao_m   double precision,
  enviado_por  uuid default auth.uid(),
  criado_em    timestamptz not null default now(),
  check (execucao_id is not null or plano_id is not null)
);
create index fotos_execucao_idx on checklist.fotos (execucao_id);
create trigger trg_fotos_sem_delete before delete on checklist.fotos
  for each row execute function checklist._bloqueia_delete();

-- id do plano automático: o MESMO no celular e no servidor (md5 de execução:item)
create or replace function checklist.id_plano(_execucao uuid, _item text)
returns uuid language sql immutable as $$
  select md5(_execucao::text || ':' || _item)::uuid;
$$;

-- pendências de uma execução (regra F) – iguais a src/domain/regras.ts → pendencias()
create or replace function checklist.pendencias_execucao(_execucao uuid)
returns table (item_id text, tipo text, mensagem text)
language plpgsql stable security definer set search_path = checklist, public as $$
declare e record; c jsonb; resp jsonb; obs jsonb; mapa jsonb; dow int; r record;
        nc boolean; nfotos int; exige_foto boolean; exige_obs boolean;
begin
  select ex.*, t.data_ref into e from checklist.execucoes ex left join checklist.tarefas t on t.id = ex.tarefa_id where ex.id = _execucao;
  if e is null then return; end if;
  select conteudo into c from checklist.modelo_versoes where id = e.versao_id;
  select coalesce(jsonb_object_agg(rr.item_id, rr.valor), '{}'), coalesce(jsonb_object_agg(rr.item_id, to_jsonb(rr.observacao)), '{}')
    into resp, obs from checklist.respostas rr where rr.execucao_id = _execucao;
  select coalesce(jsonb_object_agg(x.item ->> 'id', x.item), '{}') into mapa from checklist._itens(c) x;
  dow := extract(dow from coalesce(e.data_ref, (e.inicio_em at time zone 'America/Sao_Paulo')::date))::int;
  for r in select x.item from checklist._itens(c) x order by x.ordem loop
    if not checklist._visivel(r.item, mapa, resp, dow) then continue; end if;
    if coalesce((r.item ->> 'obrigatorio')::boolean, false) and r.item ->> 'tipo' <> 'foto'
       and checklist._sem_resposta(resp -> (r.item ->> 'id')) then
      item_id := r.item ->> 'id'; tipo := 'resposta'; mensagem := 'Falta responder'; return next;
      continue;
    end if;
    nc := checklist._nao_conforme(r.item, resp -> (r.item ->> 'id'));
    select count(*) into nfotos from checklist.fotos f where f.execucao_id = _execucao and f.item_id = r.item ->> 'id';
    exige_foto := case when r.item ->> 'tipo' = 'foto' then coalesce((r.item ->> 'obrigatorio')::boolean, false)
                       else r.item ->> 'foto' = 'sempre' or (r.item ->> 'foto' = 'se_nao_conforme' and nc) end;
    if exige_foto and nfotos = 0 then
      item_id := r.item ->> 'id'; tipo := 'foto'; mensagem := 'Falta a foto'; return next;
    end if;
    exige_obs := r.item ->> 'observacao' = 'sempre' or (r.item ->> 'observacao' = 'se_nao_conforme' and nc);
    if exige_obs and trim(coalesce(obs ->> (r.item ->> 'id'), '')) = '' then
      item_id := r.item ->> 'id'; tipo := 'observacao'; mensagem := 'Falta a observação'; return next;
    end if;
  end loop;
end;
$$;

-- SINCRONIZAÇÃO (idempotente): grava execução + respostas + fotos de uma vez.
-- Reenviar o mesmo pacote não duplica nada; depois de concluída, respostas/fotos reenviadas são ignoradas.
-- Última gravação vence por respondido_em.
create or replace function checklist.sync_execucao(_e jsonb, _respostas jsonb default '[]', _fotos jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = checklist, public as $$
declare v_id uuid := (_e ->> 'id')::uuid; ex record; n_resp int := 0; n_fotos int := 0; r jsonb; f jsonb;
begin
  if auth.uid() is null then raise exception 'Sem login.' using errcode = '42501'; end if;
  select * into ex from checklist.execucoes where id = v_id for update;
  if ex is null then
    if checklist.meu_perfil((_e ->> 'loja_id')::uuid) is null then
      raise exception 'Você não faz parte desta unidade.' using errcode = '42501';
    end if;
    insert into checklist.execucoes (id, tarefa_id, modelo_id, versao_id, loja_id, usuario_id, inicio_em, lat, lng, precisao_m)
    values (v_id, nullif(_e ->> 'tarefa_id', '')::uuid, (_e ->> 'modelo_id')::uuid, (_e ->> 'versao_id')::uuid, (_e ->> 'loja_id')::uuid,
            auth.uid(), (_e ->> 'inicio_em')::timestamptz, (_e ->> 'lat')::float8, (_e ->> 'lng')::float8, (_e ->> 'precisao_m')::float8);
    select * into ex from checklist.execucoes where id = v_id;
  elsif ex.usuario_id <> auth.uid() then
    raise exception 'Esta execução é de outra pessoa.' using errcode = '42501';
  end if;

  if ex.status in ('em_andamento', 'devolvida') then
    for r in select * from jsonb_array_elements(coalesce(_respostas, '[]')) loop
      insert into checklist.respostas (id, execucao_id, item_id, valor, observacao, respondido_em, lat, lng)
      values ((r ->> 'id')::uuid, v_id, r ->> 'item_id', r -> 'valor', r ->> 'observacao',
              coalesce((r ->> 'respondido_em')::timestamptz, now()), (r ->> 'lat')::float8, (r ->> 'lng')::float8)
      on conflict (execucao_id, item_id) do update
        set valor = excluded.valor, observacao = excluded.observacao, respondido_em = excluded.respondido_em,
            lat = excluded.lat, lng = excluded.lng
        where excluded.respondido_em >= checklist.respostas.respondido_em;
      if found then n_resp := n_resp + 1; end if;
    end loop;
    for f in select * from jsonb_array_elements(coalesce(_fotos, '[]')) loop
      if split_part(f ->> 'storage_path', '/', 1) <> ex.loja_id::text or split_part(f ->> 'storage_path', '/', 2) <> v_id::text then
        raise exception 'Caminho de foto inválido.' using errcode = 'P0001';
      end if;
      insert into checklist.fotos (id, execucao_id, item_id, loja_id, storage_path, mime, bytes, tirada_em, lat, lng, precisao_m)
      values ((f ->> 'id')::uuid, v_id, f ->> 'item_id', ex.loja_id, f ->> 'storage_path', f ->> 'mime', (f ->> 'bytes')::int,
              (f ->> 'tirada_em')::timestamptz, (f ->> 'lat')::float8, (f ->> 'lng')::float8, (f ->> 'precisao_m')::float8)
      on conflict (id) do nothing;
      if found then n_fotos := n_fotos + 1; end if;
    end loop;
  end if;
  return jsonb_build_object('status', ex.status, 'respostas', n_resp, 'fotos', n_fotos);
end;
$$;

-- foto da solução de um plano (idempotente)
create or replace function checklist.registrar_foto_plano(_f jsonb)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare p checklist.planos_acao := checklist._plano((_f ->> 'plano_id')::uuid);
begin
  if split_part(_f ->> 'storage_path', '/', 1) <> p.loja_id::text then raise exception 'Caminho de foto inválido.' using errcode = 'P0001'; end if;
  if exists (select 1 from checklist.fotos where id = (_f ->> 'id')::uuid) then return; end if;
  if p.status not in ('aberto', 'em_andamento') then raise exception 'Plano %: não aceita foto agora.', p.status using errcode = 'P0001'; end if;
  insert into checklist.fotos (id, plano_id, loja_id, storage_path, mime, bytes, tirada_em, lat, lng, precisao_m)
  values ((_f ->> 'id')::uuid, p.id, p.loja_id, _f ->> 'storage_path', _f ->> 'mime', (_f ->> 'bytes')::int,
          (_f ->> 'tirada_em')::timestamptz, (_f ->> 'lat')::float8, (_f ->> 'lng')::float8, (_f ->> 'precisao_m')::float8)
  on conflict (id) do nothing;
end;
$$;

-- responsável padrão do plano: o supervisor (ou gestor) ativo da unidade
create or replace function checklist._responsavel_padrao(_loja uuid)
returns uuid language sql stable security definer set search_path = checklist, public as $$
  select m.usuario_id from checklist.membros m
  where m.loja_id = _loja and m.ativo and m.perfil in ('supervisor', 'gestor')
  order by checklist.nivel(m.perfil), m.criado_em limit 1;
$$;

-- CONCLUIR (idempotente): confere pendências, pontua, cria os planos e fecha a tarefa
create or replace function checklist.concluir_execucao(_id uuid, _fim timestamptz, _assinatura_path text default null,
                                                       _lat double precision default null, _lng double precision default null)
returns jsonb language plpgsql security definer set search_path = checklist, public as $$
declare e record; c jsonb; resp jsonb; mapa jsonb; dow int; p record; lista text; n_planos int := 0; r record;
begin
  select ex.*, t.data_ref into e from checklist.execucoes ex left join checklist.tarefas t on t.id = ex.tarefa_id
  where ex.id = _id for update of ex;
  if e is null then raise exception 'Execução não encontrada.' using errcode = 'P0002'; end if;
  if e.usuario_id <> auth.uid() then raise exception 'Só quem executou pode concluir.' using errcode = '42501'; end if;
  if e.status in ('concluida', 'validada') then
    return jsonb_build_object('ok', true, 'ja_concluida', true, 'pontuacao', e.pontuacao);
  end if;
  if e.status not in ('em_andamento', 'devolvida') then raise exception 'Execução %: não pode ser concluída.', e.status using errcode = 'P0001'; end if;

  select string_agg(x.item_id || ' (' || x.mensagem || ')', '; ') into lista from checklist.pendencias_execucao(_id) x;
  if lista is not null then
    raise exception 'Há pendências obrigatórias: %', lista using errcode = 'P0001', hint = 'pendencias';
  end if;

  select conteudo into c from checklist.modelo_versoes where id = e.versao_id;
  select coalesce(jsonb_object_agg(rr.item_id, rr.valor), '{}') into resp from checklist.respostas rr where rr.execucao_id = _id;
  select coalesce(jsonb_object_agg(x.item ->> 'id', x.item), '{}') into mapa from checklist._itens(c) x;
  dow := extract(dow from coalesce(e.data_ref, (e.inicio_em at time zone 'America/Sao_Paulo')::date))::int;
  select * into p from checklist.calcular_pontuacao(c, resp, dow);

  -- grava visibilidade / fator / peso / setor em cada resposta (base do dashboard)
  update checklist.respostas rr set
    visivel = checklist._visivel(x.item, mapa, resp, dow),
    fator = case when checklist._visivel(x.item, mapa, resp, dow) then checklist._fator(x.item, rr.valor) end,
    peso = (x.item ->> 'peso')::numeric,
    setor = x.item ->> 'setor',
    nao_conforme = checklist._visivel(x.item, mapa, resp, dow) and checklist._nao_conforme(x.item, rr.valor)
  from checklist._itens(c) x
  where rr.execucao_id = _id and rr.item_id = x.item ->> 'id';

  update checklist.execucoes set status = 'concluida', fim_em = coalesce(_fim, now()), pontuacao = p.percentual,
    pontos_obtidos = p.obtidos, pontos_possiveis = p.possiveis,
    assinatura_path = coalesce(_assinatura_path, assinatura_path), lat = coalesce(_lat, lat), lng = coalesce(_lng, lng),
    motivo_devolucao = null, sincronizado_em = now()
  where id = _id;

  -- plano automático para não conforme (regra D/7) – id determinístico, sem duplicar
  for r in select x.item from checklist._itens(c) x
           where coalesce((x.item ->> 'gera_plano')::boolean, false)
             and checklist._visivel(x.item, mapa, resp, dow)
             and checklist._nao_conforme(x.item, resp -> (x.item ->> 'id')) loop
    insert into checklist.planos_acao (id, execucao_id, item_id, loja_id, setor, titulo, descricao, responsavel_id, prazo, criado_por)
    values (checklist.id_plano(_id, r.item ->> 'id'), _id, r.item ->> 'id', e.loja_id, r.item ->> 'setor',
            left(r.item ->> 'texto', 200),
            (select observacao from checklist.respostas where execucao_id = _id and item_id = r.item ->> 'id'),
            checklist._responsavel_padrao(e.loja_id), coalesce(_fim, now()) + interval '1 day', auth.uid())
    on conflict do nothing;
    if found then
      n_planos := n_planos + 1;
      perform checklist._hist('planos_acao', checklist.id_plano(_id, r.item ->> 'id'), e.loja_id, 'criado_automatico', null,
                              jsonb_build_object('execucao_id', _id, 'item_id', r.item ->> 'id'));
    end if;
  end loop;

  if e.tarefa_id is not null then
    update checklist.tarefas set concluida_em = coalesce(_fim, now()), execucao_id = _id where id = e.tarefa_id and concluida_em is null;
  end if;
  perform checklist._hist('execucoes', _id, e.loja_id, case when e.status = 'devolvida' then 'reenviada' else 'concluida' end,
                          jsonb_build_object('status', e.status), jsonb_build_object('status', 'concluida', 'pontuacao', p.percentual));
  return jsonb_build_object('ok', true, 'pontuacao', p.percentual, 'planos_criados', n_planos);
end;
$$;

-- o líder valida ou devolve a execução (I3). Ninguém valida a própria execução.
create or replace function checklist.validar_execucao(_id uuid, _aprovar boolean, _motivo text default null)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare e record;
begin
  select * into e from checklist.execucoes where id = _id for update;
  if e is null then raise exception 'Execução não encontrada.'; end if;
  if not checklist.pode(e.loja_id, 'supervisor') then raise exception 'Só supervisor ou gestor valida.' using errcode = '42501'; end if;
  if e.usuario_id = auth.uid() then raise exception 'Você não pode validar a sua própria execução.' using errcode = '42501'; end if;
  if _aprovar and e.status = 'validada' then return; end if;
  if not _aprovar and e.status = 'devolvida' then return; end if;
  if e.status <> 'concluida' then raise exception 'Só uma execução concluída pode ser validada ou devolvida.' using errcode = 'P0001'; end if;
  if _aprovar then
    update checklist.execucoes set status = 'validada', validado_por = auth.uid(), validado_em = now() where id = _id;
    perform checklist._hist('execucoes', _id, e.loja_id, 'validada', jsonb_build_object('status', e.status), jsonb_build_object('status', 'validada'));
  else
    if trim(coalesce(_motivo, '')) = '' then raise exception 'Informe o motivo da devolução.' using errcode = 'P0001'; end if;
    update checklist.execucoes set status = 'devolvida', motivo_devolucao = trim(_motivo), validado_por = null, validado_em = null where id = _id;
    if e.tarefa_id is not null then update checklist.tarefas set concluida_em = null where id = e.tarefa_id; end if;
    perform checklist._hist('execucoes', _id, e.loja_id, 'devolvida', jsonb_build_object('status', e.status), jsonb_build_object('status', 'devolvida'), _motivo);
  end if;
end;
$$;

create or replace function checklist.cancelar_execucao(_id uuid, _motivo text)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare e record;
begin
  select * into e from checklist.execucoes where id = _id for update;
  if e is null then raise exception 'Execução não encontrada.'; end if;
  if e.usuario_id <> auth.uid() and not checklist.pode(e.loja_id, 'supervisor') then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if trim(coalesce(_motivo, '')) = '' then raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001'; end if;
  if e.status = 'cancelada' then return; end if;
  if e.status in ('concluida', 'validada') then raise exception 'Execução concluída não pode ser cancelada.' using errcode = 'P0001'; end if;
  update checklist.execucoes set status = 'cancelada', motivo_cancelamento = trim(_motivo) where id = _id;
  perform checklist._hist('execucoes', _id, e.loja_id, 'cancelada', jsonb_build_object('status', e.status), jsonb_build_object('status', 'cancelada'), _motivo);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. PLANO DE AÇÃO – só por funções (regra D). Todas idempotentes.
-- ---------------------------------------------------------------------
create or replace function checklist._plano(_id uuid)
returns checklist.planos_acao language plpgsql security definer set search_path = checklist, public as $$
declare p checklist.planos_acao;
begin
  select * into p from checklist.planos_acao where id = _id for update;
  if p.id is null then raise exception 'Plano de ação não encontrado.' using errcode = 'P0002'; end if;
  if not (checklist.pode(p.loja_id, 'supervisor') or p.responsavel_id = auth.uid()) then
    raise exception 'Sem permissão neste plano de ação.' using errcode = '42501';
  end if;
  return p;
end;
$$;

create or replace function checklist.plano_iniciar(_id uuid)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare p checklist.planos_acao := checklist._plano(_id);
begin
  if p.status = 'em_andamento' then return; end if;
  if p.status <> 'aberto' then raise exception 'Só um plano aberto pode ser iniciado.' using errcode = 'P0001'; end if;
  update checklist.planos_acao set status = 'em_andamento', atualizado_em = now() where id = _id;
  perform checklist._hist('planos_acao', _id, p.loja_id, 'iniciado', jsonb_build_object('status', p.status), jsonb_build_object('status', 'em_andamento'));
end;
$$;

create or replace function checklist.plano_enviar_solucao(_id uuid, _solucao text)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare p checklist.planos_acao := checklist._plano(_id);
begin
  if trim(coalesce(_solucao, '')) = '' then raise exception 'Descreva a solução.' using errcode = 'P0001'; end if;
  if p.status = 'aguardando_validacao' and p.solucao = trim(_solucao) then return; end if;
  if p.status not in ('aberto', 'em_andamento') then raise exception 'Plano %: não aceita solução agora.', p.status using errcode = 'P0001'; end if;
  update checklist.planos_acao set status = 'aguardando_validacao', solucao = trim(_solucao), executado_por = auth.uid(),
    enviado_em = now(), atualizado_em = now() where id = _id;
  perform checklist._hist('planos_acao', _id, p.loja_id, 'solucao_enviada', jsonb_build_object('status', p.status),
                          jsonb_build_object('status', 'aguardando_validacao', 'solucao', trim(_solucao)));
end;
$$;

create or replace function checklist.plano_validar(_id uuid)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare p checklist.planos_acao := checklist._plano(_id);
begin
  if p.status = 'concluido' then return; end if;
  if not checklist.pode(p.loja_id, 'supervisor') then raise exception 'Só supervisor ou gestor valida.' using errcode = '42501'; end if;
  if p.status <> 'aguardando_validacao' then raise exception 'Só um plano aguardando validação pode ser concluído.' using errcode = 'P0001'; end if;
  if p.executado_por = auth.uid() then raise exception 'Quem executou não valida a própria solução.' using errcode = '42501'; end if;
  update checklist.planos_acao set status = 'concluido', validado_por = auth.uid(), validado_em = now(), atualizado_em = now() where id = _id;
  perform checklist._hist('planos_acao', _id, p.loja_id, 'validado', jsonb_build_object('status', p.status), jsonb_build_object('status', 'concluido'));
end;
$$;

create or replace function checklist.plano_rejeitar(_id uuid, _justificativa text)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare p checklist.planos_acao := checklist._plano(_id);
begin
  if not checklist.pode(p.loja_id, 'supervisor') then raise exception 'Só supervisor ou gestor rejeita.' using errcode = '42501'; end if;
  if trim(coalesce(_justificativa, '')) = '' then raise exception 'Informe a justificativa da rejeição.' using errcode = 'P0001'; end if;
  if p.status <> 'aguardando_validacao' then
    if p.status = 'em_andamento' then return; end if;
    raise exception 'Só um plano aguardando validação pode ser rejeitado.' using errcode = 'P0001';
  end if;
  if p.executado_por = auth.uid() then raise exception 'Quem executou não valida a própria solução.' using errcode = '42501'; end if;
  update checklist.planos_acao set status = 'em_andamento', atualizado_em = now() where id = _id;
  perform checklist._hist('planos_acao', _id, p.loja_id, 'rejeitado', jsonb_build_object('status', p.status, 'solucao', p.solucao),
                          jsonb_build_object('status', 'em_andamento'), _justificativa);
end;
$$;

create or replace function checklist.plano_cancelar(_id uuid, _motivo text)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare p checklist.planos_acao := checklist._plano(_id);
begin
  if p.status = 'cancelado' then return; end if;
  if not checklist.pode(p.loja_id, 'supervisor') then raise exception 'Só supervisor ou gestor cancela.' using errcode = '42501'; end if;
  if trim(coalesce(_motivo, '')) = '' then raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001'; end if;
  if p.status = 'concluido' then raise exception 'Plano concluído não pode ser cancelado.' using errcode = 'P0001'; end if;
  update checklist.planos_acao set status = 'cancelado', motivo_cancelamento = trim(_motivo), atualizado_em = now() where id = _id;
  perform checklist._hist('planos_acao', _id, p.loja_id, 'cancelado', jsonb_build_object('status', p.status), jsonb_build_object('status', 'cancelado'), _motivo);
end;
$$;

-- trocar prazo e/ou responsável exige justificativa
create or replace function checklist.plano_alterar(_id uuid, _prazo timestamptz, _responsavel uuid, _justificativa text)
returns void language plpgsql security definer set search_path = checklist, public as $$
declare p checklist.planos_acao := checklist._plano(_id);
begin
  if not checklist.pode(p.loja_id, 'supervisor') then raise exception 'Só supervisor ou gestor altera prazo ou responsável.' using errcode = '42501'; end if;
  if p.prazo is not distinct from coalesce(_prazo, p.prazo) and p.responsavel_id is not distinct from _responsavel then return; end if;
  if trim(coalesce(_justificativa, '')) = '' then raise exception 'Trocar prazo ou responsável exige justificativa.' using errcode = 'P0001'; end if;
  if p.status in ('concluido', 'cancelado') then raise exception 'Plano encerrado não pode ser alterado.' using errcode = 'P0001'; end if;
  if _responsavel is not null and not exists (select 1 from checklist.membros m where m.usuario_id = _responsavel and m.loja_id = p.loja_id and m.ativo) then
    raise exception 'O responsável precisa ser da equipe da unidade.' using errcode = 'P0001';
  end if;
  update checklist.planos_acao set prazo = coalesce(_prazo, prazo), responsavel_id = _responsavel, atualizado_em = now() where id = _id;
  perform checklist._hist('planos_acao', _id, p.loja_id, 'alterado',
    jsonb_build_object('prazo', p.prazo, 'responsavel_id', p.responsavel_id),
    jsonb_build_object('prazo', coalesce(_prazo, p.prazo), 'responsavel_id', _responsavel), _justificativa);
end;
$$;

-- plano manual (fora de checklist) – supervisor+
create or replace function checklist.plano_criar(_id uuid, _loja uuid, _titulo text, _descricao text, _responsavel uuid, _prazo timestamptz, _setor text default null)
returns void language plpgsql security definer set search_path = checklist, public as $$
begin
  if not checklist.pode(_loja, 'supervisor') then raise exception 'Só supervisor ou gestor cria plano.' using errcode = '42501'; end if;
  if trim(coalesce(_titulo, '')) = '' then raise exception 'Informe o título.' using errcode = 'P0001'; end if;
  insert into checklist.planos_acao (id, loja_id, titulo, descricao, responsavel_id, prazo, setor)
  values (_id, _loja, trim(_titulo), _descricao, _responsavel, _prazo, _setor) on conflict (id) do nothing;
  if found then perform checklist._hist('planos_acao', _id, _loja, 'criado', null, jsonb_build_object('titulo', _titulo)); end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. VIEWS COM SITUAÇÃO CALCULADA (regra C) – security_invoker: valem as políticas
-- ---------------------------------------------------------------------
create or replace view checklist.v_tarefas with (security_invoker = true) as
select t.*,
  case
    when t.cancelada_em is not null then 'cancelada'
    when t.concluida_em is not null then 'concluida'
    when t.prazo < now() then 'atrasada'
    when exists (select 1 from checklist.execucoes e where e.tarefa_id = t.id and e.status in ('em_andamento', 'devolvida')) then 'em_andamento'
    else 'pendente'
  end as situacao,
  (t.concluida_em is null and t.cancelada_em is null and t.prazo < now()) as atrasada
from checklist.tarefas t;

create or replace view checklist.v_planos with (security_invoker = true) as
select p.*,
  (p.status not in ('concluido', 'cancelado') and p.prazo < now()) as atrasado
from checklist.planos_acao p;

-- ---------------------------------------------------------------------
-- 9. DASHBOARD E RELATÓRIOS (só unidades onde o usuário é supervisor+)
-- ---------------------------------------------------------------------
create or replace function checklist.dashboard(_de date, _ate date, _loja uuid default null)
returns jsonb language sql stable security definer set search_path = checklist, public as $$
  with lojas as (
    select l.id from public.lojas l where (_loja is null or l.id = _loja) and checklist.pode(l.id, 'supervisor')
  ),
  t as (
    select t.*, (t.concluida_em is null and t.cancelada_em is null and t.prazo < now()) atrasada
    from checklist.tarefas t where t.loja_id in (select id from lojas) and t.data_ref between _de and _ate
  ),
  e as (
    select e.* from checklist.execucoes e
    where e.loja_id in (select id from lojas) and e.status in ('concluida', 'validada')
      and (e.inicio_em at time zone 'America/Sao_Paulo')::date between _de and _ate
  ),
  r as (
    select r.*, e.usuario_id, e.loja_id from checklist.respostas r join e on e.id = r.execucao_id
    where r.visivel and r.fator is not null and r.peso > 0
  )
  select jsonb_build_object(
    'tarefas_total',      (select count(*) from t where cancelada_em is null),
    'tarefas_concluidas', (select count(*) from t where concluida_em is not null),
    'tarefas_atrasadas',  (select count(*) from t where atrasada),
    'tarefas_pendentes',  (select count(*) from t where concluida_em is null and cancelada_em is null and not atrasada),
    'concluidas_no_prazo',(select count(*) from t where concluida_em is not null and concluida_em <= prazo),
    'execucoes',          (select count(*) from e),
    'tempo_medio_seg',    (select round(avg(duracao_seg)) from e),
    'conformidade',       (select case when sum(peso) = 0 then null else round(100 * sum(peso * fator) / sum(peso), 2) end from r),
    'planos_abertos',     (select count(*) from checklist.planos_acao p where p.loja_id in (select id from lojas) and p.status not in ('concluido', 'cancelado')),
    'planos_atrasados',   (select count(*) from checklist.planos_acao p where p.loja_id in (select id from lojas) and p.status not in ('concluido', 'cancelado') and p.prazo < now()),
    'por_setor', coalesce((select jsonb_agg(x order by x.setor) from (
        select coalesce(setor, 'Sem setor') setor, round(100 * sum(peso * fator) / sum(peso), 2) conformidade, count(*) itens,
               count(*) filter (where nao_conforme) nao_conformes
        from r group by 1) x), '[]'),
    'por_pessoa', coalesce((select jsonb_agg(x order by x.nome) from (
        select e.usuario_id, coalesce((select m.nome from checklist.membros m where m.usuario_id = e.usuario_id limit 1), 'Usuário') nome,
               count(*) execucoes, round(avg(e.duracao_seg)) tempo_medio_seg,
               (select round(100 * sum(r.peso * r.fator) / nullif(sum(r.peso), 0), 2) from r where r.usuario_id = e.usuario_id) conformidade,
               (select count(*) from t where t.concluida_em is not null and t.execucao_id in (select id from e e2 where e2.usuario_id = e.usuario_id) and t.concluida_em > t.prazo) concluidas_com_atraso
        from e group by e.usuario_id) x), '[]'),
    'por_loja', coalesce((select jsonb_agg(x) from (
        select l.id loja_id, l.nome,
               (select count(*) from t where t.loja_id = l.id and t.concluida_em is not null) concluidas,
               (select count(*) from t where t.loja_id = l.id and t.atrasada) atrasadas,
               (select round(100 * sum(r.peso * r.fator) / nullif(sum(r.peso), 0), 2) from r where r.loja_id = l.id) conformidade
        from public.lojas l where l.id in (select id from lojas) order by l.nome) x), '[]')
  );
$$;

create or replace function checklist.relatorio_execucoes(_de date, _ate date, _loja uuid default null)
returns table (execucao_id uuid, loja text, modelo text, versao int, pessoa text, data date, inicio timestamptz, fim timestamptz,
               duracao_seg int, status text, pontuacao numeric, nao_conformes bigint, planos bigint)
language sql stable security definer set search_path = checklist, public as $$
  select e.id, l.nome, m.nome, v.numero,
         coalesce((select mb.nome from checklist.membros mb where mb.usuario_id = e.usuario_id and mb.loja_id = e.loja_id), 'Usuário'),
         (e.inicio_em at time zone 'America/Sao_Paulo')::date, e.inicio_em, e.fim_em, e.duracao_seg, e.status, e.pontuacao,
         (select count(*) from checklist.respostas r where r.execucao_id = e.id and r.nao_conforme),
         (select count(*) from checklist.planos_acao p where p.execucao_id = e.id)
  from checklist.execucoes e
  join public.lojas l on l.id = e.loja_id
  join checklist.modelos m on m.id = e.modelo_id
  join checklist.modelo_versoes v on v.id = e.versao_id
  where (_loja is null or e.loja_id = _loja) and checklist.pode(e.loja_id, 'supervisor')
    and (e.inicio_em at time zone 'America/Sao_Paulo')::date between _de and _ate
  order by e.inicio_em;
$$;

-- ---------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------
alter table checklist.membros        enable row level security;
alter table checklist.historico      enable row level security;
alter table checklist.modelos        enable row level security;
alter table checklist.modelo_versoes enable row level security;
alter table checklist.setores        enable row level security;
alter table checklist.agendamentos   enable row level security;
alter table checklist.tarefas        enable row level security;
alter table checklist.execucoes      enable row level security;
alter table checklist.respostas      enable row level security;
alter table checklist.planos_acao    enable row level security;
alter table checklist.fotos          enable row level security;

-- membros: cada um vê a si; supervisor+ vê a equipe da unidade; gestor grava
create policy membros_ler on checklist.membros for select to authenticated
  using (usuario_id = auth.uid() or checklist.pode(loja_id, 'supervisor'));
create policy membros_inserir on checklist.membros for insert to authenticated
  with check (checklist.pode(loja_id, 'gestor'));
create policy membros_editar on checklist.membros for update to authenticated
  using (checklist.pode(loja_id, 'gestor')) with check (checklist.pode(loja_id, 'gestor'));

create policy historico_ler on checklist.historico for select to authenticated
  using (autor = auth.uid() or (loja_id is not null and checklist.pode(loja_id, 'supervisor')) or (loja_id is null and checklist.e_gestor()));

create policy modelos_ler on checklist.modelos for select to authenticated using (true);
create policy modelos_inserir on checklist.modelos for insert to authenticated with check (checklist.e_gestor());
create policy modelos_editar on checklist.modelos for update to authenticated using (checklist.e_gestor()) with check (checklist.e_gestor());

create policy versoes_ler on checklist.modelo_versoes for select to authenticated
  using (status <> 'rascunho' or checklist.e_gestor());
create policy versoes_inserir on checklist.modelo_versoes for insert to authenticated
  with check (checklist.e_gestor() and status = 'rascunho');
create policy versoes_editar on checklist.modelo_versoes for update to authenticated
  using (checklist.e_gestor() and status = 'rascunho') with check (status = 'rascunho');
create policy versoes_apagar_rascunho on checklist.modelo_versoes for delete to authenticated
  using (checklist.e_gestor() and status = 'rascunho');

create policy setores_ler on checklist.setores for select to authenticated using (true);
create policy setores_gravar on checklist.setores for all to authenticated using (checklist.e_gestor()) with check (checklist.e_gestor());

create policy agend_ler on checklist.agendamentos for select to authenticated
  using (checklist.meu_perfil(loja_id) is not null);
create policy agend_inserir on checklist.agendamentos for insert to authenticated
  with check (checklist.pode(loja_id, 'supervisor'));
create policy agend_editar on checklist.agendamentos for update to authenticated
  using (checklist.pode(loja_id, 'supervisor')) with check (checklist.pode(loja_id, 'supervisor'));

-- tarefas: supervisor+ vê a unidade; operador vê as suas (ou as do seu perfil sem responsável)
create policy tarefas_ler on checklist.tarefas for select to authenticated
  using (checklist.pode(loja_id, 'supervisor')
      or responsavel_id = auth.uid()
      or (responsavel_id is null and perfil_responsavel = checklist.meu_perfil(loja_id)));
create policy tarefas_inserir on checklist.tarefas for insert to authenticated
  with check (checklist.pode(loja_id, 'supervisor'));

create policy exec_ler on checklist.execucoes for select to authenticated
  using (usuario_id = auth.uid() or checklist.pode(loja_id, 'supervisor'));
create policy exec_inserir on checklist.execucoes for insert to authenticated
  with check (usuario_id = auth.uid() and status = 'em_andamento' and checklist.meu_perfil(loja_id) is not null);
create policy exec_editar on checklist.execucoes for update to authenticated
  using (usuario_id = auth.uid() and status in ('em_andamento', 'devolvida'))
  with check (usuario_id = auth.uid() and status in ('em_andamento', 'devolvida'));

create policy resp_ler on checklist.respostas for select to authenticated
  using (exists (select 1 from checklist.execucoes e where e.id = execucao_id));
create policy resp_inserir on checklist.respostas for insert to authenticated
  with check (exists (select 1 from checklist.execucoes e where e.id = execucao_id and e.usuario_id = auth.uid() and e.status in ('em_andamento', 'devolvida')));
create policy resp_editar on checklist.respostas for update to authenticated
  using (exists (select 1 from checklist.execucoes e where e.id = execucao_id and e.usuario_id = auth.uid() and e.status in ('em_andamento', 'devolvida')))
  with check (exists (select 1 from checklist.execucoes e where e.id = execucao_id and e.usuario_id = auth.uid() and e.status in ('em_andamento', 'devolvida')));

create policy planos_ler on checklist.planos_acao for select to authenticated
  using (checklist.pode(loja_id, 'supervisor') or responsavel_id = auth.uid() or criado_por = auth.uid());
-- sem insert/update direto: só pelas funções

create policy fotos_ler on checklist.fotos for select to authenticated
  using (checklist.meu_perfil(loja_id) is not null and (
    checklist.pode(loja_id, 'supervisor') or enviado_por = auth.uid()
    or exists (select 1 from checklist.execucoes e where e.id = execucao_id)
    or exists (select 1 from checklist.planos_acao p where p.id = plano_id)));
create policy fotos_inserir on checklist.fotos for insert to authenticated
  with check (
    (execucao_id is not null and exists (select 1 from checklist.execucoes e where e.id = execucao_id and e.loja_id = fotos.loja_id
       and e.usuario_id = auth.uid() and e.status in ('em_andamento', 'devolvida')))
    or (plano_id is not null and exists (select 1 from checklist.planos_acao p where p.id = plano_id and p.loja_id = fotos.loja_id
       and (p.responsavel_id = auth.uid() or checklist.pode(p.loja_id, 'supervisor')) and p.status in ('aberto', 'em_andamento'))));

-- ---------------------------------------------------------------------
-- 11. GRANTS (o schema precisa ser liberado em Exposed schemas – o usuário faz)
-- ---------------------------------------------------------------------
grant usage on schema checklist to authenticated, service_role;
grant select, insert, update on all tables in schema checklist to authenticated;
grant delete on checklist.modelo_versoes to authenticated;
grant all on all tables in schema checklist to service_role;
grant usage, select on all sequences in schema checklist to authenticated, service_role;
revoke all on all tables in schema checklist from anon;
revoke execute on all functions in schema checklist from public, anon;
grant execute on all functions in schema checklist to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 12. STORAGE: bucket privado de fotos (<loja>/<execução ou plano>/<foto>.jpg)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checklist-fotos', 'checklist-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function checklist._pasta_loja(_name text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function checklist._pasta_loja(text) to authenticated;

create policy "checklist fotos: membro envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'checklist-fotos' and checklist.meu_perfil(checklist._pasta_loja(name)) is not null);
create policy "checklist fotos: membro le" on storage.objects for select to authenticated
  using (bucket_id = 'checklist-fotos' and checklist.meu_perfil(checklist._pasta_loja(name)) is not null);

-- ---------------------------------------------------------------------
-- 13. SETORES iniciais + agenda diária automática (se pg_cron existir)
-- ---------------------------------------------------------------------
insert into checklist.setores (codigo, nome) values
  ('frente_caixa', 'Frente de caixa'), ('ofertas', 'Ofertas e marketing'), ('padaria', 'Padaria'),
  ('hortifruti', 'Hortifrúti'), ('acougue', 'Açougue'), ('laticinios', 'Laticínios'), ('frios', 'Frios'),
  ('bebidas', 'Bebidas'), ('loja', 'Loja (geral)'), ('gestao', 'Gestão e resultados'), ('administrativo', 'Administrativo')
on conflict do nothing;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('checklist_gerar_tarefas', '5 3 * * *', 'select checklist.gerar_tarefas()'); -- 00:05 em São Paulo (03:05 UTC)
  end if;
end $$;
