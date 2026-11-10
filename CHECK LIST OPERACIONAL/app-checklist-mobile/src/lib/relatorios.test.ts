import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { MODELOS_SEED } from "../data/seed-modelos";
import type { LinhaRelatorio } from "../data/servidor";
import { gerarExcel, gerarPdfExecucao, linhasExecucoes, nomeArquivo } from "./relatorios";

const linha: LinhaRelatorio = {
  execucao_id: "e1", loja: "Matriz", modelo: "Fiscal – Rotina da tarde", versao: 1, pessoa: "Ana", data: "2026-11-10",
  inicio: "2026-11-10T16:00:00.000Z", fim: "2026-11-10T16:25:00.000Z", duracao_seg: 1500, status: "validada",
  pontuacao: 76.92, nao_conformes: 1, planos: 1,
};

describe("relatórios", () => {
  it("Excel .xlsx com abas Resumo, Execuções e Planos; horário de São Paulo; sem pontuação aparece por extenso", async () => {
    const blob = await gerarExcel([linha, { ...linha, execucao_id: "e2", pontuacao: null }], [], [], "Teste");
    expect(blob.type).toContain("spreadsheetml");
    const wb = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: "array" });
    expect(wb.SheetNames).toEqual(["Resumo", "Execuções", "Planos de ação"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Execuções"]);
    expect(rows[0]).toMatchObject({ Data: "10/11/2026", Início: "13:00", Fim: "13:25", "Duração (min)": 25, Situação: "Validada", "Conformidade (%)": 76.92 });
    expect(rows[1]["Conformidade (%)"]).toBe("Sem pontuação aplicável");
    expect(linhasExecucoes([linha])[0]["Planos de ação"]).toBe(1);
    expect(nomeArquivo("Relatório Matriz – 10/11")).toBe("relatorio-matriz-10-11");
  });

  it("PDF de uma execução é gerado (sem fotos)", async () => {
    const m = MODELOS_SEED.find((x) => x.codigo === "fiscal_tarde")!;
    const blob = await gerarPdfExecucao({
      execucao: { id: "e1", tarefa_id: null, modelo_id: "m", versao_id: "v", loja_id: "l", usuario_id: "u", inicio_em: linha.inicio, fim_em: linha.fim, status: "concluida", pontuacao: 35 },
      versao: { id: "v", modelo_id: "m", numero: 1, status: "publicada", conteudo: m.conteudo },
      modelo: m.nome, loja: "Matriz", pessoa: "Ana", dataRef: "2026-11-10",
      respostas: [{ id: "r", execucao_id: "e1", item_id: "ft_copos", valor: { tipo: "sim_nao", v: false }, observacao: "Copos de 300 ml", respondido_em: linha.inicio }],
      fotos: [], planos: [],
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(2000);
  });
});
