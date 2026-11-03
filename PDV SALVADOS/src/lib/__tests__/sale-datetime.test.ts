import { describe, expect, it } from "vitest";
import {
  formatLocalDateInput,
  formatSaleDateOnly,
  formatSaleDateTime,
  getSaleDateKey,
  getSaleHour,
  localDateRangeToIso,
  saleDateTimePartsToIso,
  sortBySaleDateAsc,
  sortBySaleDateDesc,
} from "@/lib/sale-datetime";

describe("sale-datetime", () => {
  it("preserva a data e hora informadas no PDV ao gerar ISO", () => {
    expect(saleDateTimePartsToIso("2026-05-10", "23:58:59")).toBe("2026-05-11T02:58:59.000Z");
    expect(saleDateTimePartsToIso("10/05/2026", "23:58")).toBe("2026-05-11T02:58:00.000Z");
  });

  it("gera filtros de início e fim do dia no timezone da venda", () => {
    expect(localDateRangeToIso("2026-05-10")).toEqual({
      start: "2026-05-10T03:00:00.000Z",
      end: "2026-05-11T02:59:59.999Z",
    });
  });

  it("formata a visualização sempre com a data/hora real da venda", () => {
    const iso = "2026-05-11T02:58:59.000Z";
    expect(formatSaleDateOnly(iso)).toBe("10/05/2026");
    expect(formatSaleDateTime(iso)).toBe("10/05/2026, 23:58:59");
    expect(getSaleDateKey(iso)).toBe("10/05/2026");
    expect(getSaleHour(iso)).toBe(23);
  });

  it("mantém a ordenação cronológica pela data_venda e numero", () => {
    const rows = [
      { numero: 7, data_venda: "2026-05-11T02:58:59.000Z" },
      { numero: 8, data_venda: "2026-05-11T02:58:59.000Z" },
      { numero: 3, data_venda: "2026-05-10T15:00:00.000Z" },
    ];

    expect(sortBySaleDateDesc(rows).map((row) => row.numero)).toEqual([8, 7, 3]);
    expect(sortBySaleDateAsc(rows).map((row) => row.numero)).toEqual([3, 7, 8]);
  });

  it("usa a data da venda no preenchimento padrão do filtro", () => {
    expect(formatLocalDateInput("2026-05-11T02:58:59.000Z")).toBe("2026-05-10");
  });
});
