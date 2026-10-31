# Contexto do projeto — passagem de sessão (31/10/2026)

Leia este arquivo inteiro antes de qualquer coisa. Depois leia `CLAUDE.md`, `docs/escopo.md` e
`docs/migracao-dados.md`.

## Quem é o usuário e o que ele quer
- Dono de uma **loja de salvados** (compra lotes de seguradoras/leilões e revende os itens).
- Usa hoje o **SuperMix PDV** feito no Lovable (`cashier-buddy-plus.lovable.app`). Está
  reconstruindo no Claude Code como **gestão completa**: lotes, triagem, rateio de custo,
  estoque, PDV, caixa, relatórios, financeiro.
- Tem também o **PrecificaLote** (`https://precificalote.com.br/projetos`): recebe os produtos de
  um lote, busca cada um no **Mercado Livre** e calcula o preço de venda conforme a
  **configuração de cada lote**. O sistema novo precisa se integrar a ele.
- Fala português, é iniciante em programação: explicar passo a passo, sem jargão, com caminhos e
  links exatos. Não pedir senhas no chat.

## Documentos
- Escopo completo (fonte oficial, Claude Doc): https://claude.ai/artifact/9NPP1My1ezB8ghENwRLKsW
- `CLAUDE.md` — stack, comandos e as 10 regras fixas do projeto
- `docs/migracao-dados.md` — análise dos dados do PDV antigo e decisões de migração

## Estado atual
**Fase 0 concluída** (commits locais em `main`):
- Vite + React 19 + TanStack Router (SPA) + Tailwind v4 + Supabase. Não usamos TanStack Start
  porque no Lovable ele dependia de um pacote fechado (`@lovable.dev/vite-tanstack-config`).
- Login, menu lateral por perfil (admin, gerente, vendedor, estoquista), proteção de rotas,
  tela **Minha conta** (trocar nome/senha), telas "em construção" dos 8 módulos.
- Supabase NOVO: projeto `blqgmueqsqqpflorusrm` (região São Paulo). Migração
  `supabase/migrations/20261031000001_fundacao.sql` aplicada à mão pelo SQL Editor.
- Admin criado: comprassupermixms@gmail.com (o usuário deve ter trocado a senha provisória).
- `.env` tem `VITE_SUPABASE_URL` e a chave **publishable** (`sb_publishable_...`).
  ATENÇÃO: o usuário já colou a chave `sb_secret_` por engano uma vez — conferir sempre o tipo
  sem imprimir a chave.
- Testes (5, datas/fuso) e typecheck passando. `npm run dev` → http://localhost:5173
  (pode já estar rodando na sessão anterior; se a porta 5173 estiver ocupada, é isso).

**Pendências do usuário:**
- [ ] `git push origin main` (precisa login interativo no GitHub; o usuário roda com `!`)
- [ ] Desligar "Allow new users to sign up" no Supabase (estava LIGADO na última checagem)
- [ ] Confirmar que trocou a senha provisória do admin
- [ ] Trocar a senha do admin do PDV ANTIGO (estava escrita no código do Lovable, em
      `src/routes/api/public/seed-admin.ts` — repositório cashier-buddy-plus)

## Dados do sistema antigo
Exportados em `C:\PROJETOS_CLAUDE\PROJETO LOVABLE\ECO-SISTEMA-TB-main\TABELAS LOVABLE\`
(CSV, separador `;`). Limpeza do catálogo em `...\TABELAS LOVABLE\LIMPEZA\`:
- `products-importados-LIMPO.csv` → **8.829 produtos** (sem duplicados, sem preço zero) — vira
  base de SUGESTÃO de descrição/categoria/preço na triagem, não estoque.
- 5.374 vendas / R$ 552.074,70 (mai–out/2026) entram como HISTÓRICO (`origem='legado'`).
- Estoque do sistema novo começa do zero pela triagem dos lotes.
- Nenhum produto antigo tem código de barras → sistema gera etiqueta com código interno e
  aceita EAN quando existir.
- Categorias seguem a árvore do Mercado Livre (31 categorias, 250 subcategorias) — manter.

## Decisões já tomadas
- Metas e premiação de vendedores (`goal-spark-rewards`): FORA do escopo.
- Repositório do sistema novo: `github.com/Thiago-b2026/ECO-SISTEMA-TB`.
- Supabase novo (não reaproveitar o do Lovable).
- Limpeza do catálogo aprovada (remover duplicados e preço zero).

## Perguntas em aberto (precisam de resposta antes/durante a Fase 1)
1. Rateio do custo do lote: proporcional ao preço de venda estimado × quantidade? (recomendado)
2. As 12 vendas antigas com data errada (2023, 2025, jan–abr/2026 e 17/12/2026): importar
   marcadas como "data suspeita"?
3. Aprovação final da proposta de migração (histórico sim, estoque do zero).
4. PrecificaLote: foi feito pelo próprio usuário (Lovable/GitHub) ou é de terceiros? Como exporta?

## PRÓXIMO PASSO (motivo desta sessão nova)
Conectar ao Chrome do usuário (Claude in Chrome) e **navegar no PrecificaLote** em
https://precificalote.com.br/projetos — o usuário já está logado no Chrome. Só OLHAR, não alterar
nada. Levantar e documentar em `docs/precificalote.md`:
- lista de projetos/lotes e o que cada lote guarda;
- **configuração de precificação por lote** (todos os campos: margem, desconto sobre o preço do
  ML, arredondamento, frete, taxas etc.) e a fórmula resultante;
- como entra a lista de produtos de um lote (planilha? colunas?);
- como é feita/mostrada a busca no Mercado Livre (anúncios, preço escolhido);
- o que dá para exportar (formato, colunas).
Depois: propor como o sistema novo recebe esses dados (importação de planilha e/ou integração
direta) e ligar isso ao módulo **Lotes → Triagem → Precificação** da Fase 1.

## Fase 1 (depois do PrecificaLote)
Ordem sugerida: tabelas de fornecedores, lotes, categorias, produtos/estoque, stock_movements →
tela Lotes → Triagem com rateio → importação de preços do PrecificaLote → PDV com venda atômica
(RPC) → Caixa → Usuários (Edge Function) → importação do histórico → relatórios básicos.
