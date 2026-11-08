# Contexto do projeto — passagem de sessão (atualizado em 08/11/2026)

## Sessão 08/11/2026 — Permissão POR TELA (ECO + Gestão RH)
- **Pastas novas**: tudo está em `C:\GTB_ PROJETOS_CLAUDE\ECO-SISTEMA-TB` (repare no espaço depois de `GTB_`).
  O sistema continua em `PDV SALVADOS\`; o app de RH fica em `GESTAO-RH\` (schema `rh` no mesmo Supabase, mesmo login;
  site https://gestao-rh-tau.vercel.app). Os caminhos `C:\PROJETOS_CLAUDE\...` citados abaixo são antigos.
- **Camada nova de acesso por tela**, acima das permissões por área e das ações especiais (que continuam valendo):
  - Migration `20261108000017_permissao_por_tela.sql`: `public.telas` (catálogo, 24 telas: 19 do ECO + 5 do RH),
    `public.usuario_telas` (flags; **sem linha = bloqueado**), `pode_ver_tela(codigo)`, `minhas_telas(app)`.
    Políticas restritivas de gravação em tabelas de uma tela só (etiquetas, mercadológico, CRM, lançamentos, DRE,
    cadastros financeiros). Leitura continua pela área (o PDV precisa). Gera as flags dos usuários atuais pelo acesso
    de hoje. Auditoria registra mudanças em `usuario_telas`. Trava: ninguém tira o próprio acesso a Login de acesso.
  - **Login de acesso** e **Lojas e configurações** são exclusivas do Admin (sem checkbox). Pessoas é liberável.
  - Front: `src/lib/telas.ts` (lista oficial + regras puras), `nav.ts` (campo `tela`, `itemVisivel`, item externo
    "Gestão RH" só para quem tem tela de RH), `permissoes.tsx` (`podeTela`, `temRh`, `modoLegado`),
    `components/guard-tela.tsx` ("Acesso negado"), `components/editor-telas.tsx` (seção Telas do editor),
    `/frente` exige `vendas.pdv`. O `roles` do nav.ts virou só a base da migração e do modo de segurança.
  - **Modo de segurança**: se `minhas_telas` der erro (migration não aplicada), o site usa o acesso antigo por perfil
    e mostra um aviso ao admin. O Gestão RH libera tudo como antes e mostra aviso.
  - Login novo: ao criar, a janela de Permissões abre com o modelo do perfil (vendedor/estoquista/gerente) aplicado,
    sem salvar. Modelos e "copiar de" incluem as telas.
  - Testes: `src/lib/__tests__/telas.test.ts` (81 testes no total passando). Build OK nos dois apps.
  - Conferência só leitura ANTES de aplicar: `supabase/scripts/conferir_telas_antes.sql` (rodada em 08/11: os 5 usuários OK).
    Teste da migration em transação com rollback em 08/11: 24 telas, 88 linhas, 34 liberadas, 45 políticas; nada gravado.
- **Como cadastrar uma tela nova no controle**: (1) crie a rota; (2) adicione em `TELAS` (`src/lib/telas.ts`) com código
  `modulo.nome`, rota, área e perfis; (3) no `NAV` (`nav.ts`) ponha `tela: "<código>"`; (4) migration NOVA com
  `insert into public.telas (...) values (...)` (e, se quiser, `insert into public.usuario_telas` para quem já deve ver);
  (5) atualize o modelo pronto em `permissoes.tsx` se fizer sentido; (6) `npm test` (o teste acusa se faltar em algum lugar).
- **Pendente (usuário)**: rodar a conferência, aplicar a 0017, publicar ECO e Gestão RH, testar com um vendedor.


## Mudança de pasta (03/11/2026)
- A raiz do git `C:\PROJETOS_CLAUDE\ECO-SISTEMA-TB` agora é uma pasta guarda-chuva. O sistema fica em
  **`PDV SALVADOS\`**, ao lado de `CHECK LIST OPERACIONAL\` e `PROJETOS POP\` (essas duas não estão no git).
- Todos os comandos (`npm ...`, `npx vercel ...`, `npx supabase ...`) rodam dentro de `PDV SALVADOS`.
- **Vercel**: Settings → Build and Deployment → **Root Directory = `PDV SALVADOS`** precisa estar
  configurado ANTES do próximo push, senão o deploy quebra.
- O modo automático do Claude bloqueou `vercel deploy --prod`: o usuário roda com `!`.

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
- **Leitor pela câmera** (03/11, `@zxing/browser`, `src/components/leitor-camera.tsx`): lê código de barras
  no lote e no produto avulso.
- **DRE gerencial** (05/11, aba do Financeiro, `src/components/financeiro-dre.tsx`, migration 0016): veio do projeto
  Lovable `rhsupermixms-alt/marketwise-margin-map` (Supabase dele: `bnjkflwykzomjotrqfnn`). UNIFICADO: despesas = contas a pagar,
  agrupadas por `plano_contas.dre_categoria_id` (subcontas herdam); SEPARADO POR EMPRESA; faturamento = vendas do mês ou
  valor digitado em `dre_faturamento` (prioridade); benchmark padrão em `dre_categorias` e por empresa em `dre_benchmark_loja`.
  Dados do Lovable importados e conferidos (101 lançamentos `origem='importacao'`, documento `LOV-<id>`; faturamento mai–jul
  das duas lojas) com `scripts/importar-dre-lovable.mjs` (CSV → SQL; CSVs fora do repo, em Downloads).
- Supabase CLI novo: escrita pede confirmação → usar `--yes`; o Claude consegue conferir com `--read-only`.
- Pessoas e Lojas: só admin (03/11). Erro 403 do Mercado Livre aparece traduzido.
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
0. Configurar Root Directory na Vercel e publicar (push na `main`). Investigar o 403 do ML que o
   repositor Eder recebeu ao buscar produto no lote (falta saber se o admin também recebe).
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
