# Fase 2 – Análise do nosso Check List Operacional

> Pasta analisada: `CHECK LIST OPERACIONAL/` (10/11/2026)
> Única fonte: **`CHECK LIST DO LIDER DE LOJA DO BRAZ.xlsx`**, com 9 abas. Não existe código nem outro documento.
> No `MEU SUPERVISOR/sistemas.json` o sistema já está reservado: código `checklist`, schema `checklist`, status "planejado".

## 1. Como a planilha funciona hoje
- Cada aba é uma **folha impressa**. A coluna A é "HORÁRIO INÍCIO/FIM" (preenchida à mão, **sempre vazia** no arquivo), a coluna C traz a tarefa e as colunas **D a K (1 a 8)** são caixas de marcação. Na aba mensal vão até L (9).
- Legenda: **F = Feito**, **NF = Não feito**.
- Linhas em destaque funcionam como **títulos de seção** (ex.: "ROTINA DE VERIFICAÇÃO DA PADARIA").
- As duas abas dos fiscais trazem a coluna 1 preenchida com "F", como exemplo de uso.
- **Não há**: campo de responsável, data, loja, foto, observação, assinatura nem prazo formal. Os horários-limite aparecem só no texto (14:00, 15:00).
- *Dúvida para o usuário:* as colunas 1 a 8 são **dias** (uma folha por semana ou período) ou **rondas/turnos** no mesmo dia? Para o sistema isso não muda nada: cada execução vira um registro com data e hora.

## 2. Responsáveis (perfis reais)
| Papel | Onde aparece | Papel no sistema |
|---|---|---|
| **Líder de loja** | Abas 1, 2, 3, 5 e 6 | Executa as próprias rotinas e **acompanha** as dos fiscais e setores (supervisor da loja) |
| **Fiscal de caixa** | Abas "Rotina da manhã/tarde dos fiscais" | Operador de checklist |
| Setores (padaria, açougue, hortifruti, laticínios, frios, bebidas) | Itens de verificação | Recebem a correção (plano de ação) |
| Apoio: Marketing, CPD, RH, Tesouraria, Rádio TB | Itens que pedem conferência com essas áreas | Responsáveis por planos de ação |
| Matriz | "A matriz pode decidir pelas outras, por ter a distribuição" | Visão multiloja (gestor) |

## 3. Inventário dos checklists

### 3.1 Diário – Líder – Manhã (aba "1 ROTINA DA MANHÃ – líder") – 20 itens
| Seção | Itens | Foto sugerida? |
|---|---|---|
| Abertura | Acompanhar o checklist dos fiscais na abertura | – |
| Ofertas (abertura) | Oferta lançada no CISS (rel. 150006); oferta ok no App Braz/portal Mercafácil; pesáveis da oferta na balança do açougue; códigos avulsos (melancia, uva, linguiça...) repassados ao setor; **placas e cartazes corretos** (produto, gramatura, seção, pontos extras); listas de transmissão alimentadas; primeira postagem no status e depois a cada 30 min; ações da rádio rodando | **Sim** nas placas e cartazes e no status |
| Padaria | Balcões (layout, quantidade, qualidade); equipamentos (funcionamento e limpeza); limpeza de piso e paredes; precificação e placas | **Sim** (balcão, limpeza) |
| Hortifruti | Qualidade (frutas, legumes, verduras e ovos um a um); limpeza de bancas e chão; precificação e placas | **Sim** |
| Açougue | Balcão, qualidade e ruptura no mix de bandejas; carne de sol no balcão/expositor; limpeza (balcão, piso, porta, parede, equipamentos, balança); precificação e placas | **Sim** |

### 3.2 Diário – Líder – Análise do dia anterior (aba "2 ROTINA DA MANHÃ – líder") – 16 itens
- **Relatórios do CISS** (6): venda, ticket médio e cupons (160356); curva ABC (100047); promoções (160661); venda por seção/grupo/subgrupo (65); análise de produto/comparativo (338); dias sem venda (160705). Hoje a resposta é feito/não feito. Faria sentido anotar o **número** (venda, ticket).
- **Ofertas do dia seguinte** (10): as ofertas foram bem-sucedidas? **Se sim**, manter; **se não**, investigar a causa (**pergunta condicional**). Houve antecipação? Houve divulgação na rádio e na lista? Houve ruptura e a placa estava no local? Criar ações corretivas; confirmar a oferta com estoque de todas as lojas **até 14:00**; confirmar com marketing e Rádio TB.

### 3.3 Diário – Líder – Tarde (aba "3 ROTINA DA TARDE – líder") – 14 itens
- Rotina da tarde (9): oferta confirmada (**prazo 14:00**); limpeza de cada setor; ronda de layout, reposição e rupturas; auxiliar seções críticas que não bateram meta; alterações de preço do CPD e troca de etiquetas (rel. 75); varredura do fiscal na padaria; estoque de açougue, hortifruti e frios para o pedido (**fecha às 15:00**); placas do dia seguinte; repositores guardando os sacos para reaproveitar.
- Balcão de laticínios (3): layout e **validade**; equipamentos; precificação. → **Foto sim**.
- Preparo para o pico da noite (1): açougue, padaria e hortifruti.
- Fechamento (1): geladeiras e seções abastecidas.

