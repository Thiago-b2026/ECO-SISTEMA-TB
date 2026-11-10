# Fase 4 – Plano do app Check List Operacional

> **Aprovado em 10/11/2026** com os ajustes A–J (seção 7). Onde a seção 7 contradiz as anteriores, **vale a seção 7**.

## 1. Arquitetura e stack

**Recomendação: PWA offline-first** (não Expo/React Native).

| Critério | PWA (recomendado) | Expo / React Native |
|---|---|---|
| Igual aos outros sistemas do Ecossistema (Vite + React + Supabase + Vercel) | ✅ mesmo código, mesmo deploy | ❌ outro mundo de build |
| Instalar no celular | Link → "Adicionar à tela inicial" | Loja (Google/Apple), conta de desenvolvedor, revisão |
| Atualização | Instantânea | Pela loja (ou EAS Update) |
| Câmera, GPS, assinatura, offline | ✅ funcionam (exigem HTTPS) | ✅ |
| Limitação | iOS não sincroniza em segundo plano: sincroniza ao abrir ou ao voltar a internet | – |

Se a limitação do iOS virar problema, dá para empacotar o mesmo PWA com Capacitor depois (D5).

```
Celular (PWA)                                  Supabase ECO-SISTEMA-TB
┌───────────────────────────┐                ┌─────────────────────────────┐
│ React + TS + Tailwind     │   online       │ Auth (login único)          │
│ IndexedDB (Dexie):        │ ───────────▶   │ schema checklist (RLS)      │
│  modelos, tarefas,        │   fila de      │ public.lojas / permissões   │
│  execuções, respostas,    │   sincroniz.   │ Storage: bucket checklist-  │
│  fotos (blob), fila       │ ◀───────────   │   fotos (privado)           │
│ Service Worker (Workbox)  │  baixa dados   │ Funções SQL: gerar_tarefas, │
└───────────────────────────┘                │  dashboard, planos auto     │
         Vercel (time grupotb)               └─────────────────────────────┘
```

**Bibliotecas:** Vite, React, TypeScript, Tailwind, TanStack Router e Query (como no PDV), `@supabase/supabase-js`, **Dexie** (IndexedDB), **vite-plugin-pwa**, `browser-image-compression`, assinatura em `<canvas>` próprio, **jsPDF + autotable** (PDF), **SheetJS/xlsx** (Excel), **Recharts** (gráficos), Vitest.

**Regras do offline:**
- Toda execução, resposta, foto e plano de ação nasce no aparelho com **UUID** gerado no celular. Por isso o reenvio não duplica nada (upsert).
- Fila com ordem garantida: execução → respostas → fotos (upload no Storage) → planos.
- Sincroniza ao abrir o app, no evento `online` e com um botão "Sincronizar agora". O topo mostra "3 pendentes".
- O servidor recalcula conformidade e duração. O celular nunca é a fonte final dos números.

## 2. Perfis
| Perfil | Pode |
|---|---|
| **Operador** (fiscal, repositor) | Ver e executar as próprias tarefas; tratar os planos de ação atribuídos a ele |
| **Supervisor** (líder de loja) | Tudo do operador, mais as tarefas da loja inteira, validar execuções, atribuir e encerrar planos, ver o dashboard da loja |
| **Gestor** (matriz/diretoria) | Tudo, em todas as unidades: modelos, agendamentos, dashboard geral, relatórios |

O perfil fica em `checklist.membros (usuario, unidade, perfil)`. O acesso às telas segue a regra do Ecossistema (`public.telas`, `minhas_telas('checklist')`). Quem cria usuário é o admin, no Portal.

