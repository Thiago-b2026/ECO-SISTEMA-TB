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
