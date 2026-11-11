# Check List Operacional (Ecossistema TB)

PWA *offline-first* para as rotinas das lojas: tarefas por agenda, fotos com data/hora/GPS, respostas, planos de ação, validação pelo líder, dashboard, relatórios PDF/Excel e editor de checklists. **Multiempresa:** cada empresa tem as suas lojas, checklists, setores e equipe, e uma não vê nada da outra.
Faz parte do Ecossistema TB: **login único** (Supabase Auth), quadro no Portal ECO SISTEMA TB, telas liberadas pelo admin (`public.minhas_telas('checklist')`), empresas em `public.redes` e unidades em `public.lojas`.

- Código do sistema: `checklist` · schema: `checklist` · pasta: `CHECK LIST OPERACIONAL/app-checklist-mobile`
- Stack: Vite 8 + React 19 + TypeScript + Tailwind 4 · Dexie (IndexedDB) · Supabase · jsPDF · SheetJS · Recharts
- Plano e regras: `../../docs/plano-app-checklist-mobile.md` (seção 7 = regras A–J; seção 8 = multiempresa)

## Quem faz o quê

| Perfil | Vale para | Pode |
|---|---|---|
| **Admin** do Ecossistema | todas as empresas | tudo; **só ele** cria empresa, loja e colaborador (login) e libera telas |
| **Gestor** | a **empresa** inteira | checklists (editor), agendamentos, equipe (incluir quem tem login, perfil, inativar), dashboard |
| **Supervisor** | uma unidade | tarefas da loja, validar/devolver, planos, agendamentos, dashboard e relatórios da loja |
| **Operador** | uma unidade | as próprias tarefas e os planos em que é responsável |

O nome da empresa aparece sempre no topo. O admin troca de empresa pelo seletor; quem está em mais de uma empresa também escolhe ali.

## Rodar no computador

```bash
cd "CHECK LIST OPERACIONAL/app-checklist-mobile"
npm install
npm run dev          # http://localhost:5191
```

- **`npm run dev` sem `.env` → MODO DEMONSTRAÇÃO.** Os dados de exemplo ficam **só no navegador**, e nada vai para o banco. Na tela de login aparecem: **Admin**; Supermix Braz (Ana fiscal, Bruno líder, Carla gestora, Diego e Elisa na Filial); **Empresa Exemplo 2** (Gabriel, gestor próprio; matriz e filial, sem checklists).
- **Com `.env`** (copie `.env.example`) → usa o Supabase ECO-SISTEMA-TB. Só depois de aplicar as migrations.
- **Segurança:** o **build de produção** sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` mostra **"Erro de configuração"**, e a demonstração nunca abre por engano. Para um build de teste em demonstração, use `VITE_MODO_DEMO=1`.

```bash
npm test             # 72 testes (regras, editor, banco em PGlite com 2 empresas, offline, app montado em jsdom)
npm run build        # checagem de tipos + build + service worker (dist/sw.js)
VITE_MODO_DEMO=1 npm run build && npm run preview   # build em demonstração, para testar o PWA
npm run seed:gerar   # regenera supabase/seed/checklist_seed.sql a partir de src/data/seed-modelos.ts
```

## Testar no celular

1. Celular e computador na **mesma rede Wi-Fi**.
2. `npm run dev` (já sobe com `--host`) e veja o endereço "Network", ex. `http://192.168.0.10:5191`.
3. Abra esse endereço no celular, entre como uma das pessoas de exemplo e teste.

**Limite do navegador:** em `http://` (fora de `localhost`), o celular **não libera GPS nem o modo offline instalado** (service worker). Câmera, respostas, fila e gravação no aparelho funcionam.
Para testar GPS, instalação e uso sem internet de verdade, é preciso **HTTPS**:
- **Opção recomendada:** um *preview* na Vercel (depois do seu OK), com as variáveis do Supabase ou com `VITE_MODO_DEMO=1`.
- **Só Android/Chrome:** em `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, adicione `http://192.168.0.10:5191`, ative e reinicie o Chrome.

**Instalar como app:** abra o link HTTPS → Chrome: menu ⋮ → "Instalar app" / iPhone (Safari): Compartilhar → "Adicionar à Tela de Início".
**No iPhone**, o envio acontece com o app aberto (ao abrir, quando a internet volta e a cada 2 min).