## 3. Telas
| # | Tela | Perfis |
|---|---|---|
| 1 | Login | todos |
| 2 | **Hoje**: tarefas do dia por status, com semáforo de prazo | todos |
| 3 | **Execução**: seções e itens, cronômetro, resposta por tipo, foto, observação, progresso | todos |
| 4 | Revisão e **assinatura**, depois concluir | todos |
| 5 | Fila de sincronização (pendências, erros, reenviar) | todos |
| 6 | **Planos de ação**: lista, detalhe, foto da solução, validação | todos (escopo por perfil) |
| 7 | Tarefas da loja e validação de execuções | supervisor+ |
| 8 | **Dashboard**: concluídas, atrasadas, tempo médio, % conformidade por setor e pessoa, gráficos | supervisor+ |
| 9 | **Relatórios**: filtros, PDF da execução, Excel do período | supervisor+ |
| 10 | Agendamentos (frequência, dias, horário-limite, responsável) | gestor (supervisor da própria loja) |
| 11 | Modelos: lista e detalhe, ativar/desativar, duplicar *(editor completo = I2)* | gestor |
| 12 | Equipe da unidade: perfil de cada pessoa | gestor/supervisor |

## 4. Modelo de dados (schema `checklist`)
```
membros        (usuario_id → auth.users, loja_id → public.lojas, perfil[operador|supervisor|gestor], ativo)
setores        (id, nome)                       -- padaria, açougue, hortifruti, laticínios, frente de caixa…
modelos        (id, nome, descricao, perfil_executor, frequencia_sugerida, versao, ativo)
secoes         (id, modelo_id, titulo, setor_id, ordem)
itens          (id, secao_id, texto, ajuda, tipo[sim_nao|conformidade|numero|texto|multipla|assinatura|foto],
                opcoes jsonb, obrigatorio, exige_foto, foto_se_nao_conforme, gera_plano, peso,
                dia_semana smallint null, prazo_hora time null, ref_ciss text null, ordem)
agendamentos   (id, modelo_id, loja_id, responsavel_id null, perfil null,
                frequencia[diaria|semanal|mensal], dias_semana int[], dia_mes, dias_antes_fim_mes,
                hora_inicio, hora_limite, ativo)
tarefas        (id, agendamento_id, modelo_id, loja_id, responsavel_id, data_ref, prazo timestamptz,
                status[pendente|em_andamento|concluida|atrasada|cancelada])   -- único (agendamento, data_ref)
execucoes      (id uuid do celular, tarefa_id, modelo_id, modelo_versao, loja_id, usuario_id,
                inicio_em, fim_em, duracao_seg, lat, lng, assinatura_path, conformidade_pct,
                status[em_andamento|concluida|validada|devolvida], validado_por, sincronizado_em)
respostas      (id uuid, execucao_id, item_id, valor jsonb, conforme bool null, observacao,
                respondido_em, lat, lng)
fotos          (id uuid, resposta_id, storage_path, tirada_em, lat, lng, precisao_m)
planos_acao    (id uuid, execucao_id, resposta_id, item_id, loja_id, setor_id, titulo, descricao,
                responsavel_id, prazo, status[aberto|em_andamento|aguardando_validacao|concluido|cancelado],
                solucao, foto_solucao_path, concluido_em, validado_por)
```
- **Plano automático:** um gatilho em `respostas` cria o plano quando o item tem `gera_plano` e a resposta é não conforme ou "não". O responsável padrão é o supervisor da loja; o prazo padrão é +1 dia. Também é criado no celular, offline, com o mesmo UUID determinístico, para não duplicar.
- **Geração de tarefas:** a função `checklist.gerar_tarefas(data)` cria as tarefas do dia a partir dos agendamentos (diária; semanal pelos dias marcados; mensal por dia fixo ou "N dias antes do fim"). Roda por `pg_cron` às 00:05 e também sob demanda quando o app abre. A tarefa vira **atrasada** quando passa do prazo.
- **Checklist semanal com itens por dia:** o item tem `dia_semana` e só aparece naquele dia.
- RLS em todas as tabelas: operador vê o que é dele; supervisor vê a loja; gestor vê tudo.

