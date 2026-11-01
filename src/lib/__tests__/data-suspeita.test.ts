import { describe, expect, it } from "vitest";
import { motivoDataSuspeita } from "@/lib/data-suspeita";

const criada = "2026-07-17 15:00:00+00";

describe("motivoDataSuspeita", () => {
  it("aceita venda no mesmo dia ou antes do registro (data retroativa normal)", () => {
    expect(motivoDataSuspeita("2026-07-17 14:00:00+00", criada)).toBeNull();
    expect(motivoDataSuspeita("2026-05-01 13:10:00+00", "2026-05-05 10:00:00+00")).toBeNull();
  });

  it("marca venda antes do início do sistema", () => {
    expect(motivoDataSuspeita("2023-05-02 17:15:00+00", "2026-05-05 13:36:37+00")).toBe("antes_do_sistema");
    expect(motivoDataSuspeita("2026-04-30 12:00:00+00", "2026-05-16 10:00:00+00")).toBe("antes_do_sistema");
  });

  it("marca venda com data depois do dia em que foi registrada", () => {
    expect(motivoDataSuspeita("2026-12-17 17:44:00+00", criada)).toBe("depois_do_registro");
    expect(motivoDataSuspeita("2026-07-18 12:00:00+00", criada)).toBe("depois_do_registro");
  });

  it("compara dias no fuso de São Paulo, não em UTC", () => {
    // 02:00 UTC do dia 18 ainda é 23:00 do dia 17 em São Paulo → mesmo dia, ok
    expect(motivoDataSuspeita("2026-07-18 02:00:00+00", criada)).toBeNull();
    // 01/05 às 01:00 UTC é 30/04 22:00 em São Paulo → antes do sistema
    expect(motivoDataSuspeita("2026-05-01 01:00:00+00", "2026-05-05 10:00:00+00")).toBe("antes_do_sistema");
  });
});
