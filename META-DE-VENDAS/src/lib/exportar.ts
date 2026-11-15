// Exportar o resultado (PDF e Excel), como no Lovable. As bibliotecas só carregam quando a pessoa clica.
import type { DadosMes } from "../app/mes";
import { ordenarRanking } from "../domain/premiacao";
import { fmtBRL, fmtPct, mesCurto, nomeFaixa } from "./formato";

const nomeArquivo = (loja: string, mes: string, ext: string) => `premiacao_${loja.normalize("NFD").replace(/[^\w]+/g, "_")}_${mes.slice(0, 7)}.${ext}`;

export async function exportarPDF(loja: string, d: DadosMes) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const r = d.resultado;
  const minimo = d.meta?.percentual_minimo ?? 0.9;
  const doc = new jsPDF();
  doc.setFontSize(16).text(`Premiação — ${loja}`, 14, 18);
  doc.setFontSize(11);
  doc.text(`Mês: ${mesCurto(d.mes)}${d.fechado ? " (fechado)" : " (em aberto)"}`, 14, 26);
  doc.text(`Meta: ${fmtBRL(d.meta?.meta_total)}  •  Faturamento: ${fmtBRL(r.faturamento_loja)} (${fmtPct(r.percentual_atingido)})`, 14, 32);
  doc.text(`Faixa: ${nomeFaixa(r.faixa, minimo)}  •  Prêmio a dividir: ${fmtBRL(r.premio_a_dividir)}`, 14, 38);
  autoTable(doc, {
    startY: 46,
    head: [["Vendedor", "Faturamento", "Part.", "Cli. eng.", "Prêmio fat.", "Prêmio eng.", "Total"]],
    body: ordenarRanking(r.vendedores).map((v) => [v.nome, fmtBRL(v.faturamento_realizado), fmtPct(v.participacao), String(v.clientes_engajados),
      fmtBRL(v.premio_faturamento), fmtBRL(v.premio_engajamento), fmtBRL(v.premio_total)]),
    foot: [["TOTAL", fmtBRL(r.faturamento_loja), "", "", fmtBRL(r.total_premio_faturamento), fmtBRL(r.total_premio_engajamento), fmtBRL(r.total_premio)]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [15, 81, 50] },
    footStyles: { fillColor: [209, 231, 221], textColor: 20, fontStyle: "bold" },
  });
  doc.setFontSize(8).setTextColor(90).text("Eco Sistema TB · Meta de Vendas", 14, 290);
  doc.save(nomeArquivo(loja, d.mes, "pdf"));
}

export async function exportarExcel(loja: string, meses: DadosMes[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const resumo = [["Mês", "Meta", "Faturamento", "% da meta", "Faixa", "Prêmio a dividir", "Prêmio total pago", "Situação"],
    ...meses.map((d) => [mesCurto(d.mes), d.meta?.meta_total ?? 0, d.resultado.faturamento_loja, d.resultado.percentual_atingido,
      nomeFaixa(d.resultado.faixa, d.meta?.percentual_minimo ?? 0.9), d.resultado.premio_a_dividir, d.resultado.total_premio, d.fechado ? "Fechado" : "Em aberto"])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");
  const vend = [["Mês", "Vendedor", "Faturamento", "% participação", "Clientes engajados", "Prêmio faturamento", "Prêmio engajamento", "Prêmio total"],
    ...meses.flatMap((d) => ordenarRanking(d.resultado.vendedores).map((v) => [mesCurto(d.mes), v.nome, v.faturamento_realizado, v.participacao,
      v.clientes_engajados, v.premio_faturamento, v.premio_engajamento, v.premio_total]))];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vend), "Vendedores");
  XLSX.writeFile(wb, nomeArquivo(loja, meses[meses.length - 1]?.mes ?? "", "xlsx"));
}
