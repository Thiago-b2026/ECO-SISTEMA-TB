# 📒 HISTÓRICO – PORTAL GRUPO TB (cadastro único de acessos do Ecossistema TB)

## 📍 ONDE PARAMOS
**AGORA (08/11 noite):** Portal = página aberta, SEM login, com os quadros fixos GESTÃO SALVADOS e GESTÃO RH (Sessão 3). Sistema novo → incluir o quadro em `PORTAL/src/pages/Inicio.tsx`. O resto está pausado.

**Fase 1 (banco): APLICADA e conferida em 08/11** (294 linhas convertidas, 140 liberadas; Natália só RH nas 3 lojas da Supermix; PDV com Monte Sinai e Eldorado). Antes disso: Em 08/11, o usuário achou que tinha aplicado a 0018, mas no banco não existe nada dela. Ela roda inteira de uma vez, então não ficou nada pela metade.

**Etapas combinadas (08/11):** 0 (RH no Git, publicando pelo push) → A (menu novo do PDV) → B (Portal) → C (PDV lê o Portal) → D (RH lê o Portal + tela de entrada) → E (limpeza).
**Etapa 0 e Etapa A: código pronto e commitado.** Falta o usuário configurar o Root Directory do gestao-rh na Vercel (`GESTAO-RH`) e publicar com push no `main`.
**Próximo passo depois disso:** Etapa B (Portal).

**Depois:** fase 2, a tela do Portal (requisitos abaixo).

---

## 🧭 CONTEXTO
- **O que é:** o Portal é o lugar único onde **só o admin** cadastra usuários e dá acessos para todos os sistemas do Ecossistema TB.
- **Código do sistema:** `portal`, inativo até a fase 2.
- **Site:** https://portal-grupotb.vercel.app. Depois, `sistema.grupotbdearaujo.com.br`.
- **Banco:** Supabase ECO-SISTEMA-TB (`blqgmueqsqqpflorusrm`). As tabelas centrais ficam no schema `public`, e as migrations em `PDV SALVADOS/supabase/migrations/` (regra do `CLAUDE.md` da raiz).
- **Estrutura:** Grupo TB → **REDE** (empresa) → **UNIDADES**.
  - Cada unidade tem o seu CNPJ. Matriz ou filial sai do CNPJ: final /0001 = matriz, outro final = filial.
  - A unidade é a tabela `public.lojas`, que ganhou `rede_id`, `tipo` e `sistemas`.
  - **Rede SALVADOS LP:** Monte Sinai (65.297.057/0001-40) e Eldorado (61.387.931/0001-89), as duas matriz.
  - **Rede SUPERMIX BRAZ:** Supermix Loja 1, 2 e 3 (nomes provisórios; o usuário renomeia e põe os CNPJs pelo Portal). Elas são ligadas às lojas `loja1`, `loja2` e `loja3` do Gestão RH, sem mexer nos lançamentos.
- **Permissões por unidade:** sistema → grupo → tela → ação.
  - Tabelas: `public.acoes` (catálogo extensível), `public.tela_acoes` e `public.usuario_permissoes`. Sem linha = bloqueado; o admin pode tudo.
  - Funções: `pode(tela, ação, unidade)`, `minhas_unidades(sistema)`, `minhas_permissoes(sistema, unidade)`, `copiar_permissoes(usuário, de, para)` e `sincronizar_permissoes_legado()`. Esta última só pode ser rodada antes da fase 3.
  - "Marcar a rede inteira" grava em cada unidade que existe hoje. Unidade nova não herda nada.
- **Fases:**
  1. Banco
  2. Tela do Portal
  3. PDV e RH passam a ler o Portal (ações por tela no lugar das áreas e dos papéis Dono/Admin/Operador)
  4. Limpeza: tirar do PDV as telas antigas de permissão

---

## 🎨 REQUISITOS DA FASE 2 – TELA DO PORTAL (pedido do usuário em 08/11/2026)
1. **Topo:** "ECOSSISTEMA TB", em letra de forma (maiúsculas) e negrito.
2. **Logo abaixo:** a lista de **EMPRESAS** (redes) cadastradas, cada uma com as suas unidades (matriz e filiais).
3. **O admin escolhe a empresa** → aparece **"USUÁRIOS DESTA EMPRESA"**, com o botão **"+ ADICIONAR USUÁRIO"**.
4. **Ao abrir um usuário naquela empresa:** unidades → sistemas → grupos → telas → ações (os flags). Deve ter:
   - marcar a rede inteira de uma vez;
   - copiar de uma unidade para outra;
   - estado parcial nos checkboxes de cada nível;
   - busca, "Marcar tudo" e "Desmarcar tudo";
   - modelos prontos e "copiar de outro usuário";
   - aviso de alterações não salvas.
