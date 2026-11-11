// Relatórios exportáveis: Excel (.xlsx com abas) do período e PDF de uma execução (com fotos e assinatura).
import type { LinhaRelatorio, Membro } from "../data/servidor";
import { nomeSetor } from "../data/seed-modelos";
import { mapaRespostas, naoConforme, itemVisivel, textoPontuacao, todosItens } from "../domain/regras";
import { ROTULO_STATUS_PLANO, planoAtrasado } from "../domain/situacao";
import { dataBR, dataHoraSP, diaSemana, dataSP, duracao, horaSP } from "../domain/tempo";
import { ROTULO_SITUACAO, duracaoItemSeg, tempoAtivoSeg, type ExecAnalisada, type ItemAnalisado } from "../domain/tempos";
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

const min = (seg: number | null | undefined) => (seg == null ? "" : Math.round((seg / 60) * 10) / 10);

/** Aba "Tempos": uma linha por execução concluída (tempo ativo, pausas, referência, média, última, situação). */
export function linhasTempos(es: ExecAnalisada[]) {
  return es.map((e) => ({
    Data: dataBR(dataSP(e.inicio_em)), Unidade: e.loja, Checklist: e.modelo, Pessoa: e.pessoa,
    Início: horaSP(e.inicio_em), Fim: horaSP(e.fim_em),
    "Total (min)": min(e.total_seg), "Parado (min)": min(e.pausado_seg), "Ativo (min)": min(e.real_seg),
    "Padrão (min)": min(e.padrao_seg), "Média do período (min)": min(e.media_seg), "Última (min)": min(e.ultima_seg),
    "Referência": e.base === "padrao" ? "Padrão" : e.base === "media" ? "Média" : "",
    "Diferença (%)": e.diferenca_pct ?? "", Situação: ROTULO_SITUACAO[e.situacao],
  }));
}

/** Aba "Tempos por item": início, fim e duração de cada item medido. */
export function linhasTemposItens(is: ItemAnalisado[], es: ExecAnalisada[]) {
  const ex = new Map(es.map((e) => [e.execucao_id, e]));
  return is.filter((i) => ex.has(i.execucao_id)).map((i) => {
    const e = ex.get(i.execucao_id)!;
    return {
      Data: dataBR(dataSP(e.inicio_em)), Unidade: e.loja, Checklist: e.modelo, Pessoa: e.pessoa, Item: i.texto,
      Início: i.iniciado_em ? horaSP(i.iniciado_em) : "", Fim: i.concluido_em ? horaSP(i.concluido_em) : "",
      "Duração (s)": i.duracao_seg ?? "", "Padrão (s)": i.padrao_seg ?? "", "Média do item (s)": i.media_seg ?? "", Situação: ROTULO_SITUACAO[i.situacao],
    };
  });
}

export interface TemposExcel { execucoes: ExecAnalisada[]; itens: ItemAnalisado[] }

/** Gera o .xlsx e devolve o Blob. Com `tempos`, inclui as abas "Tempos" e "Tempos por item". */
export async function gerarExcel(execucoes: LinhaRelatorio[], planos: PlanoAcao[], membros: Membro[], titulo: string, tempos?: TemposExcel | null): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const capa = XLSX.utils.aoa_to_sheet([[titulo], [`Gerado em ${dataHoraSP(new Date())} (horário de São Paulo)`], [], ["Execuções", execucoes.length], ["Planos de ação", planos.length],
    ...(tempos ? [["Execuções com tempo", tempos.execucoes.length]] : [["Tempos", "não incluídos (não foi possível carregar)"]])]);
  XLSX.utils.book_append_sheet(wb, capa, "Resumo");
  const e = XLSX.utils.json_to_sheet(linhasExecucoes(execucoes));
  e["!cols"] = [10, 24, 34, 7, 22, 7, 7, 12, 12, 16, 12, 12].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, e, "Execuções");
  const p = XLSX.utils.json_to_sheet(linhasPlanos(planos, membros));
  p["!cols"] = [16, 40, 16, 22, 16, 20, 9, 40, 30].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, p, "Planos de ação");
  if (tempos) {
    const t = XLSX.utils.json_to_sheet(linhasTempos(tempos.execucoes));
    t["!cols"] = [10, 24, 34, 22, 7, 7, 10, 10, 10, 11, 14, 10, 11, 12, 16].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, t, "Tempos");
    const ti = XLSX.utils.json_to_sheet(linhasTemposItens(tempos.itens, tempos.execucoes));
    ti["!cols"] = [10, 24, 30, 22, 50, 7, 7, 11, 10, 15, 16].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ti, "Tempos por item");
  }
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

/** "13:01–13:04 · 3min" (+ padrão); sem medição: "—". */
export function textoTempoItem(r: Resposta | undefined, padraoMin?: number): string {
  if (!r?.iniciado_em) return "—";
  const fim = r.concluido_em ? horaSP(r.concluido_em) : "?";
  const dur = r.concluido_em ? duracao(duracaoItemSeg(r)) : "incompleto";
  return `${horaSP(r.iniciado_em)}–${fim} · ${dur}${padraoMin ? ` (padrão ${String(padraoMin).replace(".", ",")} min)` : ""}`;
}

/** PDF de uma execução: cabeçalho, nota, tempos, tabela por seção (com o tempo de cada item), fotos, planos e assinatura. */
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
    `Data: ${dataBR(d.dataRef)}   ·   Início: ${dataHoraSP(d.execucao.inicio_em)}   ·   Fim: ${dataHoraSP(d.execucao.fim_em)}`,
    `Duração: ${duracao(d.execucao.fim_em ? (new Date(d.execucao.fim_em).getTime() - new Date(d.execucao.inicio_em).getTime()) / 1000 : null)}   ·   Tempo ativo: ${duracao(d.execucao.fim_em ? tempoAtivoSeg(d.execucao) : null)}   ·   Parado: ${duracao(d.execucao.tempo_pausado_seg ?? 0)}${d.versao.conteudo.tempo_padrao_min ? `   ·   Padrão: ${d.versao.conteudo.tempo_padrao_min} min` : ""}`,
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
      head: [[`${s.titulo} · ${nomeSetor(s.setor)}`, "Resposta", "Observação", "Fotos", "Tempo"]],
      body: vis.map((i) => {
        const r = mapa.get(i.id);
        const nc = naoConforme(porId.get(i.id)!, r?.valor);
        return [i.texto, `${textoResposta(r?.valor)}${nc ? " (NC)" : ""}`, r?.observacao ?? "", String(fotosItem(i.id) || ""), textoTempoItem(r, porId.get(i.id)!.tempo_padrao_min)];
      }),
      styles: { fontSize: 8, cellPadding: 1.5, valign: "top" },
      headStyles: { fillColor: [15, 81, 50] },
      columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 24 }, 3: { cellWidth: 11, halign: "center" }, 4: { cellWidth: 25 } },
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
