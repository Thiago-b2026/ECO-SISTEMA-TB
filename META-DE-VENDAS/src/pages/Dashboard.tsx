import { FileDown, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useApp } from "../app/contexto";
import { useMesAtual } from "../app/mes";
import { exportarExcel, exportarPDF } from "../lib/exportar";
import { fmtBRL, fmtPct, mesLongo } from "../lib/formato";
import { Aviso, Botao, Carregando, Cartao, Titulo } from "../ui/base";
import { BarraMeta, Indicador, SeloFaixa, SeloFechado, TabelaResultado } from "../ui/resultado";

export default function Dashboard() {
  const { unidade, mes, pode } = useApp();
  const { dadosMes: d, erro, carregando } = useMesAtual();
  const [exportando, setExportando] = useState(false);
  const exporta = pode("metas.historico", "exportar");

  async function exportar(tipo: "pdf" | "xlsx") {
    if (!d || !unidade) return;
    setExportando(true);
    try {
      await (tipo === "pdf" ? exportarPDF(unidade.nome, d) : exportarExcel(unidade.nome, [d]));
    } finally {
      setExportando(false);
    }
  }

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (carregando || !d) return <Carregando />;
  const r = d.resultado;
  return (
    <>
      <Titulo acao={exporta ? (
        <div className="flex gap-2">
          <Botao variante="secundario" carregando={exportando} onClick={() => void exportar("pdf")}><FileDown className="size-4" aria-hidden /> PDF</Botao>
          <Botao variante="secundario" carregando={exportando} onClick={() => void exportar("xlsx")}><FileSpreadsheet className="size-4" aria-hidden /> Excel</Botao>
        </div>
      ) : undefined}>
        Dashboard — {mesLongo(mes)} <SeloFechado fechado={d.fechado} />
      </Titulo>
      {!d.meta && (
        <Aviso tom="alerta" titulo="Meta do mês não cadastrada">
          Sem meta, ninguém recebe prêmio de faturamento.{" "}
          {pode("metas.configuracao", "editar") && <Link className="font-semibold underline" to="/configuracao">Cadastrar a meta</Link>}
        </Aviso>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Meta do mês" valor={fmtBRL(d.meta?.meta_total)} detalhe={d.meta ? `Mínima: ${fmtBRL(d.meta.meta_total * d.meta.percentual_minimo)}` : "—"} />
        <Indicador rotulo="Faturamento da loja" valor={fmtBRL(r.faturamento_loja)} detalhe={`${fmtPct(r.percentual_atingido)} da meta`} />
        <Indicador rotulo="Faixa" valor={fmtBRL(r.premio_a_dividir)} detalhe={<SeloFaixa faixa={r.faixa} minimo={d.meta?.percentual_minimo ?? 0.9} />} />
        <Indicador rotulo="Prêmio total a pagar" valor={fmtBRL(r.total_premio)} detalhe={`Faturamento ${fmtBRL(r.total_premio_faturamento)} + engajamento ${fmtBRL(r.total_premio_engajamento)}`} />
      </div>
      <BarraMeta d={d} />
      <Cartao>
        <h2 className="mb-2 font-bold text-gray-900">Vendedores</h2>
        <TabelaResultado d={d} />
      </Cartao>
    </>
  );
}
