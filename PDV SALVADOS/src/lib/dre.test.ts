import { describe, expect, it } from "vitest";
import { faturamentoEfetivo, pctDe, statusBenchmark } from "./dre";

describe("statusBenchmark", () => {
  it("sem despesa é ótimo", () => expect(statusBenchmark(0, 10)).toBe("otimo"));
  it("até 90% do benchmark é ótimo", () => expect(statusBenchmark(9, 10)).toBe("otimo"));
  it("até o benchmark é bom", () => expect(statusBenchmark(10, 10)).toBe("bom"));
  it("até 15% acima é atenção", () => expect(statusBenchmark(11.4, 10)).toBe("atencao"));
  it("15% ou mais acima é ruim", () => expect(statusBenchmark(11.5, 10)).toBe("ruim"));
  it("despesa sem benchmark é ruim", () => expect(statusBenchmark(1, 0)).toBe("ruim"));
});

describe("faturamentoEfetivo", () => {
  it("usa o automático sem valor digitado", () => expect(faturamentoEfetivo(1000, null)).toBe(1000));
  it("digitado tem prioridade, mesmo zero", () => expect(faturamentoEfetivo(1000, 0)).toBe(0));
});

describe("pctDe", () => {
  it("sem faturamento dá 0", () => expect(pctDe(50, 0)).toBe(0));
  it("calcula o percentual", () => expect(pctDe(25, 200)).toBe(12.5));
});
