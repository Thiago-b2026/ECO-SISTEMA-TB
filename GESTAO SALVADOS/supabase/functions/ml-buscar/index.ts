// Busca produtos no Mercado Livre por código de barras, nome ou link.
// Body: { tipo: "ean" | "nome" | "link" | "categoria", valor: string, limite?: number }
// Resposta: { candidatos: Candidato[], tentativas: string[] }
// "tentativas" lista o que foi perguntado ao ML e quantos resultados vieram
// (aparece no console do navegador e nos logs; ajuda a entender um "não encontrado").
import { cors, exigirPapel, json, mlGet, SITE, tokenValido } from "../_shared/ml.ts";
import {
  candidatoDeItem,
  candidatoDeProduto,
  ehCodigoDeBarras,
  candidatoDeUserProduct,
  extrairIdDoLink,
  extrairUserProduct,
  nomeDoLink,
  precoDosAnuncios,
  variacoesDoNome,
  type Candidato,
} from "../_shared/ml-parse.ts";

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

/** Uma pergunta ao catálogo; anota na lista de tentativas quantos vieram. */
async function catalogo(params: string, rotulo: string, token: string, log: string[]): Promise<any[]> {
  const r = await mlGet(`/products/search?site_id=${SITE}&${params}`, token);
  const lista = Array.isArray(r?.results) ? r.results : [];
  log.push(`${rotulo}: ${lista.length}`);
  return lista;
}

/** Tenta cada pergunta em ordem e para na primeira que trouxer produto. */
async function tentarEmOrdem(
  tentativas: [string, string][],
  max: number,
  token: string,
  log: string[],
  termo?: string,
): Promise<Candidato[]> {
  for (const [params, rotulo] of tentativas) {
    const lista = (await catalogo(`${params}&limit=${max}`, rotulo, token, log)).slice(0, max);
    if (lista.length === 0) continue;
    const candidatos = await detalharProdutos(lista.map((p: any) => p.id), token, termo, lista);
    if (candidatos.length) return candidatos;
  }
  return [];
}

/**
 * Busca pelo nome tentando várias formas até achar:
 * nome inteiro (só ativos) → nome inteiro (todos) → primeiras 6 palavras → primeiras 4.
 */
async function buscarPorNome(texto: string, max: number, token: string, log: string[]): Promise<Candidato[]> {
  const tentativas: [string, string][] = [];
  variacoesDoNome(texto).forEach((q, i) => {
    if (i === 0) tentativas.push([`status=active&q=${encodeURIComponent(q)}`, `nome "${q}" (ativos)`]);
    tentativas.push([`q=${encodeURIComponent(q)}`, `nome "${q}"`]);
  });
  // A similaridade é sempre contra o termo original
  const candidatos = await tentarEmOrdem(tentativas, max, token, log, texto);
  return candidatos.sort((a, b) => (b.similaridade ?? 0) - (a.similaridade ?? 0));
}

