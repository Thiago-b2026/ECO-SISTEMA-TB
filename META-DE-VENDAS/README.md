# Meta de Vendas e Premiação

Sistema do Ecossistema TB (código `metas`, schema `metas`). Controla, por unidade e por mês, a meta de
faturamento com duas faixas de prêmio (meta 100% e meta mínima) e um bônus por cliente engajado.
Veio do app Lovable "Sales Champion", adaptado às regras do ecossistema (login único, unidades do Portal,
permissões por tela e unidade).

## Situação
- **Etapa 1 (banco):** pronta no PC e testada. **Nada aplicado no Supabase.**
- **Etapa 3 (telas e permissões):** migration 0027 no GESTAO SALVADOS, espelho em `telas.ts` e quadro no Portal. Nada aplicado.
- Próximas etapas: telas do app e publicação. Ver `HISTORICO_META_VENDAS.md`.

## Banco (`supabase/migrations/20261115000001_metas_schema.sql`)
| Tabela | O que guarda |
|---|---|
| `metas.vendedores` | Nome, unidade (`public.lojas`), login (opcional) e ativo. Não é apagado, é inativado. |
| `metas.configuracao_meta` | Por unidade e mês: meta, % mínimo, prêmio 100%, prêmio mínimo, valor por cliente engajado. |
| `metas.lancamentos` | Por vendedor e mês: faturamento e clientes engajados. Guarda a unidade do momento do lançamento. |
| `metas.meses_fechados` | Unidade + mês fechados. Mês fechado bloqueia lançamentos e meta para todos, até reabrir. |

### Telas e ações (permissões por unidade)
| Tela | Ações |
|---|---|
| `metas.dashboard` | ver |
| `metas.lancamentos` | ver, inserir, editar, excluir (lançar o resultado de qualquer vendedor) |
| `metas.ranking` | ver |
| `metas.meu_desempenho` | ver, editar (editar = o vendedor lança o próprio resultado) |
| `metas.historico` | ver, exportar |
| `metas.vendedores` | ver, inserir, editar |
| `metas.configuracao` | ver, editar, fechar_mes |

Quem tem qualquer tela do sistema numa unidade vê os dados daquela unidade (o ranking mostra todos os
vendedores da loja). A unidade precisa estar marcada como "usa o Meta de Vendas" no Portal.

## Testes
```bash
npm install
npm test
```
Os testes rodam num Postgres embutido (PGlite), com um esboço das tabelas do ecossistema
(`supabase/tests/stub_ecossistema.sql`, com as funções `pode`, `minhas_unidades` e `unidade_usa` copiadas da
migration 0018 do GESTAO SALVADOS). Não tocam no banco de produção.

## Publicar (quando autorizado)
1. Aplicar `20261115000001_metas_schema.sql` no Supabase ECO-SISTEMA-TB.
2. Aplicar, no GESTAO SALVADOS, a `20261113000026_portal_quadros_pop_precificacao.sql` (se ainda não estiver aplicada) e depois a `20261115000027_metas_telas.sql`.
3. Supabase → Integrations → Data API → Exposed schemas: incluir `metas`.
4. Marcar as unidades que usam o sistema e liberar as telas para as pessoas.