5. **Lista GERAL de usuários:** abro uma pessoa e vejo tudo o que ela acessa em todas as empresas. **Desativar ali tira o acesso de tudo** (todos os sistemas e todas as unidades).
6. **Visual:**
   - títulos, menus e botões em **letra de forma e negrito**;
   - textos longos, valores e tabelas em letra normal, para ler melhor.

7. **Tela de entrada do usuário (depois do login):**
   - Aparece a lista de **EMPRESAS** que ele acessa.
   - Ao clicar numa empresa, logo **abaixo do nome** aparecem só os **SISTEMAS** que essa empresa usa e que ele tem liberados nela.
   - Clicou no sistema, ele abre **já dentro daquela empresa**, sem pedir login de novo e sem perguntar a empresa outra vez. O sistema recebe a empresa ou unidade escolhida e usa a mesma sessão do Supabase.
   - Se a pessoa só tem uma empresa e um sistema, abre direto.
8. **ATIVO / INATIVO / EXCLUIR**, para empresas (redes e unidades) e usuários:
   - **Botão Ativar/Inativar.** Inativo some das listas e não consegue entrar, mas o histórico fica. Dá para reativar.
   - **Filtro** nas listas: Ativos / Inativos / Todos.
   - **EXCLUIR** só aparece se o cadastro nunca teve movimento (cadastro de teste): sem vendas, caixa, estoque, lançamentos do RH nem registros na auditoria. Se tiver, mostrar: **"Não pode excluir, já tem histórico. Use Inativar."**
   - Antes de excluir, confirmar: **"Tem certeza? Não dá para desfazer."**
   - **Excluir usuário** apaga o login e as permissões dele (só quando ele não tem histórico). **Inativar** só bloqueia a entrada.
   - Onde fica o "ativo":
     - `public.redes.ativo` e `public.lojas.ativo` (unidades) **já existem**. A de redes vem na 0018; a de lojas já existia.
     - **Usuário:** `public.profiles.ativo` já existe. Na fase 2, inativar também bloqueia o login no Supabase Auth, pela função de servidor que já faz isso no PDV (`admin-usuarios`, ação "ativo").
     - **Vínculo usuário–unidade:** ainda não existe como tabela, porque as permissões são linhas por unidade. Na fase 2 entra uma **migration nova** (0019) com `public.usuario_unidades (user_id, unidade_id, ativo, atualizado_por, atualizado_em)`. Inativar o vínculo bloqueia aquela unidade sem apagar as marcações. Não precisa refazer a fase 1.
9. **Loja nova no Gestão RH:** só o admin adiciona (`rh.adicionar_loja`). Ela vira **unidade da rede automaticamente** e entra nas análises por loja e global, mas **não libera ninguém**. No Portal, o botão **"Copiar permissões da Loja 1 para a loja nova"** usa `public.copiar_permissoes(usuário, de, para)`. Testado no ensaio: copiou 10 linhas e a Natália passou a ver a Loja 4.
   - Até a fase 3, o Gestão RH ainda mostra todas as lojas da empresa para quem é membro dela, porque hoje o RH controla o acesso por empresa. Na fase 3, passa a ser por unidade.

Também valem na fase 2:
- só o admin entra (telas `portal.*` são exclusivas do Admin);
- login único do Supabase, sem tela de "Criar conta";
- quem cria usuário é o Portal, **sem perfil do PDV e sem loja obrigatória** (resolve o caso de usuário só do RH, como a Natália);
- remover acesso **nunca** apaga a conta de login;
- relatórios por unidade, por rede (global) e pelo grupo todo;
- seguir o checklist de sistema novo do `CLAUDE.md` da raiz (pasta, histórico, `sistemas.json`, publicação na Vercel no time `grupotb`).

---

## 🧭 ORGANIZAÇÃO NOVA DO MENU DO PDV (pedido em 08/11/2026)
Os **grupos no banco já nascem assim na fase 1**. A troca do menu na tela do PDV fica para a **fase 3**.
- **DASHBOARD:** Dashboard, Relatórios
- **PDV · FRENTE DE LOJA:** PDV, Vendas e notas
- **PRODUTOS:** Cadastro de produtos, Mercadológico, Lotes, Etiquetas, Transferências (e Mercado Livre, que é uma rota escondida)
- **FINANCEIRO:** Financeiro (pagar, receber, fluxo, DRE), Movimentações de caixa, Formas e meios de pagamento, Contas bancárias, Plano de contas
- **CADASTROS:** Empresas (antes "Lojas e configurações"), Pessoas. Login de acesso continua aqui até a fase 4, porque vai para o Portal.
- **CRM E WHATSAPP:** CRM

