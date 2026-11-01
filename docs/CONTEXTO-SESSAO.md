# Contexto do projeto — passagem de sessão (atualizado em 01/11/2026, noite)

Leia este arquivo inteiro antes de qualquer coisa. Depois `CLAUDE.md`, `docs/escopo.md`,
`docs/migracao-dados.md`, `docs/mercado-livre-api.md` e `docs/ANALISE-PRECIFICALOTE.md`.

## Usuário
- Dono de lojas de salvados (lotes de seguradora/leilão, inclusive planilhas de lote do Mercado Livre).
- Iniciante em programação: explicar passo a passo, **sempre em português do Brasil**, sem jargão,
  com comandos prontos para o PowerShell dele.
- **Nunca** pedir, repetir ou digitar senhas, Client Secret ou chaves. Ele faz isso sozinho.
- Arquivos com dados pessoais (e-mails, vendas) ficam FORA do repo, em
  `C:\PROJETOS_CLAUDE\PROJETO LOVABLE\ECO-SISTEMA-TB-main\TABELAS LOVABLE\...`.

## Stack e ambiente
- Vite + React 19 + TanStack Router (SPA; `routeTree.gen.ts` é gerado — `npx vite build` regenera)
  + Tailwind v4 + Supabase (`blqgmueqsqqpflorusrm`, São Paulo).
- `npm run dev` → http://localhost:5173 · `npm test` (Vitest, 49 testes) · `npm run build` (tsc + vite).
- **Migrations**: o usuário aplica no PowerShell dele:
  `npx supabase db query --linked --project-ref blqgmueqsqqpflorusrm -f "<caminho>.sql"`.
  - "already exists" = já estava aplicada (o arquivo roda inteiro numa transação, nada fica pela metade).
  - Arquivos > ~1 MB dão erro 413: dividir.
  - Conferência das 12–14: `supabase/scripts/conferir_migrations_12_14.sql` (só leitura).
- Modo automático do Claude Code bloqueia: SQL remoto, deploy de função com `--no-verify-jwt`,
  `npm install` de URL, `vercel git connect` (mexe na conta). Deploy de Edge Function com JWT funciona.
- Salvar arquivos em `src` recarrega a tela aberta (HMR) e **interrompe o robô de planilha**.
- Chrome conectado ao Claude não abre localhost:5173 (outra máquina/perfil): pedir ao usuário para conferir telas.
- Diálogos `window.confirm/prompt` travam a automação do Chrome.

