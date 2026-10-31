# Migração dos dados do PDV antigo (Lovable)

Análise dos CSVs exportados em 31/10/2026
(`C:\PROJETOS_CLAUDE\PROJETO LOVABLE\ECO-SISTEMA-TB-main\TABELAS LOVABLE`, separador `;`).

## O que veio

| Tabela | Linhas | Observação |
| --- | --- | --- |
| sales | 5.374 | 5.372 finalizadas, 2 canceladas; nº 1 a 5.380, sem duplicados |
| sale_items | 5.845 | todos ligados a uma venda; soma dos itens bate com o subtotal em 100% |
| sale_cancellations | 3 | 2 são registros duplicados da mesma venda (clique duplo) |
| user_roles | 4 | 1 admin, 3 vendedores |
| products | 22.749 | ver seção "Catálogo de produtos" |
| profiles | 4 | NAGILA, VIVIANE, DHAFINE (vendedor) e Administrador (admin) |

- Faturamento das finalizadas: **R$ 552.074,70**
- Período real de uso: mai/2026 a out/2026
- Pagamentos: Pix 2.481 · Débito 1.336 · Dinheiro 990 · Crédito 567
- Vendedores: NAGILA 2.936 · VIVIANE 2.162 · DHAFINE 274 · Administrador 2

| Mês | Vendas | Faturamento |
| --- | ---: | ---: |
| 2026-05 | 1.233 | R$ 107.495,79 |
| 2026-06 | 985 | R$ 100.457,79 |
| 2026-07 | 991 | R$ 85.027,56 |
| 2026-08 | 822 | R$ 108.581,95 |
| 2026-09 | 636 | R$ 65.192,73 |
| 2026-10 | 694 | R$ 84.639,90 |

## Problemas encontrados

1. **Datas digitadas erradas (12 vendas, revisar):** 2 em 2023, 1 em 2025, 8 entre jan e abr/2026
   (antes do sistema existir) e 1 em **17/12/2026, no futuro** (venda nº 2784, criada em 17/07/2026 —
   provavelmente o mês foi digitado errado). Causa: a data retroativa do PDV não tinha limite.
2. **1 venda com total zerado/negativo:** item "BOLA" com quantidade 0,001 e desconto maior que o
   valor (total do item −R$ 10,08). Causa: o PDV aceitava quantidade 0,001 e desconto maior que o item.
3. **Cancelamento gravado 2 vezes** na mesma venda (clique duplo sem trava).
4. **Catálogo de produtos virou lixo:** 5.550 produtos diferentes para só 3.690 nomes; 592 nomes
   aparecem com vários cadastros ("Capinha" 95x, "carregador" 78x...). Cada venda avulsa criava um
   produto novo. Ou seja, o histórico não identifica o item físico vendido.

## Catálogo de produtos (products, 22.749 linhas)

| Grupo | Cadastros | O que é |
| --- | ---: | --- |
| Importados em massa (5 e 7/mai) | 17.103 | Títulos completos estilo Mercado Livre, com categoria e subcategoria |
| Avulsos criados no PDV | 5.646 | Sem categoria; ~1 por venda ("Capinha", "lava louça") |

- **Nenhum produto tem código de barras** (coluna `codigo` vazia em 100%).
- **Importação duplicada:** a planilha das 08:05 de 05/05 foi importada de novo às 08:38 (3.741 de
  3.741 nomes iguais). No total, 5.111 cadastros importados repetem um nome já existente.
- **3.352 produtos importados com preço R$ 0,00** (um lote inteiro importado às 08:12 de 05/05).
- **17.199 produtos nunca foram vendidos.** Só 5.550 aparecem em alguma venda.
- Preços digitados errado nos avulsos: "Climatizador 80Lt crédito" R$ 119.999, "Copo+ papel de
  parede 84,99" R$ 8.499 (não foram vendidos, não afetam o faturamento).
- 32 vendas acima de R$ 1.000 somam R$ 67.806,62. São vendas reais, mas várias juntam muitos itens
  em uma linha só ("Colchão 350un x 8 = 2.800...", "Vendas Fabiana" R$ 4.159,98), sem detalhe.
- Categorias seguem a árvore do Mercado Livre (Casa, Móveis e Decoração 2.971; Calçados, Roupas e
  Bolsas 1.351; Alimentos e Bebidas 1.252; ...). **Vale manter essa árvore** no sistema novo.

## Decisão de migração (proposta)

- **Vendas e itens entram como HISTÓRICO** (marcados `origem = 'legado'`), mantendo número,
  `data_venda`, vendedor, pagamento e valores. Servem para relatórios e comparação mês a mês.
- **Não geram estoque nem lucro** (não havia custo nem lote). O estoque do sistema novo começa do
  zero pela triagem dos lotes.
- **Produtos antigos não são importados como estoque.** Os 17.103 importados viram uma **base de
  referência** de descrição, categoria e preço para a triagem sugerir enquanto se digita.
  Limpeza feita em 31/10/2026 (pasta `TABELAS LOVABLE\LIMPEZA`): −5.112 duplicados (nenhum com
  venda) e −3.162 com preço zero → **8.829 produtos** em `products-importados-LIMPO.csv`
  (31 categorias, 250 subcategorias, preço de R$ 0,58 a R$ 3.225,53, mediana R$ 33,92).
  Os 5.646 avulsos não entram.
- A árvore de categorias (estilo Mercado Livre) é importada como tabela de categorias.
- As 12 datas suspeitas e a venda zerada são revisadas antes da importação.
- Vendedores: ligados por nome aos usuários novos (criar NAGILA, VIVIANE, DHAFINE na tela Usuários).
