# Portal – Ecossistema TB

Entrada única dos sistemas do Grupo TB. Mesmo login do PDV Salvados e do Gestão RH (Supabase ECO-SISTEMA-TB).

**Etapa 1 (atual):** tela de login + tela inicial com um quadro para cada sistema liberado
(`public.meus_sistemas()`): GESTÃO SALVADOS (PDV) e GESTÃO RH. Clicar abre o sistema na mesma aba.
Ainda não há cadastro de usuários, empresas ou permissões (próximas etapas, ver `HISTORICO_PORTAL.md`).

## Rodar no computador
```
npm install
npm run dev      # http://localhost:5190
```
Precisa do arquivo `.env` (copie de `.env.example`) com a URL e a chave **pública** (anon) do Supabase.

## Publicar
Projeto `portal-grupotb` na Vercel (time `grupotb`), com as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
