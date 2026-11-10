import { describe, expect, it } from "vitest";
import { linkWhatsApp, montarMensagem, normalizarTelefone } from "@/lib/whatsapp";

describe("whatsapp", () => {
  it("monta a mensagem com nome e produtos", () => {
    const m = montarMensagem("Oi {primeiro_nome}! Chegou:\n{produtos}", { nome: "MARIA SILVA", produtos: [{ titulo: "Air Fryer", preco: 199.9 }] });
    expect(m).toContain("Oi Maria!");
    expect(m).toContain("• Air Fryer — R$");
    expect(montarMensagem("Olá {nome}", {})).toBe("Olá cliente");
  });
  it("normaliza telefone", () => {
    expect(normalizarTelefone("(67) 99999-1234")).toBe("5567999991234");
    expect(normalizarTelefone("5567999991234")).toBe("5567999991234");
    expect(normalizarTelefone("1234")).toBeNull();
  });
  it("gera o link", () => {
    expect(linkWhatsApp("5567999991234", "oi tudo bem")).toBe("https://wa.me/5567999991234?text=oi%20tudo%20bem");
  });
});
