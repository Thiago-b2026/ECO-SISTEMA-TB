-- =====================================================================
-- Dados cadastrais de cada loja (filial): CNPJ, razão social, endereço…
-- Cada loja tem o seu CNPJ; vendas/caixa/estoque continuam separados por
-- loja_id. A visão "Todas as lojas" só CONSULTA (relatórios), não mistura.
-- =====================================================================

alter table public.lojas
  add column cnpj               text unique check (cnpj is null or cnpj ~ '^\d{14}$'),
  add column razao_social       text,
  add column nome_fantasia      text,
  add column ie                 text,
  add column im                 text,
  add column regime_tributario  text check (regime_tributario is null or regime_tributario in ('simples', 'simples_excesso', 'presumido', 'real', 'mei')),
  add column email              text,
  add column telefone           text,
  add column cep                text,
  add column logradouro         text,
  add column numero             text,
  add column complemento        text,
  add column bairro             text,
  add column cidade             text,
  add column uf                 text check (uf is null or uf ~ '^[A-Z]{2}$'),
  add column cod_ibge           text,
  add column situacao_cadastral text,
  add column atividade          text;

-- Gerente pode editar os dados da(s) loja(s) dele (admin já edita todas)
create policy "lojas: gerente edita a sua" on public.lojas for update to authenticated
  using (public.is_gestor() and public.pode_ver_loja(id))
  with check (public.is_gestor() and public.pode_ver_loja(id));

-- minhas_lojas() devolve setof lojas: recriar para incluir as colunas novas
create or replace function public.minhas_lojas()
returns setof public.lojas language sql stable security definer set search_path = public as $$
  select l.* from public.lojas l
  where l.ativo and public.pode_ver_loja(l.id)
  order by l.nome;
$$;
