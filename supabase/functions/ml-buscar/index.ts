// Busca produtos no Mercado Livre por código de barras, nome ou link.
// Body: { tipo: "ean" | "nome" | "link" | "categoria", valor: string, limite?: number }
// Resposta: { candidatos: Candidato[] }
import { cors, exigirPapel, json, mlGet, SITE, tokenValido } from "../_shared/ml.ts";
import { candidatoDeItem, candidatoDeProduto, ehCodigoDeBarras, extrairIdDoLink, precoDosAnuncios, type Candidato } from "../_shared/ml-parse.ts";

async function detalharProdutos(ids: string[], token: string, termo?: string): Promise<Candidato[]> {
  const res = await Promise.allSettled(ids.map((id) => mlGet(`/products/${id}`, token)));
  const candidatos = res.flatMap((r) => (r.status === "fulfilled" ? [candidatoDeProduto(r.value, termo)] : []));
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
      candidatos = await detalharProdutos((r.results ?? []).slice(0, max).map((p: any) => p.id), token);
    } else if (tipo === "nome") {
      const r = await mlGet(`/products/search?status=active&site_id=${SITE}&q=${encodeURIComponent(texto)}&limit=${max}`, token);
      candidatos = await detalharProdutos((r.results ?? []).slice(0, max).map((p: any) => p.id), token, texto);
      candidatos.sort((a, b) => (b.similaridade ?? 0) - (a.similaridade ?? 0));
    } else if (tipo === "link") {
      const alvo = extrairIdDoLink(texto);
      if (!alvo) return json({ erro: "Não reconheci esse link do Mercado Livre." }, 400);
      if (alvo.tipo === "produto") {
        candidatos = await detalharProdutos([alvo.id], token);
      } else {
        const item = await mlGet(`/items/${alvo.id}`, token);
        candidatos = [candidatoDeItem(item)];
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
    const err = e as Error & { status?: number };
    const status = err.status === 429 ? 429 : err.status === 404 ? 404 : 500;
    const msg = status === 429
      ? "Mercado Livre pediu para esperar (muitas buscas). Tente de novo em alguns segundos."
      : status === 404 ? "Não encontrado no Mercado Livre." : err.message;
    return json({ erro: msg }, status);
  }
});
