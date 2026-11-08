# RH Compass 2.0 – multi-empresa

Versão própria (fora do Lovable) do RH Compass: gestão de RH e custos de pessoal, agora com **várias empresas**.

## O que mudou em relação ao app do Lovable
| Antes (Lovable) | Agora |
|---|---|
| Uma empresa só, 3 lojas fixas | **Cadastro de empresas**, cada uma com quantas lojas quiser |
| Gastos Extras fixo em 5% | % configurável por empresa (padrão 5%) |
| Faixas ÓTIMO/BOM/ALERTA fixas (8% / 10%) | Configuráveis por empresa (padrão 8% / 10%) |
| Anos 2023–2026 | Anos automáticos |
| — | **Provisão x Realizado** (diferença em R$ e %) |
| — | **Acumulado do ano** |
| — | **Copiar mês anterior** e **copiar de Provisão/Realizado** |
| — | **Exportar Excel (CSV)** e **Imprimir** |
| — | **Histórico de alterações** com botão **Desfazer** |
| Qualquer um podia criar conta e ver tudo | Conta nova não vê nada até ser adicionada a uma empresa |

Os cálculos são **os mesmos** do app original (itens 1–13, Gastos Extras sobre os itens, % custo/faturamento).

---

## Instalação (uma vez só)

### 1. Banco de dados (Supabase)
1. Crie uma conta em https://supabase.com e um projeto novo (região São Paulo).
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/migrations/001_inicial.sql` e clique em **Run**.
3. Em **Project Settings → API** copie: *Project URL*, *anon public key* e *service_role key*.
4. Copie `.env.example` para `.env` e preencha as quatro linhas.

### 2. Trazer os dados do Lovable
1. No Lovable, no projeto RH Compass: **Cloud → Database → Tables**. Exporte em CSV:
   - `rh_entries` (obrigatório)
   - `profiles` e `user_roles` (se existirem; trazem os usuários)
2. Salve os arquivos na pasta `dados-lovable/`.
3. Teste sem gravar:
   ```
   npm run importar -- --empresa "Supermix Braz" --dono comprassupermixms@gmail.com --simular
   ```
   Confira os totais por ano com o app antigo.
4. Importe de verdade (mesmo comando sem `--simular`).
   - Usuários do Lovable ganham **senha temporária** (o Lovable não exporta senhas). Elas ficam em `senhas-temporarias.txt`. Entregue a cada pessoa e apague o arquivo.
   - Rodar de novo não duplica nada, e lançamentos diferentes já existentes **não** são sobrescritos.

### 3. Publicar (Vercel)
1. `npm i -g vercel` e depois `vercel` dentro desta pasta.
2. Em **Vercel → Settings → Environment Variables**, cadastre as 4 variáveis do `.env`.
3. `vercel --prod`.

### Rodar no computador
```
npm install
npx vercel dev     # app + tela de Usuários
# ou: npm run dev  # só o app (a tela Usuários precisa do vercel dev)
```

---

## Estrutura
- `src/pages/Dashboard.tsx`: painel, lançamentos, gráficos e comparativos
- `src/pages/Empresas.tsx`: cadastro e configuração de empresas e lojas
- `src/pages/Usuarios.tsx` + `api/admin-users.ts`: usuários por empresa (Dono, Admin, Operador)
- `src/pages/Historico.tsx`: histórico com "Desfazer"
- `src/lib/calc.ts`: regras de cálculo
- `supabase/migrations/001_inicial.sql`: tabelas, segurança (RLS) e funções
- `scripts/importar-lovable.mjs`: importação dos CSVs do Lovable

## Perfis
- **Dono**: tudo, inclusive gerenciar outros Donos.
- **Admin**: configura a empresa, lojas e usuários (menos Donos), e desfaz alterações.
- **Operador**: lança e consulta.
