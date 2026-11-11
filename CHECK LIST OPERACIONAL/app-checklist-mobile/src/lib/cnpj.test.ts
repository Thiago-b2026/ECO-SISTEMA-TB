import { describe, expect, it } from "vitest";
import { cnpjValido, formatarCnpj, tipoPeloCnpj } from "./cnpj";

describe("CNPJ", () => {
  it("valida os dígitos, formata e diz se é matriz (/0001) ou filial", () => {
    expect(cnpjValido("17.890.178/0001-58")).toBe(true);
    expect(cnpjValido("17890178000159")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(formatarCnpj("17890178000158")).toBe("17.890.178/0001-58");
    expect(tipoPeloCnpj("17890178000158")).toBe("matriz");
    expect(tipoPeloCnpj("17890178000239")).toBe("filial");
    expect(tipoPeloCnpj("")).toBeNull();
  });
});
