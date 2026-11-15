// Peças comuns: selo da faixa, indicadores, barra de progresso e tabela do resultado do mês.
import { Award, Lock, TrendingDown, TrendingUp } from "lucide-react";
import type { DadosMes } from "../app/mes";
import { quantoFalta, ordenarRanking, type Faixa } from "../domain/premiacao";
import { fmtBRL, fmtInt, fmtPct, nomeFaixa } from "../lib/formato";
import { Cartao, cx, Selo } from "./base";

export function SeloFaixa({ faixa, minimo }: { faixa: Faixa; minimo: number }) {
  if (faixa === "100") return <Selo tom="ok" icone={Award}>{nomeFaixa(faixa, minimo)}</Selo>;
  if (faixa === "minima") return <Selo tom="alerta" icone={TrendingUp}>{nomeFaixa(faixa, minimo)}</Selo>;
  return <Selo tom="neutro" icone={TrendingDown}>{nomeFaixa(faixa, minimo)}</Selo>;
}

export function SeloFechado({ fechado }: { fechado: boolean }) {
  return fechado ? <Selo tom="info" icone={Lock}>Mês fechado</Selo> : null;
}

export function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: React.ReactNode }) {
  return (
    <Cartao>
      <div className="text-sm font-semibold text-gray-600">{rotulo}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 num" style={{ textAlign: "left" }}>{valor}</div>
      {detalhe && <div className="mt-1 text-sm text-gray-700">{detalhe}</div>}
    </Cartao>
  );
}

/** Barra do faturamento × meta, com as marcas do % mínimo e dos 100%. */
export function BarraMeta({ d }: { d: DadosMes }) {
  const r = d.resultado;
  const minimo = d.meta?.percentual_minimo ?? 0.9;
  const escala = Math.max(1.1, r.percentual_atingido);
  const pos = (p: number) => `${Math.min(100, (p / escala) * 100)}%`;
  const falta = quantoFalta(d.meta, r.faturamento_loja);
  return (
    <Cartao>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-gray-900">Progresso da meta</h2>
        <SeloFaixa faixa={r.faixa} minimo={minimo} />
      </div>
      <div className="relative h-6 rounded-full bg-gray-200" role="img"
        aria-label={`Faturamento ${fmtPct(r.percentual_atingido)} da meta. Mínimo ${fmtPct(minimo)}.`}>
        <div className={cx("h-6 rounded-full", r.faixa === "100" ? "bg-green-600" : r.faixa === "minima" ? "bg-amber-500" : "bg-gray-500")}
          style={{ width: pos(r.percentual_atingido) }} />
        <div className="absolute inset-y-0 w-0.5 bg-gray-800" style={{ left: pos(minimo) }} aria-hidden />
        <div className="absolute inset-y-0 w-0.5 bg-gray-900" style={{ left: pos(1) }} aria-hidden />
      </div>
      <div className="relative mt-1 h-5 text-xs text-gray-700" aria-hidden>
        <span className="absolute -translate-x-1/2" style={{ left: pos(minimo) }}>{fmtPct(minimo)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: pos(1) }}>100%</span>
      </div>
      <p className="mt-2 text-sm text-gray-800">
        {!d.meta ? "Meta do mês ainda não cadastrada."
          : r.faixa === "100" ? "Meta batida!"
          : r.faixa === "minima" ? <>Meta mínima garantida. Faltam <b>{fmtBRL(falta.para100)}</b> para os 100%.</>
          : <>Faltam <b>{fmtBRL(falta.paraMinima)}</b> para a meta mínima e <b>{fmtBRL(falta.para100)}</b> para os 100%.</>}
      </p>
    </Cartao>
  );
}

/** Tabela por vendedor (ordenada pelo faturamento). */
export function TabelaResultado({ d, destacar }: { d: DadosMes; destacar?: string | null }) {
  const r = d.resultado;
  const linhas = ordenarRanking(r.vendedores);
  if (!linhas.length) return <p className="text-sm text-gray-700">Nenhum lançamento neste mês.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-gray-700">
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Vendedor</th>
            <th className="py-2 pr-2 num">Faturamento</th>
            <th className="py-2 pr-2 num">Participação</th>
            <th className="py-2 pr-2 num">Clientes eng.</th>
            <th className="py-2 pr-2 num">Prêmio fat.</th>
            <th className="py-2 pr-2 num">Prêmio eng.</th>
            <th className="py-2 num">Total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((v, i) => (
            <tr key={v.vendedor_id} className={cx("border-b border-gray-100", destacar === v.vendedor_id && "bg-marca-claro font-semibold")}>
              <td className="py-2 pr-2">{i + 1}º</td>
              <td className="py-2 pr-2">{v.nome}{destacar === v.vendedor_id && " (você)"}</td>
              <td className="py-2 pr-2 num">{fmtBRL(v.faturamento_realizado)}</td>
              <td className="py-2 pr-2 num">{fmtPct(v.participacao)}</td>
              <td className="py-2 pr-2 num">{fmtInt(v.clientes_engajados)}</td>
              <td className="py-2 pr-2 num">{fmtBRL(v.premio_faturamento)}</td>
              <td className="py-2 pr-2 num">{fmtBRL(v.premio_engajamento)}</td>
              <td className="py-2 num">{fmtBRL(v.premio_total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className="py-2 pr-2" colSpan={2}>Total da loja</td>
            <td className="py-2 pr-2 num">{fmtBRL(r.faturamento_loja)}</td>
            <td className="py-2 pr-2 num">{fmtPct(r.faturamento_loja > 0 ? 1 : 0)}</td>
            <td className="py-2 pr-2 num">{fmtInt(r.vendedores.reduce((s, v) => s + v.clientes_engajados, 0))}</td>
            <td className="py-2 pr-2 num">{fmtBRL(r.total_premio_faturamento)}</td>
            <td className="py-2 pr-2 num">{fmtBRL(r.total_premio_engajamento)}</td>
            <td className="py-2 num">{fmtBRL(r.total_premio)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
