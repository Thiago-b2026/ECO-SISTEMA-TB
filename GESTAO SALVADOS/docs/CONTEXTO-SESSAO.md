# Contexto do projeto — passagem de sessão (atualizado em 22/11/2026)

## Sessão 22/11/2026 — Busca da planilha com muita divergência (lote "LOTE MOGI 220V NOVEMB")
- Diagnóstico do lote 7f3b135b (planilha PRODUTOS_POR_CATEGORIA_LOTES_1_A_4.xlsx, 124 itens): 23 linhas "SUBTOTAL ..." viraram itens;
  nota antiga = só % de palavras do termo no título → peças com 100% ("Membrana painel micro-ondas ME36B", "Motor do liquidificador
  L-99-FB", "Prato com rodízio", "Transformador") e outros modelos aceitos ("Micro-ondas Luoruil" para MHP35S2/CMS23ARBNA).
- PrecificaLote com a MESMA planilha (projeto 314, 22/11 20:11): 79 de 83 "Não achou" — a coluna do nome foi mapeada para a de PREÇO
  (termos "800.9", "620"…); a comparação lá precisa ser refeita com a coluna certa.
- Correção (`src/lib/similaridade.ts`, testes `similaridade.test.ts`): `notaSemelhanca` = palavras em comum + código de modelo
  (`codigosDeModelo`: letras+números 4+, junta hífen; ausente → máx. 35) + peça/acessório ANTES do nome do produto, "compatível" ou
  "para/p/" → máx. 40 + voltagem trocada −25 + preço fora de 35%–300% da planilha −30. `situacaoPelaNota`: ≥ mínimo do lote = sucesso,
  ≥ 50 similar, < 50 não encontrado (não preenche produto; deixa as opções). Robô (`processarFila`): 5 candidatos, escolhe a melhor nota,
  2ª busca "nome + código do modelo" quando fraco. Importação ignora SUBTOTAL/TOTAL/cabeçalho/só número (`linhaNaoEhProduto`) e avisa.
  Lote: botões "Refazer busca" (não aprovados → fila) e "Remover N linhas que não são produto".
- **Robô pela BUSCA DO SITE (extensão 1.1.0)**, como o robô do PrecificaLote: "Buscar na fila" abre (no clique) a aba
  `pdv-busca|<PDV>`; `buscarNoSite()` leva a aba para `lista.mercadolivre.com.br/<slug>`; `anuncio.js` (`buscaDoRobo`) lê o JSON-LD
  `@graph` (48 Product: nome, preço, foto, marca, link; preço "de" pelos cartões) e devolve por postMessage (confere a página pelo slug);
  a aba fica aberta e vai para o próximo termo (1,2 s entre buscas); no fim fecha. Site vazio/erro → catálogo (API). Página sem
  resultados nem aviso = verificação do ML → `VerificacaoML`: o robô PARA, item fica na fila, pessoa resolve na aba (não contornar).
  Teste no Chrome: "Batedeira planetária PBP90A" (antes Tedge errada) → "Batedeira Planetária Philco … Pbp90a" nota 100; PMO30F certo e a
  peça "Teclado Membrana … Pmo30f" com 40. Extensão instalada na loja ainda é 1.0: tela do lote avisa para atualizar (zip de novo por
  cima da pasta + ↻ em chrome://extensions).
- Rodada real no lote (22/11 22:20–22:36, extensão 1.1 no Chrome do usuário): 57 buscados pelo site → 44 sucesso (conferidos: PBP90A,
  OBAT641, PH10P, ME36B, MO-01-21-B, AWD01, PPP01P, ME3EP, ST65L… antes peças/modelos errados; 9 de anúncios fora do catálogo /up/),
  3 similar, 9 não encontrado (modelos que não existem no ML: MHP35S2, MHP35B2, CMS23ARBNA, CMS46ABBNA, BMS46ARANA, BFE62A, WAF2S,
  PH110AZ, L-1200RL). O robô parou 2x com "verificação" mas a página estava normal: checagem automática do ML depois de ~25 buscas.
  Ajustes: `buscarNoSite` espera até 45 s mesmo após aviso de verificação; robô com 2,5 s entre buscas e, na verificação, espera 30 s e
  tenta de novo (até 2x) antes de parar. Itens "não encontrado" agora limpam o produto antigo (título volta ao termo, sem preço ML).
  Na 3ª retomada a aba do PDV foi trocada e a aba antiga do robô (opener morto) não respondia; fechada, o usuário retomou e TERMINOU
  (23:04). **Resultado final do lote: 80 sucesso, 8 similar (+1 kit remarcado), 12 não encontrado, 1 aprovado** (antes: 49/50 com
  peças e modelos errados + 23 subtotais). Regra nova: anúncio de kit/várias unidades sem "kit" no termo → máx. 70 (conferir).
  Atenção: se a aba do PDV for trocada, feche a aba antiga do robô antes de retomar (ela fica ligada à aba velha).
- **Editar produto do lote → "Salvar e buscar de novo"**: salva nome/código/qtd/grade/pallet, grava termo = nome editado e refaz a busca
  daquele item com a mesma regra do robô (`buscarItem` + `criarBuscador`, extraídos de `processarFila`; busca do site se extensão 1.1).
- **Menu ⋮ da lista de lotes completo (como o PrecificaLote)**: Abrir lote, Editar cadastro (nome, observação, % desconto,
  similaridade — `EditarLoteDialog`), Marcar Em criação/Disponível/Vendido (gestor), Ajustar custos (% sobre o preço recalcula cada
  item; ou valor pago → `recalcular_custo_lote` — `AjustarCustosDialog`), Transferir produtos (abre o lote com `?acao=transferir`),
  Baixar/Exportar (Excel com todos os itens; custo só com "ver custo"; `exportarLote`), Editor de post, Excluir (gestor).
  Arquivo: `src/components/lotes/menu-lote-acoes.tsx`.
- Reavaliação offline com os candidatos já buscados desse lote: antes 49 sucesso/50 similar (com peças e modelos errados); agora
  56 sucesso (todos conferidos, modelo batendo), 14 similar, 31 não encontrado, 23 subtotais fora.


## Sessão 20–21/11/2026 — Busca por link do ML no ar, menu ⋮ dos lotes e Editor de post
- **Função `ml-buscar` v12 publicada** (corrige busca por link, inclusive link colado com ": " antes). Usuário testou: OK.
  Permissão local `.claude/settings.local.json` (raiz) deixa o Claude rodar `npx supabase functions deploy … --project-ref blqgmueqsqqpflorusrm`
  (o Supabase ainda pede `--yes`).
- **Nova varredura do PrecificaLote** (conta do usuário, só leitura): menu ⋮ de cada lote (Abrir, Editar cadastro, Marcar Disponível/Vendido,
  Ajustar custos, Transferir, Baixar/Exportar, Excluir) e `/edit-post` (camadas fundo/logo/foto/textos, layouts salvos, legenda com campos).
- **Lista de lotes: menu ⋮ por linha** (`MenuLote` em `_app.lotes.index.tsx`): Abrir lote, Editor de post e, para admin/gerente,
  Marcar como Em criação/Disponível/Vendido e Excluir. Excluir usa `excluirLoteConfirmando()` (`src/lib/lotes.ts`), o mesmo de dentro
  do lote: bloqueia lote com produtos lançados no estoque; avisa quando a RLS não deixa (só gestor).
- **Editor de post** (`src/lib/post.ts` + `src/components/lotes/editor-post-dialog.tsx`): arte 1080×1350 em canvas; 3 layouts prontos
  (Verde saldão, Azul, Vermelho oferta) e layouts da loja; camadas com cor, fonte, negrito/itálico/riscado, faixa, posição (arrastar na arte);
  logo enviada vira data URL (≤400 px) dentro do layout; campos {nome} {precoML} {precoVenda} {desconto} {qtd} nos textos e na legenda.
  Abre pelo menu ⋮ e pelo botão "Editor de post" dentro do lote. Em cada produto do lote: botão **Compartilhar** (verde) → escolhe layout,
  edita legenda; celular abre o compartilhar (WhatsApp) com a imagem; computador baixa o JPG; a legenda sempre vai para a área de transferência.
  Fotos do ML liberam CORS (testado: imagem exportada). Último layout usado fica lembrado no aparelho (localStorage).
- **Migration `20261120000028_post_layouts.sql` (tabela `public.post_layouts`, RLS pode_lotes + pode_ver_loja; excluir só gestor) — APLICADA (conferida em 21/11).**
  Comando usado (uma migration por vez):
  `npx supabase db query --remote=blqgmueqsqqpflorusrm --yes --workdir "<pasta do PDV>" -f "supabase/migrations/20261120000028_post_layouts.sql"`.
  ⚠️ **NUNCA `db push`**: o banco não tem o histórico de migrations e o dry-run quer reaplicar as 32.
- **Pessoas → Excluir usuário direto na lista** (admin; em quem tem login, menos o próprio admin): consulta os motivos na função
  `admin-usuarios` e só exclui se nunca teve movimento (mesma regra da aba LOGIN E PERMISSÕES). O cadastro da pessoa continua.
- **Pessoas → "Excluir" (cadastro) para quem NÃO tem login** (cliente, fornecedor, funcionário; só admin): funções
  `motivos_excluir_pessoa()` e `excluir_pessoa()` (migration **`20261121000029_excluir_pessoa.sql` — APLICADA em 21/11**; conferido: sem login e sem movimento → pode; com login → "exclua o usuário primeiro").
  Movimento = qualquer linha em qualquer tabela com FK para `public.pessoas` (lido do `pg_constraint`, entra tabela nova sozinha).
  Quem tem login: primeiro "Excluir usuário", depois o cadastro.
- **Link do ML que traz produto diferente** (ex.: `.../up/MLBU3962023842?pdp_filters=item_id:MLB4667725923`): o ML responde 403
  ("PolicyAgent") para o anúncio de outro vendedor E para `/user-products/MLBU…`; a página do anúncio cai na verificação de
  "tráfego suspeito" (não contornar). Sobra só a busca pelo nome do link → produtos PARECIDOS. `ml-buscar` agora tenta
  `/user-products` (pega o produto exato se um dia o ML liberar, inclusive o catálogo ligado) e devolve `aviso`; a tela de inserir
  produto e a aba Configuração Mercado Livre mostram o aviso em amarelo. Link de catálogo (`/p/MLB…`) segue exato.
- **Busca de link igual ao PrecificaLote: extensão do Chrome** (pasta `extensao-chrome/`, pacote `public/extensao-salvados-lp.zip`,
  baixado pela tela). O favorito "Enviar para o PDV" saiu (usuário achou complicado). Fluxo: Inserir produto → aba Link → colar → Buscar.
  Com a extensão (ela marca o PDV com `data-salvados-ext`), `capturarPeloNavegador()` abre o link numa aba chamada
  `pdv-captura|<origem do PDV>`; o `anuncio.js` da extensão só age nessa aba, lê o JSON-LD Product da página (nome, preço, marca, foto;
  preço "de" pelo aria-label; item_id do link; categoria do breadcrumb), devolve por `postMessage` (origem validada dos dois lados) e
  fecha a aba (~2 s). Sem a aba do PDV (sem opener): plano B `/capturar#<json>` (localStorage + BroadcastChannel; lista "Recebidos").
  Falhou/sem extensão → busca normal pela API (com aviso de "parecidos" e as instruções de instalar). Testado no Chrome com o link do
  short (aba abriu, leu 33,90 / de 64,90 / Hueto / MLB4667725923, devolveu e fechou). Origens liberadas no manifest:
  eco-sistema-tb.vercel.app e localhost:5173 — se o domínio mudar (ex.: sistema.grupotbdearaujo.com.br), atualizar manifest.json,
  `anuncio.js` (regex da origem), gerar o zip de novo e recarregar a extensão. Só computador (Chrome/Edge).
  Quando cai no jeito antigo, o aviso amarelo mostra o motivo ("extensão não detectada nesta aba: aperte F5" ou o erro da leitura).
  Aba do PDV aberta ANTES de instalar a extensão não a enxerga até o F5 (caso do print 21/11 01:26).
- **Lote: etiqueta e compartilhar visíveis** (21/11): em cada produto, botões "Etiqueta" e "Compartilhar" logo abaixo do nome (antes o
  compartilhar ficava na última coluna, escondido pela rolagem; etiqueta no lote não existia). "Imprimir todos/filtrados" no topo.
  Usa o `EtiquetasDialog` e os modelos da tela Etiquetas (De = preço ML, Por = preço de venda, código de barras = SKU, 1 por unidade).
  Sem preço de venda ou com ocorrência (não chegou/avaria total): fica de fora. "Imprimir etiqueta ao salvar" (Inserir produto) agora
  imprime no último modelo usado, por quadro escondido (`imprimirEtiquetasNaPagina`, sem pop-up). Etiqueta de item de lote NÃO é
  registrada em `etiquetas_impressas` (só produto do cadastro conta como movimento).
- **Exclusão dos 5 produtos inativos (21/11, pedido e confirmado pelo usuário, exceção à regra "não apagar histórico")**: A100002,
  A100027, A100058, A100064 (Eldorado, cadastros repetidos sem venda) e A100000 "TESTE PDV - apagar" (Monte Sinai) com as 2 vendas de
  teste canceladas nº 10001 e 10002. Apagados direto no banco numa transação: 2 vendas (itens/pagamentos/lançamentos em cascata),
  8 registros de etiqueta, 10 movimentos de estoque, 5 produtos. Conferido: 0 inativos, 73 produtos.
- **Trocar de loja sem sair (21/11)**: quem tem mais de uma loja liberada (não-admin) agora tem o seletor "Loja atual" no menu e na
  frente de loja (`setLojaAtual` → `escolherEmpresa`, vale para a sessão; sem "Todas as lojas", que segue só do admin). A tela de
  escolha no login continua.
- **Produto avulso: duplicado parecido, grade e Editar produto (21/11)** — migration **`20261121000032_avulso_trava_grade.sql`
  (APLICADA, ensaiada)**. O que passou (ELMORANE): "CHALEIRA ELETRICA ZENTRA" × "…1,8L" × "…1,8LT" e "BLUSA FEMININA" × "…BASICA SEM
  MANGA" (nomes parecidos, não iguais). Agora: `normalizar_nome` (banco e `duplicados.ts`) iguala unidades ("1,8LT" = "1,8 L" =
  "1,8 litros"); `criar_produto` (novo parâmetro `_grade`) recusa igual (nome/código) entre ativos da loja; tela do avulso lista
  PARECIDOS (`nomesParecidos`: um contém o outro com 2+ palavras, ou 80% das palavras) com "Dar entrada neste" e só cadastra com
  "É outro produto" marcado; campo Grade. Cadastro de produtos: botão Editar (nome, código, grade, preço com permissão
  "alterar preço", custo com "ver custo"); gatilho `trg_trava_produto_duplicado` recusa renomear/reativar para igual a outro ativo.
- **Venda retroativa + trava de duplicado no banco + aviso de versão (21/11)** — migration
  **`20261121000031_trava_duplicado_venda_retroativa.sql` (APLICADA, ensaiada com rollback)**:
  - Duplicado que passou (ELMORANE, NOVO TESTE P3658 às 18:23) veio de aba aberta antes da trava (publicada 15:57). Agora o gatilho
    `trg_trava_item_duplicado` recusa no banco item repetido no mesmo lote (código 8+ dígitos ou `normalizar_nome`) quando o insert vem
    da tela (`current_user = 'authenticated'`); RPCs (desmembrar/avaria/transferir) e origem planilha passam. Duplicados antigos
    (planilhas: LOTE MOGI NOV 13, TESTE - Lote ML 129 216) continuam.
  - `src/lib/versao.ts`: a cada 5 min / ao voltar para a aba compara o `index-*.js` publicado; se mudou, aviso "Atualizar".
  - Venda retroativa: ação especial `vendas.retroativa` (editor de permissões do PDV; RESTRITA: fora de "todas", sem linha = NÃO; admin
    sempre). `lancar_venda_retroativa()` = validações da `finalizar_venda` + data/hora (até 30 dias, não futuro) + motivo; `caixa_id`
    nulo; `vendas.retroativa/motivo_retroativa`; estoque baixa na hora; financeiro/relatórios pelo `data_venda`. Tela: Vendas →
    "Lançar venda retroativa" (`venda-retroativa-dialog.tsx`); lista mostra etiqueta "Retroativa" (lançada em / motivo).
- **Trava de produto duplicado (21/11)**: `src/lib/duplicados.ts` (`acharDuplicado`: código de barras igual > nome igual,
  ignorando maiúsculas/acentos/pontuação/espaços). Inserir produto do lote: duplicado no lote BLOQUEIA o "Inserir" e oferece
  "Somar N un. no existente" (ou mudar o nome/código); mesmo anúncio do ML com nome diferente = só aviso (variação); já existe no
  estoque da loja = só aviso. Produto avulso: duplicado na loja bloqueia "Cadastrar" e oferece "Dar entrada no existente"
  (`movimentar_estoque` entrada). Editar produto do lote: não deixa renomear para nome/código de outro item. Só na tela (sem
  restrição no banco; produtos antigos duplicados continuam). "Lançar no estoque" também não duplica: migration
  **`20261121000030_lancar_lote_soma_existente.sql` (APLICADA 21/11, ensaiada com rollback)** — `lancar_lote_estoque` procura na
  mesma loja produto ativo com mesmo código (8+ dígitos) ou `normalizar_nome()` igual; achou → entrada nele, custo médio ponderado,
  preço de venda mantido; senão cria. `lote_itens.lancado_produto_id` evita relançar e trava excluir lote. Retorno agora jsonb
  `{novos, somados}` (tela mostra os dois). Ensaio: 3 itens → 2 novos + 1 somado (estoque 4→5, custo 10,03, preço mantido); 2ª vez 0/0.
- **Ajuste de estoque que só aumentava (21/11)**: a tela pedia "use − para tirar" e quem digitava 2 somava (e o "−" do celular não era
  entendido). Agora, em Produtos → Movimentar estoque, o **Ajuste** (aba padrão) pede o **estoque correto (contado)** e manda a diferença
  com sinal para `movimentar_estoque` (banco igual), com prévia "28 → 25 (tira 3)". Entrada/Perda/Devolução: quantidade positiva.
  Bloqueia estoque negativo; motivo obrigatório em ajuste e perda.
- **"Cannot coerce the result to a single JSON object" (ELMORANE, 21/11)**: era lote que não existe mais (lotes de teste excluídos;
  aba/link antigo). Conferido no banco: ELMORANE (gerente, Eldorado + Monte Sinai, tela pdv.lotes) lê os 4 lotes atuais.
  `carregarLote` usa `maybeSingle()` e a tela mostra "Lote não encontrado: não existe mais ou é de loja sem acesso" + botão para a lista.
- **Editar custo** (21/11): no "Inserir produto" (todas as abas) os campos "% custo" (começa no % do lote) e "Custo (R$)" são
  editáveis (digitado à mão vence o %; "usar %" volta ao automático). Em cada produto do lote: botão "Editar" → tela
  `EditarItemDialog` (custo em R$ ou % do preço, margem, preço ML, preço de venda, quantidade, grade, pallet, código de barras).
  A coluna Custo da tabela também é editável (com o olho aberto). "Reaplicar preços e custo %" e "Recalcular custo pelo valor pago"
  substituem custos editados (agora avisam na confirmação).
- **Compartilhar no celular** (21/11): o menu de compartilhar do aparelho não abria porque a imagem era gerada DEPOIS do toque
  (o celular só aceita `navigator.share` na hora do toque) e caía no "baixar". Agora a arte é gerada ao abrir o diálogo
  ("Preparando imagem…") e o toque chama `share` sem espera; a legenda vai junto e é copiada depois.
- **0028 só foi aplicada de fato em 21/11 ~01:30** (a conferência anterior com `head: true` deu "ok" falso); salvar layout de post voltou.
- **Visual Salvados LP: preto e amarelo** (`src/styles.css`: primary amarelo da logo ≈ #F7AC03 com texto preto, barra lateral preta;
  `text-primary` no tema claro vira dourado escuro para dar leitura). Logo em `src/assets/logo-salvados.jpg` (barra lateral e login),
  símbolo em `src/assets/logo-simbolo.png` (topo no celular) e `public/favicon.png`; título da aba "Salvados LP — Gestão".
  Original: `LOGO SALVADOS LP.jpg` (fora do Git).
- **Menu sempre na barra lateral esquerda**: saiu o visual "ERP" (menu no topo) e a escolha em Minha conta (`layout-topo.tsx` e `visual.ts` apagados).
- Testes 142 (novo `post.test.ts`); build ok. Publicado com push na `main` (Vercel).


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
- Testes: 127; build ok. **Ensaios rodados e conferidos (08/11), 0022 APLICADA e função `admin-usuarios` publicada.** Ensaio: entrada, etiqueta e venda BARRAM; só cadastrado exclui; usuários: só VIVIANE (vendedor) sem nenhum movimento; 4 permissões por unidade criadas (1 liberada, ELMORANE gerente). Comandos de banco: `npx supabase db query --remote=blqgmueqsqqpflorusrm --yes -f "<arquivo>"`; função: `npx supabase functions deploy <nome> --remote=blqgmueqsqqpflorusrm --yes --workdir "<pasta do PDV>"`.

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

## Sessão 22/11/2026 (cont.) — Exportação no modelo PrecificaLote e junção de itens repetidos
- **Baixar/Exportar** do lote agora gera **.xlsx** no mesmo modelo de `PRODUTOS 127V.xlsx` (exceljs, carregado só ao exportar):
  - aba Planilha1: nome do lote em C2:I4, Qnt. Pallet, Qnt. Categorias, SUBTOTAL na linha 6 e as colunas
    Pallet · Qtd · Condição (Grade) · Descrição do Item · Valor Unit (preço de venda) · Valor Total · Custo Unit (só para quem vê custo) · Categoria · Link · Codigo (SKU);
  - abas Resumo por Pallet e Resumo por Categoria. Itens "não chegou" e "avaria total" ficam de fora.
- **Importar planilha:** linhas do mesmo produto viram um item só, com a quantidade somada (`unificarLinhas` em `src/lib/duplicados.ts`):
  mesmo código de barras ou mesmo nome normalizado, e a mesma grade. Nome igual com códigos de barras diferentes não junta.
- Lotes já importados (ex.: LOTE MOGI 220V NOVEMB) continuam com as linhas repetidas; juntar esses só com o OK do usuário.
- **Feito com OK do usuário:** no LOTE MOGI 220V NOVEMB (ainda em criação, nada lançado) foram juntados 6 grupos de linhas repetidas,
  mesmo modelo e mesmo anúncio do ML: PMO23B (3→1), MO-02-34, ME23B, PCL10QF, BLQ1300 e L-99-FB. O lote passou de 101 para 94 itens,
  e a quantidade total (128) não mudou. Valor da planilha e custo ficaram pela média ponderada, então o custo total não mudou.
  Ficaram separados de propósito, porque a descrição é diferente: "Liquidificador Série 5000" (P3696/P3697) e "Ventilador de parede 50cm" (P3777/P3779).
- A importação também junta pelo **código do modelo** (`modeloParaJuntar` em `src/lib/similaridade.ts`): "Microondas PMO23B 220v" = "Micro-ondas PMO23B".
  Não junta 220V com 127V (sem voltagem junta com qualquer uma), não junta kit com unidade e não junta códigos de barras diferentes.
  Nome sem código de modelo (ex.: "Ventilador de parede 50cm") só junta se o nome for igual. O valor da planilha vira a média ponderada.

## Sessão 23/11/2026 — % no editar produto e pallets nomeados/renomear
- **Editar produto do lote:** "Custo %" (da planilha, ou do preço) e "Desconto %" (sobre o preço ML) agora vêm preenchidos e dá para editar.
  Mudar o % recalcula o custo / preço de venda, e mudar o valor recalcula o %. O preço de venda usa o arredondamento do lote.
- **Editar produto do cadastro:** novo campo "Custo % do preço" (custo = preço de venda × %), para quem vê custo.
- **Pallets:**
  - na importação da planilha há a coluna opcional "Pallet": cria os pallets com o nome da planilha e liga os itens a eles;
  - a junção de itens repetidos não junta o mesmo produto em pallets diferentes;
  - a tela "Pallets" (botão ao lado do filtro de pallet e em Parâmetros) cria, renomeia e exclui pallets vazios;
  - `codigoPallet` padroniza o nome: até 15 caracteres, maiúsculas, espaço vira hífen.
- A partir de agora o deploy vai só para o `main`, não mais para a branch também, por causa do limite de deploys da Vercel (6 projetos por envio).

## Sessão 24/11/2026 — Tabela do lote sem rolagem lateral e impressão igual ao PrecificaLote
- **Tabela do lote:** cabe sem rolar para o lado (larguras fixas a partir de 1280 px; testado em 1280 e 1366). Planilha ficou embaixo do preço ML;
  ícones aprovar/opções/desmembrar/avaria/excluir foram para a coluna Situação; botões Editar/Etiqueta/Compartilhar embaixo do nome.
  Abaixo de 1280 px (tablet/celular) cada produto vira um cartão.
- **Impressão** (comparada com o PrecificaLote, só leitura): diálogo "Pré-visualização da Etiqueta" (Impressora, prévia em tamanho real, Cancelar/Imprimir);
  etiqueta redesenhada: nome em 2 linhas, SKU na vertical, De / % OFF com 2 casas, Por, código de barras e logo. Modelos prontos: 100x50/1, 33x22/3,
  50x25/2, 70x30/1, 50x30/2. Modelos personalizados (★) usam o desenho novo, com os campos que já tinham (sem logo até marcar "Logo" no editor).
  Nos modelos prontos, Grade e nome da loja não saem mais (igual ao PrecificaLote); dá para ligar num modelo próprio.
- **x/y impressos:** migration `20261124000033_etiquetas_impressas_lote.sql` APLICADA (`lote_itens.etiquetas_impressas`, `registrar_etiquetas_lote`).
  Botão Etiqueta: cinza = nenhuma, amarelo = parte, verde = todas. Etiquetas impressas antes desta data não foram contadas.
- Não verificado: impressão em papel (conferir tamanho e leitura do código de barras na impressora) e o "Imprimir Todos" do PrecificaLote (não foi clicado).

## Sessão 24/11/2026 (cont.) — Lógica do preço da etiqueta igual ao PrecificaLote
- Varredura (só leitura): no PrecificaLote **De = preço atual do ML** (não o cheio) e **Por = preço atual − desconto do lote**. Exemplos: cheio 499 / atual 376 →
  etiqueta "De 376,00"; encontrado 339 / 288 com 70% → 90,99 (lote com planilha arredonda). Nos lotes sem planilha vistos, o preço é exato (415,28 − 10% = 373,75).
- Nossa etiqueta nunca usou o custo. O erro: ao lançar no estoque, o "De" do Cadastro ia com o preço CHEIO (`preco_ml_original`), e o % OFF não batia com o desconto.
  Corrigido na migration `20261124000034_preco_de_igual_preco_ml.sql` (APLICADA): `lancar_lote_estoque` grava `preco_de = preco_ml` (e preenche o De de produto somado que não tinha).
- Editar produto (Cadastro): campos **Preço ML ("De")**, **Desconto %** e **Preço de venda ("Por")**; o custo ficou separado. O "Custo % do preço" tinha sido
  confundido com desconto (P3687: custo foi de 42,71 para 13,50).
- **Feito com OK do usuário (24/11):** De de 43 produtos já lançados corrigido do preço cheio para o preço atual do ML (preço de venda, custo e estoque não mudaram).
  Valores antigos (SKU De antigo→novo), para desfazer se precisar: P3663 659→539, P3668 636.9→463.89, P3669 764.9→568, P3674 649→499, P3683 299.9→194.93, P3686 154.9→98.84, P3688 172.9→109.91, P3691 289.9→204.24, P3692 134.51→114, P3697 419.9→227.99, P3698 266.9→139.9, P3701 207→141, P3703 410.51→344.82, P3705 269.99→190.92, P3711 489.9→286.29, P3717 177.14→119.89, P3723 566.03→484.9, P3731 849.9→783.79, P3734 519→464.17, P3737 631.9→415.9, P3738 529→470.81, P3740 669→515, P3743 735.71→380, P3745 999→648, P3746 504.9→394.99, P3748 129.9→110.9, P3749 397.65→349, P3752 449.9→282, P3754 462.9→237.91, P3758 309.99→227.79, P3760 699.9→561.79, P3761 489.24→463.05, P3762 459.99→349.9, P3764 322.9→187.78, P3765 229.9→134.89, P3767 248.75→189, P3769 199→179.55, P3771 269.9→211, P3772 449.9→341.92, P3775 229.9→156.56, P3776 299→221.56, P3779 305→247, P3780 260.95→229.9.
- **Feito com OK do usuário (24/11):** os 5 com preço alterado à mão passaram a preço ML − 10% exato, com De = preço ML (Por antigo→novo): P3694 174,99→133,99,
  P3713 299,99→269,91, P3687 144,99→85,41, P3727 319,20→172,37, P3750 65,49→48,39. De antigo: 194,90, 470,00, 154,90, 399,00, 72,67.
- **Feito com OK do usuário (24/11):** custo do P3687 voltou de 13,50 para 42,71 (o do lote).
- Observação: o arredondamento (cima, ,99) faz o % OFF ficar um pouco menor que o configurado ("Arredondamento de preços").

## Sessão 25/11/2026 — Etiqueta da loja 2 (impressora nova Elgin/Bematech, rolo com 2 colunas)
- Foto: etiqueta única no meio do rolo, em cima do vão. **Causa confirmada por PDF:** modelo "Meu modelo" (100x50, 1 por linha) impresso com o papel do Windows em 50x25
  (uma etiqueta só): o Chrome reduziu pela metade e a impressora centralizou. A de baixo da foto (P3729, 14:57) saiu em 100x50 real, ocupando 2 linhas.
- Banco: P3717 4 impressões (até 14:48), P3729 1 (14:57), P3675 5 (15:28), P3669 1 (15:28); "Meu modelo" salvo às 15:40 (depois da foto, continua 100x50/1).
  O banco não guarda a impressora nem o modelo usados em cada impressão, nem a loja de onde se imprimiu o lote.
- Computador novo já vinha com o 1º da lista ("Meu modelo"). Agora precisa **escolher a impressora** antes de imprimir (fica salvo no computador).
- Novo no diálogo: "Papel na impressora (Windows): 103 × 25 mm", "Teste e ajuste" (folha de molduras que não conta como impressa; ajuste fino em mm por computador,
  `eco.ajusteEtiqueta`). Cada linha de etiquetas é uma página (`paginas`), conferido em PDF: 103x25, sem página sobrando.
- Editor de etiquetas: "Salvar como novo" sempre disponível; "Salvar alterações" avisa que o modelo vale para todas as lojas.
- PENDENTE: configurar o papel no Windows da loja 2 (103 × 25 mm, medir o rolo) e imprimir o teste.
