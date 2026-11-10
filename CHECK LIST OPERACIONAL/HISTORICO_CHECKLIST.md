# Histórico – Check List Operacional (código `checklist`, schema `checklist`)

## 📍 ONDE PARAMOS
- **Fase 5 em andamento** na branch `feat/checklist-mobile` (sem push). Plano aprovado com os ajustes A–J (`docs/plano-app-checklist-mobile.md`, seção 7).
- **Etapa atual: 3 concluída** (login único, permissões do Ecossistema, modo demonstração). Banco testado só em PGlite; **nada aplicado em produção**.
- Faltam: 4 (Hoje e Execução), 5 (foto, GPS e assinatura), 6 (offline e sincronização), 7 (planos de ação), 8 (agendamentos), 9 (dashboard), 10 (PDF e Excel), 11 (testes de aceite e roteiro).
- Regra: nada no banco de produção, em *Exposed schemas* ou na Vercel sem OK do usuário.

---

## Sessão 1 – 10/11/2026
- **Fase 1:** pesquisa pública do Checklist Fácil → `docs/pesquisa-checklist-facil.md`. A central de ajuda exige login e Capterra/Reclame Aqui bloqueiam leitura automática; usei trechos de busca, App Store e B2B Stack.
- **Fase 2:** análise da planilha `CHECK LIST DO LIDER DE LOJA DO BRAZ.xlsx` (9 abas, 8 checklists, 109 itens (contagem corrigida na etapa 2; antes dizia 112); líder e fiscal de caixa; diário, semanal por dia e mensal; Método Polar) → `docs/analise-checklist-operacional.md`.
- **Fase 3:** comparativo e requisitos (essencial, importante, desejável) → `docs/comparativo-e-requisitos.md`.
- **Fase 4:** plano proposto → `docs/plano-app-checklist-mobile.md`. PWA offline-first (Vite + React + Dexie + Supabase + Vercel), schema `checklist`, perfis operador, supervisor e gestor.
- Dúvida em aberto: as colunas 1 a 8 da planilha são dias ou rondas?

## Sessão 2 – 10/11/2026
- Plano aprovado com os ajustes A–J e os critérios de aceite. O documento do plano foi atualizado (seção 7).
- Ajuste do usuário: o Check List entra no Portal Grupo TB, como o PDV e o RH (login único, `minhas_telas('checklist')`, migration de telas no PDV, quadro no Portal, botão "Eco Sistema TB").
- **Etapa 0:** projeto criado (Vite 8 + React 19 + TS + Tailwind 4, Dexie, jsPDF, SheetJS, Recharts, PGlite para testar o banco sem produção). `src/domain/regras.ts` com pontuação (teste dos 35%), condicionais, pendências e itens que geram plano. 7 testes passam e o build passa.
- **Etapa 1:** migration `app-checklist-mobile/supabase/migrations/20261110000001_checklist_schema.sql`, com membros/perfis, versões imutáveis, pontuação e pendências em SQL, `sync_execucao` idempotente, `concluir_execucao`, planos só por funções (fluxo D), histórico, views com "atrasada" calculada, `gerar_tarefas`, dashboard, relatório, RLS e bucket privado. 17 testes de banco em PGlite (RLS entre lojas, 35%, versões, idempotência, plano).
- Ecossistema: `GESTAO SALVADOS/supabase/migrations/20261110000023_checklist_telas.sql` (ativa `checklist`, 3 grupos, 8 telas, ações), espelhada em `GESTAO SALVADOS/src/lib/telas.ts`. O teste do PDV passa a ler a 0023 (127 testes ok). Quadro no Portal (`PORTAL/src/pages/Inicio.tsx`); `sistemas.json` em-construcao com url prevista `https://checklist-grupotb.vercel.app`.
- **Etapa 2:** `src/data/seed-modelos.ts` com os 8 modelos reais (109 itens da planilha + 2 sugeridos no Método Polar), tipos, fotos obrigatórias, prazos (14:00/15:00), condicional da oferta, itens por dia da semana e agenda sugerida. `npm run seed:gerar` gera `supabase/seed/checklist_seed.sql` (idempotente); um teste garante que o SQL está em dia. Correção: a Fase 2 tinha contado 112 itens; o certo é 109. 29 testes passam.
- **Etapa 3:** login "Eco Sistema TB" sem "Criar conta"; menu e rotas por `public.minhas_telas('checklist')` (com `.schema("public")`) e perfil mínimo; "Acesso negado"; se a consulta falhar, aviso e não bloqueia. Unidades por `minhas_unidades('checklist')` + perfil de `checklist.membros`; topo com o botão "Eco Sistema TB" para o Portal. Servidor Supabase e **modo demonstração** (sem `.env`), com as mesmas regras, usuários de exemplo e teste do fluxo completo. Banco: `checklist.definir_membro`. 42 testes passam.
