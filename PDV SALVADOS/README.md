# Eco Sistema TB

Gestão completa da loja de salvados: lotes, triagem, rateio de custo, estoque, PDV, caixa,
relatórios e financeiro.

## Rodar no computador

1. Copie `.env.example` para `.env` e preencha com a URL e a chave **anon public** do Supabase
   (Supabase → Project Settings → API).
2. `npm install`
3. `npm run dev` e abra http://localhost:5173

## Banco de dados

As tabelas ficam em `supabase/migrations/`. Para aplicar no Supabase:

```
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

**Primeiro acesso:** no painel do Supabase, vá em Authentication → Users → Add user e crie o
seu usuário. O primeiro usuário criado vira **admin** automaticamente. Depois, em
Authentication → Sign In / Providers, desligue "Allow new users to sign up" — novos usuários
são criados só pelo admin.

## Documentação

- `CLAUDE.md` — regras do projeto (lidas pelo Claude Code)
- `docs/escopo.md` — resumo e link para o escopo completo
