import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decidirModo } from "../data/conexao";
import { lerNumero, mesAtual, mesCurto, mesLongo, nomeFaixa, somarMeses, ultimosMeses } from "./formato";
import { podeVerTela, TELAS_APP, telaDaRota, telaInicial } from "./telas";

describe("meses (fuso de São Paulo)", () => {
  it("mês atual é o de São Paulo, não o de Londres", () => {
    expect(mesAtual(new Date("2026-12-01T02:00:00Z"))).toBe("2026-11-01"); // 23h de 30/11 em SP
    expect(mesAtual(new Date("2026-12-01T04:00:00Z"))).toBe("2026-12-01");
  });
  it("soma e subtrai meses atravessando o ano", () => {
    expect(somarMeses("2026-01-01", -1)).toBe("2025-12-01");
    expect(somarMeses("2026-11-01", 3)).toBe("2027-02-01");
    expect(ultimosMeses(3, "2026-02-01")).toEqual(["2025-12-01", "2026-01-01", "2026-02-01"]);
  });
  it("nomes", () => {
    expect(mesCurto("2026-11-01")).toBe("11/2026");
    expect(mesLongo("2026-03-01")).toBe("março de 2026");
    expect(nomeFaixa("minima", 0.9)).toBe("Meta mínima (90%)");
    expect(nomeFaixa("100", 0.9)).toBe("Meta 100%");
  });
  it("lê número digitado em português", () => {
    expect(lerNumero("1.234,56")).toBe(1234.56);
    expect(lerNumero("1234.5")).toBe(1234.5);
    expect(lerNumero("")).toBe(0);
    expect(lerNumero("abc")).toBeNaN();
  });
});

describe("telas", () => {
  it("são as mesmas da migration 0027 do PDV (códigos, rotas e ações)", () => {
    const sql = readFileSync(resolve(import.meta.dirname, "../../../GESTAO SALVADOS/supabase/migrations/20261115000027_metas_telas.sql"), "utf8");
    for (const t of TELAS_APP) {
      expect(sql, t.codigo).toMatch(new RegExp(`\\('${t.codigo}',\\s+'${t.nome}',\\s+'metas',\\s+'${t.grupo}',\\s+'${t.rota}'`));
      const acoes = sql.match(new RegExp(`\\('${t.codigo}',\\s+array\\[([^\\]]+)\\]\\)`))?.[1].replace(/'/g, "").split(",");
      expect(acoes, t.codigo).toEqual(t.acoes);
    }
    expect([...sql.matchAll(/\('(metas\.[a-z_]+)',\s+'[^']+',\s+'metas'/g)].length).toBe(TELAS_APP.length);
  });
  it("tela sem flag fica bloqueada; admin vê tudo; consulta com erro não bloqueia todo mundo", () => {
    const so = new Set(["metas.meu_desempenho"]);
    expect(podeVerTela("metas.dashboard", { liberadas: so })).toBe(false);
    expect(podeVerTela("metas.meu_desempenho", { liberadas: so })).toBe(true);
    expect(podeVerTela("metas.dashboard", { admin: true, liberadas: new Set() })).toBe(true);
    expect(podeVerTela("metas.dashboard", { liberadas: null })).toBe(true);
  });
  it("tela de entrada: gestão cai no Dashboard, vendedor no Meu desempenho", () => {
    expect(telaInicial({ admin: true, liberadas: new Set() })?.codigo).toBe("metas.dashboard");
    expect(telaInicial({ liberadas: new Set(["metas.ranking", "metas.meu_desempenho"]) })?.codigo).toBe("metas.meu_desempenho");
    expect(telaInicial({ liberadas: new Set() })).toBeUndefined();
  });
  it("rota → tela", () => {
    expect(telaDaRota("/meu-desempenho")?.codigo).toBe("metas.meu_desempenho");
    expect(telaDaRota("/nada")).toBeUndefined();
  });
});

describe("modo de conexão", () => {
  it("produção sem variáveis NUNCA abre a demonstração", () => {
    expect(decidirModo({ prod: true })).toBe("erro_config");
    expect(decidirModo({ prod: false })).toBe("demo");
    expect(decidirModo({ prod: true, url: "u", chave: "c" })).toBe("supabase");
    expect(decidirModo({ prod: true, demo: "1" })).toBe("demo");
  });
});
