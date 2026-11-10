# Fase 3 – Comparativo e requisitos

> Base: `pesquisa-checklist-facil.md` (Fase 1) e `analise-checklist-operacional.md` (Fase 2).

## 1. O que o Checklist Fácil tem e nós precisamos
| Recurso | Por que precisamos |
|---|---|
| App no celular com **offline** e sincronização | Câmara fria, depósito e fundo de loja têm sinal ruim |
| Foto como evidência, tirada na hora | Placas, balcões, limpeza e validade só se comprovam com foto |
| Tipos de resposta (sim/não, conforme/NC, N/A, número, texto) | Hoje só existe F/NF |
| **Perguntas condicionais** | "Oferta bem-sucedida? Se não, investigar a causa" |
| **Plano de ação** a partir de não conformidade, com responsável, prazo e revisão | Hoje o "NF" morre no papel |
| **Agendamento** por frequência e responsável | Diário, semanal (por dia) e mensal |
| Notificações | Avisar prazo das 14:00, atraso, plano de ação aberto |
| Perfis e permissões por unidade | Fiscal, líder, gestor/matriz |
| Dashboards e PDF | Acompanhar a loja sem ir até ela |
| Assinatura e geolocalização | Prova de quem fez e onde |
| Nota/pontuação | Método Polar |

## 2. O que temos de específico e ele não atende (ou não atende bem)
| Nossa necessidade | Situação no Checklist Fácil |
|---|---|
| Login, unidades e permissões **únicos do Ecossistema TB** (Portal) | Sistema fechado, cadastros à parte |
| Item que referencia o **relatório do CISS** e, depois, puxa o número | Só por API e sob medida |
| **Prazos dentro do dia** por item (oferta até 14:00, pedido até 15:00, validade entre 14:00 e 15:00) | O agendamento é por checklist; o prazo por item não está documentado |
| Itens **por dia da semana** e regra "**N dias antes do fim do mês**" | Não documentado |
| **Líder valida o checklist do fiscal** (dupla checagem) | Workflow existe, mas é recurso de plano mais caro |
| **Tempo de execução** de cada tarefa (início e fim automáticos) | Não destacado |
| **Método Polar** ligado à meta/premiação por colaborador | Nota existe; a ligação com a meta, não |
| Custo: geolocalização e notificações só nos planos caros, preço sob consulta | Sistema próprio sem custo por usuário |

## 3. Melhorias para ficar igual ou melhor
1. **Offline de verdade:** a fila local mostra "X itens aguardando envio"; fotos comprimidas no aparelho (~200–400 KB); nada se perde ao fechar o app. *(Ataca a reclamação nº 1.)*
2. **Câmera rápida:** captura nativa do navegador (`<input capture>`), sem biblioteca pesada. Carimbo de data, hora e GPS gravado na foto e nos dados.
3. **% de conformidade** por item, seção, setor, pessoa e loja, mais **Excel** desde o início. *(Reclamação: relatórios fracos.)*
4. **Duplicar item, seção ou checklist** no editor. *(Reclamação: não copia a configuração.)*
5. **Prazo por item** com semáforo (no prazo, perto do prazo, atrasado).
6. Tempo de execução e **ranking de produtividade**.
7. Atualizações **automáticas e testadas** (PWA), sem depender de loja de aplicativos.
8. Texto de ajuda no item (ex.: o script de atendimento aparece dentro do item).

## 4. Requisitos priorizados

### Essencial (MVP – Fase 5)
| # | Requisito |
|---|---|
| E1 | Login pelo Supabase Auth do Ecossistema; perfis **operador, supervisor e gestor**; acesso por unidade |
| E2 | Modelos de checklist com seções e itens, já carregados com os **8 checklists reais** (112 itens) |
| E3 | Tipos de resposta: sim/não, conforme/não conforme (+N/A), número, texto, múltipla escolha, assinatura, foto |
| E4 | Foto **obrigatória** por item, só pela câmera, com data, hora e GPS |
| E5 | Início e fim registrados automaticamente; tempo de execução por checklist e por item |
| E6 | **Offline-first** com fila de sincronização e indicador de pendências |
| E7 | Plano de ação **automático** para não conforme ou não feito: responsável, prazo, status, foto da solução, validação |
| E8 | Agendamento: frequência (diária, semanal com dias, mensal com dia ou "N dias antes do fim"), horário-limite, responsável ou perfil, unidade |
| E9 | Minhas tarefas do dia: pendentes, em andamento, atrasadas e concluídas |
| E10 | Dashboard: concluídas, atrasadas, tempo médio, % de conformidade por setor e por pessoa |
| E11 | Relatório **PDF** de uma execução e **Excel** de período |
| E12 | Integração com o Ecossistema TB: schema `checklist`, RLS, `public.lojas`, `minhas_telas('checklist')` |

### Importante (logo após o MVP)
| # | Requisito |
|---|---|
| I1 | Perguntas condicionais (mostrar item B se A = "não") |
| I2 | Editor de modelos na tela (criar, duplicar, reordenar itens) |
| I3 | Validação do supervisor (o líder aprova ou devolve a execução do fiscal) |
| I4 | Pontuação com pesos e nota (Método Polar) |
| I5 | Notificações push e WhatsApp para prazo, atraso e plano de ação |
| I6 | Prazo por item (14:00, 15:00) |

### Desejável
| # | Requisito |
|---|---|
| D1 | Puxar números dos relatórios do CISS automaticamente |
| D2 | Comparação de foto com padrão (IA), revisão automática |
| D3 | QR Code por setor/equipamento |
| D4 | Ligação do Método Polar com meta/premiação (Gestão RH) |
| D5 | App nativo nas lojas (Expo), se o PWA tiver limitação |
| D6 | Ditado por voz nos campos de texto |
