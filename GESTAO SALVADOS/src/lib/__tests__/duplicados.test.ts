import { describe, expect, it } from "vitest";
import { acharDuplicado, acharParecidos, nomesParecidos, normalizarNome } from "@/lib/duplicados";

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

  it("unidade escrita diferente é o mesmo nome", () => {
    expect(normalizarNome("CHALEIRA ELETRICA ZENTRA 1,8LT")).toBe(normalizarNome("Chaleira Elétrica Zentra 1,8 L"));
    expect(normalizarNome("Água 1,5 litros")).toBe("agua 1 5l");
  });

  it("nome parecido: um contém o outro ou quase todas as palavras", () => {
    expect(nomesParecidos("CHALEIRA ELETRICA ZENTRA", "CHALEIRA ELETRICA ZENTRA 1,8L")).toBe(true);
    expect(nomesParecidos("BLUSA FEMININA", "BLUSA FEMININA BASICA SEM MANGA")).toBe(true);
    expect(nomesParecidos("LIVRO", "LIVRO PESSOAS IMPROVAVEIS")).toBe(false); // uma palavra só não basta
    expect(nomesParecidos("MOLETOM UNISSEX", "AIR FRYER WAP")).toBe(false);
  });

  it("lista os parecidos sem repetir o igual", () => {
    const l = [{ titulo: "CHALEIRA ELETRICA ZENTRA 1,8L" }, { titulo: "VINHO 750ML" }];
    expect(acharParecidos(l, { titulo: "chaleira eletrica zentra" }).map((x) => x.titulo)).toEqual(["CHALEIRA ELETRICA ZENTRA 1,8L"]);
  });
});

describe("unificar linhas da planilha", () => {
  it("soma a quantidade do mesmo produto", async () => {
    const { unificarLinhas } = await import("@/lib/duplicados");
    const r = unificarLinhas([
      { titulo: "Micro-ondas PMO23B", quantidade: 2, grade: "A" },
      { titulo: "MICRO-ONDAS  pmo23b", quantidade: 1, grade: "A" },
      { titulo: "Micro-ondas PMO23B", quantidade: 3, grade: "B" },
      { titulo: "Chaleira 1,8L", quantidade: 1, codigo_barras: "789" },
      { titulo: "Chaleira elétrica", quantidade: 4, codigo_barras: "789" },
      { titulo: "Ventilador 40cm", quantidade: 1, codigo_barras: "111" },
      { titulo: "Ventilador 40cm", quantidade: 1, codigo_barras: "222" },
    ]);
    expect(r.juntadas).toBe(2);
    expect(r.linhas.map((l) => l.quantidade)).toEqual([3, 3, 5, 1, 1]);
  });
});

describe("pallets da planilha", () => {
  it("nome do pallet vira código válido", async () => {
    const { codigoPallet } = await import("@/lib/lotes");
    expect(codigoPallet("Pallet 1")).toBe("PALLET-1");
    expect(codigoPallet(" mz-0409 ")).toBe("MZ-0409");
    expect(codigoPallet("Lote nº 3 / caixa")).toBe("LOTE-N-3-CAIXA");
    expect(codigoPallet("")).toBe("");
  });
  it("mesmo produto em pallets diferentes não junta", async () => {
    const { unificarLinhas } = await import("@/lib/duplicados");
    const r = unificarLinhas([
      { titulo: "Micro-ondas PMO23B", quantidade: 1, _pallet: "P1" },
      { titulo: "Micro-ondas PMO23B", quantidade: 1, _pallet: "P2" },
      { titulo: "Micro-ondas PMO23B", quantidade: 2, _pallet: "P1" },
    ]);
    expect(r.linhas.map((l) => l.quantidade)).toEqual([3, 1]);
  });
});
