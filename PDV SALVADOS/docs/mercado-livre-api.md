# Integração com a API do Mercado Livre (busca de preços)

Levantado da documentação oficial em 31/10/2026 (developers.mercadolivre.com.br).
Objetivo: a seção **Precificação** do sistema busca produtos e preços no ML, como o PrecificaLote.

## 1. Cadastro (o usuário faz, uma vez)

1. Entrar em https://developers.mercadolivre.com.br/devcenter com a conta do ML **da loja**
   (de preferência a do CNPJ — o ML recomenda conta de pessoa jurídica e a conta dona não pode
   ser trocada depois). Clicar em **Vincular**.
2. Se pedir, completar/validar os dados do titular. No Brasil só é permitido **1 aplicação por
   conta**, e só depois dos dados validados.
3. Clicar em **Criar uma aplicação** e preencher:

| Campo | O que colocar |
| --- | --- |
| Nome | `Eco Sistema TB` (precisa ser único; se já existir, `Eco Sistema TB Salvados`) |
| Nome curto | `ecosistematb` |
| Descrição (até 150) | `Sistema de gestão da loja: consulta produtos e preços do catálogo para precificar lotes.` |
| Logo | logo da loja (opcional) |
| URI de redirecionamento | `https://blqgmueqsqqpflorusrm.supabase.co/functions/v1/ml-oauth-callback` |
| PKCE | **ligado** |
| Device grant | desligado |
| Escopos | **Leitura** + **acesso offline** (escrita não é necessária) |
| Tópicos / URL de notificações | nenhum tópico; se a URL for obrigatória, usar a mesma do redirecionamento |

4. Salvar. A tela mostra o **Client ID** (APP ID) e a **Client Secret**.
   **Nunca colar a Secret no chat, no código ou no Git.** Ela vai só para os segredos do Supabase
   (painel → Edge Functions → Secrets): `ML_CLIENT_ID` e `ML_CLIENT_SECRET`.

## 2. Autorização (OAuth 2.0, feito uma vez pelo sistema)

- O sistema abre `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=...&redirect_uri=...&state=...&code_challenge=...&code_challenge_method=S256`.
- O usuário (conta **principal**, não colaborador — senão dá `invalid_operator_user_id`) autoriza.
- O ML volta para a Edge Function `ml-oauth-callback` com `?code=...`, que faz
  `POST https://api.mercadolibre.com/oauth/token` (`grant_type=authorization_code`, client_id,
  client_secret, code, redirect_uri, code_verifier) e guarda os tokens numa tabela só do servidor.
- **access_token dura 6 horas**; renovar com `grant_type=refresh_token`. O refresh_token é de
  **uso único** (cada renovação devolve um novo, que precisa ser salvo) e vale 6 meses.
- Tokens caem se: trocar a senha do ML, renovar a Client Secret, revogar a permissão, ou ficar
  4 meses sem usar a API. Nesse caso, autorizar de novo.
- Todas as chamadas: header `Authorization: Bearer <access_token>`, sempre pelo servidor
  (Edge Function), nunca pelo navegador.

## 3. Endpoints que vamos usar

| Uso | Chamada |
| --- | --- |
| Buscar por **código de barras (EAN/GTIN)** | `GET /products/search?status=active&site_id=MLB&product_identifier=<EAN>` |
| Buscar por **nome** | `GET /products/search?status=active&site_id=MLB&q=<texto>` |
| Detalhe + **preço** do produto de catálogo | `GET /products/<PRODUCT_ID>` → `buy_box_winner.price`, `original_price`, fotos, atributos, `permalink` |
| Buscar pelo **link do anúncio** | extrair o ID (`MLB...`) da URL → `GET /items/<ITEM_ID>` ou `/products/<ID>` |
| Vários anúncios de uma vez | `GET /items/bulk?ids=ID1,ID2` (o `/items?ids=` foi descontinuado em 25/10/2026) |
| Árvore de categorias | `GET /sites/MLB/categories` e `GET /categories/<ID>` |

Observações:
- A busca de catálogo devolve **produtos de catálogo** (com nome padronizado, GTIN, marca, modelo,
  fotos). O preço vem do anúncio vencedor (`buy_box_winner`); se for `null`, não há anúncio
  competindo e o item cai em "sem preço".
- Limite de requisições: erro **429** = esperar alguns segundos e tentar de novo (a fila do robô
  precisa respeitar isso).
- A busca pública genérica de anúncios por palavra (`/sites/MLB/search?q=`) não aparece mais na
  documentação atual; a base será o buscador de catálogo. Validar na prática quando o app existir.

## 4. Próximos passos no código (depois do cadastro)
1. Migration: tabela `ml_tokens` (sem acesso pelo navegador; só service_role).
2. Edge Functions: `ml-oauth-start`, `ml-oauth-callback`, `ml-buscar` (EAN, nome, link) com
   renovação automática do token.
3. Tela **Configurações → Mercado Livre**: botão "Conectar conta do Mercado Livre" e status.
4. Testar busca com alguns EANs reais do estoque.