## 5. Carga inicial (dados reais)
Script que converte a planilha `CHECK LIST DO LIDER DE LOJA DO BRAZ.xlsx` nos **8 modelos com 109 itens da planilha + 2 sugeridos** (Fase 2, contagem corrigida), com tipo, foto obrigatória e prazos sugeridos:
- Itens visuais (placas, balcões, limpeza, qualidade, validade) → `conformidade` + **foto obrigatória** + gera plano.
- Itens "conferir relatório X" → `sim_nao`, com `ref_ciss` = nº do relatório.
- "Oferta bem-sucedida?" → `sim_nao`, mais o texto da causa se for "não".
- Método Polar → `conformidade` com peso.
- Prazos: confirmar oferta 14:00; pedido 15:00; frios (quinta) 14:00.
Tudo editável depois pelo gestor.

## 6. Etapas de construção
| Etapa | Entrega |
|---|---|
| 0 | Projeto Vite + PWA em `CHECK LIST OPERACIONAL/app-checklist-mobile`; `HISTORICO_CHECKLIST.md` |
| 1 | Migration do schema `checklist` (tabelas, RLS, funções, gatilhos, bucket) e migration de telas/grupos no padrão `GESTAO SALVADOS/supabase/migrations` |
| 2 | Seed dos modelos reais |
| 3 | Login, perfis, menu por permissão |
| 4 | Hoje + Execução (todos os tipos de resposta, cronômetro) |
| 5 | Foto pela câmera com carimbo, GPS, assinatura |
| 6 | Offline: Dexie + fila de sincronização + Service Worker |
| 7 | Planos de ação automáticos e tela de tratamento |
| 8 | Agendamentos + `gerar_tarefas` + atrasos |
| 9 | Dashboard |
| 10 | Relatórios PDF e Excel |
| 11 | Testes (Vitest: regras de agendamento, conformidade, fila), build, publicação na Vercel |

**O que eu faço sozinho × o que depende de você:** eu escrevo o código, as migrations e os testes, e rodo tudo localmente. **Aplicar a migration no banco de produção**, liberar o schema `checklist` em *Exposed schemas* e publicar na Vercel ficam para depois da sua confirmação, porque mexem no banco compartilhado do Ecossistema.

---

## 7. Ajustes aprovados (revisão 2 – 10/11/2026)

Decisões: PWA aprovado (Expo fica para depois); pasta `CHECK LIST OPERACIONAL/app-checklist-mobile`; cada execução é um registro com data e hora. **Nada vai para o banco de produção, para *Exposed schemas* nem para a Vercel sem OK.**

### A) Modelos versionados
- `modelos` (a "família") + `modelo_versoes` (numero, status `rascunho | publicada | arquivada`, `conteudo jsonb` com seções e itens).
- Uma versão **publicada não muda mais** (gatilho bloqueia). Editar = `criar_rascunho(modelo)` (copia a última) → `publicar_versao(versao)` (a anterior vira arquivada).
- A execução guarda `versao_id`. Execuções antigas continuam apontando para a versão em que foram feitas.

### B) Pontuação (igual no Método Polar)
- Fator por resposta avaliativa: conforme/sim = **1**, parcial = **0,5**, não conforme/não = **0**, **N/A fica fora**.
- `Conformidade = 100 × Σ(peso × fator) ÷ Σ(pesos aplicáveis)`.
- Sem item pontuável: **"Sem pontuação aplicável"** (valor nulo), nunca 0% nem 100%.
- Teste obrigatório: pesos 2, 3, 5 e 2 com conforme, parcial, não conforme e N/A = **35%**.
- A regra fica em `src/domain/pontuacao.ts` (app) e `checklist.calcular_pontuacao()` (banco), com o mesmo teste nos dois.

### C) "Atrasada" é calculada
- Não existe status `atrasada` gravado. Atrasada = prazo vencido e não concluída (nem cancelada). Vale para tarefas e para planos.
- No banco: views `v_tarefas` e `v_planos` com a coluna `situacao` calculada. No app: `situacaoTarefa()` e `situacaoPlano()`.

