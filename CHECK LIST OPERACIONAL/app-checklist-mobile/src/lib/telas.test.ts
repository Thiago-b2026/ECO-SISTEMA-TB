import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TELAS_APP, podeVerTela, telaDaRota } from "./telas";

const MIG = resolve(import.meta.dirname, "../../../../GESTAO SALVADOS/supabase/migrations");
const SQL = ["20261110000023_checklist_telas.sql", "20261110000024_checklist_empresas.sql", "20261111000025_checklist_tempos_tela.sql"].map((f) => readFileSync(resolve(MIG, f), "utf8")).join("\n");

describe("telas do Check List no Ecossistema", () => {
  it("mesmos códigos, rotas e grupos da migration do PDV", () => {
    const doSql = [...SQL.matchAll(/\('(checklist\.[a-z_]+)',\s+'([^']+)',\s+'checklist',\s+'([a-z]+)',\s+'([^']+)',\s+\d+,\s+(true|false)\)/g)]
      .map((m) => ({ codigo: m[1], nome: m[2], grupo: m[3], rota: m[4], somenteAdmin: m[5] === "true" }));
    const porCodigo = <T extends { codigo: string }>(xs: T[]) => [...xs].sort((a, b) => a.codigo.localeCompare(b.codigo));
    expect(porCodigo(doSql)).toEqual(porCodigo(TELAS_APP.map(({ codigo, nome, grupo, rota, somenteAdmin }) => ({ codigo, nome, grupo, rota, somenteAdmin: !!somenteAdmin }))));
  });

  it("Empresas e lojas é só do admin", () => {
    const todas = new Set(TELAS_APP.map((t) => t.codigo));
    expect(podeVerTela("checklist.empresas", { liberadas: todas, perfil: "gestor" })).toBe(false);
    expect(podeVerTela("checklist.empresas", { admin: true, liberadas: new Set(), perfil: "gestor" })).toBe(true);
  });

  it("sem tela liberada = bloqueada; consulta com erro não bloqueia todo mundo", () => {
    expect(podeVerTela("checklist.hoje", { liberadas: new Set(), perfil: "operador" })).toBe(false);
    expect(podeVerTela("checklist.hoje", { liberadas: new Set(["checklist.hoje"]), perfil: "operador" })).toBe(true);
    expect(podeVerTela("checklist.hoje", { liberadas: null, perfil: "operador" })).toBe(true);
  });

  it("perfil mínimo vale mesmo com a tela liberada", () => {
    const todas = new Set(TELAS_APP.map((t) => t.codigo));
    expect(podeVerTela("checklist.dashboard", { liberadas: todas, perfil: "operador" })).toBe(false);
    expect(podeVerTela("checklist.dashboard", { liberadas: todas, perfil: "supervisor" })).toBe(true);
    expect(podeVerTela("checklist.modelos", { liberadas: todas, perfil: "supervisor" })).toBe(false);
    expect(podeVerTela("checklist.hoje", { liberadas: todas, perfil: null })).toBe(false);
  });

  it("rota filha usa a tela do pai", () => {
    expect(telaDaRota("/execucao/abc")?.codigo).toBe("checklist.hoje");
    expect(telaDaRota("/planos/123")?.codigo).toBe("checklist.planos");
    expect(telaDaRota("/")?.codigo).toBe("checklist.hoje");
  });
});
