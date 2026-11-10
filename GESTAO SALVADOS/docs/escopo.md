# Escopo do projeto

O escopo completo (módulos, modelo de dados, arquitetura, roadmap, riscos e decisões em aberto)
fica no documento online, que é a fonte oficial e é atualizado durante o projeto:

**https://claude.ai/artifact/9NPP1My1ezB8ghENwRLKsW**

No Claude Code, peça: "leia o escopo do projeto" — ele lê esse documento pelas ferramentas de docs.

## Resumo
- **Centro do sistema:** o lote. Todo produto vem de um lote; o custo do lote é rateado entre
  os itens (proporcional ao preço de venda estimado × quantidade; descarte = custo zero).
- **MVP (Fase 1):** lotes, triagem, rateio, produtos e estoque, precificação (PrecificaLote),
  PDV com baixa de estoque, caixa completo, relatórios básicos com lucro por lote, usuários.
- **Fase 2:** clientes, financeiro (pagar/receber, fluxo, DRE), relatórios completos, auditoria.
- **Fase 3 (opcional):** NFC-e/NF-e, marketplaces, catálogo WhatsApp, triagem pelo celular.
- **Fora do escopo:** metas e premiação de vendedores.

## Falhas do PDV antigo que NÃO podem se repetir
- Senha de admin escrita no código e rota pública que cria admin.
- Venda e itens gravados em passos separados (venda sem itens se o 2º falhar).
- Saldo do caixa somando Pix/cartão como dinheiro; caixa só contando vendas de quem abriu.
- Qualquer usuário logado podendo alterar preço.
- Curva ABC com cortes 20/50 (correto: 80/95).
- Venda não baixa estoque; cancelamento não devolve.

## Referência
- Prompt original do PDV no Lovable: `docs/prompt-pdv-lovable-original.md`
- Código antigo: `C:\PROJETOS_CLAUDE\PROJETO LOVABLE\cashier-buddy-plus-main\`
