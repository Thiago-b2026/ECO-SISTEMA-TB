# Histórico – Meta de Vendas e Premiação (código `metas`, schema `metas`)

## 📍 ONDE PARAMOS
- **15/11/2026:** projeto aberto. Origem: app Lovable "Sales Champion" (código em `C:\GTB_ PROJETOS_CLAUDE\ARQUIVO-ECO-SISTEMA-TB\PROJETO LOVABLE\goal-spark-rewards-main`, banco Lovable `rbwttovhtcjazueagipp`). **Sem dados reais** (15/11: no Lovable só havia testes) → o app começa limpo, sem importação.
- Código de referência: `metavendas-codigo.zip` (15/11, 106 arquivos), igual à cópia de 19/09 nas telas, regras e tabelas; só mudaram arquivos automáticos do Lovable.
- **Etapa 1 pronta (15/11)** na branch `feat/meta-vendas`: migration `supabase/migrations/20261115000001_metas_schema.sql` + 21 testes de banco (PGlite) passando. **Nada aplicado no Supabase, nada publicado.**
- **Etapa 3 pronta (15/11), NÃO commitada:** `GESTAO SALVADOS/supabase/migrations/20261115000027_metas_telas.sql` (sistema `metas`, 3 grupos, 7 telas, ação `fechar_mes`), espelho em `GESTAO SALVADOS/src/lib/telas.ts` + teste (131 ok, tsc ok) e quadro em `PORTAL/src/lib/quadros.tsx` (tsc ok). Testes do metas: 24 ok, já usando a 0027 real. Esses arquivos do PDV e do Portal estão misturados com o trabalho pendente do Quadro Geral (0026), então o commit depende dele.
- **Próximo passo:** decidir o commit da etapa 3 e começar a etapa 4 (telas do app).

---

## 🧭 CONTEXTO
- **O que é:** meta de faturamento por loja e por mês, com duas faixas de prêmio (meta 100% e meta mínima, ex.: 90%) e bônus por cliente engajado (avaliação Google, contato salvo, Instagram). Perfis: admin e vendedor (o vendedor vê só o próprio desempenho).
- **Telas no Lovable:** Dashboard, Lançamentos, Ranking, Meu desempenho, Histórico, Vendedores, Lojas, Configuração.
- **Tabelas no Lovable (schema public):** `lojas`, `user_roles` (admin/vendedor), `vendedores` (user_id, loja_id, nome, ativo), `configuracao_meta` (loja + mês: meta_total, percentual_minimo, premio_meta_100, premio_meta_90, valor_por_cliente_engajado), `lancamentos` (vendedor + mês: faturamento_realizado, clientes_engajados), `meses_fechados` (loja + mês).
- **Stack no Lovable:** TanStack Start com funções no servidor (`createServerFn`) e Supabase.

## 🔁 ADAPTAÇÃO AO ECOSSISTEMA (decidida)
| Lovable | Ecossistema |
|---|---|
| Banco próprio | Schema `metas` no Supabase ECO-SISTEMA-TB (`blqgmueqsqqpflorusrm`) |
| `public.lojas` própria | `public.lojas` do Portal (o nome colide: NÃO criar outra) |
| `public.user_roles` + `has_role` | Permissões por tela (`minhas_telas('metas')`, `pode(...)`); o nome `user_roles` colide com o do PDV |
| Gatilho `on_auth_user_created` | Não trazer (colide; regra 3 do CLAUDE.md). Quem cria login é só o admin |
| Tela com cadastro | Login único, sem "Criar conta" |
| Funções no servidor | App Vite como os outros, segurança por RLS |
| Link do Lovable | Projeto Vercel próprio (time grupotb), url em `public.sistemas`, quadro no Portal |

## 🗺️ ETAPAS PREVISTAS
1. Schema `metas` (RLS, grants, vendedor ligado ao login e à unidade) + testes.
2. ~~Importador dos CSVs~~ — dispensado (sem dados reais no Lovable).
3. Permissões: migration em `GESTAO SALVADOS/supabase/migrations/` (sistema `metas`, grupos, telas) + espelho em `telas.ts` + quadro no Portal (`PORTAL/src/lib/quadros.tsx`).
4. Front-end adaptado (login único, menu por telas liberadas, botão para o Portal).
5. Publicação: banco → Exposed schemas → Vercel → main → url → liberar acessos.

---

## Sessão 1 – 15/11/2026 (projeto aberto e etapa 1: banco)
- Origem conferida: `metavendas-codigo.zip` (106 arquivos) igual à cópia de 19/09 nas telas e regras. Sem dados reais no Lovable (só testes) → sem importação.
- Pasta `META-DE-VENDAS` (com hífen, regra do Meu Supervisor), `README.md`, `CLAUDE.md`, `.gitignore` (dados-lovable, .env, zip) e `sistemas.json` (código `metas`, em construção).
- **Migration `20261115000001_metas_schema.sql`** (idempotente): `metas.vendedores`, `configuracao_meta`, `lancamentos`, `meses_fechados`; unidades de `public.lojas`; permissões por `public.pode` / `minhas_unidades('metas')`.
- **Decisões:**
  - Quem tem qualquer tela do sistema na unidade vê os dados dela (ranking com todos os vendedores da loja, como no Lovable). O vendedor sempre vê o próprio cadastro.
  - O vendedor lança o próprio resultado só com `metas.meu_desempenho → editar`; lançar para qualquer um é `metas.lancamentos`.
  - Mês fechado bloqueia lançamentos e meta para TODOS, inclusive o admin (no Lovable o admin ainda editava); é preciso reabrir. Fechar/reabrir = `metas.configuracao → fechar_mes` (ação nova no catálogo).
  - O lançamento guarda a unidade do vendedor no momento; trocar o vendedor de loja não muda o histórico.
  - Vendedor não é apagado, só inativado; inativo não recebe lançamento.
  - A unidade precisa usar o sistema `metas` (`public.lojas.sistemas`).
- **Testes:** `supabase/tests/metas.db.test.ts`, 21 passando (`npm test`). O esboço do ecossistema copia `pode`, `minhas_unidades` e `unidade_usa` da migration 0018 do PDV.

## Sessão 2 – 15/11/2026 (etapa 3: telas e permissões)
- Migration `20261115000027_metas_telas.sql` no GESTAO SALVADOS (idempotente): `public.sistemas` metas (ordem 45, ativo, url nula), ação nova `fechar_mes` ("Fechar / reabrir mês", especial), grupos Acompanhamento / Lançamentos / Cadastros e 7 telas:
  Dashboard, Ranking, Meu desempenho, Histórico (Acompanhamento); Lançamentos do mês (Lançamentos); Vendedores, Meta e fechamento do mês (Cadastros).
- Espelho em `GESTAO SALVADOS/src/lib/telas.ts` (SISTEMAS, GRUPOS, TELAS) e `telas.test.ts` lendo a 0027: 131 testes do PDV ok, tsc ok.
- Portal: quadro "Meta de Vendas" (ícone de troféu) em `PORTAL/src/lib/quadros.tsx`; sem url aparece "Sem endereço" (só para o admin, até publicar). tsc ok.
- Testes do metas passam a rodar a 0027 real e conferem que toda ação usada nas políticas está no catálogo (24 ok).
- **Ordem de publicação:** schema `metas` (0001 do META-DE-VENDAS) → 0026 do PDV (Quadro Geral) → 0027 do PDV → Exposed schemas `metas`.

