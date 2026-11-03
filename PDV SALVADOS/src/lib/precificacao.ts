// Regras de precificação dos lotes (preço sugerido, custo, arredondamento, rateio).
// Funções puras: testadas em src/lib/__tests__/precificacao.test.ts

export interface FaixaArredondamento {
  /** Vale para preços MENORES que este valor. null = acima de todas as anteriores. */
  ate: number | null;
  /** 1 = unidade (…8,99 → 18,99), 10 = dezena (…89,99), 100 = centena (…299,99) */
  passo: 1 | 10 | 100;
}

export interface ConfigArredondamento {
  ativo: boolean;
  direcao: "cima" | "baixo";
  /** Final dos centavos: 0 (R$ 90,00), 0.9 (R$ 89,90) ou 0.99 (R$ 89,99) */
  centavos: 0 | 0.9 | 0.99;
  faixas: FaixaArredondamento[];
}

export const ARREDONDAMENTO_PADRAO: ConfigArredondamento = {
  ativo: true,
  direcao: "cima",
  centavos: 0.99,
  faixas: [
    { ate: 50, passo: 1 },
    { ate: 100, passo: 10 },
    { ate: 500, passo: 10 },
    { ate: 1000, passo: 10 },
    { ate: null, passo: 100 },
  ],
};

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;

/** Escolhe a faixa de arredondamento pelo valor. */
export function faixaDe(valor: number, faixas: FaixaArredondamento[]): FaixaArredondamento {
  return faixas.find((f) => f.ate == null || valor < f.ate) ?? faixas[faixas.length - 1] ?? { ate: null, passo: 1 };
}

/**
 * Arredonda para um "preço de vitrine".
 * Com centavos 0,99 e passo 10, os preços possíveis são 9,99 · 19,99 · 29,99 …
 * "cima" pega o menor preço possível ≥ valor; "baixo" o maior ≤ valor
 * (se não houver nenhum acima de zero, usa "cima").
 */
export function arredondar(valor: number, cfg: ConfigArredondamento = ARREDONDAMENTO_PADRAO): number {
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  const v = centavos(valor);
  if (!cfg.ativo) return reais(v);
  const passo = faixaDe(valor, cfg.faixas).passo * 100;
  const c = centavos(cfg.centavos);
  const deslocamento = c > 0 ? c - 100 : 0; // 0,99 → termina em (k·passo − 0,01)
  const preco = (k: number) => k * passo + deslocamento;
  const kCima = Math.ceil((v - deslocamento) / passo);
  if (cfg.direcao === "baixo") {
    const kBaixo = Math.floor((v - deslocamento) / passo);
    if (preco(kBaixo) > 0) return reais(preco(kBaixo));
  }
  return reais(preco(kCima));
}

/** Preço de venda sugerido = preço do ML − desconto %, arredondado. */
export function precoSugerido(precoML: number | null | undefined, percDesconto: number, cfg?: ConfigArredondamento): number | null {
  if (precoML == null || !(precoML > 0)) return null;
  return arredondar(precoML * (1 - (percDesconto || 0) / 100), cfg);
}

/** Custo pelo modo "percentual": preço de referência × % de custo. */
export function custoPercentual(precoRef: number | null | undefined, percCusto: number): number | null {
  if (precoRef == null || !(precoRef > 0)) return null;
  return reais(Math.round(centavos(precoRef) * (percCusto || 0) / 100));
}

export interface ItemRateio {
  id: string;
  quantidade: number;
  preco_ref: number | null;
}

/**
 * Rateio pelo valor pago no lote (mesma regra da função SQL recalcular_custo_lote):
 * custo_unit = valor_pago × preço_ref / Σ(preço_ref × quantidade)
 */
export function ratearValorPago(valorPago: number, itens: ItemRateio[]): Map<string, number> {
  const base = itens.reduce((s, i) => s + (i.preco_ref ?? 0) * i.quantidade, 0);
  const out = new Map<string, number>();
  for (const i of itens) {
    out.set(i.id, base > 0 ? Math.round((valorPago * (i.preco_ref ?? 0) * 100) / base) / 100 : 0);
  }
  return out;
}

/** Margem % sobre o preço de venda. */
export function margem(precoVenda: number | null | undefined, custo: number | null | undefined): number | null {
  if (!precoVenda || precoVenda <= 0 || custo == null) return null;
  return Math.round(((precoVenda - custo) / precoVenda) * 1000) / 10;
}

/** Classifica o resultado da busca do robô. */
export function classificar(similaridade: number | null | undefined, minimo: number): "sucesso" | "similar" | "nao_encontrado" {
  if (similaridade == null) return "nao_encontrado";
  return similaridade >= minimo ? "sucesso" : "similar";
}

/** "A" → 0, "B" → 1, "Z" → 25, "AA" → 26, "AB" → 27. Inválido → -1. */
export function colunaParaIndice(coluna: string): number {
  const c = coluna.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(c)) return -1;
  let n = 0;
  for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Converte "R$ 1.234,56", "1234.56", 1234.56 em número. */
export function lerNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[R$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
