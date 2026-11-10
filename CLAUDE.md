# Instruções para o Claude – Projetos do Supermix Braz

- Responda sempre em português.
- O projeto ativo é o **CRM próprio do Supermix Braz** (substituir o Mercafácil; ERP/PDV CISS).
- O diário de bordo fica em `HISTORICO_PROJETO_CRM.md`.

## Ao abrir / retomar o projeto ("abrir projeto", "onde paramos")
1. Ler `HISTORICO_PROJETO_CRM.md`.
2. Mostrar ao usuário: **onde parou**, **o que já foi feito** (resumo das sessões) e **o próximo passo**.

## Ao final de cada trabalho no projeto
1. Adicionar uma nova "Sessão N – data" em `HISTORICO_PROJETO_CRM.md` com: o que foi feito, decisões e onde parou.
2. Atualizar a seção "📍 ONDE PARAMOS" no topo do histórico.
3. Atualizar a memória do projeto (`projeto-crm-supermix`).

## Novos projetos
Para cada projeto novo nesta pasta, criar um `HISTORICO_<NOME>.md` no mesmo formato e seguir as mesmas regras.

---

## 🧩 Ecossistema TB – regras para TODO sistema desta pasta

O Ecossistema TB é um guarda-chuva com vários sistemas (meta: 10 a 12). Cada sistema fica no seu
bloco, mas todos compartilham **um login** e **um cadastro de permissões**.

### Estrutura
- **Banco único:** projeto Supabase **ECO-SISTEMA-TB** (ref `blqgmueqsqqpflorusrm`, São Paulo).
  Não criar outro projeto Supabase (o plano grátis só permite 2).
- **Cada sistema = uma pasta + um schema próprio + um projeto na Vercel (time `grupotb`).**
  Exemplos: PDV Salvados → pasta `GESTAO SALVADOS`, schema `public`; Gestão RH → pasta `GESTAO-RH`, schema `rh`.
- Lista oficial dos sistemas: `MEU SUPERVISOR/sistemas.json` (sempre atualizar ao criar um sistema).

### Permissões: SISTEMA → GRUPO → TELA
- Tabelas centrais no schema `public`: `sistemas` (cada sistema), `grupos` (grupos de telas dentro de
  cada sistema), `telas` (cada tela; a coluna `app` é o código do sistema, mais o `grupo`) e
  `usuario_telas` (o que cada usuário pode abrir).
- Permissões por UNIDADE (Portal, fase 1): `public.acoes`, `public.tela_acoes`, `public.usuario_permissoes`
  (usuário + unidade + tela + ação) e `pode(tela, ação, unidade)`, `minhas_unidades(sistema)`, `minhas_permissoes(sistema, unidade)`.
  Estrutura: Grupo TB → REDE (`public.redes`) → UNIDADE (`public.lojas`, CNPJ; matriz se final /0001).
- Funções: `minhas_telas('<sistema>')` (telas liberadas do usuário logado), `meus_sistemas()`
  (sistemas com pelo menos uma tela, para o menu "Sistemas") e `pode_ver_tela('<código>')` (para políticas).
- **Tela sem flag = bloqueada.** O admin vê tudo. Telas `somente_admin` não têm checkbox
  (hoje: Login de acesso, Lojas e configurações, Usuários do Gestão RH).
- Código do sistema: o mesmo em `public.sistemas.codigo` e em `sistemas.json` (`pdv`, `rh`, `crm`,
  `checklist`, `pop`, `supervisor`). Código da tela: `<sistema>.<tela>` (ex.: `pdv.etiquetas`, `rh.global`).
- **Só o admin dá acessos.** A tela de permissões é única: hoje fica no PDV Salvados
  (Cadastros → Login de acesso → Permissões). No futuro ela vai para um Portal central.
- As migrations dessas tabelas centrais ficam em `GESTAO SALVADOS/supabase/migrations/`, até existir o Portal.

### Checklist ao criar um sistema novo (obrigatório)
1. Criar a pasta do sistema e o `HISTORICO_<NOME>.md`; incluir em `MEU SUPERVISOR/sistemas.json`.
2. Criar o schema próprio no banco (ex.: `crm`, `checklist`), com RLS em todas as tabelas e os grants.
   Liberar o schema em Supabase → Integrations → Data API → Exposed schemas (o usuário faz isso).
3. **Login:** usar o mesmo Supabase Auth. Sem tela de "Criar conta": quem cria usuário é só o admin.
   Gatilhos em `auth.users` devem ter nome com prefixo do sistema (ex.: `crm_on_auth_user_created`),
   para não apagar o gatilho de outro sistema.
4. **Permissões:** migration nova em `GESTAO SALVADOS/supabase/migrations/` ativando/inserindo o sistema em
   `public.sistemas` (com a `url`), os grupos em `public.grupos` e todas as telas em `public.telas`
   (código `<sistema>.<tela>`, grupo, rota, ordem, `somente_admin`). Espelhar no front do PDV
   (`src/lib/telas.ts`: SISTEMAS, GRUPOS, TELAS) para o editor de permissões mostrar as telas; o teste
   `npm test` acusa se faltar algo.
5. **Front-end:** ler `public.minhas_telas('<código do sistema>')` (com `.schema("public")` se o
   cliente usar outro schema). Menu só com as telas liberadas; rota bloqueada mostra "Acesso negado";
   se a consulta der erro, não bloquear todo mundo (mostrar aviso).
   Remover uma pessoa de um sistema NUNCA apaga a conta de login (ela é compartilhada). Só o "Excluir usuário" do
   Portal apaga o login, e apenas de quem nunca teve movimento; quem tem histórico é Inativado.
6. Dados de um sistema não são gravados no schema de outro. O que é comum a todos é só o login, as permissões
   e o cadastro de **redes e unidades** (`public.redes` e `public.lojas` = unidades, com `sistemas` dizendo em quais
   sistemas cada unidade aparece). Cada sistema liga as suas tabelas à unidade (`unidade_id` / `loja_id`).
7. Segredos só em `.env` (fora do Git); `service_role` nunca no front-end.
8. Publicar na Vercel (time `grupotb`) e cadastrar a `url` do sistema em `public.sistemas`.
