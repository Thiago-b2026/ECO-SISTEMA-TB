// Trava de produto duplicado: compara código de barras e nome (sem maiúsculas, acentos, pontuação e espaços extras).
// Usada no "Inserir produto" do lote e no "Produto avulso" do cadastro.

/** "Ventilador  Mondial 40cm - Preto!" → "ventilador mondial 40cm preto" */
export function normalizarNome(t: string | null | undefined): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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
