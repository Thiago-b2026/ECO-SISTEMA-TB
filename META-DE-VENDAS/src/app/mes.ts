// Dados de UMA unidade num período: vendedores, metas, lançamentos, meses fechados e o resultado de cada mês.
import { servidor } from "../data/conexao";
import type { Lancamento, Meta, Vendedor } from "../data/servidor";
import { calcularPremiacao, type ResultadoLoja } from "../domain/premiacao";
import { useApp, useDados } from "./contexto";

export interface DadosMes {
  mes: string;
  meta: Meta | null;
  lancamentos: Lancamento[];
  fechado: boolean;
  resultado: ResultadoLoja;
}

export interface DadosPeriodo {
  vendedores: Vendedor[];
  meses: DadosMes[];
}

export function montarMes(mes: string, vendedores: Vendedor[], metas: Meta[], lancamentos: Lancamento[], fechados: string[]): DadosMes {
  const nome = new Map(vendedores.map((v) => [v.id, v.nome]));
  const doMes = lancamentos.filter((l) => l.mes_referencia === mes);
  const meta = metas.find((m) => m.mes_referencia === mes) ?? null;
  const resultado = calcularPremiacao(meta, doMes.map((l) => ({
    vendedor_id: l.vendedor_id, nome: nome.get(l.vendedor_id) ?? "Vendedor de outra loja", faturamento_realizado: l.faturamento_realizado, clientes_engajados: l.clientes_engajados,
  })));
  return { mes, meta, lancamentos: doMes, fechado: fechados.includes(mes), resultado };
}

export async function carregarPeriodo(unidade: string, meses: string[]): Promise<DadosPeriodo> {
  const [vendedores, metas, lancamentos, fechados] = await Promise.all([
    servidor.vendedores(unidade), servidor.metas(unidade, meses), servidor.lancamentos(unidade, meses), servidor.mesesFechados(unidade, meses),
  ]);
  return { vendedores, meses: meses.map((m) => montarMes(m, vendedores, metas, lancamentos, fechados)) };
}

/** lista vazia fixa: um [] novo a cada render faria os efeitos das telas rodarem sem parar */
const SEM_VENDEDORES: Vendedor[] = [];

/** Dados do mês escolhido no topo, na unidade escolhida. */
export function useMesAtual() {
  const { unidade, mes } = useApp();
  const r = useDados(async () => (unidade ? carregarPeriodo(unidade.id, [mes]) : null), [unidade?.id, mes]);
  return { ...r, vendedores: r.dados?.vendedores ?? SEM_VENDEDORES, dadosMes: r.dados?.meses[0] ?? null };
}
