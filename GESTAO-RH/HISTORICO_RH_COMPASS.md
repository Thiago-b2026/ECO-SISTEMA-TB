# 📒 HISTÓRICO – RH COMPASS 2.0 (multi-empresa)

## 📍 ONDE PARAMOS
✅ No ar (versão antiga): https://gestao-rh-tau.vercel.app (login = o mesmo do PDV Salvados).
🆕 **Permissões do Ecossistema (08/11)**: as telas do RH são liberadas no PDV Salvados (Login de acesso → Permissões → sistema Gestão RH). Só o admin cria empresas e dá acessos. O código está pronto e o build passou; **falta o usuário aplicar a migration 0017 do PDV e publicar os dois sites**.
Depois de publicado e testado: colocar esta pasta no Git, sem .env, CSVs, prints e senhas-temporarias.txt.
Pasta: `C:\GTB_ PROJETOS_CLAUDE\ECO-SISTEMA-TB\GESTAO-RH`. Banco: Supabase ECO-SISTEMA-TB, schema `rh`.

---

## 🧭 CONTEXTO
- App original: Lovable "RH Compass" (https://cost-visionary-pro.lovable.app), projeto e0c879d7-b2e4-4375-b630-59696f728cb0.
- Função: custo de pessoal x faturamento de 3 lojas, abas Provisão/Realizado, 13 itens + Gastos Extras 5%, indicador ÓTIMO <8% / BOM / ALERTA ≥10%.
- Banco original (Lovable Cloud/Supabase): `rh_entries` (tab, ano, mes 0–11, data JSON {faturamento:{loja1..3}, items:[13 x {loja1..3}]}) e `user_roles` (owner/admin/operador).

## 🗓️ SESSÕES

### Sessão 1 – 07/11/2026
**O que foi feito:**
1. Lemos o app publicado (só a tela de login é pública) e o código JS público para levantar telas, cálculos e tabelas.
2. Criamos o RH Compass 2.0 (Vite + React + Supabase + Vercel):
   - Cadastro de **empresas** (quem cria vira Dono), com lojas variáveis
   - Gastos Extras % e faixas do indicador configuráveis por empresa
   - Comparativo Provisão x Realizado, Acumulado do ano, Copiar mês anterior / da outra aba, Exportar Excel, Imprimir
   - Histórico de alterações com Desfazer (tabela `rh_entries_log`)
   - Usuários por empresa (Dono/Admin/Operador) via função de servidor `api/admin-users.ts`
   - Segurança: conta nova não vê nada até ser adicionada a uma empresa (no original, qualquer cadastro via tudo)
3. Importador `scripts/importar-lovable.mjs`: lê os CSVs do Lovable (separados por ;), cria a empresa "Supermix Braz" com loja1–3, mantém o JSON idêntico, não sobrescreve nada e tem modo `--simular`.

**Decisões:**
- Hospedagem: Supabase (banco próprio) + Vercel
- Dados atuais = empresa **Supermix Braz**
- Formato dos lançamentos mantido igual ao original (lojas pelo código loja1, loja2…), então a importação é 1:1
- Lojas não são excluídas (só renomeadas) para não perder histórico

**Onde parou:** aguardando a criação do Supabase e a exportação dos CSVs.

---
### Sessão 2 – 08/11/2026
**O que foi feito:**
1. Descobrimos que, no fim da sessão 1, a criação de um projeto Supabase novo falhou (limite de 2 projetos grátis). Hoje MetaVendas e o ECO antigo (ljslkz…) estão pausados.
2. Decisão do usuário: usar o **mesmo banco do ECO-SISTEMA-TB**, em pasta separada → schema `rh`.
3. SQL `001_inicial.sql` convertido para `rh.*`. O gatilho em auth.users foi renomeado para `rh_on_auth_user_created`, porque o nome original apagaria o gatilho do ECO. Ele também foi protegido contra erro. Foram adicionadas as permissões (grants) e os perfis dos 5 usuários existentes. Aplicado e conferido: 6 tabelas em `rh`, gatilho do ECO intacto.
4. App, `api/admin-users.ts` e importador apontam para `db.schema = "rh"`. O tempo real também usa o schema `rh`.
5. `.env` criado com a URL e as chaves do projeto ECO. `.env.db` (senha do projeto que não chegou a existir) foi incluído no `.gitignore`.
6. Nova tela **Visão Global** (`/global`): todas as empresas lado a lado e o total consolidado. Permite escolher Provisão/Realizado, mês ou acumulado do ano, exportar Excel, imprimir e ver gráfico.

**Atenção:** os logins são compartilhados com o ECO (mesmo auth). Um usuário criado no RH também consegue entrar no ECO. Falta conferir o que ele enxerga lá: algumas regras do ECO liberam leitura para qualquer usuário logado, como a lista de profiles.

7. O usuário liberou o schema `rh` em Integrations → Data API → Settings → Exposed schemas.
8. Importação feita: empresa Supermix Braz, 3 lojas, 11 lançamentos. Realizado 2026 (9 meses): faturamento R$ 13.124.876,83 e custo R$ 1.458.277,03.
9. Pastas mudaram para C:\GTB_ PROJETOS_CLAUDE\ECO-SISTEMA-TB, e o RH virou GESTAO-RH.
10. A publicação na Vercel foi bloqueada pela permissão do Claude Code (chaves secretas e deploy de produção). Comandos para o usuário, dentro da pasta GESTAO-RH:
    `npx vercel link --yes --project gestao-rh`, depois `npx vercel env add <NOME> production` para as 4 variáveis do .env, depois `npx vercel --prod`.

11. Usuário autorizou e o app foi publicado: https://gestao-rh-tau.vercel.app. Variáveis cadastradas em production e preview. O `.vercelignore` impede o envio do .env, dos CSVs, dos prints e dos scripts.
12. Nome do app trocado de "RH Compass" para "Gestão RH" e republicado.
13. Conferido: um usuário só do RH, ao entrar no ECO, consegue ler apenas formas_pagamento, mercadologico, modelos_etiqueta, profiles (nomes e e-mails da equipe) e user_roles. Não vê vendas, estoque nem financeiro.

**Onde parou:** app no ar; falta o usuário validar.

---
### Sessão 3 – 08/11/2026 – Permissões do Ecossistema (sistema → grupo → tela)
**O que foi feito:**
1. O RH entrou no cadastro único de permissões do Ecossistema como sistema `rh`, com dois grupos:
   - **Lançamentos:** Painel e Histórico.
   - **Consolidado:** Visão Global e Empresas.
   A tela **Usuários do Gestão RH** passou a ser exclusiva do Admin.
2. `src/contexts/TelasContext.tsx` lê `public.minhas_telas('rh')` e `public.is_admin()`. O menu e as rotas mostram só as telas liberadas; a tela bloqueada mostra "Acesso negado".
3. **Só o admin dá acessos e cria empresas:**
   - `api/admin-users.ts` exige `user_roles.role = 'admin'`.
   - `rh.criar_empresa` exige admin (migration 0017 do PDV).
   - O botão "Nova empresa" aparece só para o admin.
   - Quem não está em nenhuma empresa vê o aviso "peça ao administrador".
4. Login sem "Criar conta", como manda a regra do Ecossistema.
5. **Correção importante:** remover alguém de uma empresa não apaga mais a conta de login, que é compartilhada com o PDV Salvados.
6. Os papéis Dono, Admin e Operador continuam valendo para os dados. Modo de segurança: se a consulta falhar, libera como antes e mostra aviso.
7. `npm run build` OK. Tipos de `api/admin-users.ts` conferidos.

**Onde parou:** aplicar a 0017 (no PDV) e publicar (`npx --yes vercel@latest deploy --prod --yes` nesta pasta).

---
### Sessão 4 – 08/11/2026 – Portal, fase 1 (redes e unidades)
**O que foi feito:**
1. A empresa "Supermix Braz" do RH vira a **rede SUPERMIX BRAZ**, e as lojas `loja1`, `loja2` e `loja3` viram as unidades Supermix Loja 1 (CNPJ 17.890.178/0001-58, matriz), Loja 2 e Loja 3.
   - Os lançamentos não mudam: a coluna `rh.lojas.unidade_id` diz qual unidade é cada chave.
   - Faturamento por unidade conferido no ensaio: 6.754.074,54 + 3.320.453,99 + 3.050.348,30 = 13.124.876,83.
2. **Loja nova** (só o admin adiciona) vira unidade da rede automaticamente e entra nas análises, mas não libera ninguém.
3. Natália ("NATHALIA", login criado pela tela Usuários do RH, Operador na Supermix) recebe Painel e Histórico pela regra 3c da 0018.
4. "+ Adicionar loja" só aparece para o admin. `npm run build` OK.

**Onde parou:** 0018 APLICADA em 08/11; falta republicar o RH (`npx --yes vercel@latest deploy --prod --yes`).

---
<!-- NOVAS SESSÕES ENTRAM ABAIXO, NO MESMO FORMATO -->
