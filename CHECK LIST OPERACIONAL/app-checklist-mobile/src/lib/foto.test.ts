import { describe, expect, it } from "vitest";
import { legendaFoto, reduzir, validarArquivo } from "./foto";

describe("foto (regra I)", () => {
  it("aceita só imagem e recusa arquivo vazio ou enorme", () => {
    expect(validarArquivo({ type: "image/jpeg", size: 3_000_000 })).toBeNull();
    expect(validarArquivo({ type: "application/pdf", size: 1000 })).toMatch("não é uma foto");
    expect(validarArquivo({ type: "image/gif", size: 1000 })).toMatch("não é uma foto");
    expect(validarArquivo({ type: "image/png", size: 0 })).toMatch("vazia");
    expect(validarArquivo({ type: "image/jpeg", size: 30 * 1024 * 1024 })).toMatch("grande demais");
  });

  it("reduz para no máximo 1600 px mantendo a proporção", () => {
    expect(reduzir(4000, 3000)).toEqual({ w: 1600, h: 1200 });
    expect(reduzir(3000, 4000)).toEqual({ w: 1200, h: 1600 });
    expect(reduzir(800, 600)).toEqual({ w: 800, h: 600 });
  });

  it("legenda com data e hora de São Paulo e a localização", () => {
    expect(legendaFoto("2026-11-10T17:05:00.000Z", { lat: -20.46971, lng: -54.62012, precisao_m: 8 }, "Matriz"))
      .toBe("10/11/2026 14:05 · -20.46971, -54.62012 (±8 m) · Matriz");
    expect(legendaFoto("2026-11-10T17:05:00.000Z", null)).toBe("10/11/2026 14:05 · sem localização");
  });
});