### D) Plano de ação
- Fluxo: `aberto → em_andamento → aguardando_validacao → concluido`; `cancelado` a partir de qualquer estado não final.
- **Rejeitar** volta para `em_andamento`, com justificativa obrigatória.
- **Quem executou não valida** a própria solução.
- Trocar **prazo** ou **responsável** exige justificativa.
- Tudo por funções (`plano_iniciar`, `plano_enviar_solucao`, `plano_validar`, `plano_rejeitar`, `plano_cancelar`, `plano_alterar`). Não há UPDATE direto na tabela.

### E) Histórico e nada apagado
- `checklist.historico (tabela, registro_id, acao, autor, data, antes, depois, justificativa)` registra: publicação de modelo, conclusão, validação e devolução de execução, cancelamentos e todas as mudanças de plano.
- Cancelamento exige motivo. **Não há DELETE** em nada com histórico (sem política de DELETE; gatilho bloqueia). Só se arquiva ou desativa.

### F) Conclusão com pendências
- Antes de concluir, o app mostra a lista de **pendências obrigatórias** (resposta, foto, observação) com link para cada item e **bloqueia** a conclusão. O banco confere de novo em `concluir_execucao()`.
- O plano de ação para não conforme é criado automaticamente e não depende de pendência.
- Pergunta **oculta por condição** não gera pendência e **não pontua**.

### G) Status de salvamento sempre visível
- Barra fixa: "Salvo no aparelho às HH:MM" e "Enviado ao servidor às HH:MM" (ou "N pendentes").
- Erro de envio aparece **como erro**, com a mensagem e o botão **Tentar de novo**. Nunca aparece como sucesso.

### H) Entram no MVP
- I1 condicionais (ex.: "oferta bem-sucedida?" = Não → aparece "qual a causa?").
- I3 validação do líder (aprovar ou devolver com motivo).
- I4 nota do Método Polar.
- I6 prazo por item (14:00, 15:00).
- O editor completo de modelos (I2) continua para depois. No MVP o gestor pode criar rascunho, ajustar peso, obrigatoriedade e foto dos itens, e publicar.

### I) Datas e fotos
- Tudo gravado em `timestamptz` (UTC) e exibido em `America/Sao_Paulo`. A data de referência da tarefa é a data local de São Paulo.
- Fotos: só JPEG, PNG ou WebP; comprimidas no aparelho (máx. 1600 px); até 5 MB no envio. Bucket **privado** `checklist-fotos`, com caminho `<loja>/<execução>/<foto>`, e leitura por URL assinada.

### J) Acessibilidade
- Estados sempre com **texto + ícone**, nunca só com cor.
- Alvos de toque de pelo menos 48 px.
- Foco visível e navegação por teclado no computador.

### Modo demonstração (para testar sem banco)
Sem `.env`, o app abre em **modo demonstração**. Um "servidor" local no próprio navegador aplica as mesmas regras, e há usuários de exemplo (operador, supervisor, gestor) e duas lojas. Com `.env`, ele usa o Supabase.

### Testes de banco sem tocar em produção
As migrations rodam em **PGlite** (Postgres embutido) dentro do Vitest, com um "esboço" das tabelas centrais (`auth.users`, `public.lojas`, `is_admin`...). Lá testamos RLS, versões, pontuação, plano, histórico e idempotência.

### Critérios de aceite (viram testes)
1. Operador não vê dados de outra loja, nem chamando a API direto (RLS).
2. Publicar nova versão não altera execuções antigas.
3. Sair e voltar mantém respostas e fotos, inclusive offline.
4. Reenviar não duplica execução, foto nem plano.
5. Conclusão bloqueada com pendências.
6. A nota reproduz os 35% e o caso sem pontuação.
7. Um não conforme gera o plano ligado ao item.
8. O fluxo completo agendar → executar → não conforme → plano → solução → validação → dashboard funciona.
