# Check List Operacional (Ecossistema TB)

PWA *offline-first* para as rotinas das lojas: tarefas por agenda, fotos com data/hora/GPS, respostas, planos de ação, validação pelo líder, dashboard e relatórios PDF/Excel.
Faz parte do Ecossistema TB: **login único** (Supabase Auth), telas liberadas pelo admin no Portal (`public.minhas_telas('checklist')`), unidades em `public.lojas`.

- Código do sistema: `checklist` · schema: `checklist` · pasta: `CHECK LIST OPERACIONAL/app-checklist-mobile`
- Stack: Vite 8 + React 19 + TypeScript + Tailwind 4 · Dexie (IndexedDB) · Supabase · jsPDF · SheetJS · Recharts
- Plano e regras: `../../docs/plano-app-checklist-mobile.md` (seção 7 = regras A–J)

## Rodar no computador

```bash
cd "CHECK LIST OPERACIONAL/app-checklist-mobile"
npm install
npm run dev          # http://localhost:5191
```

- **Sem `.env` → MODO DEMONSTRAÇÃO.** O app abre com dados de exemplo **só no navegador**, sem tocar no banco. Na tela de login aparecem 5 pessoas (fiscal, líder e gestora da Matriz; fiscal e líder da Filial).
- **Com `.env`** (copie `.env.example`) → usa o Supabase ECO-SISTEMA-TB. Só depois de aplicar as migrations (ver "Publicar").

```bash
npm test             # 55 testes (regras, banco em PGlite, offline, app montado em jsdom)
npm run build        # checagem de tipos + build + service worker (dist/sw.js)
npm run preview      # serve o build em http://localhost:5191
npm run seed:gerar   # regenera supabase/seed/checklist_seed.sql a partir de src/data/seed-modelos.ts
```

## Testar no celular

1. Celular e computador na **mesma rede Wi-Fi**.
2. `npm run dev` (já sobe com `--host`) e veja o endereço "Network", ex. `http://192.168.0.10:5191`.
3. Abra esse endereço no celular, entre no modo demonstração e teste.

**Limite do navegador:** em `http://` (fora de `localhost`), o celular **não libera GPS nem o modo offline instalado** (service worker). Câmera, respostas, fila e gravação no aparelho funcionam.
Para testar GPS, instalação e uso sem internet de verdade, é preciso **HTTPS**:
- **Opção recomendada:** um *preview* na Vercel (depois do seu OK). O link `https://...vercel.app` libera tudo.
- **Só Android/Chrome:** em `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, adicione `http://192.168.0.10:5191`, ative e reinicie o Chrome.

**Instalar como app:** abra o link HTTPS → Chrome: menu ⋮ → "Instalar app" / iPhone (Safari): Compartilhar → "Adicionar à Tela de Início".
**No iPhone**, o envio acontece com o app aberto (ao abrir, quando a internet volta e a cada 2 min). O iOS não envia em segundo plano.

## Publicar (precisa do OK do usuário. NADA disso foi feito)

1. **Banco** (Supabase ECO-SISTEMA-TB → SQL Editor), nesta ordem:
   1. `supabase/migrations/20261110000001_checklist_schema.sql` (schema, RLS, funções, bucket `checklist-fotos`)
   2. `GESTAO SALVADOS/supabase/migrations/20261110000023_checklist_telas.sql` (sistema ativo, grupos, telas e ações)
   3. `supabase/seed/checklist_seed.sql` (8 modelos reais, versão 1 publicada)
2. **Supabase → Integrations → Data API → Exposed schemas:** incluir `checklist`.
3. **Portal / Redes e unidades:** marcar o sistema **checklist** nas unidades que vão usar (`public.lojas.sistemas`) e liberar as telas do Check List para cada pessoa.
4. **Equipe:** o primeiro gestor é o **admin** (já é gestor em todas as unidades). Ele entra em *Equipe e perfis* e põe cada pessoa com o perfil, e em *Agendamentos* toca "Aplicar a agenda sugerida".
5. **Vercel (time `grupotb`):** novo projeto do mesmo repositório, *Root Directory* = `CHECK LIST OPERACIONAL/app-checklist-mobile`, framework Vite, variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Nome sugerido: `checklist-grupotb`.
6. **URL:** `update public.sistemas set url = 'https://checklist-grupotb.vercel.app' where codigo = 'checklist';` e confirmar a mesma URL em `PORTAL/src/pages/Inicio.tsx` e `MEU SUPERVISOR/sistemas.json`.
7. (Opcional) ativar **pg_cron** no Supabase para gerar as tarefas às 00:05. Sem ele, o app gera as do dia quando alguém abre.

## Critérios de aceite → testes automáticos