/** Código de barras: identificador (ativos) → identificador (todos) → o código como texto. */
function buscarPorCodigo(codigo: string, max: number, token: string, log: string[]): Promise<Candidato[]> {
  return tentarEmOrdem(
    [
      [`status=active&product_identifier=${codigo}`, `código ${codigo} (ativos)`],
      [`product_identifier=${codigo}`, `código ${codigo}`],
      [`q=${codigo}`, `código ${codigo} como texto`],
    ],
    max,
    token,
    log,
  );
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
  const log: string[] = [];
  try {
    const { erro } = await exigirPapel(req, ["admin", "gerente", "estoquista"]);
    if (erro) return erro;

    const { tipo, valor, limite } = await req.json().catch(() => ({}));
    const texto = String(valor ?? "").trim();
    const max = Math.min(Math.max(Number(limite) || 3, 1), 10);
    if (!texto) return json({ erro: "Informe o que buscar." }, 400);

    const token = await tokenValido();
    let candidatos: Candidato[] = [];
    /** Mensagem para a tela quando o resultado NÃO é o anúncio exato do link (só parecidos pelo nome). */
    let aviso: string | null = null;

    if (tipo === "ean") {
      // O leitor às vezes manda espaço ou traço junto
      const codigo = texto.replace(/\D/g, "");
      if (!ehCodigoDeBarras(codigo)) return json({ erro: "O código de barras deve ter só números (8 a 14 dígitos)." }, 400);
      candidatos = await buscarPorCodigo(codigo, max, token, log);
    } else if (tipo === "nome") {
      candidatos = await buscarPorNome(texto, max, token, log);
    } else if (tipo === "link") {
      const alvo = extrairIdDoLink(texto);
      if (!alvo && !nomeDoLink(texto)) return json({ erro: "Não reconheci esse link do Mercado Livre." }, 400);
      if (!alvo) log.push("link sem código de anúncio: buscando pelo nome");
      else try {
        candidatos = alvo.tipo === "produto"
          ? await detalharProdutos([alvo.id], token)
          : [candidatoDeItem(await mlGet(`/items/${alvo.id}`, token))];
        log.push(`link ${alvo.id}: ${candidatos.length}`);
      } catch (e) {
        // O ML bloqueia a leitura de anúncios de outros vendedores (403) e responde
        // 404 para anúncio encerrado. O produto ainda pode aparecer pelo nome do link.
        const st = (e as { status?: number }).status;
        if (st !== 403 && st !== 404) throw e;
        log.push(`link ${alvo.id}: ML respondeu ${st}`);
      }
      // Plano B: link novo (.../up/MLBU...) → "produto do vendedor" pela API oficial. Traz o produto EXATO
      // (nome, foto, atributos) e, se ele estiver ligado a um produto de catálogo, o preço do catálogo.
      const up = extrairUserProduct(texto);
      if (candidatos.length === 0 && up) {
        try {
          const dados = await mlGet(`/user-products/${up}`, token);
          log.push(`produto do vendedor ${up}: ok (${Object.keys(dados ?? {}).slice(0, 12).join(",")})`);
          const catalogoId = dados?.catalog_product_id;
          if (catalogoId) {
            try {
              candidatos = await detalharProdutos([String(catalogoId)], token);
              log.push(`catálogo ${catalogoId}: ${candidatos.length}`);
            } catch (e) {
              log.push(`catálogo ${catalogoId}: ML respondeu ${(e as { status?: number }).status ?? "erro"}`);
            }
          }
          if (candidatos.length === 0 && (dados?.name || dados?.title)) {
            candidatos = [candidatoDeUserProduct(dados, texto.split("#")[0])];
          }
        } catch (e) {
          const st = (e as { status?: number }).status;
          if (st !== 401 && st !== 403 && st !== 404) throw e;
          log.push(`produto do vendedor ${up}: ML respondeu ${st}`);
        }
      }
      // Plano C: busca pelo nome que vem escrito no próprio link
      if (candidatos.length === 0) {
        const nome = nomeDoLink(texto);
        if (nome) {
          candidatos = await buscarPorNome(nome, max, token, log);
          aviso = alvo || up
            ? "O Mercado Livre não deixa ler este anúncio (é de outro vendedor e não está no catálogo). Os resultados abaixo são PARECIDOS pelo nome do link, não o mesmo anúncio: confira foto e preço antes de escolher, ou use \"Inserir sem buscar\"."
            : "Este link não tem o código do anúncio. Os resultados abaixo são parecidos pelo nome do link: confira antes de escolher.";
        }
      }
    } else if (tipo === "categoria") {
      // Caminho da categoria no ML (para o mercadológico): [{ id, name }, ...]
      if (!/^MLB\d+$/i.test(texto)) return json({ erro: "Categoria inválida." }, 400);
      const c = await mlGet(`/categories/${texto.toUpperCase()}`, token);
      return json({ caminho: (c.path_from_root ?? []).map((p: any) => ({ id: p.id, nome: p.name })) });
    } else {
      return json({ erro: "Tipo de busca inválido." }, 400);
    }

    // Aparece em Supabase → Edge Functions → ml-buscar → Logs
    console.log(`ml-buscar ${tipo} "${texto}" → ${candidatos.length} | ${log.join(" | ")}`);
    return json({ candidatos, tentativas: log, aviso });
  } catch (e) {
    const err = e as Error & { status?: number; caminho?: string };
    console.error(`ml-buscar falhou: ${err.status ?? ""} ${err.caminho ?? ""} ${err.message} | ${log.join(" | ")}`);
    if (err.status === 429) {
      return json({ erro: "Mercado Livre pediu para esperar (muitas buscas). Tente de novo em alguns segundos.", tentativas: log }, 429);
    }
    if (err.status === 404) return json({ erro: "Não encontrado no Mercado Livre.", tentativas: log }, 404);
    if (err.status === 401 || err.status === 403) {
      return json({
        erro: `O Mercado Livre negou o acesso ${etapa(err.caminho)}. Tente buscar pelo nome ou código de barras, ou use "Inserir sem buscar".`.replace("  ", " "),
        detalhe: `${err.status} ${err.caminho ?? ""}: ${err.message}`,
        tentativas: log,
        bloqueio_ml: true,
      }, 403);
    }
    return json({ erro: err.message, tentativas: log }, 500);
  }
});
