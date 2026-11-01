# Contexto do projeto — passagem de sessão (01/11/2026)

Leia este arquivo inteiro antes de qualquer coisa. Depois `CLAUDE.md`, `docs/escopo.md`,
`docs/migracao-dados.md`, `docs/mercado-livre-api.md` e `docs/ANALISE-PRECIFICALOTE.md`.

## Usuário
Dono de loja de salvados (lotes de seguradora/leilão, inclusive planilhas de lote do Mercado Livre).
Iniciante em programação: explicar passo a passo, **sempre em português do Brasil**, sem jargão.
Nunca pedir nem repetir senhas/chaves no chat. Ele roda comandos no PowerShell dele.

## Stack e ambiente
- Vite + React 19 + TanStack Router (SPA) + Tailwind v4 + Supabase (`blqgmueqsqqpflorusrm`, São Paulo).
- `npm run dev` → http://localhost:5173 · `npm test` (Vitest) · `npm run build`.
- Migrations: o usuário aplica com
  `npx supabase db query --linked --project-ref blqgmueqsqqpflorusrm -f supabase\migrations\<arquivo>.sql`
  (o modo automático do Claude Code bloqueia SQL remoto; deploy de Edge Function com JWT funciona;
  `--no-verify-jwt` e `npm install` de URL são bloqueados).
- Salvar arquivos em `src` recarrega a tela aberta (HMR) e **interrompe o robô de planilha**.
- Branch de trabalho: `fase1-lotes-pdv-multiloja` (ainda não enviada ao GitHub nem mesclada na `main`).

## O que está pronto
- Login, "Esqueci minha senha" (Site URL = http://localhost:5173), Minha conta (clicar no nome no rodapé).
- **Multiloja**: lojas criadas pelo CNPJ (BrasilAPI), loja atual no menu, admin vê "Todas as lojas"
  (só consulta). Vendas/caixa/estoque separados por `loja_id` + RLS `pode_ver_loja`.
- **Mercado Livre** (aba em Lotes): Client ID 6994712218468875, conta SL20260203173040; Edge Functions
  `ml-oauth-start`, `ml-oauth-callback` (sem JWT), `ml-buscar`.
- **Lotes** (estilo PrecificaLote): manual e planilha (padrão ML: H produto, E qtd, J valor, F grade,
  L categoria), robô no navegador, revisão, arredondamento, rateio % ou valor pago, pallets, ocorrências,
  desmembrar, avaria parcial, transferir, gráficos, lançar no estoque.
- **Estoque** (`produtos` + `stock_movements`), etiquetas Code128 + editor, dados fiscais.
- **PDV** com caixa embutido (abrir, sangria, suprimento, fechamento cego), venda atômica, comprovante.
- **Movimento**: vendas (abas fiscais aguardando emissão), histórico de caixas, transferências.
- **Cadastros/Pessoas**, usuários via Edge Function `admin-usuarios`, histórico legado importado.
- Menu agrupado (Cadastros / Movimento) em `src/lib/nav.ts`.

## Em andamento (pedido de 01/11/2026)
- Etapa B: Funcionário em Pessoas; formas e meios de pagamento (PDV usa); contas bancárias; plano de contas.
- Etapa C: mercadológico (departamento → categoria → subcategoria) a partir do ML e das planilhas.
- Etapa D: relatórios visuais e financeiro (pagar/receber, fluxo de caixa, conciliação).
- Depois: NFC-e/NF-e (Focus NFe ou Nuvem Fiscal), robô no servidor.

## Pendências do usuário
- Trocar a senha do admin e renovar a Client Secret do ML se ainda não renovou.
- Desligar "Allow new users to sign up" no Supabase.
- `git push` da branch (precisa login interativo dele).
