// Trava de produto duplicado: compara código de barras e nome (sem maiúsculas, acentos, pontuação e espaços extras).
// Usada no "Inserir produto" do lote e no "Produto avulso" do cadastro.

/**
 * "Ventilador  Mondial 40cm - Preto!" → "ventilador mondial 40cm preto".
 * Unidades escritas de jeitos diferentes viram uma só: "1,8LT", "1,8 litros", "1.8 ltr" → "1 8l". (Igual a normalizar_nome no banco.)
 */
export function normalizarNome(t: string | null | undefined): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d)\s*(litros?|ltrs?|lts?|l)(?![a-z])/g, "$1l")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const PALAVRAS_VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "com", "para", "p", "c", "a", "o", "em"]);
const palavras = (t: string) => normalizarNome(t).split(" ").filter((p) => p && !PALAVRAS_VAZIAS.has(p));

/**
 * Nome PARECIDO (não igual): um nome contém o outro inteiro (ex.: "Chaleira Elétrica Zentra" e "Chaleira Elétrica Zentra 1,8L"),
 * ou 80% das palavras iguais. Serve para avisar e pedir confirmação, não para bloquear.
 */
export function nomesParecidos(a: string, b: string): boolean {
  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb || na === nb) return false;
  const pa = palavras(a);
  const pb = palavras(b);
  if (pa.length === 0 || pb.length === 0) return false;
  const sa = new Set(pa);
  const sb = new Set(pb);
  const comuns = [...sa].filter((x) => sb.has(x)).length;
  const menor = Math.min(sa.size, sb.size);
  // contém o outro inteiro (pelo menos 2 palavras em comum, para "Livro" não bater com todos os livros)
  if (comuns === menor && comuns >= 2) return true;
  return comuns / Math.max(sa.size, sb.size) >= 0.8;
}

/** Lista os parecidos (até 5), para a pessoa conferir antes de cadastrar. */
export function acharParecidos<T extends Comparavel>(lista: T[], novo: Comparavel, ignorarId?: (x: T) => boolean): T[] {
  if (normalizarNome(novo.titulo).length < 3) return [];
  return lista.filter((x) => !(ignorarId && ignorarId(x)) && nomesParecidos(x.titulo, novo.titulo)).slice(0, 5);
}

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export interface Comparavel {
  titulo: string;
  codigo_barras?: string | null;
}

export type MotivoDuplicado = "codigo" | "nome";

export const TEXTO_MOTIVO: Record<MotivoDuplicado, string> = {
  codigo: "mesmo código de barras",
  nome: "mesmo nome",
};

/**
 * Procura na lista um produto igual ao novo. Código de barras igual vale mais que nome igual.
 * Devolve o primeiro encontrado e o motivo, ou null.
 */
export function acharDuplicado<T extends Comparavel>(lista: T[], novo: Comparavel, ignorarId?: (x: T) => boolean): { item: T; motivo: MotivoDuplicado } | null {
  const ean = soDigitos(novo.codigo_barras);
  const nome = normalizarNome(novo.titulo);
  const candidatos = ignorarId ? lista.filter((x) => !ignorarId(x)) : lista;
  if (ean.length >= 8) {
    const porCodigo = candidatos.find((x) => soDigitos(x.codigo_barras) === ean);
    if (porCodigo) return { item: porCodigo, motivo: "codigo" };
  }
  if (nome.length >= 3) {
    const porNome = candidatos.find((x) => normalizarNome(x.titulo) === nome);
    if (porNome) return { item: porNome, motivo: "nome" };
  }
  return null;
}
