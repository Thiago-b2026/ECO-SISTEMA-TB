-- =====================================================================
-- CHECK LIST OPERACIONAL – etapa 13: TEMPO DE EXECUÇÃO E COMPARATIVO
-- Aplicar DEPOIS de 20261110000001_checklist_schema.sql (já aplicada em produção em 10/11/2026).
-- IDEMPOTENTE e SEM APAGAR DADOS: só acrescenta colunas, uma tabela, e troca funções (create or replace).
-- NÃO APLICAR sem OK do usuário.
--  - respostas: iniciado_em (1º toque no item), concluido_em (item completo) e duracao_seg (calculada)
--  - execucoes: tempo_pausado_seg + pausas (app em 2º plano / saiu e voltou) e tempo_ativo_seg (calculado)
--  - config_tempos: limites por empresa (acima +20%, muito acima +50%, rápido demais < 30%)
--  - sync_execucao: grava os tempos; "última gravação vence" NUNCA apaga o iniciado_em mais antigo
--  - dados_tempos: tempos brutos (só onde a pessoa é supervisor+, respeitando a empresa). As situações
--    e comparativos são calculados no app (src/domain/tempos.ts), iguais no Supabase e no modo demonstração.
--  - O tempo padrão (do checklist e de cada item) fica no conteúdo da VERSÃO (tempo_padrao_min).
-- =====================================================================

-- 1. tempos de cada item
alter table checklist.respostas add column if not exists iniciado_em timestamptz;
alter table checklist.respostas add column if not exists concluido_em timestamptz;
alter table checklist.respostas add column if not exists duracao_seg int
  generated always as (case when iniciado_em is null or concluido_em is null then null
                            else greatest(0, extract(epoch from (concluido_em - iniciado_em)))::int end) stored;

-- 2. pausas da execução (tempo total × tempo ativo)
alter table checklist.execucoes add column if not exists tempo_pausado_seg int not null default 0;
alter table checklist.execucoes add column if not exists pausas jsonb not null default '[]';
alter table checklist.execucoes add column if not exists tempo_ativo_seg int
  generated always as (case when fim_em is null then null
                            else greatest(0, extract(epoch from (fim_em - inicio_em))::int - coalesce(tempo_pausado_seg, 0)) end) stored;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'execucoes_tempo_pausado_ok') then
    alter table checklist.execucoes add constraint execucoes_tempo_pausado_ok check (tempo_pausado_seg >= 0);
  end if;
end $$;

-- 3. limites por empresa (sem linha = padrão 20 / 50 / 30)
create table if not exists checklist.config_tempos (
  rede_id          uuid primary key references public.redes(id),
  acima_pct        int not null default 20 check (acima_pct between 1 and 500),
  muito_acima_pct  int not null default 50 check (muito_acima_pct between 1 and 1000),
  rapido_pct       int not null default 30 check (rapido_pct between 1 and 99),
  atualizado_em    timestamptz not null default now(),
  check (muito_acima_pct > acima_pct)
);
alter table checklist.config_tempos enable row level security;
drop policy if exists config_tempos_ler on checklist.config_tempos;
create policy config_tempos_ler on checklist.config_tempos for select to authenticated using (checklist.na_rede(rede_id));
drop policy if exists config_tempos_gravar on checklist.config_tempos;
create policy config_tempos_gravar on checklist.config_tempos for all to authenticated
  using (checklist.e_gestor(rede_id)) with check (checklist.e_gestor(rede_id));
grant select, insert, update on checklist.config_tempos to authenticated;
grant all on checklist.config_tempos to service_role;

