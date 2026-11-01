import { describe, expect, it } from "vitest";
import { compararCodigo, proximoCodigo } from "@/lib/plano-contas";

const contas = [
  { id: "1", codigo: "3", pai_id: null },
  { id: "2", codigo: "3.1", pai_id: "1" },
  { id: "3", codigo: "3.1.01", pai_id: "2" },
  { id: "4", codigo: "3.1.02", pai_id: "2" },
  { id: "5", codigo: "4", pai_id: null },
];

describe("plano de contas", () => {
  it("ordena número a número", () => {
    expect(["3.1.10", "3.1.9", "3", "3.1"].sort(compararCodigo)).toEqual(["3", "3.1", "3.1.9", "3.1.10"]);
  });
  it("gera o próximo código", () => {
    expect(proximoCodigo(null, contas)).toBe("5");
    expect(proximoCodigo({ id: "1", codigo: "3" }, contas)).toBe("3.2");
    expect(proximoCodigo({ id: "2", codigo: "3.1" }, contas)).toBe("3.1.03");
    expect(proximoCodigo({ id: "5", codigo: "4" }, contas)).toBe("4.1");
  });
});
