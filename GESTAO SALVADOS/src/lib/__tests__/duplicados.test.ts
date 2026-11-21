import { describe, expect, it } from "vitest";
import { acharDuplicado, normalizarNome } from "@/lib/duplicados";

const lista = [
  { id: "1", titulo: "Ventilador Mondial 40cm Preto", codigo_barras: "7891234567890" },
  { id: "2", titulo: "Chaleira Elétrica Zentra 1,8L", codigo_barras: null },
];

describe("trava de produto duplicado", () => {
  it("normaliza o nome", () => {
    expect(normalizarNome("  Chaleira  ELÉTRICA Zentra - 1,8L! ")).toBe("chaleira eletrica zentra 1 8l");
  });

  it("acha pelo código de barras, mesmo com nome diferente", () => {
    expect(acharDuplicado(lista, { titulo: "Outro nome", codigo_barras: "789-1234567890" })).toMatchObject({ item: { id: "1" }, motivo: "codigo" });
  });

  it("acha pelo nome, ignorando acento, maiúscula e pontuação", () => {
    expect(acharDuplicado(lista, { titulo: "chaleira eletrica zentra 1.8l" })?.item.id).toBe("2");
  });

  it("mudar o nome libera (outro produto)", () => {
    expect(acharDuplicado(lista, { titulo: "Chaleira Elétrica Zentra 1,8L Inox" })).toBeNull();
  });

  it("pode ignorar o próprio item (edição)", () => {
    expect(acharDuplicado(lista, { titulo: "Chaleira Elétrica Zentra 1,8L" }, (x) => x.id === "2")).toBeNull();
  });
});