## Publicar (precisa do OK do usuário. NADA disso foi feito)

**Ordem de aplicação no banco** (Supabase ECO-SISTEMA-TB → SQL Editor):
1. `CHECK LIST OPERACIONAL/app-checklist-mobile/supabase/migrations/20261110000001_checklist_schema.sql`: schema multiempresa, RLS, funções, bucket `checklist-fotos`. Foi **ajustada** na etapa 12; como nunca foi aplicada, é aplicada uma vez só, já na versão nova.
2. `GESTAO SALVADOS/supabase/migrations/20261110000023_checklist_telas.sql`: sistema ativo, grupos, 8 telas e ações.
3. `GESTAO SALVADOS/supabase/migrations/20261110000024_checklist_empresas.sql`: **nova**, tela "Empresas e lojas" (`checklist.empresas`, só admin).
4. `CHECK LIST OPERACIONAL/app-checklist-mobile/supabase/seed/checklist_seed.sql`: 8 checklists da planilha na empresa **SUPERMIX BRAZ** (versão 1 publicada) e setores dela.

Depois:
5. **Supabase → Integrations → Data API → Exposed schemas:** incluir `checklist`.
6. **Edge Function `admin-usuarios` (nova versão):** `cd "GESTAO SALVADOS" && supabase functions deploy admin-usuarios`. Agora há o arquivo `criar.ts` junto do `index.ts`. Sem `sistema`, o PDV continua igual; com `sistema: "checklist"`, cria só o login e coloca a pessoa na equipe do Check List.
7. **Vercel (time `grupotb`):** novo projeto do mesmo repositório, *Root Directory* = `CHECK LIST OPERACIONAL/app-checklist-mobile`, framework Vite, variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (**sem** `VITE_MODO_DEMO`). Nome sugerido: `checklist-grupotb`.
8. **URL:** `update public.sistemas set url = 'https://checklist-grupotb.vercel.app' where codigo = 'checklist';` e confirmar a mesma URL em `PORTAL/src/pages/Inicio.tsx` e `MEU SUPERVISOR/sistemas.json`.
9. **No app, como admin:** *Empresas e lojas* → marcar "usa o Check List" nas unidades da Supermix; *Equipe* → incluir as pessoas ou cadastrar colaboradores novos e "Liberar telas"; *Agendamentos* → "Aplicar a agenda sugerida".
10. Só juntar ao `main` depois da Vercel no ar, para o quadro do Portal não abrir uma página de erro (item 9 do `CLAUDE.md` da raiz).
11. (Opcional) ativar **pg_cron** para gerar as tarefas às 00:05. Sem ele, o app gera as do dia quando alguém abre.

## Critérios de aceite → testes automáticos

| Critério | Onde é testado |
|---|---|
| Operador não vê dados de outra loja (RLS) | `supabase/tests/checklist.db.test.ts` → "RLS…"; `tests/demo-servidor.test.ts` |
| **Empresa A não vê modelo, tarefa, execução, plano, setor, histórico nem dashboard da B; gestor da A não edita a B; admin vê as duas** | `supabase/tests/multiempresa.db.test.ts` → "separação por empresa" |
| **Copiar checklists da A para a B não altera a A** | `multiempresa.db.test.ts` → "cópia…"; `tests/demo-servidor.test.ts` → "multiempresa…" |
| **Criar checklist do zero (seção, itens, condicional), publicar e executar** | `multiempresa.db.test.ts` → "checklist do zero"; `tests/editor-fluxo.test.ts`; `src/domain/editor.test.ts` |
| **Admin cria colaborador e loja; gestor não** | `multiempresa.db.test.ts` → "colaboradores e lojas"; `tests/demo-servidor.test.ts`; PDV: `src/lib/__tests__/admin-usuarios.test.ts` |
| Nova versão não altera execuções antigas | `checklist.db.test.ts` → "versões (regra A)" |
| Sair e voltar mantém respostas e fotos, inclusive offline | `tests/offline.test.ts` |
| Reenviar não duplica execução, foto nem plano | `checklist.db.test.ts` → "sincronização idempotente"; `tests/offline.test.ts` |
| Conclusão bloqueada com pendências | `checklist.db.test.ts`, `tests/offline.test.ts`, `tests/app.ui.test.tsx` |
| Nota 35% e "Sem pontuação aplicável" | `src/domain/regras.test.ts` e `checklist.db.test.ts` |
| Não conforme gera plano ligado ao item (mesmo id no celular e no banco) | `checklist.db.test.ts`, `tests/offline.test.ts` |
| Fluxo completo agendar → executar → plano → solução → validação → dashboard | `tests/demo-servidor.test.ts` → "fluxo completo" |
| Demonstração nunca abre no build de produção sem variáveis | `src/data/conexao.test.ts` |