## Git e publicação
- Repo: github.com/Thiago-b2026/ECO-SISTEMA-TB, local `C:\PROJETOS_CLAUDE\ECO-SISTEMA-TB`.
- Branch de trabalho: `fase1-lotes-pdv-multiloja`. Commits com
  `git -c user.name="Thiago" -c user.email="comprassupermixms@gmail.com" commit ...`
  e rodapé `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Vercel** (conta `comprassupermixms-7340`, time `grupotb`, projeto `eco-sistema-tb`):
  - Site oficial: **https://eco-sistema-tb.vercel.app** (publicado em 01/11/2026 pela CLI).
  - GitHub já conectado: push na `main` atualiza o site; push na branch gera site de teste.
  - Para publicar, o usuário roda:
    `git -C "C:\PROJETOS_CLAUDE\ECO-SISTEMA-TB" push origin fase1-lotes-pdv-multiloja`
    `git -C "C:\PROJETOS_CLAUDE\ECO-SISTEMA-TB" push origin fase1-lotes-pdv-multiloja:main`
  - Ou o Claude publica direto: `npx --yes vercel@latest deploy --prod --yes` (na pasta do projeto; já logado).
  - Variáveis na Vercel (production + preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  - `vercel.json`: rotas do SPA → index.html, cache de /assets, cabeçalhos de segurança.
  - `.vercelignore`: nunca envia `.env`, prints, planilhas.
- **Domínio**: `grupotbdearaujo.com.br` comprado no Registro.br (Pix, 01/11/2026), aguardando publicação.
  Plano: `sistema.grupotbdearaujo.com.br` → CNAME para o valor que a Vercel mostrar (Settings → Domains).

## Lojas e dados
- **SALVADOS LP MS** — CNPJ 65.297.057/0001-40 (código `MATRIZ`): 5.374 vendas legadas, 26 com data
  suspeita, início 01/05/2026.
- **SALVADOS LP** (M A LTDA) — CNPJ 61.387.931/0001-89, Araguaína/TO: 9.088 vendas legadas
  (8.741 finalizadas, 347 canceladas com motivo), R$ 799.826,94, 17 suspeitas, início 01/11/2025.
- **SALVADOS LP MS (duplicada)**: desativada, sem CNPJ; não aparece em relatórios.
- Histórico legado vai até out/2026 (hoje é 01/11/2026).

## O que está pronto (funcionalidades)
- **Acesso**: login, "Esqueci minha senha" (`/nova-senha`), Minha conta (`/conta`, visual Clássico/ERP),
  sem "Criar conta".
- **Empresa por usuário**: não-admin fica preso à loja dele (sem "Todas as lojas"); com mais de uma loja
  escolhe a empresa logo após o login (`src/components/escolher-empresa.tsx`, sessionStorage).
  Admin vê e compara todas. Usuário novo NÃO entra mais automaticamente na Matriz (migration 0013).
- **Permissões** (`src/lib/permissoes.tsx`, `src/components/editor-permissoes.tsx`, tela
  Cadastros → Login de acesso → botão Permissões):
  - empresas do usuário; modelos prontos (Vendedor/caixa, Estoquista, Gerente, Só consulta, Liberar tudo);
    copiar de outro usuário; aviso de alterações não salvas;
  - por área (`permissoes`): vendas, caixa, pessoas, crm, produtos, lotes, financeiro,
    cadastros_financeiros, relatorios × ver/inserir/editar/excluir — políticas RESTRITIVAS no banco
    + gatilho `checa_permissao` (sem "ver" o item some do menu);
  - ações especiais (`permissoes_acoes`): vendas.desconto, vendas.cancelar, caixa.sangria,
    caixa.suprimento, produtos.alterar_preco, produtos.ajustar_estoque (barradas no banco por
    `checa_acoes`), produtos.ver_custo e dados.exportar (só na tela);
  - sem linha = liberado (vale o perfil); admin sempre pode tudo. Formas/meios de pagamento sempre
    legíveis (o PDV precisa).
- **Auditoria** (tabela `auditoria`, gatilho `registra_auditoria`; aba Auditoria em Relatórios, só admin):
  quem inseriu/alterou/excluiu, antes/depois por campo, filtros e exportação. Registra desde a migration 0013.
- **Relatórios** (`src/routes/_app.relatorios.tsx`, `src/components/relatorios-extra.tsx`): atalhos de período
  (padrão 30 dias), filtro de loja próprio, barra fixa, 5 indicadores com variação, colunas por dia/mês,
  formas de pagamento, vendedores, comparativo entre lojas ativas, curva ABC, resultado por lote, itens parados.
- **Exportar Excel/PDF** em todas as telas de dados (`src/lib/exportar.ts`, `src/components/exportar.tsx`):
  CSV com ";" e BOM para o Excel brasileiro; PDF via janela de impressão.
- **Tabelas**: estilo global em `src/styles.css` (cabeçalho fixo, zebra, hover, totais em tfoot).
- **Menu** (`src/lib/nav.ts`, campo `modulo` liga ao controle de permissão): Dashboard, PDV, Lotes, CRM,
  Relatórios, Financeiro, Lojas e configurações; grupo Cadastros (Pessoas, Login de acesso, Produtos,
  Etiquetas, Mercadológico, Formas/meios de pagamento, Contas bancárias, Plano de contas); grupo Movimento
  (Vendas e notas, Movimentações de caixa, Transferências).
- **Multiloja**: `lojas`, `usuario_lojas`, `pode_ver_loja`, `minhas_lojas()`, `src/lib/loja.tsx`.
- **Mercado Livre**: Edge Functions `ml-oauth-start`, `ml-oauth-callback` (sem JWT), `ml-buscar`;
  Client ID 6994712218468875, conta SL20260203173040; retorno usa o secret `APP_URL`.
- **Lotes** estilo PrecificaLote (planilha ML: H produto, E qtd, J valor, F grade, L categoria, M subcategoria),
  robô, desmembrar, avaria parcial, transferir, gráficos, lançar no estoque.
- **Estoque/Produtos**, etiquetas Code128 com editor, dados fiscais.
- **PDV** (`/pdv` abre `/frente` em janela própria): caixa embutido, venda atômica `finalizar_venda`,
  cupom 80 mm, impressões de caixa.
- **Pessoas** (cliente/fornecedor/funcionário/usuário, CNPJ via BrasilAPI), login pela Edge Function
  `admin-usuarios`. **Financeiro** (pagar/receber, fluxo, saldos). **CRM WhatsApp** manual (wa.me).

## Migrations
- `20261031000001`–`0004` e `20261101000001`–`0014`: aplicadas e conferidas.
- **`20261101000015_corrige_checa_permissao.sql`**: corrige "invalid input value for enum caixa_status:
  cancelada" ao abrir caixa (bug da 0013/0014). **O usuário precisa aplicar** — confirmar se rodou.

## Pendências
1. Usuário aplicar a migration 0015 e testar: abrir caixa, sangria/suprimento, ajuste de estoque.
2. Supabase → Authentication → URL Configuration: Site URL e Redirect URLs com
   `https://eco-sistema-tb.vercel.app` (manter localhost); secret `APP_URL` nas Edge Functions.
3. Configurar permissões e empresa de cada vendedora (modelo "Vendedor(a)/caixa"); criar logins das
   6 vendedoras e ligar vendas antigas em "Vendedores do sistema antigo".
4. Rodar `supabase/scripts/auditoria_por_loja.sql` e conferir vendas/logins por CNPJ.
5. Segurança: trocar senha de admin, desligar "Allow new users to sign up", renovar Client Secret do ML,
   apagar senha em texto do arquivo `PROJETO SALVADOS.txt`.
6. Domínio `sistema.grupotbdearaujo.com.br` quando o Registro.br publicar.
7. Futuro: NFC-e/NF-e (Focus NFe ou Nuvem Fiscal), uazapi (WhatsApp automático), robô no servidor,
   seguir responsivo para celular.
