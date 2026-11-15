import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { useApp, useDados } from "../app/contexto";
import { carregarPeriodo } from "../app/mes";
import { exportarExcel } from "../lib/exportar";
import { fmtBRL, fmtPct, mesLongo, ultimosMeses } from "../lib/formato";
import { Aviso, Botao, Carregando, Cartao, classeEntrada, Titulo } from "../ui/base";
import { SeloFaixa, SeloFechado } from "../ui/resultado";

export default function Historico() {
  const { unidade, mes, pode } = useApp();
  const [n, setN] = useState(6);
  const meses = ultimosMeses(n, mes);
  const { dados, erro, carregando } = useDados(async () => (unidade ? carregarPeriodo(unidade.id, meses) : null), [unidade?.id, mes, n]);
  const [exportando, setExportando] = useState(false);

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  const lista = [...(dados?.meses ?? [])].reverse();
  return (
    <>
      <Titulo acao={pode("metas.historico", "exportar") && dados ? (
        <Botao variante="secundario" carregando={exportando} onClick={async () => {
          setExportando(true);
          try {
            await exportarExcel(unidade!.nome, dados.meses);
          } finally {
            setExportando(false);
          }
        }}><FileSpreadsheet className="size-4" aria-hidden /> Excel</Botao>
      ) : undefined}>Histórico</Titulo>
      <label className="block max-w-xs text-sm">
        <span className="mb-1 block font-semibold text-gray-800">Período (até {mesLongo(mes)})</span>
        <select className={classeEntrada} value={n} onChange={(e) => setN(Number(e.target.value))}>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={24}>Últimos 24 meses</option>
        </select>
      </label>
      {carregando || !dados ? <Carregando /> : (
        <Cartao className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-gray-700">
                <th className="py-2 pr-2">Mês</th>
                <th className="py-2 pr-2 num">Meta</th>
                <th className="py-2 pr-2 num">Faturamento</th>
                <th className="py-2 pr-2 num">% da meta</th>
                <th className="py-2 pr-2">Faixa</th>
                <th className="py-2 pr-2 num">Prêmio a dividir</th>
                <th className="py-2 pr-2 num">Prêmio total pago</th>
                <th className="py-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <tr key={d.mes} className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-semibold">{mesLongo(d.mes)}</td>
                  <td className="py-2 pr-2 num">{d.meta ? fmtBRL(d.meta.meta_total) : "—"}</td>
                  <td className="py-2 pr-2 num">{fmtBRL(d.resultado.faturamento_loja)}</td>
                  <td className="py-2 pr-2 num">{d.meta ? fmtPct(d.resultado.percentual_atingido) : "—"}</td>
                  <td className="py-2 pr-2">{d.meta ? <SeloFaixa faixa={d.resultado.faixa} minimo={d.meta.percentual_minimo} /> : "Sem meta"}</td>
                  <td className="py-2 pr-2 num">{fmtBRL(d.resultado.premio_a_dividir)}</td>
                  <td className="py-2 pr-2 num">{fmtBRL(d.resultado.total_premio)}</td>
                  <td className="py-2">{d.fechado ? <SeloFechado fechado /> : "Em aberto"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}
    </>
  );
}
