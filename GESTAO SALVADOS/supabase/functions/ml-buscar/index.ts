// Busca produtos no Mercado Livre por código de barras, nome ou link.
// Body: { tipo: "ean" | "nome" | "link" | "categoria", valor: string, limite?: number }
// Resposta: { candidatos: Candidato[] }
import { cors, exigirPapel, json, mlGet, SITE, tokenValido } from "../_shared/ml.ts";
import { candidatoDeItem, candidatoDeProduto, ehCodigoDeBarras, extrairIdDoLink, nomeDoLink, precoDosAnuncios, type Candidato } from "../_shared/ml-parse.ts";

/**
 * Abre cada produto do catálogo. Se o ML negar o detalhe, usa o resumo que já
 * veio na busca (nome, fotos, atributos). Se nada der certo, repassa o erro do
 * ML, para a tela não dizer "nada encontrado" quando na verdade houve bloqueio.
 */
async function detalharProdutos(ids: string[], token: string, termo?: string, resumos: any[] = []): Promise<Candidato[]> {
  const res = await Promise.allSettled(ids.map((id) => mlGet(`/products/${id}`, token)));
  const candidatos = res.flatMap((r, i) => {
    if (r.status === "fulfilled") return [candidatoDeProduto(r.value, termo)];
    const resumo = resumos.find((p) => p?.id === ids[i]);
    return resumo?.name ? [candidatoDeProduto(resumo, termo)] : [];
  });
  if (candidatos.length === 0) {
    const falha = res.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (falha) throw falha.reason;
  }
  // Sem anúncio vencedor: busca os anúncios do produto e usa o menor preço
  await Promise.allSettled(
    candidatos
      .filter((c) => c.preco == null)
      .map(async (c) => {
        const p = precoDosAnuncios(await mlGet(`/products/${c.id}/items`, token));
        if (p) {
          c.preco = p.preco;
          c.preco_original = p.preco_original;
          c.categoria_id ??= p.categoria_id;
        }
      }),
  );
  return candidatos;
}

async function buscarPorNome(texto: string, max: number, token: string): Promise<Candidato[]> {
  const r = await mlGet(`/products/search?status=active&site_id=${SITE}&q=${encodeURIComponent(texto)}&limit=${max}`, token);
  const lista = (r.results ?? []).slice(0, max);
  const candidatos = await detalharProdutos(lista.map((p: any) => p.id), token, texto, lista);
  return candidatos.sort((a, b) => (b.similaridade ?? 0) - (a.similaridade ?? 0));
}

/** Nome da etapa para a mensagem de erro (ajuda a saber o que o ML bloqueou). */
function etapa(caminho?: string): string {
  if (!caminho) return "";
  if (caminho.startsWith("/products/search")) return "na busca do catálogo";
  if (caminho.startsWith("/products/")) return "ao abrir o produto do catálogo";
  if (caminho.startsWith("/items")) return "ao abrir o anúncio";
  if (caminho.startsWith("/categories")) return "ao ler a categoria";
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { erro } = await exigirPapel(req, ["admin", "gerente", "estoquista"]);
    if (erro) return erro;

    const { tipo, valor, limite } = await req.json().catch(() => ({}));
    const texto = String(valor ?? "").trim();
    const max = Math.min(Math.max(Number(limite) || 3, 1), 10);
    if (!texto) return json({ erro: "Informe o que buscar." }, 400);

    const token = await tokenValido();
    let candidatos: Candidato[] = [];

    if (tipo === "ean") {
      if (!ehCodigoDeBarras(texto)) return json({ erro: "O código de barras deve ter só números (8 a 14 dígitos)." }, 400);
      const r = await mlGet(`/products/search?status=active&site_id=${SITE}&product_identifier=${texto}`, token);
      const lista = (r.results ?? []).slice(0, max);
      candidatos = await detalharProdutos(lista.map((p: any) => p.id), token, undefined, lista);
    } else if (tipo === "nome") {
      candidatos = await buscarPorNome(texto, max, token);
    } else if (tipo === "link") {
      const alvo = extrairIdDoLink(texto);
      if (!alvo) return json({ erro: "Não reconheci esse link do Mercado Livre." }, 400);
      if (alvo.tipo === "produto") {
        try {
          candidatos = await detalharProdutos([alvo.id], token);
        } catch (e) {
          if ((e as { status?: number }).status !== 403) throw e;
        }
      } else {
        try {
          const item = await mlGet(`/items/${alvo.id}`, token);
          candidatos = [candidatoDeItem(item)];
        } catch (e) {
          // O ML bloqueia a leitura de anúncios de outros vendedores (403).
          // Se o anúncio já é de catálogo, o produto aparece pela busca do nome do link.
          if ((e as { status?: number }).status !== 403) throw e;
        }
      }
      // Plano B: busca pelo nome que vem escrito no próprio link
      if (candidatos.length === 0) {
        const nome = nomeDoLink(texto);
        if (nome) candidatos = await buscarPorNome(nome, max, token);
      }
    } else if (tipo === "categoria") {
      // Caminho da categoria no ML (para o mercadológico): [{ id, name }, ...]
      if (!/^MLB\d+$/i.test(texto)) return json({ erro: "Categoria inválida." }, 400);
      const c = await mlGet(`/categories/${texto.toUpperCase()}`, token);
      return json({ caminho: (c.path_from_root ?? []).map((p: any) => ({ id: p.id, nome: p.name })) });
    } else {
      return json({ erro: "Tipo de busca inválido." }, 400);
    }

    return json({ candidatos });
  } catch (e) {
    const err = e as Error & { status?: number; caminho?: string };
    if (err.status === 429) {
      return json({ erro: "Mercado Livre pediu para esperar (muitas buscas). Tente de novo em alguns segundos." }, 429);
    }
    if (err.status === 404) return json({ erro: "Não encontrado no Mercado Livre." }, 404);
    if (err.status === 401 || err.status === 403) {
      return json({
        erro: `O Mercado Livre negou o acesso ${etapa(err.caminho)}. Tente buscar pelo nome ou código de barras, ou use "Inserir sem buscar".`.replace("  ", " "),
        detalhe: `${err.status} ${err.caminho ?? ""}: ${err.message}`,
        bloqueio_ml: true,
      }, 403);
    }
    return json({ erro: err.message }, 500);
  }
});
