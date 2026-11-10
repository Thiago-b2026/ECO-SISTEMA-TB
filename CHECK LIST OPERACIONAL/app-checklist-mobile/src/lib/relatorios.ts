// Relatórios exportáveis: Excel (.xlsx com abas) do período e PDF de uma execução (com fotos e assinatura).
import type { LinhaRelatorio, Membro } from "../data/servidor";
import { nomeSetor } from "../data/seed-modelos";
import { mapaRespostas, naoConforme, itemVisivel, textoPontuacao, todosItens } from "../domain/regras";
import { ROTULO_STATUS_PLANO, planoAtrasado } from "../domain/situacao";
import { dataBR, dataHoraSP, diaSemana, dataSP, duracao, horaSP } from "../domain/tempo";
import type { Execucao, Foto, ModeloVersao, PlanoAcao, Resposta } from "../domain/tipos";
import { textoResposta } from "../ui/CampoResposta";

const STATUS_EXEC: Record<string, string> = { em_andamento: "Em andamento", concluida: "Concluída", validada: "Validada", devolvida: "Devolvida", cancelada: "Cancelada" };

export const nomeArquivo = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "relatorio";

/** Linhas da aba "Execuções" (datas em São Paulo). */
export function linhasExecucoes(rs: LinhaRelatorio[]) {
  return rs.map((r) => ({
    Data: dataBR(r.data), Unidade: r.loja, Checklist: r.modelo, Versão: r.versao, Pessoa: r.pessoa,
    Início: horaSP(r.inicio), Fim: r.fim ? horaSP(r.fim) : "", "Duração (min)": r.duracao_seg == null ? "" : Math.round(r.duracao_seg / 60),
    Situação: STATUS_EXEC[r.status] ?? r.status, "Conformidade (%)": r.pontuacao == null ? "Sem pontuação aplicável" : Number(r.pontuacao),
    "Não conformes": Number(r.nao_conformes), "Planos de ação": Number(r.planos),
  }));
}

export function linhasPlanos(ps: PlanoAcao[], membros: Membro[]) {
  const nome = (u?: string | null) => membros.find((m) => m.usuario_id === u)?.nome ?? "";
  return ps.map((p) => ({
    Aberto: dataHoraSP(p.criado_em), Título: p.titulo, Setor: nomeSetor(p.setor), Responsável: nome(p.responsavel_id),
    Prazo: dataHoraSP(p.prazo), Situação: ROTULO_STATUS_PLANO[p.status], Atrasado: planoAtrasado(p) ? "Sim" : "Não",
    Solução: p.solucao ?? "", "Motivo cancelamento": p.motivo_cancelamento ?? "",
  }));
}

/** Gera o .xlsx e devolve o Blob. */
export async function gerarExcel(execucoes: LinhaRelatorio[], planos: PlanoAcao[], membros: Membro[], titulo: string): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const capa = XLSX.utils.aoa_to_sheet([[titulo], [`Gerado em ${dataHoraSP(new Date())} (horário de São Paulo)`], [], ["Execuções", execucoes.length], ["Planos de ação", planos.length]]);
  XLSX.utils.book_append_sheet(wb, capa, "Resumo");
  const e = XLSX.utils.json_to_sheet(linhasExecucoes(execucoes));
  e["!cols"] = [10, 24, 34, 7, 22, 7, 7, 12, 12, 16, 12, 12].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, e, "Execuções");
  const p = XLSX.utils.json_to_sheet(linhasPlanos(planos, membros));
  p["!cols"] = [16, 40, 16, 22, 16, 20, 9, 40, 30].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, p, "Planos de ação");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export interface DadosPdf {
  execucao: Execucao;
  versao: ModeloVersao;
  modelo: string;
  loja: string;
  pessoa: string;
  dataRef: string;
  respostas: Resposta[];
  fotos: (Foto & { blob?: Blob | null })[];
  planos: PlanoAcao[];
}

const paraDataUrl = (b: Blob) => new Promise<string>((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => erro(r.error); r.readAsDataURL(b); });

