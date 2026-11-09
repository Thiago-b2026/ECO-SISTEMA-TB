# Contexto do projeto — passagem de sessão (atualizado em 08/11/2026)

## Sessão 08/11/2026 (noite, 3) — CADASTROS com abas, Excluir produto e Excluir usuário
- **Menu final:** DASHBOARD · PDV · FRENTE DE LOJA · CADASTROS (Produtos, Pessoas, Empresas) · FINANCEIRO · CRM E WHATSAPP.
  O grupo PRODUTOS saiu (virou item de CADASTROS) e "Login de acesso" saiu do menu. A árvore de permissões no banco NÃO mudou.
- **Produtos** = tela com abas CADASTRO | MERCADOLÓGICO | LOTES | ETIQUETAS | TRANSFERÊNCIAS (`ABAS_PRODUTOS` em `nav.ts`;
  `/produtos?aba=...`). Cada aba só aparece com a tela liberada; quem só tem uma aba entra direto nela.
  Endereços antigos (/mercadologico, /lotes, /etiquetas, /transferencias) abrem a aba; `/lotes/123` continua página própria.
- **Pessoas**: ao abrir, abas DADOS | LOGIN E PERMISSÕES (`src/components/aba-login.tsx`, só admin): CRIAR LOGIN, perfil,
  senha, desativar, empresas e permissões, Excluir usuário. `/usuarios` → `/pessoas?filtro=usuario`.
- **REGRA RÍGIDA (corrigida a pedido do usuário): só exclui o que NUNCA teve nenhum movimento; NUNCA apagar histórico.**
- **Excluir produto** (aba CADASTRO): admin, ou gerente com a área Produtos → Excluir (`pode_excluir_produto()`). Bloqueia se
  tem QUALQUER `stock_movements` (inclusive entrada), venda, transferência, item de lote, etiqueta impressa, pedido no CRM ou
  estoque. Com histórico: "Não pode excluir, já tem histórico. Use Inativar." Filtro Ativos/Inativos/Todos e Reativar.
- **Etiquetas impressas pela tela Produtos agora ficam registradas** (`public.etiquetas_impressas`, `registrar_etiquetas()`),
  sem apagar em cascata e sem edição. Etiqueta impressa conta como movimento.
- **"Excluir" no catálogo da tela Produtos** (`tela_acoes`) + linhas em `usuario_permissoes` iguais às de hoje (gerente com a área).
  Atenção: se um dia rodarem `sincronizar_permissoes_legado()` de novo, essas linhas somem (a regra dela não tem Produtos → Excluir).
- **Excluir usuário** (só admin, função `admin-usuarios` ações `motivos` e `excluir`): qualquer registro bloqueia — venda, caixa,
  sangria/suprimento, lançamento, transferência, movimento de estoque, lote/triagem, produto cadastrado, etiqueta, CRM, DRE,
  pessoas cadastradas, conexão do Mercado Livre, alteração de permissões, auditoria ou uso do Gestão RH (o login é o mesmo).
  Ninguém exclui a si mesmo; admin não é excluído. Apaga só o login e as permissões; a pessoa continua.
- **Dashboard**: tirado o botão "Abrir frente de loja" (a frente continua no menu PDV · FRENTE DE LOJA).
- **Migration `20261108000022_excluir_produto_usuario.sql`**. Ensaio com rollback: `supabase/scripts/ensaio_0022_excluir.sql`
  (cria produtos de teste dentro da transação e prova: entrada e etiqueta BARRAM, só cadastrado exclui; o erro "ENSAIO 0022" no fim
  é proposital e desfaz tudo). Regras travadas em `src/lib/__tests__/excluir-regras.test.ts`. A 0021 continua parada.
- Testes: 127; build ok. **Ensaio ainda não rodado.**

## Sessão 08/11/2026 (noite, 2) — Dashboard com abas RESUMO | RELATÓRIOS
- A tela **Dashboard** agora tem duas abas: **RESUMO** (vendas de hoje, caixas abertos, estoque, contas, gráficos) e **RELATÓRIOS**
  (o conteúdo da antiga tela Relatórios, com Resultados/Auditoria). Endereço da aba: `/dashboard?aba=relatorios`.
- A aba RELATÓRIOS só aparece para quem tem a tela `pdv.relatorios` liberada (as permissões no banco não mudaram).
- O item "Relatórios" saiu do menu (`oculto` em `nav.ts`); o endereço antigo `/relatorios` leva para a aba nova. Grupo DASHBOARD
  ficou com uma tela só, então vira link direto.
