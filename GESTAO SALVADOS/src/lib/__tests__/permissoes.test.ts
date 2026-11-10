import { describe, expect, it } from "vitest";
import { ACOES_ESPECIAIS, MODELOS, MODULOS } from "@/lib/permissoes";

describe("modelos de permissão", () => {
  it("cobrem todas as áreas e ações, sem inserir/editar/excluir sem ver", () => {
    for (const md of MODELOS) {
      expect(Object.keys(md.modulos).sort()).toEqual(MODULOS.map((m) => m.id).sort());
      expect(Object.keys(md.acoes).sort()).toEqual(ACOES_ESPECIAIS.map((a) => a.id).sort());
      for (const l of Object.values(md.modulos)) if (l.inserir || l.editar || l.excluir) expect(l.ver).toBe(true);
    }
  });
  it("vendedor vende mas não cancela nem dá desconto", () => {
    const v = MODELOS.find((m) => m.id === "vendedor")!;
    expect(v.modulos.vendas.inserir).toBe(true);
    expect(v.modulos.produtos.ver).toBe(true);
    expect(v.acoes["vendas.cancelar"]).toBe(false);
    expect(v.acoes["vendas.desconto"]).toBe(false);
  });
});