| Critério | Onde é testado |
|---|---|
| Operador não vê dados de outra loja, nem chamando a API direto (RLS) | `supabase/tests/checklist.db.test.ts` → "RLS…", "sincronização idempotente"; `tests/demo-servidor.test.ts` |
| Publicar nova versão não altera execuções antigas | `checklist.db.test.ts` → "versões (regra A)" |
| Sair e voltar mantém respostas e fotos, inclusive offline | `tests/offline.test.ts` → "trabalha sem internet, sai e volta…" |
| Reenviar não duplica execução, foto nem plano | `checklist.db.test.ts` → "sincronização idempotente"; `tests/offline.test.ts` |
| Conclusão bloqueada com pendências | `checklist.db.test.ts`, `tests/offline.test.ts`, `tests/app.ui.test.tsx` (botão desabilitado + links) |
| Nota 35% e "Sem pontuação aplicável" | `src/domain/regras.test.ts` e `checklist.db.test.ts` (mesma regra no app e no banco) |
| Não conforme gera plano ligado ao item (mesmo id no celular e no banco) | `checklist.db.test.ts`, `tests/offline.test.ts`, `tests/demo-servidor.test.ts` |
| Fluxo agendar → executar → não conforme → plano → solução → validação → dashboard | `tests/demo-servidor.test.ts` → "fluxo completo" |

## Roteiro de teste manual (modo demonstração ou banco de teste)

1. **Login:** a tela mostra "Eco Sistema TB" e **não** tem "Criar conta". O botão "Eco Sistema TB" no topo leva ao Portal.
2. **Ana (fiscal)** → *Minhas tarefas*: aparecem "Fiscal de caixa – manhã/tarde", com prazo e situação (texto + ícone).
3. Iniciar a da tarde: o início é registrado e o cronômetro roda. Responder alguns itens. Na *validade da padaria*, marcar **Não conforme**: aparecem "Foto obrigatória" e "Observação (obrigatória)".
4. Tirar a foto: a miniatura mostra data, hora e localização, e o carimbo fica na imagem. Ligar o **modo avião**: a barra mostra "Sem internet · N pendente(s)" e "Salvo no aparelho às HH:MM".
5. Fechar o app e abrir de novo, ainda em modo avião: respostas e foto continuam lá.
6. *Revisar e concluir*: a lista de pendências tem link para cada item, e o botão fica **bloqueado** até resolver. Resolver, assinar e concluir: aparecem a nota e "1 plano de ação aberto".
7. Desligar o modo avião: a barra passa a "Enviado ao servidor às HH:MM".
8. **Bruno (líder)** → *Tarefas da loja*: a execução da Ana fica "Aguardando a sua validação". **Devolver** sem motivo é recusado; validar funciona.
9. *Planos de ação*: o plano do item está com Bruno. Iniciar, enviar solução com foto e tentar validar: **"Quem executou não valida a própria solução"**. Rejeitar sem justificativa também é recusado.
10. **Carla (gestora)** valida o plano. O *Histórico* mostra cada passo, com autor e justificativa.
11. *Dashboard* (Bruno ou Carla): concluídas, tempo médio, conformidade por setor e por pessoa. *Relatórios*: baixar o **Excel** (abas Resumo/Execuções/Planos) e o **PDF** da execução (fotos e assinatura).
12. *Modelos* (Carla): criar rascunho, mudar um peso e publicar a versão 2. A execução antiga continua mostrando a versão 1.
13. **Diego (fiscal da Filial)** não vê nada da Matriz.
14. *Agendamentos* (Bruno): criar um semanal só na quinta, com prazo 14:00.

## O que ficou pendente (próximas versões)

- **Editor completo de modelos (I2):** criar ou apagar seções e itens, reordenar e montar condicionais na tela. Hoje dá para ajustar os itens que já existem e duplicar.
- **Notificações (I5):** push e WhatsApp para prazo, atraso e plano de ação.
- **Integrações:** puxar números dos relatórios do CISS (D1), comparação de foto por IA (D2), QR Code por setor (D3), ligação do Método Polar com a meta no Gestão RH (D4).
- **Envio em segundo plano no iPhone:** depende de app nativo (Capacitor/Expo, D5).
- A foto vem do seletor de câmera do sistema (`capture`). No computador, ele também deixa escolher um arquivo. Só um app nativo consegue impedir isso.
- O histórico do plano e as telas de cadastro (Agendamentos, Modelos, Equipe, Dashboard, Relatórios) precisam de internet. O trabalho de campo (tarefas, execução, fotos, planos) funciona offline.
- Telas testadas automaticamente (jsdom) e por roteiro. **Falta o teste num celular de verdade com HTTPS**, depois do preview.
