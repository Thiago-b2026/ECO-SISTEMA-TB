-- =====================================================================
-- Cadastro único de PESSOAS: cliente, fornecedor e/ou usuário do sistema
-- (marcações combináveis). Pessoa física (CPF) ou jurídica (CNPJ).
-- Se for usuário, user_id liga ao login (auth.users) criado pela
-- Edge Function admin-usuarios; o papel continua em user_roles.
-- Cadastro é da EMPRESA (compartilhado entre as lojas).
-- =====================================================================

create type public.tipo_pessoa as enum ('F', 'J');

create table public.pessoas (
  id               uuid primary key default gen_random_uuid(),
  tipo             public.tipo_pessoa not null,
  documento        text unique check (documento is null or documento ~ '^(\d{11}|\d{14})$'),
  nome             text not null,            -- nome (PF) ou razão social (PJ)
  nome_fantasia    text,
  ie               text,                      -- inscrição estadual
  im               text,                      -- inscrição municipal
  data_nascimento  date,
  email            text,
  telefone         text,
  celular          text,
  cep              text,
  logradouro       text,
  numero           text,
  complemento      text,
  bairro           text,
  cidade           text,
  uf               text check (uf is null or uf ~ '^[A-Z]{2}$'),
  cod_ibge         text,
  situacao_cadastral text,                    -- da Receita (PJ)
  atividade        text,                      -- CNAE principal (PJ)
  observacao       text,
  eh_cliente       boolean not null default false,
  eh_fornecedor    boolean not null default false,
  eh_usuario       boolean not null default false,
  user_id          uuid unique references auth.users(id) on delete set null,
  ativo            boolean not null default true,
  created_by       uuid references auth.users(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (eh_cliente or eh_fornecedor or eh_usuario),
  check ((tipo = 'F' and (documento is null or length(documento) = 11)) or (tipo = 'J' and (documento is null or length(documento) = 14)))
);
create index pessoas_nome_idx on public.pessoas using gin (to_tsvector('portuguese', nome || ' ' || coalesce(nome_fantasia, '')));
create index pessoas_flags_idx on public.pessoas (eh_cliente, eh_fornecedor, eh_usuario);
create trigger trg_pessoas_updated before update on public.pessoas
  for each row execute function public.set_updated_at();
alter table public.pessoas enable row level security;

-- Todos os logados consultam (PDV precisa achar cliente).
-- Vendedor cadastra/edita só CLIENTE; gestor cadastra tudo; usuário é ligado só pelo admin (Edge Function).
create policy "pessoas: ler" on public.pessoas for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','gerente','vendedor','estoquista']::public.app_role[]));
create policy "pessoas: criar" on public.pessoas for insert to authenticated
  with check (user_id is null and (public.is_gestor() or (public.pode_vender() and eh_cliente and not eh_fornecedor and not eh_usuario)));
create policy "pessoas: editar" on public.pessoas for update to authenticated
  using (public.is_gestor() or (public.pode_vender() and eh_cliente and not eh_fornecedor and not eh_usuario))
  with check (public.is_gestor() or (public.pode_vender() and eh_cliente and not eh_fornecedor and not eh_usuario));
create policy "pessoas: admin exclui" on public.pessoas for delete to authenticated using (public.is_admin());

-- Só o admin (via Edge Function, service_role) liga/desliga o login
create or replace function public.pessoas_protege_user()
returns trigger language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'O acesso ao sistema só é ligado pelo admin';
  end if;
  return new;
end;
$$;
create trigger trg_pessoas_protege_user before update on public.pessoas
  for each row execute function public.pessoas_protege_user();

-- Os usuários que já existem viram pessoas (marcadas como usuário)
insert into public.pessoas (tipo, nome, email, eh_usuario, user_id, ativo)
select 'F', p.nome, p.email, true, p.id, p.ativo from public.profiles p
on conflict (user_id) do nothing;

-- Venda pode ter cliente (opcional)
alter table public.vendas add column cliente_id uuid references public.pessoas(id) on delete set null;
