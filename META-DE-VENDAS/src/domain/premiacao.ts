// Cálculo da premiação – MESMAS contas do Lovable "Sales Champion" (src/lib/calculo-premiacao.ts):
//  - % atingido = faturamento da loja ÷ meta;
//  - ≥ 100% → prêmio da meta 100%; ≥ % mínimo → prêmio da meta mínima; abaixo → sem prêmio de faturamento;
//  - cada vendedor recebe o prêmio a dividir × a participação dele no faturamento da loja;
//  - mais o bônus de engajamento: clientes engajados × valor por cliente (vale em qualquer faixa).
// Única diferença: a faixa mínima se chama "minima" (no Lovable era "90%", mas o % mínimo é configurável).

export type Faixa = "100" | "minima" | "abaixo";

export interface ConfigMeta {
  meta_total: number;
  /** ex.: 0.9 = 90% */
  percentual_minimo: number;
  premio_meta_100: number;
  premio_meta_90: number;
  valor_por_cliente_engajado: number;
}

export interface LancamentoVendedor {
  vendedor_id: string;
  nome: string;
  faturamento_realizado: number;
  clientes_engajados: number;
}

export interface ResultadoVendedor extends LancamentoVendedor {
  participacao: number;
  premio_faturamento: number;
  premio_engajamento: number;
  premio_total: number;
}

export interface ResultadoLoja {
  faturamento_loja: number;
  percentual_atingido: number;
  faixa: Faixa;
  premio_a_dividir: number;
  vendedores: ResultadoVendedor[];
  total_premio_faturamento: number;
  total_premio_engajamento: number;
  total_premio: number;
}

export function calcularPremiacao(config: ConfigMeta | null, lancamentos: LancamentoVendedor[]): ResultadoLoja {
  const fatLoja = lancamentos.reduce((s, l) => s + Number(l.faturamento_realizado || 0), 0);
  const meta = Number(config?.meta_total ?? 0);
  const pct = meta > 0 ? fatLoja / meta : 0;
  const permin = Number(config?.percentual_minimo ?? 0.9);
  const p100 = Number(config?.premio_meta_100 ?? 0);
  const p90 = Number(config?.premio_meta_90 ?? 0);
  const vpc = Number(config?.valor_por_cliente_engajado ?? 0);

  let faixa: Faixa = "abaixo";
  let premio_a_dividir = 0;
  if (meta > 0 && pct >= 1) {
    faixa = "100";
    premio_a_dividir = p100;
  } else if (meta > 0 && permin > 0 && pct >= permin) {
    faixa = "minima";
    premio_a_dividir = p90;
  }

  const vendedores: ResultadoVendedor[] = lancamentos.map((l) => {
    const fat = Number(l.faturamento_realizado || 0);
    const participacao = fatLoja > 0 ? fat / fatLoja : 0;
    const premio_faturamento = premio_a_dividir * participacao;
    const premio_engajamento = Number(l.clientes_engajados || 0) * vpc;
    return { ...l, faturamento_realizado: fat, participacao, premio_faturamento, premio_engajamento, premio_total: premio_faturamento + premio_engajamento };
  });

  return {
    faturamento_loja: fatLoja,
    percentual_atingido: pct,
    faixa,
    premio_a_dividir,
    vendedores,
    total_premio_faturamento: vendedores.reduce((s, v) => s + v.premio_faturamento, 0),
    total_premio_engajamento: vendedores.reduce((s, v) => s + v.premio_engajamento, 0),
    total_premio: vendedores.reduce((s, v) => s + v.premio_total, 0),
  };
}

/** Quanto falta (em R$) para cada faixa. Já atingida = 0. */
export function quantoFalta(config: ConfigMeta | null, faturamentoLoja: number) {
  const meta = Number(config?.meta_total ?? 0);
  const minimo = meta * Number(config?.percentual_minimo ?? 0.9);
  return { para100: Math.max(0, meta - faturamentoLoja), paraMinima: Math.max(0, minimo - faturamentoLoja) };
}

/** Ranking: ordem por faturamento (maior primeiro); empate pelo nome. */
export const ordenarRanking = (v: ResultadoVendedor[]) =>
  [...v].sort((a, b) => b.faturamento_realizado - a.faturamento_realizado || a.nome.localeCompare(b.nome, "pt-BR"));