## Roteiro de teste manual (modo demonstração)

**Campo (Supermix):**
1. **Login:** a tela mostra "Eco Sistema TB" e **não** tem "Criar conta". O topo mostra **SUPERMIX BRAZ**, e o botão "Eco Sistema TB" leva ao Portal.
2. **Ana (fiscal)** → *Minhas tarefas* → iniciar a rotina da tarde. Marcar **Não conforme** na validade da padaria: pede foto e observação. Tirar a foto: aparecem data, hora e localização.
3. Ligar o **modo avião**: a barra mostra "Sem internet · N pendente(s)" e "Salvo no aparelho às HH:MM". Fechar e abrir o app: tudo continua lá.
4. *Revisar e concluir*: pendências com link; botão **bloqueado** até resolver. Resolver, assinar e concluir, depois desligar o modo avião: aparece "Enviado ao servidor às HH:MM".
5. **Bruno (líder)** → *Tarefas da loja* → validar (devolver sem motivo é recusado). Em *Planos de ação*, ao enviar a solução: "Quem executou não valida a própria solução".
6. **Carla (gestora da Supermix)** valida o plano. *Dashboard* e *Relatórios* (Excel e PDF).

**Empresas e configuração:**
7. **Admin** → o topo tem o seletor **SUPERMIX BRAZ / EMPRESA EXEMPLO 2**. *Empresas e lojas*: a lista vem agrupada empresa → matriz → filiais; ligar e desligar "usa o Check List"; inativar uma unidade.
8. **Nova empresa** "MERCADO TESTE" → "Copiar checklists de outra empresa" → escolher 2 da Supermix. Cadastrar a matriz (CNPJ com /0001 vira "matriz") e uma filial. CNPJ errado é recusado.
9. *Equipe* (empresa MERCADO TESTE) → **Colaborador novo**: nome, e-mail, senha inicial, perfil gestor (empresa toda). Sair e entrar com esse login: ele só vê MERCADO TESTE.
10. **Gestor novo** → *Modelos de checklist*: os 2 copiados estão em **rascunho v1**. Mudar um texto e publicar. Entrar como **Carla**: o original da Supermix continua igual.
11. **Gabriel (gestor da Exemplo 2)** → *Modelos de checklist* → **Novo checklist** (do zero) → criar a seção "Abertura" com: sim/não "Loja abriu no horário?"; texto "Por que atrasou?" com **condicional** (mostrar quando a 1ª for "Não"); número "Temperatura" de −2 a 4 °C; múltipla escolha com opções editadas. Subir e descer itens e seções; **Pré-visualizar** (a condicional aparece ao marcar "Não"); **Publicar** → **Criar agendamento** abre a agenda já preenchida.
12. Gabriel **não vê** nenhum checklist, tarefa ou dashboard da Supermix, e o menu dele não tem "Empresas e lojas".
13. *Equipe* como gestor: incluir quem já tem login (e-mail), trocar perfil e unidade, inativar e reativar. "Colaborador novo" e "Liberar telas" só aparecem para o admin.

## O que ficou pendente (próximas versões)

- **Notificações (I5):** push e WhatsApp para prazo, atraso e plano.
- **Integrações:** números do CISS (D1), comparação de foto por IA (D2), QR Code por setor (D3), Método Polar × meta do Gestão RH (D4).
- **Cadastro de setores na tela:** hoje cada empresa recebe os 11 setores padrão; o banco já aceita setores por empresa.
- **Envio em segundo plano no iPhone:** depende de app nativo (D5).
- No computador, o seletor de câmera também deixa escolher um arquivo; só um app nativo impede isso.
- As telas de cadastro (Empresas, Modelos, Equipe, Agendamentos, Dashboard, Relatórios) precisam de internet. O trabalho de campo funciona offline.
- Testado automaticamente (PGlite, jsdom) e por roteiro. **Falta o teste num celular de verdade com HTTPS e contra o banco real**, depois do seu OK.
