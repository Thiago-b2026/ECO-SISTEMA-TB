# Análise do PrecificaLote (precificalote.com.br) — 2026-10-31

Fonte: análise do bundle JS público (SPA React + Vite, shadcn/Tailwind). Backend próprio em `https://precificalote.com.br/api` (JWT com `/auth/refresh`). Não foi feito login — telas internas inferidas pelo código do front.

## O que é
SaaS para lojas de salvados/lotes: o usuário sobe a planilha do lote (Excel), um **robô** pesquisa cada item no **Mercado Livre** (por EAN, nome, URL ou Google Lens), traz preço/foto/categoria/condição, e o sistema calcula **custo rateado, preço de venda sugerido, etiqueta** e exporta para o ERP (Sismaster) ou via API.

## Rotas (telas)
`/login`, `/register`, `/reset`, `/retomar-pagamento`, `/dashboard`, `/projetos`, `/projeto/:id`, `/lotes`, `/lote/:arquivoId`, `/lote/:arquivoId/transferir`, `/produto`, `/robo`, `/assinatura`, `/funcionarios`, `/perfil`, `/editor/barcode`, `/ref-barcode`, `/api`, `/tutoriais`, `edit-post`.

## Fluxo principal
1. **Dashboard / Upload**: envia .xlsx/.xls "com os produtos para raspagem", informando colunas por letra (A, B, AB), **% de desconto sobre o preço do ML**, **% de lucro sobre o custo calculado**, margem de erro (%). Botão "Enviar para o Robô".
2. **Projeto (planilha processada)** → tarefas por item com status (Aguardando revisão, Concluído…). O robô devolve **candidatos**; usuário escolhe, aprova similares (individual ou "aprovar todos"), corrige termo, reprocessa, "Não achou", insere manualmente.
3. **Liberar para exportação** (item ou todos) → exporta planilha "Padrão Sismaster" ou "Padrão manual", ou consome via API.
4. **Ocorrências** por item: `NAO_CHEGOU`, `AVARIA_TOTAL` (custo continua no lote), `AVARIA_PARCIAL` (vira produto separado com preço menor e etiqueta própria). Mostra "recuperado" e "deixa de ganhar".
5. **Saldo de custo**: ao excluir itens, o custo vira saldo que "vai baixando conforme você insere os produtos que faltam"; pode zerar ("Não vou repor").

## Lotes manuais (`/lotes`, `/lote/:id`)
- Criar lote: nome, observação, valor do lote, `minimoSimilar` (70%), % desconto, % custo.
- Inserir produto por **código de barras (câmera/scanner)**, busca no ML por nome/URL/Google Lens, ou "Preencher manualmente"; detecta duplicado e pede quantidade a adicionar.
- **Pallets** (código até 15 caracteres) dentro do lote; download por pallet.
- **Transferir entre lotes** (wizard: escolher produtos/pallet → mapear pallets "levar junto / mesmo nome / novo MZ automático" → revisão; detecta duplicados).
- Status do lote (Em criação → …), ajuste de custo, dashboards mensal/anual: produtos únicos, total de unidades, **desempenho e ranking por operador**, cadastros por categoria (Top 10), atividade por dia da semana.
- Por produto: preço venda vs preço ML, margem, impressões de etiqueta (x/y impressos), exportados (x/y), imagens (com compressão no cliente), variações, compartilhar no WhatsApp.

## Etiquetas e posts
- **Editor de etiqueta** (`/editor/barcode`): layout em mm, etiquetas por linha, espaço, campos (preço, com desconto, código de barras), JsBarcode, "Imprimir todas (PDF)", layouts compartilhados.
- **Impressoras** cadastradas + impressora padrão; marca "tag impresso".
- **Editor de post** (`edit-post`): monta imagem para redes/WhatsApp (layouts, textos, fundo), compartilhar via Web Share.
- **Referências de barcode** (`/ref-barcode`): EAN → nome de referência; minhas referências + base compartilhada entre usuários.

## Configurações (`/perfil`)
Logo da empresa, impressora padrão, **margem de erro**, **arredondamento por faixa de preço** ("padrão de centavos": até 50, 50–100, 100–500, 500–1000, >1000), troca de e-mail com código, senha.

## Operadores (`/funcionarios`)
Cadastro de funcionários (ativar/desativar), seleção "Quem é você?/Trocar operador" na sessão — métricas por operador.

## Robô e cobrança
- `/robo`: fila, produtos/minuto, buscas do dia (**1 busca = 1 crédito**), taxa de sucesso, consumo 30 dias. Robô roda como app desktop ("Precificador", "Desktop - robo 1").
- `/assinatura`: planos com créditos mensais (anual, renovável), **créditos avulsos** (não expiram), upgrade pró-rata, plano de teste/demonstração. Pagamento **PagBank**: PIX (com desconto) ou cartão até 12×. Bloqueio por pagamento atrasado.
- Cadastro exige **CNPJ** + confirmação de e-mail.

## API pública (`/api`)
Autenticação por token + CNPJ no path. Endpoint retorna produtos pendentes e **os marca como exportados** (não voltam). Campos: id, nome, categoria, condição ML (A, B, E…), custo, código de barras, código do pallet, link ML, preço ML, valor da planilha, qtd disponível p/ exportação e p/ etiquetas, imagem, lote de origem. Opção "Exigir liberação para exportar". Rate limit.

