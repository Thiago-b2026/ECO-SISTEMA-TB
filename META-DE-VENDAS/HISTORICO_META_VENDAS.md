# Histórico – Meta de Vendas e Premiação (código `metas`, schema `metas`)

## 📍 ONDE PARAMOS
- **15/11/2026 — publicação em andamento** (roteiro: `PUBLICAR.md`). Feito com OK do usuário:
  - commit do Quadro Geral do Portal (`a5af49f`);
  - **banco de produção:** aplicadas, nesta ordem, a 0001 do metas, a 0026 e a 0027 do PDV e a 0002 do metas. Conferido: 4 tabelas com RLS, 9 telas, 22 ações, `fechar_mes`, Portal (POP, Precificação, bucket); **nenhum dado criado**;
  - **Edge Function `admin-usuarios` v5** publicada (sem login → 401);
  - branch `feat/meta-vendas` enviada ao GitHub (main intocado).
- **Falta (na ordem):** 👤 Exposed schemas `metas` → 👤 projeto Vercel `metas-grupotb` (Root `META-DE-VENDAS`, Vite, as 2 variáveis) → 🤖 merge no main → 🤖 url em `public.sistemas` e `sistemas.json` → 👤 marcar lojas, dar acessos e cadastrar a meta.
- Origem: app Lovable "Sales Champion" (sem dados reais; começa limpo).
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

## Sessão 3 – 15/11/2026 (etapa 4: telas do app)
- App Vite + React + Tailwind + react-router (mesmo padrão do Check List), na raiz de `META-DE-VENDAS` (`npm run dev` → porta 5193; `.claude/launch.json` → `metas-demo`).
- **Login único** (sem "Criar conta"), menu só com as telas liberadas (`minhas_telas('metas')`), "Acesso negado" em rota não liberada, aviso (sem bloquear) se a consulta de permissões falhar, botão "Eco Sistema TB" para o Portal. Unidade e mês sempre no topo; as ações dentro de cada tela seguem `minhas_permissoes('metas', unidade)`.
- **Telas:** Dashboard (indicadores, barra com as marcas do mínimo e dos 100%, quanto falta, tabela, PDF/Excel com `historico → exportar`); Ranking (medalhas, "você" destacado); Meu desempenho (resultado e prêmio do vendedor, lançar o próprio resultado com `meu_desempenho → editar`, gráfico de 6 meses); Histórico (6/12/24 meses, Excel com abas Resumo e Vendedores); Lançamentos do mês (tabela editável, "Alterado, falta salvar", salvar tudo, excluir); Vendedores (cadastrar, editar, trocar de unidade, inativar/reativar, ligar ao login pelo e-mail); Meta e fechamento (meta do mês, copiar do mês anterior, fechar/reabrir com confirmação).
- **Cálculo** em `src/domain/premiacao.ts`, mesmas contas do Lovable (a faixa mínima agora mostra o % configurado, em vez de "90%" fixo).
- **Banco (0001 ajustada, ainda não aplicada):** `metas.ligar_login(vendedor, email)` liga o cadastro a um login que JÁ existe (quem cria login é o admin, no Portal) e `metas.emails_vendedores(loja)` (só para quem vê a tela Vendedores). +3 testes.
- **Modo demonstração:** Admin, Gerente da Loja 1, Ana (lança o próprio resultado) e Bruno (só acompanha); 2 lojas, 3 meses de exemplo (o mais antigo fechado). Mesmas regras do banco. Build de produção sem as variáveis mostra "Erro de configuração".
- **Correção durante os testes:** lista vazia criada a cada render fazia a tela de Lançamentos recarregar sem parar; virou constante.
- Pendente para a publicação: criar login novo de vendedor continua com o admin (Portal/PDV); o app só liga ao login existente.

## Sessão 4 – 15/11/2026 (auditoria + várias empresas, cadastro de empresas, lojas e usuários)
**Pedido do usuário:** não havia como cadastrar/editar loja (nome fixo da empresa); auditar, melhorar e deixar para várias empresas, com cadastro de empresa e de usuários.

**Auditoria (o que estava faltando ou fraco):**
1. Não havia cadastro de empresa/unidade nem de usuário dentro do app (dependia do Portal, que ainda não tem essa tela) → **corrigido**.
2. O topo só tinha "Unidade" (com o nome da empresa grudado) → **Empresa** e **Unidade** separadas; cada pessoa vê só as empresas em que tem acesso.
3. Admin sem nenhuma unidade cadastrada via só "Nenhuma unidade" → agora leva direto ao cadastro.
4. Vendedores: a troca de unidade listava lojas de outras empresas → só da mesma empresa.
5. Dashboard não avisava quem ainda não lançou → aviso "Vendedores ativos sem lançamento" com atalho.
6. Prêmio da meta mínima podia ser maior que o da meta 100% (só a tela barrava) → regra também no banco.
7. Ao sair, quem entrava depois caía na tela da pessoa anterior ("Acesso negado") → volta ao início.