- **"Sistemas" saiu do menu** (lateral, topo/ERP e celular); `menu-sistemas.tsx` apagado. A escolha de sistema agora é pelo **Portal**.
- Clicar em **"Eco Sistema TB"** no topo do menu (os dois visuais e o cabeçalho do celular) abre o Portal na mesma aba
  (`PORTAL_URL` em `nav.ts` = https://portal-grupotb.vercel.app).
- Testes: 95; build ok. Commit `dc6e1bf`, **publicado em 08/11** (push na branch e no `main`).

## Sessão 08/11/2026 (noite) — Etapa 0 (RH no Git) e Etapa A (menu novo do PDV)
- **GESTAO-RH entrou no Git** (sem .env/.env.local/.env.db, CSVs, prints, senhas, supabase/.temp). Vercel do gestao-rh precisa de
  **Root Directory = `GESTAO-RH`**; depois disso o RH publica pelo push no `main` (igual ao PDV) e o deploy pela CLI de dentro da pasta deixa de funcionar.
- **Menu novo** (`nav.ts`: `GRUPOS_MENU`, `montarMenu()`; os dois visuais): DASHBOARD (Dashboard, Relatórios) · PDV · FRENTE DE LOJA (PDV,
  Vendas e notas) · PRODUTOS (Cadastro de produtos, Mercadológico, Lotes, Etiquetas, Transferências) · FINANCEIRO (Financeiro, Movimentações
  de caixa, Formas e meios de pagamento, Contas bancárias, Plano de contas) · CADASTROS (Empresas, Pessoas, Login de acesso) · CRM E WHATSAPP (CRM).
  Clicar no grupo abre a 1ª tela liberada e mostra as subtelas; grupo com 1 tela só vira link direto. Grupos = `public.grupos` (teste confere).
- "Lojas e configurações" → **Empresas** (rede → unidades, Tipo matriz/filial, rede ao criar unidade, "Unidades de outros sistemas" só consulta).
  "Produtos e estoque" → **Cadastro de produtos**. **Pessoas**: colunas "Tem login" e "Abrir no Portal" (desligado até o Portal existir).
- Testes: 94 (novo `src/lib/__tests__/menu.test.ts`).

## Sessão 08/11/2026 (tarde) — Portal, fase 1: Grupo TB → REDE → UNIDADE e permissões por unidade
- Migration **`20261108000018_portal_redes_unidades.sql` (APLICADA e conferida em 08/11)**. Histórico completo e requisitos da
  fase 2 em `../PORTAL/HISTORICO_PORTAL.md`.
- Unidade = `public.lojas` (+ `rede_id`, `tipo` matriz/filial pelo CNPJ (/0001 = matriz), `sistemas`). `public.redes`. Monte Sinai (ex "SALVADOS LP MS")
  e Eldorado (ex "SALVADOS LP") na rede SALVADOS LP; SUPERMIX BRAZ com Supermix Loja 1 (= loja "SUPER MIX BRAZ" do PDV, CNPJ 17.890.178/0001-58,
  reaproveitada, só RH), Loja 2 e 3. O PDV só lista unidades com 'pdv' em `sistemas` (`minhas_lojas`, `lojas_ativas`, `relatorio_por_loja`, tela Empresas).
- Grupos do PDV = menu novo: Dashboard; PDV · Frente de loja; Produtos; Financeiro; Cadastros; CRM e WhatsApp (o menu na tela muda na fase 3).
- `public.acoes`, `public.tela_acoes`, `public.usuario_permissoes` (usuário+unidade+tela+ação), `pode()`, `minhas_unidades()`, `minhas_permissoes()`,
  `copiar_permissoes()`, `sincronizar_permissoes_legado()` (só antes da fase 3). Nenhum comportamento muda até a fase 3.
- Gestão RH: loja nova vira unidade automaticamente; `adicionar_loja` e `criar_empresa` só admin.
- Conferência: `supabase/scripts/conferir_portal_antes.sql`. Testes: 88 passando.

- **PUBLICAÇÃO DO PDV (mudou em 08/11)**: a Vercel tem *Root Directory = `PDV SALVADOS`* e publica **pelo push no `main`**
  do GitHub. O `npx vercel deploy --prod` de dentro da pasta NÃO funciona mais (erro "Root Directory does not exist").
  Branch de trabalho do PDV: **`fase1-lotes-pdv-multiloja`** (igualada ao `main` em 08/11, commit `573a40d`). Para publicar:
  `git -C "C:\GTB_ PROJETOS_CLAUDE\ECO-SISTEMA-TB" push origin fase1-lotes-pdv-multiloja` e depois
  `git -C "C:\GTB_ PROJETOS_CLAUDE\ECO-SISTEMA-TB" push origin fase1-lotes-pdv-multiloja:main`.
  Existe também a branch `feat/meu-supervisor` (criada pela sessão do Meu Supervisor), hoje no mesmo commit.
  O Gestão RH continua publicando pela CLI dentro de `GESTAO-RH` (`npx --yes vercel@latest deploy --prod --yes`).
- **Status 08/11**: migration 0017 APLICADA e conferida (6 sistemas, 9 grupos, 24 telas, 84 linhas, 34 liberadas, 45 políticas,
  1 admin). PDV e Gestão RH publicados com a versão nova. Falta o teste com uma vendedora.
- Migration 0017 aplicada com: `npx supabase db query --remote=blqgmueqsqqpflorusrm --yes -f "<arquivo>.sql"`
  (o `--linked --project-ref` está descontinuado; conferência só leitura usa `--read-only` no lugar do `--yes`).
- **Pastas novas**: tudo está em `C:\GTB_ PROJETOS_CLAUDE\ECO-SISTEMA-TB` (espaço depois de `GTB_`). O sistema
  continua em `PDV SALVADOS\`; o Gestão RH fica em `GESTAO-RH\` (schema `rh`, mesmo login, https://gestao-rh-tau.vercel.app).
  Regras de TODO sistema da pasta: `CLAUDE.md` da raiz (seção "Ecossistema TB"). Catálogo: `MEU SUPERVISOR/sistemas.json`.
  Os caminhos `C:\PROJETOS_CLAUDE\...` citados abaixo são antigos.
- **Migration `20261108000017_permissao_por_tela.sql` (APLICADA em 08/11, depois de ensaiada com rollback)**:
  `public.sistemas` (pdv, rh ativos; crm, checklist, pop, supervisor inativos), `public.grupos` (PDV: Vendas, Caixa, Estoque,
  Cadastros, Financeiro, Relatórios, CRM; RH: Lançamentos, Consolidado), `public.telas` (24; `app` = FK do sistema, código
  `<sistema>.<tela>`), `public.usuario_telas` (**sem linha = bloqueado**), `pode_ver_tela`, `minhas_telas(app)`, `meus_sistemas()`.
  Exclusivas do Admin: `pdv.login_acesso`, `pdv.lojas`, `rh.usuarios`. Políticas restritivas de gravação em tabelas de uma tela
  só. Flags dos usuários atuais geradas pelo acesso de hoje. Auditoria em `usuario_telas`; ninguém tira o próprio Login de acesso.
  RH: `rh.criar_empresa` só para admin. Ensaio: 6 sistemas, 9 grupos, 24 telas, 84 linhas, 34 liberadas, 45 políticas;
  vendedor barrado ao criar empresa.
- Permissões por área (`permissoes`) e ações especiais (`permissoes_acoes`) continuam valendo, abaixo das telas.
- **Front PDV**: `src/lib/telas.ts` (SISTEMAS, GRUPOS, TELAS e regras puras), `nav.ts` (campo `tela`, item "Sistemas"),
  `permissoes.tsx` (`podeTela`, `sistemas`, `modoLegado`), `components/guard-tela.tsx` ("Acesso negado"),
  `components/editor-telas.tsx` (3 níveis com estado parcial, busca, marcar/desmarcar tudo), `components/menu-sistemas.tsx`.
  Login novo abre as Permissões com o modelo do perfil. `/frente` exige `pdv.pdv`.
- **Gestão RH**: `TelasContext` lê `minhas_telas('rh')` e `is_admin()`; menu/rotas por tela; sem "Criar conta"; só o admin cria
  empresa e dá acesso (`api/admin-users.ts` exige `user_roles.role = 'admin'`); remover da empresa NÃO apaga mais o login.
- **Modo de segurança**: se `minhas_telas`/`meus_sistemas` derem erro, o PDV usa o acesso antigo por perfil (aviso para o admin)
  e o RH libera como antes (aviso).
- Testes: `src/lib/__tests__/telas.test.ts` (86 testes no total). Build OK nos dois apps.
- Conferência só leitura: `supabase/scripts/conferir_telas_antes.sql` (hoje x depois por sistema/grupo/tela, `confere`,
  `alerta_admin` se houver mais de 1 admin). Em 08/11: 5 usuários OK, 1 admin.
- **Como cadastrar uma tela nova**: (1) rota; (2) `TELAS` em `src/lib/telas.ts` (código `<sistema>.<tela>`, grupo, rota, área,
  perfis); (3) no `NAV` (só PDV) `tela: "<código>"`; (4) migration NOVA com `insert into public.telas` (e `public.grupos` se for
  grupo novo); (5) modelos em `permissoes.tsx`; (6) `npm test`.
- **Sistema novo**: checklist do `CLAUDE.md` da raiz (ativar em `public.sistemas` com a url, grupos, telas, `sistemas.json`).
- **Pendente (usuário)**: testar com vendedor; cadastrar a Natália (só Gestão RH). Depois: pôr `GESTAO-RH` no Git
  (sem .env, CSVs, prints, senhas-temporarias.txt). Desligar "Allow new users to sign up" no Supabase (pendência antiga).

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