## Endpoints backend (amostra)
lote: `cadastro, listar, filtros, resumo/:id, custo/:id, status/:id, fila/:id, ajusteCusto/:id, mudar-status/:id, criar-tarefa, gerar-produto, verificar-termo, :id/transferencia(/preview), dashMensal/:id, dashTotalMensal, dashTotalAnual, resumoTotal`
tarefa: `listar, resumo, candidatos/:id, escolher-candidato, aprovar-similiar, aprovar-allsimilar/:id, correcao-similar, correcao-termo, liberar-exportar(-todos), revogar-exportar, saldo-custo/:id(/zerar), inserir/:id, liberar-bloqueado`
arquivo: `upload, listar, listar-filtros, download, download-pallet, download/padrao-sismaster, download/padrao-manual`
produto, pallet, ocorrencia, impressora, funcionario, layout-post, usuario (refBarcode, arredondamento, margem-erro, logo, perfil), assinatura, creditos, pagamento, robo, integracao/config, tutorial/video.

## Navegação logada (Chrome, conta do usuário, só leitura) — 2026-10-31
Menu: Meus Lotes (com Planilha) = `/dashboard`+`/projetos`; Meus Lotes (sem Planilha) = `/lotes`; Robô; Tutoriais; seletor de Operador no rodapé.

- **Lotes com planilha** (`/dashboard`): cards Lotes ativos / Aguardando revisão / Concluídos; tabela arquivo, data, progresso (157/157), status. "Novo Upload": arquivo .xlsx, colunas (Produto=D, Preço custo=E…), **Desconto %** sobre o ML, **Margem de erro %** (compara nome e preço da planilha), **Score mínimo %** (95: abaixo vira Similar), botão "Enviar para o Robô".
- **Detalhe da planilha** (`/projeto/:id`): filtros Total/Sucesso/Similares/Bloqueado/Não encontrado (ex.: 157 = 80/71/0/6), "Reprocessar N tarefas", "Ações do lote". Cada linha: termo × produto achado, pallet (MZ-0045), qtd, **preço planilha, custo, preço encontrado (cheio e promo), preço sugerido, margem %, desconto sugerido %**, status do robô com % de similaridade, revisão (Verificado/Reprovado) e lista "Selecione o produto correto" com até 3 candidatos. Paginação de 50.
  - Custo = ~30% do valor da planilha (custo do lote rateado proporcional ao valor da planilha).
- **Lotes sem planilha** (`/lotes`): cards Disponíveis / Em criação / Vendidos (com valor); colunas Total itens, Variedade, Categorias, Pallets, **Valor do lote + KPI (ticket médio)**, Status. "Novo Lote": nome, observação, **Ação (modo de seleção)**, similaridade mínima (50–100%, padrão 70), % custo, % desconto.
- **Detalhe do lote manual** (`/lote/188`): cards Itens (64 / 37 únicos, gráfico), Valor custo total (oculto com olho), Potencial venda total + ticket médio, Lucro estimado %. Filtros data, pallet, condição, categoria, operador, desmembramento. Tabela: produto + SKU interno (P4519), data, qtd, pallet/condição (MZ-0409 / A), categoria, operador, **venda unit. editável inline**, ref. ML; ações imprimir, abrir ML, editar, compartilhar. "Imprimir todos", "Salvar alterações".
  - **Inserir produto**: abas Código de barras / Nome / URL do produto / Busca guiada; "Buscar no ML", "Inserir sem buscar", similaridade mínima; campos título, preço ML, preço promo, preço editado, desconto %, % custo, custo unit., quantidade, **categoria, grade (A…), pallet** obrigatórios, "Imprimir etiqueta ao salvar"; atalho Pendências.
  - Tutoriais citam também **desmembramento** (caixa → unidades; kit com peça quebrada) e **recalcular custo** do lote ao finalizar.
- **Robô** (`/robo`): status da fila, créditos do mês (5.000 no plano Pro, renovação dia 1), avulsos, fila pendente, velocidade/min, feito hoje.
- **Assinatura** — preços (anual, valor/mês): Teste grátis 100 créditos únicos; Starter R$ 297 (1.000/mês); **Pro R$ 497 (5.000/mês, plano atual)**; Business R$ 797 (10.000); Enterprise R$ 1.197 (20.000); Scale R$ 1.697 (40.000); Corporate sob consulta. 10% off no PIX. Créditos avulsos: 100 = R$ 50, 500 = R$ 225, 1.000 = R$ 400, 10.000 = R$ 2.000.
- **Perfil**: dados, senha, logo (usada nas etiquetas), margem de erro, **impressoras/etiquetas** (100x50/1, 33x22/3, 50x25/2, 70x30/1, 50x30/2), **arredondamento** (para cima/baixo, centavos ,00/,90/,99, granularidade unidade/dezena/centena por faixa: <50, 50–100, 100–500, 500–1000, >1000), link para operadores e referências de código de barras.
- **Operadores** (`/funcionarios`): só nome + ativar/desativar.
- **Editor de etiqueta**: modelo com título, "De: R$ 3.724,40 / Por: R$ 2.599,90", % OFF, código de barras, SKU, letra da grade; elementos Nome, De, %OFF, Preço, Logo, SKU, Barcode; imprimir 1 (HTML) ou todas (PDF).
- **API**: login `POST /api/usuario/login` (JWT de 1h); `GET /api/integracao/produtos/{cnpj}` (só consulta) e `POST` (consulta e marca como exportado); opção "Exigir liberação para exportar" (lote manual já nasce liberado).
- **Tutoriais**: 19 vídeos, inclusive integração com o ERP Sismaster.

## Ideias para o ECO-SISTEMA-TB
- Já temos lote/rateio/PDV/caixa — o diferencial deles é **busca de preço no ML + aprovação de candidatos + etiqueta**. Integração possível: consumir a API deles (produtos com custo, preço ML, EAN, pallet) para alimentar nosso estoque.
- Copiar conceitos: ocorrências (não chegou / avaria total / parcial), saldo de custo, pallets, arredondamento por faixa, ranking por operador, editor de etiqueta.