/** PDF de uma execução: cabeçalho, nota, tabela por seção, fotos, planos e assinatura. */
export async function gerarPdfExecucao(d: DadosPdf): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  let y = 14;
  doc.setFontSize(9).setTextColor(90).text("Eco Sistema TB · Check List Operacional", 14, y);
  y += 7;
  doc.setFontSize(15).setTextColor(0).text(d.modelo, 14, y, { maxWidth: larg - 28 });
  y += 8;
  doc.setFontSize(10);
  const linhasInfo = [
    `Unidade: ${d.loja}   ·   Executado por: ${d.pessoa}`,
    `Data: ${dataBR(d.dataRef)}   ·   Início: ${dataHoraSP(d.execucao.inicio_em)}   ·   Fim: ${dataHoraSP(d.execucao.fim_em)}   ·   Duração: ${duracao(d.execucao.fim_em ? (new Date(d.execucao.fim_em).getTime() - new Date(d.execucao.inicio_em).getTime()) / 1000 : null)}`,
    `Versão do modelo: ${d.versao.numero}   ·   Situação: ${STATUS_EXEC[d.execucao.status] ?? d.execucao.status}   ·   Conformidade: ${textoPontuacao({ percentual: d.execucao.pontuacao ?? null })}`,
    `Localização: ${d.execucao.lat != null ? `${d.execucao.lat.toFixed(5)}, ${d.execucao.lng?.toFixed(5)}` : "não registrada"}`,
  ];
  for (const l of linhasInfo) { doc.text(l, 14, y, { maxWidth: larg - 28 }); y += 5.5; }
  if (d.execucao.motivo_devolucao) { doc.setTextColor(150, 80, 0).text(`Devolvida: ${d.execucao.motivo_devolucao}`, 14, y); doc.setTextColor(0); y += 5.5; }

  const itens = todosItens(d.versao.conteudo);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const mapa = mapaRespostas(d.respostas);
  const dow = diaSemana(d.dataRef);
  const fotosItem = (id: string) => d.fotos.filter((f) => f.item_id === id).length;
  for (const s of d.versao.conteudo.secoes) {
    const vis = s.itens.filter((i) => itemVisivel(porId.get(i.id)!, porId, mapa, dow));
    if (!vis.length) continue;
    autoTable(doc, {
      startY: y + 2,
      head: [[`${s.titulo} · ${nomeSetor(s.setor)}`, "Resposta", "Observação", "Fotos"]],
      body: vis.map((i) => {
        const r = mapa.get(i.id);
        const nc = naoConforme(porId.get(i.id)!, r?.valor);
        return [i.texto, `${textoResposta(r?.valor)}${nc ? " (NC)" : ""}`, r?.observacao ?? "", String(fotosItem(i.id) || "")];
      }),
      styles: { fontSize: 8, cellPadding: 1.5, valign: "top" },
      headStyles: { fillColor: [15, 81, 50] },
      columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 26 }, 3: { cellWidth: 12, halign: "center" } },
      didParseCell: (c) => { if (c.section === "body" && c.column.index === 1 && String(c.cell.raw).includes("(NC)")) { c.cell.styles.textColor = [160, 20, 20]; c.cell.styles.fontStyle = "bold"; } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
  }

  if (d.planos.length) {
    autoTable(doc, {
      startY: y + 4,
      head: [["Planos de ação gerados", "Prazo", "Situação"]],
      body: d.planos.map((p) => [p.titulo, dataHoraSP(p.prazo), ROTULO_STATUS_PLANO[p.status]]),
      styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [120, 40, 40] }, margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
  }

  // fotos (miniaturas com a legenda) e assinatura
  const comArquivo = d.fotos.filter((f) => f.blob);
  const fotos = comArquivo.filter((f) => f.item_id !== "__assinatura" && f.mime !== "image/png");
  const assinatura = comArquivo.find((f) => f.item_id === "__assinatura");
  if (fotos.length) {
    doc.addPage();
    y = 16;
    doc.setFontSize(12).text("Fotos", 14, y);
    y += 4;
    const w = 58, h = 44;
    let x = 14;
    for (const f of fotos) {
      if (x + w > larg - 10) { x = 14; y += h + 12; }
      if (y + h > 280) { doc.addPage(); y = 16; x = 14; }
      try { doc.addImage(await paraDataUrl(f.blob!), "JPEG", x, y, w, h, undefined, "FAST"); } catch { doc.rect(x, y, w, h); }
      const item = f.item_id ? porId.get(f.item_id)?.texto ?? "" : "";
      doc.setFontSize(7).text([dataHoraSP(f.tirada_em), item.slice(0, 60)], x, y + h + 3.5, { maxWidth: w });
      x += w + 5;
    }
  }
  if (assinatura) {
    if (y > 230) { doc.addPage(); y = 16; } else y += 60;
    doc.setFontSize(10).text("Assinatura de quem executou:", 14, y);
    try { doc.addImage(await paraDataUrl(assinatura.blob!), "PNG", 14, y + 2, 70, 28); } catch { /* sem imagem */ }
    doc.setFontSize(8).text(`${d.pessoa} · ${dataHoraSP(assinatura.tirada_em)}`, 14, y + 34);
  }
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setTextColor(120).text(`Página ${i} de ${paginas} · gerado em ${dataHoraSP(new Date())} · horário de São Paulo`, 14, 290);
  }
  return doc.output("blob");
}

export function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const hojeArquivo = () => dataSP().replace(/-/g, "");
