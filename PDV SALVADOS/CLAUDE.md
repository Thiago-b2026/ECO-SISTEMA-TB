# Eco Sistema TB — Gestão da loja de salvados

Sistema web de gestão completa para loja de salvados: lotes, triagem, rateio de custo,
estoque, PDV, caixa, relatórios e financeiro. Substitui o "SuperMix PDV" feito no Lovable.

- **Ao abrir uma sessão nova, leia primeiro `docs/CONTEXTO-SESSAO.md`** (estado atual, pendências e próximo passo)
- Escopo completo: `docs/escopo.md` (fonte: https://claude.ai/artifact/9NPP1My1ezB8ghENwRLKsW)
- Código antigo de referência (só leitura): `C:\PROJETOS_CLAUDE\PROJETO LOVABLE\cashier-buddy-plus-main\`
- Metas/premiação de vendedores está FORA do escopo.

## Stack
- Vite + React 19 + TypeScript, SPA (sem SSR)
- TanStack Router com rotas por arquivo em `src/routes` (`routeTree.gen.ts` é gerado — não editar)
- Tailwind v4 + componentes shadcn em `src/components/ui`; ícones lucide-react; toasts sonner
- Supabase: Postgres + Auth + RLS + Storage. Cliente em `src/lib/supabase.ts`
- Testes: Vitest (`npm test`)

## Comandos
- `npm run dev` — sobe em http://localhost:5173
- `npm test` — testes
- `npm run build` — checa tipos e gera `dist/`
- Banco: migrations em `supabase/migrations/` aplicadas com `npx supabase db push`

## Regras fixas (não quebrar)
1. **Português do Brasil** em toda a interface. Moeda BRL (`fmtBRL`).
2. **Fuso `America/Sao_Paulo`** em tudo. Use as funções de `src/lib/sale-datetime.ts`.
3. **`data_venda` é a data oficial da venda.** Filtros, relatórios, caixa e dashboard usam
   `data_venda`, nunca `created_at`.
4. **Nada de limite de 1000 linhas:** listas completas usam `fetchAllRows` / `fetchAllByIds`
   (`src/lib/fetch-all.ts`); contagens usam `count: "exact", head: true`.
5. **RLS em todas as tabelas.** Papel fica só em `user_roles`; checar com `has_role`,
   `has_any_role`, `is_admin()`, `is_gestor()`. Nunca confiar só na tela para permissão.
6. **Toda mudança de estoque passa por `stock_movements`** (entrada, venda, ajuste, perda,
   devolução). Nunca alterar `estoque_atual` direto.
7. **Operações de dinheiro são atômicas:** venda + itens + pagamentos + baixa de estoque em
   UMA função Postgres (RPC), nunca em vários inserts soltos pelo navegador.
8. **Caixa:** só pagamento em dinheiro entra no saldo da gaveta. Fechamento é cego.
9. **Sem segredos no código.** Chaves só no `.env` (fora do Git). A `service_role` key
   nunca vai para o front-end.
10. Banco só muda por arquivo de migration novo em `supabase/migrations/` — nunca editar
    uma migration já aplicada nem alterar pelo painel.

## Perfis
| Papel | Acesso |
| --- | --- |
| admin | tudo, inclusive Usuários |
| gerente | tudo, menos Usuários |
| vendedor | PDV, Produtos (consulta), Vendas, Caixa |
| estoquista | Lotes, Produtos e estoque |

O menu e as permissões de tela ficam em `src/lib/nav.ts`. O primeiro usuário criado no
Supabase vira admin automaticamente (trigger `handle_new_user`).

## Roadmap
- Fase 0 — Fundação (projeto, banco, login, menu) ← atual
- Fase 1 — MVP: lotes, triagem, rateio, estoque, PDV, caixa, relatórios básicos, usuários
- Fase 2 — clientes, financeiro, relatórios completos, auditoria
- Fase 3 — NFC-e, marketplaces, catálogo, app de triagem
