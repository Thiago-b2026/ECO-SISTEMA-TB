// Funções puras (sem Deno) usadas pela busca no Mercado Livre.
// Testadas pelo Vitest em src/lib/__tests__/ml-parse.test.ts.

export type IdDoLink = { tipo: "produto" | "item"; id: string };

/**
 * Extrai o ID de um link do Mercado Livre.
 * - .../p/MLB12345678            → produto de catálogo
 * - produto.mercadolivre.com.br/MLB-1234567890-... → anúncio (item)
 * - ...?item_id=MLB123 / wid=MLB123 → anúncio
 */
export function extrairIdDoLink(link: string): IdDoLink | null {
  const texto = link.trim();
  const produto = texto.match(/\/p\/(MLB\d+)/i);
  if (produto) return { tipo: "produto", id: produto[1].toUpperCase() };
  const param = texto.match(/[?&#](?:item_id|wid)[=:](MLB)-?(\d+)/i);
  if (param) return { tipo: "item", id: `MLB${param[2]}` };
  const item = texto.match(/\b(MLB)-?(\d{6,})\b/i);
  if (item) return { tipo: "item", id: `MLB${item[2]}` };
  return null;
}

/** Só dígitos, 8 a 14 (EAN-8, UPC-12, EAN-13, GTIN-14). */
export function ehCodigoDeBarras(valor: string): boolean {
  return /^\d{8,14}$/.test(valor.trim());
}

function palavras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 1);
}

/** % das palavras do termo buscado que aparecem no título encontrado (0–100). */
export function similaridade(termo: string, titulo: string): number {
  const t = [...new Set(palavras(termo))];
  if (t.length === 0) return 0;
  const alvo = new Set(palavras(titulo));
  const achadas = t.filter((p) => alvo.has(p)).length;
  return Math.round((achadas / t.length) * 100);
}

export interface Candidato {
  id: string;
  tipo: "produto" | "item";
  titulo: string;
  preco: number | null;
  preco_original: number | null;
  foto: string | null;
  link: string | null;
  gtin: string | null;
  marca: string | null;
  modelo: string | null;
  categoria_id: string | null;
  similaridade: number | null;
}

type Atributo = { id: string; value_name?: string | null };
const attr = (lista: Atributo[] | undefined, id: string) =>
  lista?.find((a) => a.id === id)?.value_name ?? null;

/**
 * Menor preço entre os anúncios de um produto de catálogo
 * (resposta de GET /products/{id}/items). Ignora anúncios sem preço.
 */
export function precoDosAnuncios(resp: any): { preco: number; preco_original: number | null; categoria_id: string | null } | null {
  const lista: any[] = Array.isArray(resp?.results) ? resp.results : Array.isArray(resp) ? resp : [];
  const comPreco = lista.filter((i) => typeof i?.price === "number" && i.price > 0);
  if (comPreco.length === 0) return null;
  const menor = comPreco.reduce((a, b) => (b.price < a.price ? b : a));
  return {
    preco: menor.price,
    preco_original: typeof menor.original_price === "number" ? menor.original_price : null,
    categoria_id: menor.category_id ?? null,
  };
}

/** Converte a resposta de GET /products/{id}. */
export function candidatoDeProduto(p: any, termo?: string): Candidato {
  const bb = p.buy_box_winner ?? null;
  const faixa = p.buy_box_winner_price_range?.min?.price;
  return {
    id: p.id,
    tipo: "produto",
    titulo: p.name,
    preco: bb?.price ?? (typeof faixa === "number" ? faixa : null),
    preco_original: bb?.original_price ?? null,
    foto: p.pictures?.[0]?.url ?? null,
    link: p.permalink || `https://www.mercadolivre.com.br/p/${p.id}`,
    gtin: attr(p.attributes, "GTIN"),
    marca: attr(p.attributes, "BRAND"),
    modelo: attr(p.attributes, "MODEL"),
    categoria_id: bb?.category_id ?? null,
    similaridade: termo ? similaridade(termo, p.name) : null,
  };
}

/** Converte a resposta de GET /items/{id}. */
export function candidatoDeItem(i: any, termo?: string): Candidato {
  return {
    id: i.id,
    tipo: "item",
    titulo: i.title,
    preco: i.price ?? null,
    preco_original: i.original_price ?? null,
    foto: i.pictures?.[0]?.secure_url ?? i.thumbnail ?? null,
    link: i.permalink ?? null,
    gtin: attr(i.attributes, "GTIN"),
    marca: attr(i.attributes, "BRAND"),
    modelo: attr(i.attributes, "MODEL"),
    categoria_id: i.category_id ?? null,
    similaridade: termo ? similaridade(termo, i.title) : null,
  };
}