**Feito:**
- Migration `20261115000002_metas_empresas_acessos.sql` (não aplicada): perfis `vendedor` (Ranking + Meu desempenho; opcional lançar o próprio resultado), `gerente` (tudo na unidade), `gestor` (tudo em todas as lojas da empresa que usam o sistema); `metas.definir_acesso` (admin, pelo e-mail), `metas._definir_acesso_usuario` (só service_role), `metas.remover_acesso` (nunca apaga login nem histórico), `metas.usuarios_da_empresa` (admin); cria o cadastro de vendedor ligado ao login; check do prêmio. +8 testes de banco.
- 0027 do PDV: telas `metas.empresas` e `metas.usuarios` (somente_admin) + espelho em `telas.ts` + teste.
- Edge Function `admin-usuarios`: `sistema: "metas"` cria só o login e grava o acesso (sem efeitos do PDV). +1 teste no PDV.
- App: telas **Empresas e lojas** (empresa, unidades com CNPJ → matriz/filial, "usa o Meta de Vendas", ativa; mesmo cadastro do Portal) e **Usuários e acessos** (dar acesso a quem já tem login ou criar login novo, perfil, unidade, trocar perfil, tirar acesso). Modo demonstração refeito com empresas, lojas e usuários cadastráveis.
- **Testes:** 68 no app (35 banco, 9 cálculo, 12 apoio/telas, 7 demonstração, 8 de tela — inclusive o admin cadastrando empresa, loja e login e o vendedor entrando na loja nova) e 132 no PDV.
- **Publicação muda:** além do que já estava, aplicar a 0002 do META-DE-VENDAS (depois da 0027) e publicar de novo a Edge Function `admin-usuarios`.

## Sessão 5 – 15/11/2026 (demonstração limpa + excluir)
- **Pedido:** não deixar empresa de teste cadastrada (começar limpo, como no Lovable, que não tinha dados) e ter opção de excluir.
- **Demonstração começa vazia:** só o Administrador; ele cadastra empresa, lojas e usuários (quem ele cria entra com o e-mail e a senha que ele definiu). Botão "Apagar tudo o que foi cadastrado na demonstração" (com confirmação). Os dados de exemplo ficaram só para os testes automáticos (`semearExemplo`). O banco de produção também começa sem nenhum dado do Meta de Vendas.
- **Excluir** (0002, não aplicada): `metas.excluir_empresa` (admin; só sem unidades), `metas.excluir_unidade` (admin; só se nunca teve vendedor, meta ou lançamento e não é usada por outro sistema — senão a mensagem manda desmarcar o Meta de Vendas ou inativar; leva junto os acessos da unidade), `metas.excluir_vendedor` (quem edita vendedores; só sem lançamento — senão, Inativar). Botões "Excluir" com confirmação em Empresas e lojas e em Vendedores.
- Testes: 72 no app (36 banco, 9 cálculo, 12 apoio/telas, 9 demonstração, 9 de tela), tsc e build ok; conferido no navegador (começa vazio, menu com as 9 telas).

## Sessão 6 – 15/11/2026 (cadastro de unidade no padrão de todos os sistemas)
- **Pedido:** a tela não pedia CNPJ nem endereço; usar o cadastro padrão de todos os apps.
- **Padrão adotado = "Dados da unidade" do PDV** (`GESTAO SALVADOS/src/components/dados-loja.tsx`), nos MESMOS campos de `public.lojas` (migration 0005 do PDV): CNPJ, razão social, nome fantasia, IE, IM, regime tributário, telefone, e-mail, CEP, rua, número, complemento, bairro, cidade, UF, código IBGE, situação cadastral e atividade. Nenhuma mudança no banco.
- **Pesquisar CNPJ** (BrasilAPI, igual ao PDV) preenche os dados da Receita; **Buscar CEP** completa o endereço. `src/lib/documento.ts` é cópia do PDV.
- **Unidade nova:** CNPJ (válido) e endereço (rua, número, cidade, UF) obrigatórios. Unidade antiga de outro sistema sem CNPJ continua editável sem travar. A lista mostra CNPJ (matriz/filial) e o endereço, com aviso "Sem CNPJ" / "Endereço não cadastrado".
- A empresa (rede) continua só com o nome, como no PDV e no Portal: o CNPJ fica em cada unidade (a matriz é a de final /0001).
- Testes: 75 no app (inclui a pesquisa de CNPJ com a Receita simulada e as regras do cadastro), tsc e build ok; conferido no navegador.

## Sessão 7 – 15/11/2026 (publicação: banco, Edge Function e GitHub)
- Conferência do banco de produção (só leitura) antes: nada do metas nem da 0026; dependências presentes; regras de `public.lojas` deixam o admin ler/criar/editar/excluir.
- Testes antes: metas 75, PDV 132, build do Portal ok.
- Commit `a5af49f` (Portal: Quadro Geral, 0026, telas.ts, sistemas.json).
- Aplicadas em produção: `20261115000001_metas_schema.sql` → `20261113000026_portal_quadros_pop_precificacao.sql` → `20261115000027_metas_telas.sql` → `20261115000002_metas_empresas_acessos.sql`. Conferido depois: tabelas, RLS, telas, ações, perfis (`telas_do_perfil`), núcleo `_definir_acesso_usuario` fechado para authenticated, `definir_acesso` fechado para anon.
- `admin-usuarios` publicada (v5, ACTIVE, verify_jwt; chamada sem login → 401).

