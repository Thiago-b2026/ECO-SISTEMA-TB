import { describe, expect, it } from "vitest";
import { codigosDeModelo, linhaNaoEhProduto, notaSemelhanca, situacaoPelaNota } from "@/lib/similaridade";

// Casos reais do lote "LOTE MOGI 220V NOVEMB" (planilha PRODUTOS_POR_CATEGORIA_LOTES_1_A_4.xlsx)
describe("nota de semelhança da busca da planilha", () => {
  it("acha os códigos de modelo", () => {
    expect(codigosDeModelo("Micro-ondas MHP35S2")).toEqual(["mhp35s2"]);
    expect(codigosDeModelo("Liquidificador L-99-FB")).toEqual(["l99fb"]);
    expect(codigosDeModelo("Liquidificador Turbo Mondial 1200W L-1200RL 220V")).toEqual(["l1200rl"]);
    expect(codigosDeModelo("Ventilador oscilante coluna turbo 6 40cm 220v")).toEqual([]);
  });

  it("produto certo com o modelo: nota alta", () => {
    expect(notaSemelhanca("Micro-ondas PMO30F", "Micro-Ondas PMO30F Flat 28L Preto Espelhado Philco 220V", 799, 587).nota).toBe(100);
    expect(notaSemelhanca("Micro-ondas MEO44", "Micro-ondas Electrolux 34l Branco Meo44").nota).toBeGreaterThanOrEqual(90);
  });

  it("outro modelo da mesma família: não aceita", () => {
    const r = notaSemelhanca("Micro-ondas MHP35S2", "Micro-ondas Luoruil");
    expect(r.nota).toBeLessThan(50);
    expect(r.motivos.join()).toContain("MHP35S2");
    expect(notaSemelhanca("Microondas MHP35B2 220v", "Microondas Mecânico Nex Microondas 20l 1200w 5 potência").nota).toBeLessThan(50);
  });

  it("peça ou acessório: não aceita", () => {
    expect(notaSemelhanca("Micro-ondas ME36B", "Membrana Painel Controle Micro-ondas Me36b A21371701").nota).toBeLessThan(80);
    expect(notaSemelhanca("Liquidificador L-99-FB", "Motor Do Liquidificador L-99-fb Mondial").nota).toBeLessThan(80);
    expect(notaSemelhanca("Micro-ondas MO-01-21-B", "Prato Com Rodizio Do Micro-ondas Mo-01-21-b Mondial").nota).toBeLessThan(80);
  });

  it("componente citado depois do nome do produto não é peça", () => {
    expect(notaSemelhanca("Liquidificador Philips 220V", "Liquidificador Philips Walita com jarra de vidro 220V").nota).toBeGreaterThanOrEqual(90);
    expect(notaSemelhanca("Aspirador vertical Philco PH110AZ", "Aspirador Vertical Philco PH110AZ com escova e bateria").nota).toBeGreaterThanOrEqual(90);
    expect(notaSemelhanca("Micro-ondas ME36B", "Kit Prato Micro-ondas Compatível Me36b").nota).toBeLessThan(50);
    expect(notaSemelhanca("Micro-ondas ME36B", "Capacitor P/ Micro-ondas Electrolux Me36b").nota).toBeLessThan(50);
    expect(notaSemelhanca("Microondas MO-02-34 220v", "Transformador Gal-900e 220v Para Microondas Mo-02-34").nota).toBeLessThan(50);
  });

  it("voltagem trocada e preço muito longe derrubam", () => {
    expect(notaSemelhanca("Fritadeira airfry 10l 220v", "Forno E Fritadeira Airfry 10l 127v").motivos.join()).toContain("voltagem");
    expect(notaSemelhanca("Micro-ondas PMO23E", "Micro-ondas PMO23E Philco", 899, 78.99).motivos.join()).toContain("preço");
  });

  it("kit de várias unidades vai para conferência", () => {
    const r = notaSemelhanca("Ventilador oscilante de parede Ventisol New 60cm 220V", "Kit 2 Ventiladores De Parede Ventisol New 60 Oscilante 220V");
    expect(r.nota).toBeLessThan(90);
    expect(notaSemelhanca("Kit 2 tigelas batedeira", "Kit 2 tigelas batedeira inox").nota).toBeGreaterThanOrEqual(90);
  });

  it("situação pela nota", () => {
    expect(situacaoPelaNota(95, 90)).toBe("sucesso");
    expect(situacaoPelaNota(70, 90)).toBe("similar");
    expect(situacaoPelaNota(35, 90)).toBe("nao_encontrado");
  });

  it("linhas que não são produto", () => {
    expect(linhaNaoEhProduto("SUBTOTAL MICRO-ONDAS")).toBe(true);
    expect(linhaNaoEhProduto("Sub-total aspirador")).toBe(true);
    expect(linhaNaoEhProduto("TOTAL GERAL")).toBe(true);
    expect(linhaNaoEhProduto("800.9")).toBe(true);
    expect(linhaNaoEhProduto("Micro-ondas PMO30F")).toBe(false);
  });
});