Regras:
- É só agrupamento: cada subtela mantém o seu código e o seu flag. Ninguém perde nem ganha acesso.
- No menu, a tela principal abre e mostra as subtelas logo abaixo.

## 🔑 LOGIN LIGADO À PESSOA (fases 2 e 3)
- No Portal, o login do usuário fica ligado à **PESSOA** (`public.pessoas.user_id`).
- No PDV, a tela Pessoas mostra **"tem login: sim/não"** e um botão que abre o Portal.
- **Caso conhecido:** a Natália tem cadastro em Pessoas ("NATHALIA", `eh_usuario = false`), mas o login dela foi criado pela tela Usuários do Gestão RH e **não está ligado à pessoa**. Ligar os dois no Portal (fase 2).

---

## 🗓️ SESSÕES

### Sessão 1 – 08/11/2026 – Desenho e fase 1 (banco)
**O que foi feito:**
1. Desenho aprovado: Grupo TB → rede → unidades (CNPJ, matriz e filial automáticas); permissões por unidade com ações por tela; Portal em site próprio.
2. Migration da fase 1 escrita, mas ainda não aplicada. Nenhum comportamento muda nos sistemas e nenhum dado é movido. O PDV passa a filtrar as unidades que usam o PDV (`minhas_lojas`, `lojas_ativas` e `relatorio_por_loja`).
3. Conferência só leitura rodada: os 5 usuários deram OK, com 1 admin.
4. Requisitos visuais e de navegação da fase 2 anotados acima.

**Decisões:**
- Unidades da Supermix com nomes provisórios.
- As vendedoras mantêm desconto e sangria na conversão (era o acesso de hoje); o usuário pode tirar depois.

5. A loja "SUPER MIX BRAZ", criada no PDV em 08/11 (CNPJ 17.890.178/0001-58, sem nenhum movimento e sem usuários), foi **reaproveitada** como a unidade da loja1 do RH: vira "Supermix Loja 1" (matriz), só RH, e sai do PDV. Não há unidade duplicada.
6. A Natália (login criado pelo RH, sem perfil do PDV e sem loja) estava sem telas de RH. Pela regra 3c da migration, membro do RH sem nenhuma tela de RH recebe Painel e Histórico.
7. Grupos do PDV refeitos conforme o menu novo (seção acima).
8. Conferência rodada de novo: tudo OK, com a Natália em destaque (só RH, nas 3 unidades da Supermix).
9. **Ensaio desfeito:**
   - vendas, caixa, estoque e lançamentos iguais em 4 de 4 lojas, e lançamentos do RH intactos;
   - faturamento do RH por unidade: Loja 1 = 6.754.074,54, Loja 2 = 3.320.453,99, Loja 3 = 3.050.348,30, somando os mesmos 13.124.876,83;
   - o PDV mostra só Monte Sinai e Eldorado;
   - a Natália lança no Painel, não edita a empresa e não vê o PDV;
   - a NAGILA vende, mas não edita produto nem cancela venda;
   - 294 linhas de permissão, 140 liberadas.

10. **Aplicação:** o usuário disse que aplicou, mas o banco não tem nada da 0018 (sem tabelas, sem colunas, nada pela metade). Aproveitei que ela não estava aplicada e incluí nela:
    - a **loja nova do RH vira unidade automaticamente**: gatilho `trg_rh_loja_cria_unidade`;
    - `rh.adicionar_loja` **só para o admin**;
    - `rh.criar_empresa` também cria a rede.

    No Gestão RH, o "+ Adicionar loja" aparece só para o admin.
11. **Ensaio desfeito, de novo:**
    - dados iguais em 4 de 4 lojas, e lançamentos do RH intactos;
    - a loja SUPER MIX BRAZ continua sendo a mesma, agora "Supermix Loja 1", só RH e matriz;
    - o PDV mostra só Eldorado e Monte Sinai;
    - a Natália foi barrada ao adicionar loja;
    - o admin criou a Loja 4, que virou unidade da SUPERMIX BRAZ com 0 permissões;
    - copiar da Loja 1 → Loja 4 gravou 10 linhas, e a Natália passou a ver a Loja 4;
    - a Natália continua sem PDV.
