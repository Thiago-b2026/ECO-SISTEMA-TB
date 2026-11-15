# Roteiro de publicação — Meta de Vendas (junto com o Quadro Geral do Portal)

Preparado em 15/11/2026. 🤖 = o Claude faz (sempre com o seu SIM antes). 👤 = você faz no painel.
A ordem segue as dependências: primeiro o banco, depois o servidor, por último os sites e o main.

## Conferência feita (só leitura, banco de produção `blqgmueqsqqpflorusrm`)
- Nada do Meta de Vendas existe ainda (schema `metas`, sistema `metas`, ação `fechar_mes`).
- A 0026 do Portal (POP, Precificação, bucket `portal-arquivos`) **também não foi aplicada**.
- Tudo de que o Meta de Vendas depende já existe: `pode`, `minhas_unidades`, `minhas_permissoes`, `unidade_usa`,
  `minhas_telas(_app)`, colunas de endereço em `public.lojas`, `acoes.especial`, `raw_user_meta_data`.
- Regras das lojas em produção: o admin lê, cria, edita e exclui (as telas do admin funcionam).
- Testes antes de publicar: Meta de Vendas 75 ✅ · PDV 132 ✅ · build do Portal ✅.

## Passo 1 — 🤖 Guardar o Quadro Geral do Portal (commit)
O `telas.ts` do PDV, a 0026 e o Portal novo ainda não estão commitados. Entram num commit próprio nesta branch,
antes de juntar ao main.

## Passo 2 — 🤖 Banco (nesta ordem, cada uma conferida antes da próxima)
| # | Arquivo | O que faz |
|---|---|---|
| 1 | `META-DE-VENDAS/supabase/migrations/20261115000001_metas_schema.sql` | schema `metas`, tabelas, regras (RLS) |
| 2 | `GESTAO SALVADOS/supabase/migrations/20261113000026_portal_quadros_pop_precificacao.sql` | Portal: POP, Precificação, bucket privado |
| 3 | `GESTAO SALVADOS/supabase/migrations/20261115000027_metas_telas.sql` | sistema `metas`, 9 telas, ação "Fechar / reabrir mês" |
| 4 | `META-DE-VENDAS/supabase/migrations/20261115000002_metas_empresas_acessos.sql` | perfis, acessos, excluir (precisa das telas da 3) |

Comando (na pasta de cada arquivo): `npx supabase db query --remote=blqgmueqsqqpflorusrm --yes -f "<arquivo>"`.
Todas são idempotentes (podem rodar de novo sem apagar nada) e **não criam nenhum dado** de empresa ou venda.

## Passo 3 — 👤 Exposed schemas
Supabase → Integrations → Data API → **Exposed schemas** → incluir **`metas`** → Save.
(Sem isso o app não lê as próprias tabelas.)

## Passo 4 — 🤖 Edge Function `admin-usuarios`
Publicar de novo (agora cria login também para o Meta de Vendas):
`npx supabase functions deploy admin-usuarios --project-ref blqgmueqsqqpflorusrm` (na pasta GESTAO SALVADOS).

## Passo 5 — 🤖 Enviar a branch ao GitHub
`git push origin feat/meta-vendas` (o `main` continua intocado).

## Passo 6 — 👤 Vercel: projeto novo (time grupotb)
1. Add New → Project → repositório `ECO-SISTEMA-TB`.
2. Nome sugerido: **`metas-grupotb`** (link: `https://metas-grupotb.vercel.app`).
3. **Root Directory:** `META-DE-VENDAS` · Framework: **Vite**.
4. Environment Variables (as mesmas do Check List):
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
5. Deploy da branch `feat/meta-vendas` e abrir o link: tem que aparecer a **tela de login de verdade**
   (sem o quadro amarelo de "Modo demonstração").

## Passo 7 — 🤖 Juntar ao main (só com o passo 6 no ar)
Merge de `feat/meta-vendas` no `main` e push. A Vercel publica sozinha:
- **PDV** (Permissões passam a mostrar Meta de Vendas, POP e Precificação);
- **Portal** (Quadro Geral com login e o quadro Meta de Vendas);
- **Meta de Vendas** (produção).

## Passo 8 — 🤖 Cadastrar o link
`update public.sistemas set url = 'https://metas-grupotb.vercel.app' where codigo = 'metas';`
e o mesmo link no `MEU SUPERVISOR/sistemas.json`. A partir daí o quadro do Portal abre o app.

## Passo 9 — 👤 Começar a usar (como administrador, no próprio Meta de Vendas)
1. **Empresas e lojas:** conferir as empresas e lojas que já existem e marcar **"Usa o Meta de Vendas"** nas lojas
   que vão ter meta (ou cadastrar uma nova pelo CNPJ).
2. **Usuários e acessos:** dar o perfil a cada pessoa (gerente, gestor ou vendedor) ou criar o login novo.
3. **Meta e fechamento do mês:** cadastrar a meta do mês.
4. Teste no celular com um vendedor de verdade.

## Pendências do Quadro Geral do Portal (do histórico do Portal)
- Enviar pelo Portal (como admin) os arquivos de `PORTAL/para-enviar/pop` e `PORTAL/para-enviar/precificacao`.
- Liberar o POP para a equipe nas Permissões (a Precificação fica só para o admin).

## Se algo der errado
- Migrations: nenhuma apaga dados; dá para rodar de novo depois de corrigir.
- Site: a Vercel guarda as versões anteriores (Deployments → Promote). O link do PDV e do Portal não muda.
