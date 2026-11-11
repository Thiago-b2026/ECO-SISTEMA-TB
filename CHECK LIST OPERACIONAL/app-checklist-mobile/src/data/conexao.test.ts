import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { decidirModo } from "./conexao";

describe("modo de conexão (segurança do modo demonstração)", () => {
  it("produção sem variáveis = erro de configuração (nunca abre a demonstração)", () => {
    expect(decidirModo({ prod: true })).toBe("erro_config");
    expect(decidirModo({ prod: true, url: "https://x.supabase.co" })).toBe("erro_config");
  });
  it("com as variáveis = Supabase; demonstração só no dev ou com VITE_MODO_DEMO=1", () => {
    expect(decidirModo({ prod: true, url: "https://x.supabase.co", chave: "k" })).toBe("supabase");
    expect(decidirModo({ prod: false })).toBe("demo");
    expect(decidirModo({ prod: true, demo: "1" })).toBe("demo");
    expect(decidirModo({ prod: false, url: "https://x.supabase.co", chave: "k" })).toBe("supabase");
  });
});