-- 4. sincronização com tempos (mesmas regras de antes + tempos; idempotente)
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
    -- pausas: o tempo parado só cresce (reenvio antigo não diminui)
    if (_e ? 'tempo_pausado_seg') and coalesce((_e ->> 'tempo_pausado_seg')::int, 0) > ex.tempo_pausado_seg then
      update checklist.execucoes set tempo_pausado_seg = (_e ->> 'tempo_pausado_seg')::int,
        pausas = coalesce(_e -> 'pausas', pausas) where id = v_id;
    end if;
    for r in select * from jsonb_array_elements(coalesce(_respostas, '[]')) loop
      insert into checklist.respostas (id, execucao_id, item_id, valor, observacao, respondido_em, lat, lng, iniciado_em, concluido_em)
      values ((r ->> 'id')::uuid, v_id, r ->> 'item_id', r -> 'valor', r ->> 'observacao',
              coalesce((r ->> 'respondido_em')::timestamptz, now()), (r ->> 'lat')::float8, (r ->> 'lng')::float8,
              (r ->> 'iniciado_em')::timestamptz, (r ->> 'concluido_em')::timestamptz)
      on conflict (execucao_id, item_id) do update
        set valor = excluded.valor, observacao = excluded.observacao, respondido_em = excluded.respondido_em,
            lat = excluded.lat, lng = excluded.lng, concluido_em = excluded.concluido_em
        where excluded.respondido_em >= checklist.respostas.respondido_em;
      if found then n_resp := n_resp + 1; end if;
      -- o INÍCIO do item é sempre o mais antigo conhecido (nunca é apagado nem empurrado para frente)
      update checklist.respostas set iniciado_em = least(coalesce(iniciado_em, (r ->> 'iniciado_em')::timestamptz),
                                                         coalesce((r ->> 'iniciado_em')::timestamptz, iniciado_em))
       where execucao_id = v_id and item_id = r ->> 'item_id' and (r ->> 'iniciado_em') is not null;
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

-- 5. tempos brutos do período (supervisor+ da unidade; filtro opcional por empresa e unidade)
create or replace function checklist.dados_tempos(_de date, _ate date, _rede uuid default null, _loja uuid default null)
returns jsonb language sql stable security definer set search_path = checklist, public as $$
  with lojas as (
    select l.id, l.nome, l.rede_id from public.lojas l
    where (_loja is null or l.id = _loja) and (_rede is null or l.rede_id = _rede) and checklist.pode(l.id, 'supervisor')
  ),
  e as (
    select e.*, v.conteudo, v.numero versao, m.nome modelo, lj.nome loja, lj.rede_id
    from checklist.execucoes e
    join lojas lj on lj.id = e.loja_id
    join checklist.modelo_versoes v on v.id = e.versao_id
    join checklist.modelos m on m.id = e.modelo_id
    where e.status in ('concluida', 'validada') and e.fim_em is not null
      and (e.inicio_em at time zone 'America/Sao_Paulo')::date between _de and _ate
  )
  select jsonb_build_object(
    'config', coalesce((select jsonb_agg(to_jsonb(c)) from checklist.config_tempos c where c.rede_id in (select distinct rede_id from lojas)), '[]'),
    'execucoes', coalesce((select jsonb_agg(jsonb_build_object(
        'execucao_id', e.id, 'modelo_id', e.modelo_id, 'modelo', e.modelo, 'versao_id', e.versao_id, 'versao', e.versao,
        'loja_id', e.loja_id, 'loja', e.loja, 'rede_id', e.rede_id, 'usuario_id', e.usuario_id,
        'pessoa', coalesce((select mb.nome from checklist.membros mb where mb.usuario_id = e.usuario_id and mb.rede_id = e.rede_id limit 1), 'Usuário'),
        'inicio_em', e.inicio_em, 'fim_em', e.fim_em, 'total_seg', e.duracao_seg, 'pausado_seg', e.tempo_pausado_seg,
        'ativo_seg', e.tempo_ativo_seg, 'status', e.status,
        'padrao_seg', case when jsonb_typeof(e.conteudo -> 'tempo_padrao_min') = 'number' then round((e.conteudo ->> 'tempo_padrao_min')::numeric * 60) end
      ) order by e.inicio_em) from e), '[]'),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'execucao_id', e.id, 'item_id', x.item ->> 'id', 'texto', x.item ->> 'texto', 'secao_id', x.secao_id, 'ordem', x.ordem,
        'iniciado_em', r.iniciado_em, 'concluido_em', r.concluido_em, 'duracao_seg', r.duracao_seg,
        'padrao_seg', case when jsonb_typeof(x.item -> 'tempo_padrao_min') = 'number' then round((x.item ->> 'tempo_padrao_min')::numeric * 60) end
      ) order by e.inicio_em, x.ordem)
      from e cross join lateral checklist._itens(e.conteudo) x
      join checklist.respostas r on r.execucao_id = e.id and r.item_id = x.item ->> 'id'
      where r.iniciado_em is not null), '[]')
  );
$$;

revoke execute on function checklist.dados_tempos(date, date, uuid, uuid) from public, anon;
grant execute on function checklist.dados_tempos(date, date, uuid, uuid) to authenticated, service_role;
revoke execute on function checklist.sync_execucao(jsonb, jsonb, jsonb) from public, anon;
grant execute on function checklist.sync_execucao(jsonb, jsonb, jsonb) to authenticated, service_role;