### 3.4 Diário – Fiscal de caixa – Manhã (aba "1 ROTINA DA MANHÃ DOS FISCAIS") – 16 itens
- Operação (8): equipamentos, limpeza, embalagens, carrinhos e cestinhas, **pelo menos uma bobina de reserva**; oferta no CISS (rel. 150006); **encarte impresso em cada caixa**; códigos avulsos informados à equipe; rádio com propaganda da loja (YouTube proibido); retornáveis; telefone da loja com o fiscal; monitorar o script de atendimento.
- Script de atendimento (8): caixa livre; saudação; cadastro Clube Braz; CPF na nota; encontrou tudo (anotar produto e contato); meta do dia; forma de pagamento; agradecimento. → Na prática é uma **auditoria de atendimento** (observar o operador), não uma tarefa.

### 3.5 Diário – Fiscal de caixa – Tarde (aba "1 ROTINA DA TARDE DOS FISCAIS") – 11 itens
Copos descartáveis (180/200 ml); álcool meio a meio; anotações de falta no caderno; controle da fita de empacotamento; **validade da padaria entre 14:00 e 15:00** com desconto de até 30%; chinelos amarrados; rádio da loja; flanela e fita; telefone com o fiscal; operador não pode pôr o próprio CPF na nota; uso da sacola 50×60.

### 3.6 Semanal – Líder (aba "6 ROTINAS SEMANAIS") – 18 itens, por **dia da semana**
| Dia | Itens |
|---|---|
| Segunda | Balanço do açougue e levantamento para o pedido |
| Terça | Levantamento de bebidas para a compra; balanço do hortifruti; fiscal passa a lista de faltas e sugestões |
| Quarta | RH: banco de horas positivo/negativo; produtos de limpeza da loja |
| Quinta | Bebidas para o fim de semana; limpeza das cestinhas; **pedido de frios até 14:00**; pedido de carvão; etiquetas de balança e papel de cartaz |
| Sexta | Tesouraria: vales não assinados; tabela de códigos de açougue e padaria atualizada; imprimir e colar o script; rádio do fim de semana; veículos abastecidos |
| Sábado | A loja abre impecável no domingo? (revisão da semana); conferir vendas e repassar a quantidade de bebidas dos freezers |

### 3.7 Mensal – Líder (aba "5 ROTINAS MENSAIS") – 7 itens
Escala do mês de todos os setores; feriados e planejamento; **8 dias antes do fim do mês**, resolver trocas e perdas; estoque de etiquetas de balança, etiquetas de gôndola, ribbon e papel de cartaz.

### 3.8 Avaliação – Método Polar (aba "7 MÉTODO POLAR") – auditoria com nota
Categorias: **Precificação** (etiqueta embaixo do produto certo; pontas e pontos extras com placa), **Operação** (pontualidade e frequência; depósito organizado; avarias e perdas por má exposição, que **descontam do valor da meta**; produtos vencidos), **Limpeza** (seção, produto e pontos extras), **Atendimento** e **Rupturas** (ainda sem itens).
→ É um checklist de **pontuação que liga à meta/premiação**. Pede respostas conforme/não conforme com peso e nota final por seção ou colaborador.

### 3.9 Script de atendimento do operador (aba 8)
Cartão impresso, repetido duas vezes para recorte. Não é um checklist, é **material de apoio**. No sistema pode virar texto de ajuda do item ou um anexo.

## 4. Totais
| Checklist | Frequência | Responsável | Itens |
|---|---|---|---|
| Líder – Manhã (abertura) | Diária | Líder | 20 |
| Líder – Análise e ofertas | Diária | Líder | 16 |
| Líder – Tarde e fechamento | Diária | Líder | 14 |
| Fiscal – Manhã | Diária | Fiscal | 16 |
| Fiscal – Tarde | Diária | Fiscal | 11 |
| Líder – Semanal | Semanal (itens por dia) | Líder | 18 |
| Líder – Mensal | Mensal | Líder | 7 |
| Método Polar | Avaliação (sugestão: semanal) | Líder/Gestor | 7 (Atendimento e Rupturas sem itens) |
| **Total** | | | **109 itens** |

> *Correção de 10/11/2026 (etapa 2):* a primeira contagem dizia 112 (17 na análise e 9 no Método Polar). Na recontagem linha a linha são 16 e 7, total **109**. No sistema entram ainda **2 itens sugeridos** (Atendimento e Rupturas do Método Polar), marcados como "SUGERIDO".

## 5. Dados coletados hoje × o que faltaria coletar
| Hoje | Falta (para o sistema) |
|---|---|
| Feito/Não feito por item | Hora de início e fim (a coluna existe, mas fica vazia), duração |
| (implícito) loja = Braz | Loja/unidade, data, responsável identificado |
| Prazos no texto (14:00, 15:00, 8 dias antes do fim do mês) | Prazo como regra, com alerta de atraso |
| – | Foto com data, hora e GPS nos itens visuais |
| – | Observação e motivo do "Não feito" |
| – | Valores numéricos (venda, ticket, cupons, % desconto) |
| – | Plano de ação para o que não foi feito ou não está conforme |
| – | Assinatura do líder no fechamento |

## 6. Particularidades nossas (importantes para a comparação)
1. **Integração de fato com o CISS:** vários itens são "conferir o relatório X do CISS". O item deveria mostrar o **número do relatório** e, no futuro, puxar o dado direto.
2. **Ciclo da oferta** (Mercafácil/App Braz → balança → placas → rádio → WhatsApp → confirmação até 14:00): é o coração da rotina e tem **prazos fixos no dia**.
3. **Itens por dia da semana** dentro do checklist semanal.
4. **Regra relativa ao fim do mês** ("faltando 8 dias").
5. **Hierarquia líder → fiscal:** o líder confere o checklist do fiscal.
6. **Método Polar** ligado à meta/premiação.
7. **Multiloja com matriz** que decide pelas outras.
8. Encaixa no **Ecossistema TB**: mesmo login, unidades (`public.lojas`) e permissões do Portal.
