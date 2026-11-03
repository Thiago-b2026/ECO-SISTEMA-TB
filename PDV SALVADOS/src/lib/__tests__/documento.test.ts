import { describe, expect, it } from "vitest";
import { cnpjValido, cpfValido, empresaDaBrasilApi, formatarDocumento } from "@/lib/documento";

describe("documento", () => {
  it("valida CPF", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });
  it("valida CNPJ", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-80")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });
  it("formata", () => {
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("converte a resposta da BrasilAPI", () => {
    const e = empresaDaBrasilApi({
      razao_social: "LOJA X LTDA", nome_fantasia: "LOJA X", cep: "79000000", descricao_tipo_de_logradouro: "RUA",
      logradouro: "DAS FLORES", numero: "10", bairro: "CENTRO", municipio: "CAMPO GRANDE", uf: "MS",
      ddd_telefone_1: "6733334444", codigo_municipio_ibge: 5002704, descricao_situacao_cadastral: "ATIVA",
    });
    expect(e).toMatchObject({ nome: "LOJA X LTDA", nome_fantasia: "LOJA X", logradouro: "RUA DAS FLORES", cidade: "CAMPO GRANDE", uf: "MS", telefone: "6733334444", cod_ibge: "5002704" });
  });
});
