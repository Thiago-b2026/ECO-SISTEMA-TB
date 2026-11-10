# PROMPT — Sistema PDV + Gestão de Vendas (Varejo)

Você é um engenheiro full-stack sênior. Construa um sistema web completo, em português do Brasil, de PDV (Ponto de Venda) + Gestão de Vendas para varejo de loja física, funcionando em desktop e celular, focado em performance e operação diária. Siga EXATAMENTE a estrutura abaixo.

## 1. Tecnologia
- React 19 + TanStack Start (rotas por arquivo em `src/routes`), Vite, TypeScript.
- Tailwind CSS v4 + componentes shadcn/ui; ícones lucide-react; animações framer-motion.
- Banco Postgres + autenticação via Supabase (e-mail e senha), com RLS em todas as tabelas.
- `xlsx` para importar/exportar planilhas; recharts para gráficos; jsPDF (+ autotable) para PDF.
- Fuso horário fixo em TODO o sistema: `America/Sao_Paulo`. Moeda BRL (R$ 1.234,56).
- Layout com menu lateral no desktop e menu recolhível no celular.

## 2. Perfis e permissões
- Tabela `user_roles` separada (enum `app_role`: `admin`, `vendedor`, `estoquista`) + função `has_role(user_id, role)` SECURITY DEFINER usada nas políticas RLS. Nunca guardar papel no perfil.
- **admin**: acessa tudo.
- **vendedor**: acessa tudo, exceto Usuários.
- **estoquista**: acessa Produtos.
- Página inicial após login: admin → Dashboard, vendedor → PDV, estoquista → Produtos.
- Admin inicial criado automaticamente (rota pública idempotente `/api/public/seed-admin`), e-mail: `SEU-EMAIL@exemplo.com` (trocar).

## 3. Ordem do menu
PDV → Produtos → Vendas → Caixa → Dashboard → Usuários.

## 4. Banco de dados
- `profiles` (id = auth user id, nome, email, created_at) — criado por trigger no cadastro.
- `user_roles` (id, user_id, role).
- `products` (id, nome/descricao, codigo, categoria, subcategoria, unidade texto livre, preco numeric, ativo bool, created_at). Índices em nome, codigo, categoria, subcategoria e ativo (suportar 30 mil+ produtos; usar índice trigram para busca ilike).
- `sales` (id, numero sequencial, data_venda timestamptz, subtotal, desconto, total, forma_pagamento enum `pix|dinheiro|debito|credito`, status `finalizada|cancelada`, vendedor_id, vendedor_nome, observacao, created_at).
- `sale_items` (id, sale_id, product_id nulo permitido, descricao, unidade, quantidade, preco_unitario, total).
- `cash_registers` (abertura/fechamento de caixa: usuário, data, valor inicial, valor final, totais por forma de pagamento, status).
- Cancelamento grava status `cancelada`, motivo, quem cancelou e quando.
- RLS: usuários autenticados leem produtos e vendas; vendedor/admin inserem vendas; só admin gerencia usuários e exclui registros.

## 5. Regra OBRIGATÓRIA de data/hora
- `data_venda` é a data oficial da venda. TODO filtro, ordenação, agrupamento, relatório, dashboard e fechamento de caixa usa `data_venda` — NUNCA `created_at`.
- Centralizar em `src/lib/sale-datetime.ts`: converter data+hora local (São Paulo) para ISO, início/fim do dia local, formatar no fuso de São Paulo, ordenar por `data_venda` desc + `numero` desc.
- Vendas retroativas ou importadas aparecem no dia de `data_venda`.
- Criar testes (Vitest) para essas funções.

## 6. Busca sem limite de 1000
- Criar `src/lib/fetch-all.ts` que busca em blocos de 1000 (`range`) até acabar, para não truncar resultados.
- Contagens com `select(..., { count: "exact", head: true })`.

## 7. Telas

### PDV
- Campo de busca: só mostra resultados quando o usuário digita; pesquisa no servidor por nome/código entre produtos ativos (cadastrados ou importados), ordenados por nome.
- Carrinho com quantidade editável, remover item, desconto em R$, subtotal e total.
- Formas de pagamento: Pix, Dinheiro (com troco), Débito, Crédito.
- Campo opcional de data e hora da venda ANTES de finalizar (vazio = agora).
- Bloquear finalização com total zerado.
- Importação de vendas por planilha com modelo para baixar. Colunas: produto, unidade, preço, forma de pagamento, data, hora, vendedor. Abre tela de conferência; ao confirmar, salva em `sales` e `sale_items` com `data_venda` correta e mostra sucesso/erro.

### Produtos
- Campos: descrição, preço, categoria, subcategoria, unidade (texto livre com sugestões UN, KG, CX, PC, BD).
- Cadastro avulso, edição, ativar/desativar, excluir.
- Importação por planilha (modelo com descricao, preco, categoria, subcategoria).
- Mostrar a quantidade REAL de produtos cadastrados (count exato).
- Busca no servidor por nome, código, categoria e subcategoria; rolagem infinita em blocos de 200.

### Vendas
- Filtro de data inicial e final (padrão: hoje).
- Carrega TODAS as vendas do período (fetch-all).
- Resumo: quantidade e valor de finalizadas e canceladas.
- Ver detalhes/itens e cancelar venda com motivo.

### Caixa
- Abrir caixa com valor inicial; fechar mostrando totais por forma de pagamento das vendas do dia (por `data_venda`) e diferença.

### Dashboard
- Período padrão: dia 1 do mês atual até hoje, editável.
- Cards: faturamento, quantidade de cupons, ticket médio, média diária, descontos, cancelamentos (por valor).
- Gráfico de vendas por dia em azul.
- Formas de pagamento com cores fixas: Pix azul, Dinheiro verde, Débito amarelo, Crédito vermelho (valores e %).
- Vendedores: gráfico e tabela com total, cupons, ticket médio e participação %. Classificação pelo percentual do maior total: azul = Ótimo, laranja = Bom, vermelho = Ruim (barras, marcadores, selos e legenda).
- Exportar o relatório em PDF.

### Usuários (só admin)
- Listar, criar, editar (nome, e-mail, senha, perfil) e excluir.
- Fazer pelo servidor (rotas protegidas que verificam se quem chama é admin), sem derrubar a sessão do admin.

## 8. Integração com assistentes (MCP) — opcional
- Servidor MCP em `/mcp` com login OAuth do próprio sistema, ferramentas somente leitura: `list_products` (busca), `list_recent_sales` (últimas vendas, filtro de status), `sales_summary` (totais, ticket médio e por forma de pagamento entre duas datas, fuso São Paulo). Respeitar RLS do usuário.

## 9. Design
- Visual limpo e profissional, azul como cor principal, cores via variáveis de tema (sem cores fixas nos componentes), botões grandes no PDV para uso em toque.

## 10. Ordem de construção
1. Banco, RLS, papéis e admin inicial.
2. Login e layout com menu por perfil.
3. Produtos (com importação).
4. PDV (com importação de vendas).
5. Vendas e Caixa.
6. Dashboard e PDF.
7. Usuários.
8. Testes de data/hora e MCP.

## 11. Critérios de aceite
- Nenhuma lista truncada em 1000.
- Venda com data retroativa aparece no dia certo em Vendas, Caixa e Dashboard.
- Vendedor não vê Usuários.
- Total zerado não finaliza.
- Contagem de produtos mostra o total real.
- Funciona bem no celular.
