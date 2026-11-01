import { describe, expect, it } from "vitest";
import { gerarCsv } from "@/lib/exportar";

describe("exportar", () => {
  it("gera CSV para o Excel brasileiro (; e vírgula decimal, com acentos)", () => {
    const csv = gerarCsv([{ titulo: "Produto" }, { titulo: "Valor", numero: true }], [["Café; especial", 12.5], ['Copo "grande"', null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Produto;Valor");
    expect(csv).toContain('"Café; especial";12,5');
    expect(csv).toContain('"Copo ""grande""";');
  });
});
