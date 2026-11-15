# Meta de Vendas e Premiação – instruções para o Claude

- Responda sempre em português, de forma curta e direta.
- Sistema do Ecossistema TB: código `metas`, schema `metas`, pasta `META-DE-VENDAS`. Valem as regras do
  `CLAUDE.md` da raiz e do `MEU SUPERVISOR/CLAUDE.md` (pedir autorização antes de qualquer execução final).
- Diário de bordo: `HISTORICO_META_VENDAS.md`. Ao abrir, ler o "📍 ONDE PARAMOS"; ao terminar, registrar a
  sessão e atualizar o topo.

## Regras deste sistema
- Unidades = `public.lojas` (cadastro do Portal). Nunca criar tabela de lojas própria.
- Permissões só por `public.pode(tela, ação, unidade)` e `public.minhas_unidades('metas')`. Não usar
  `user_roles` nem `has_role` (são do PDV).
- Nenhum gatilho em `auth.users`. Login de vendedor é criado só pelo admin (Edge Function `admin-usuarios`).
- Migration já aplicada em produção não se altera: mudança vira migration nova.
- Toda regra de banco nova ganha teste em `supabase/tests/metas.db.test.ts` (`npm test`).
- O cálculo da premiação segue o do Lovable (`calculo-premiacao.ts`): % atingido = faturamento da loja ÷ meta;
  ≥ 100% → prêmio 100%; ≥ % mínimo → prêmio mínimo; cada vendedor recebe pela participação no faturamento,
  mais clientes engajados × valor por cliente.
- Código original do Lovable para consulta: `metavendas-codigo.zip` (fora do git).