12. 88 testes OK; build OK no PDV e no Gestão RH.

**Onde parou:** aplicar a 0018 de verdade.

---
### Sessão 2 – 08/11/2026 – Recomeço pelo simples: TELA INICIAL (etapa 1)
**Pedido do usuário:** parar tudo e fazer uma coisa de cada vez.
- A 0019 NÃO foi aplicada: está só no commit 1918825.
- A troca de nomes "Caixa" / "Formas de pagamento" está commitada, mas NÃO publicada.
- O PDV e o RH não foram mexidos.

**O que foi feito:**
1. Site do Portal criado nesta pasta (Vite + React + Supabase, cores do PDV):
   - **login:** mesmo login, sem "Criar conta";
   - **tela inicial:** cabeçalho "ECOSSISTEMA TB" e botão SAIR. Um quadro grande por sistema liberado, lido de `public.meus_sistemas()`: GESTÃO SALVADOS (PDV) e GESTÃO RH. Clicar abre na mesma aba.
2. Nesta etapa os quadros só abrem o site, e a pessoa entra com o login lá. **"Já logado" fica para a próxima etapa, separada.**
3. O site usa só a chave pública (anon). Script `scripts/vercel-variaveis.mjs` cadastra as 2 variáveis públicas na Vercel.
4. Build OK.

5. **Publicado em 08/11:** https://portal-grupotb.vercel.app. Projeto `portal-grupotb` na Vercel, com as 2 variáveis públicas. A Vercel ligou o projeto ao GitHub sozinha.
   - Hoje ele é publicado pela CLI, de dentro da pasta.
   - Antes do próximo push no `main`, configurar **Root Directory = `PORTAL`** e passar a publicar pelo push.

**Onde parou:** o usuário confere a tela inicial. Próxima etapa, separada: "já logado" ao clicar no quadro.

---
### Sessão 3 – 08/11/2026 – Portal SEM senha e nome "ECO SISTEMA TB"
**O que foi feito (só no Portal; PDV, RH e banco intocados; migrations 0019 e 0020 continuam paradas):**
1. O nome passa a ser **"ECO SISTEMA TB"** em letra de forma e negrito, no cabeçalho e na aba do navegador. Fica numa linha só, também no celular.
2. **Página aberta, sem login.** Saem a tela de login e o botão SAIR, e o Portal não consulta mais o banco (sem Supabase).
3. Os quadros são sempre os mesmos: **GESTÃO SALVADOS** (https://eco-sistema-tb.vercel.app) e **GESTÃO RH** (https://gestao-rh-tau.vercel.app), abrindo na mesma aba. A senha é pedida pelo próprio sistema, que mostra só o que a pessoa tem liberado.
4. ⚠️ **SISTEMA NOVO = INCLUIR O QUADRO AQUI:** a lista de quadros é **fixa no código**, na constante `SISTEMAS` em `PORTAL/src/pages/Inicio.tsx`. Ao criar um sistema novo, incluir o quadro (código, título, descrição, endereço, ícone) e também em `MEU SUPERVISOR/sistemas.json`.
5. O script de variáveis e o `.env.example` foram retirados, porque não há mais conexão com o banco. As variáveis antigas na Vercel ficaram, mas não fazem nada.

**Observação:** existe a migration `20261108000020_rh_cadastro_filiais.sql` e há mudanças em `GESTAO-RH/src/pages/Empresas.tsx` que NÃO são desta sessão (outra sessão, talvez o Meu Supervisor). Não foram tocadas.

**Onde parou:** publicar o Portal (`npx --yes vercel@latest deploy --prod --yes` dentro da pasta PORTAL).

---
<!-- NOVAS SESSÕES ENTRAM ABAIXO, NO MESMO FORMATO -->

## Sessão – 10/11/2026 (Check List Operacional entra no Portal)
- Quadro **Check List Operacional** ("Rotinas, fotos e planos de ação por loja", ícone de prancheta) incluído em `src/pages/Inicio.tsx`.
- A url é **prevista** (`https://checklist-grupotb.vercel.app`) e precisa ser confirmada quando o projeto for criado na Vercel (time grupotb, Root Directory `CHECK LIST OPERACIONAL/app-checklist-mobile`).
- Sistema, grupos e telas: migration `GESTAO SALVADOS/supabase/migrations/20261110000023_checklist_telas.sql`, espelhada em `GESTAO SALVADOS/src/lib/telas.ts`. **Ainda não aplicada** (depende do OK do usuário).
- Portal **não publicado** nesta sessão.
