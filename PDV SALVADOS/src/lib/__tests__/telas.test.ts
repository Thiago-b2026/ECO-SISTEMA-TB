import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODELOS, MODULOS, type Modulo } from "@/lib/permissoes";
import { NAV, itemDaRota, itemVisivel } from "@/lib/nav";
import {
  GRUPOS, SISTEMAS, SISTEMAS_EDITAVEIS, TELAS, TELAS_EDITAVEIS, estadoGrupo, estadoSistema, mapaDeLinhas,
  podeVerTela, sistemasDoUsuario, telaDaRota, telasLegado, telasVazias,
} from "@/lib/telas";

const SQL = readFileSync(resolve(process.cwd(), "supabase/migrations/20261108000017_permissao_por_tela.sql"), "utf8");
const CONFERIR = readFileSync(resolve(process.cwd(), "supabase/scripts/conferir_telas_antes.sql"), "utf8");
const CATALOGO = JSON.parse(readFileSync(resolve(process.cwd(), "../MEU SUPERVISOR/sistemas.json"), "utf8")) as { sistemas: { codigo?: string; nome: string }[] };
const tudoVe = () => true;
const nada = new Set<string>();

describe("regra de tela", () => {
  it("é BLOQUEADA por padrão (sem flag = não vê)", () => {
    for (const t of TELAS_EDITAVEIS) expect(podeVerTela(t.codigo, { admin: false, liberadas: nada })).toBe(false);
    expect(Object.values(telasVazias()).every((v) => v === false)).toBe(true);
    expect(mapaDeLinhas([])["pdv.etiquetas"]).toBe(false);
  });

  it("admin vê tudo, inclusive as telas exclusivas do Admin", () => {
    for (const t of TELAS) expect(podeVerTela(t.codigo, { admin: true, liberadas: nada })).toBe(true);
  });

  it("libera só a tela marcada (Etiquetas sem Mercadológico e sem Transferências)", () => {
    const liberadas = new Set(["pdv.etiquetas"]);
    expect(podeVerTela("pdv.etiquetas", { admin: false, liberadas })).toBe(true);
    expect(podeVerTela("pdv.mercadologico", { admin: false, liberadas })).toBe(false);
    expect(podeVerTela("pdv.transferencias", { admin: false, liberadas })).toBe(false);
  });

  it("Login de acesso, Lojas e Usuários do RH são só do Admin (sem checkbox); Pessoas é liberável", () => {
    const so = ["pdv.login_acesso", "pdv.lojas", "rh.usuarios"];
    const liberadas = new Set([...so, "pdv.pessoas"]);
    for (const c of so) {
      expect(podeVerTela(c, { admin: false, liberadas })).toBe(false);
      expect(TELAS_EDITAVEIS.map((t) => t.codigo)).not.toContain(c);
    }
    expect(podeVerTela("pdv.pessoas", { admin: false, liberadas })).toBe(true);
    expect(TELAS.filter((t) => t.somenteAdmin).map((t) => t.codigo).sort()).toEqual([...so].sort());
  });

  it("tela sem controle (Minha conta) continua liberada", () => {
    expect(podeVerTela("pdv.conta_inexistente", { admin: false, liberadas: nada })).toBe(true);
  });
});

describe("3 níveis: sistema → grupo → tela", () => {
  it("estado do SISTEMA e do GRUPO: nenhum, parcial e todos", () => {
    const m = telasVazias();
    expect(estadoSistema(m, "pdv")).toBe("nenhum");
    expect(estadoGrupo(m, "pdv", "estoque")).toBe("nenhum");
    m["pdv.etiquetas"] = true;
    expect(estadoGrupo(m, "pdv", "estoque")).toBe("parcial");
    expect(estadoSistema(m, "pdv")).toBe("parcial");
    expect(estadoSistema(m, "rh")).toBe("nenhum");
    for (const t of TELAS_EDITAVEIS) if (t.grupo === "estoque") m[t.codigo] = true;
    expect(estadoGrupo(m, "pdv", "estoque")).toBe("todos");
    for (const t of TELAS_EDITAVEIS) if (t.sistema === "rh") m[t.codigo] = true;
    expect(estadoSistema(m, "rh")).toBe("todos");
  });

  it("grupos do PDV e do RH como combinado", () => {
    expect(GRUPOS.filter((g) => g.sistema === "pdv").map((g) => g.nome)).toEqual(["Vendas", "Caixa", "Estoque", "Cadastros", "Financeiro", "Relatórios", "CRM"]);
    const rh = (g: string) => TELAS.filter((t) => t.sistema === "rh" && t.grupo === g && !t.somenteAdmin).map((t) => t.codigo);
    expect(rh("lancamentos")).toEqual(["rh.painel", "rh.historico"]);
    expect(rh("consolidado")).toEqual(["rh.global", "rh.empresas"]);
  });

  it("todo código de tela é <sistema>.<tela> e aponta para sistema e grupo existentes", () => {
    for (const t of TELAS) {
      expect(t.codigo.startsWith(t.sistema + "."), t.codigo).toBe(true);
      expect(GRUPOS.some((g) => g.sistema === t.sistema && g.codigo === t.grupo), t.codigo).toBe(true);
    }
  });

  it("editor mostra só sistemas ativos com tela (PDV e RH)", () => {
    expect(SISTEMAS_EDITAVEIS.map((s) => s.codigo)).toEqual(["pdv", "rh"]);
  });

  it("menu Sistemas: só os sistemas em que ele tem pelo menos uma tela", () => {
    expect(sistemasDoUsuario({ admin: false, liberadas: new Set(["pdv.pdv"]) }).map((s) => s.codigo)).toEqual(["pdv"]);
    expect(sistemasDoUsuario({ admin: false, liberadas: new Set(["rh.global"]) }).map((s) => s.codigo)).toEqual(["rh"]);
    expect(sistemasDoUsuario({ admin: false, liberadas: nada })).toEqual([]);
    expect(sistemasDoUsuario({ admin: true, liberadas: nada }).map((s) => s.codigo)).toEqual(["pdv", "rh"]);
    const item = NAV.find((n) => n.menuSistemas)!;
    const base = { podeTela: () => true, pode: () => true };
    expect(itemVisivel(item, { ...base, sistemas: [{ codigo: "pdv" }] })).toBe(false);
    expect(itemVisivel(item, { ...base, sistemas: [{ codigo: "pdv" }, { codigo: "rh" }] })).toBe(true);
  });
});

describe("migração dos usuários atuais (ninguém perde acesso)", () => {
  const menuAntigo = (role: "gerente" | "vendedor" | "estoquista", ver: (m: Modulo) => boolean) =>
    new Set(NAV.filter((n) => n.tela && n.roles.includes(role) && (!n.modulo || ver(n.modulo))).map((n) => n.tela!));

  for (const role of ["gerente", "vendedor", "estoquista"] as const) {
    it(`${role}: as telas migradas são exatamente as que ele via no menu`, () => {
      const migradas = [...telasLegado(role, tudoVe)].filter((c) => c.startsWith("pdv.")).sort();
      expect(migradas).toEqual([...menuAntigo(role, tudoVe)].sort());
    });
  }

  it("respeita área sem 'ver' (vendedor sem CRM não ganha a tela de CRM)", () => {
    const s = telasLegado("vendedor", (m) => m !== "crm");
    expect(s.has("pdv.crm")).toBe(false);
    expect(s.has("pdv.pdv")).toBe(true);
  });

  it("vendedor não ganha Etiquetas nem Financeiro; estoquista não ganha PDV", () => {
    const v = telasLegado("vendedor", tudoVe);
    expect(v.has("pdv.etiquetas")).toBe(false);
    expect(v.has("pdv.financeiro")).toBe(false);
    expect(telasLegado("estoquista", tudoVe).has("pdv.pdv")).toBe(false);
  });

  it("RH: membro ganha Painel/Histórico/Visão Global/Empresas; Usuários do RH nunca (só Admin)", () => {
    const membro = telasLegado("vendedor", tudoVe, { membro: true });
    expect(["rh.painel", "rh.historico", "rh.global", "rh.empresas"].every((c) => membro.has(c))).toBe(true);
    expect(membro.has("rh.usuarios")).toBe(false);
    expect([...telasLegado("gerente", tudoVe)].some((c) => c.startsWith("rh."))).toBe(false);
  });

  it("o SQL da migration e a conferência usam os mesmos perfis e áreas do front", () => {
    for (const t of TELAS.filter((x) => x.sistema === "pdv" && !x.somenteAdmin)) {
      const linha = SQL.split("\n").find((l) => l.includes(`('${t.codigo}',`) && l.includes("array["));
      expect(linha, t.codigo).toBeTruthy();
      for (const p of t.perfis) expect(linha).toContain(`'${p}'`);
      expect(linha).toContain(t.area ? `'${t.area}')` : "null)");
      const conf = CONFERIR.split("\n").find((l) => l.includes(`('${t.codigo}',`));
      expect(conf, `conferência: ${t.codigo}`).toBeTruthy();
      for (const p of t.perfis) expect(conf).toContain(`'${p}'`);
    }
  });
});

describe("catálogo", () => {
  it("toda tela do front existe na migration e vice-versa, com sistema, grupo e somente_admin iguais", () => {
    const doSql = [...SQL.matchAll(/^\s+\('([a-z_]+\.[a-z_]+)',\s+'[^']+',\s+'([a-z]+)',\s+'([a-z]+)',\s+'[^']+',\s+\d+,\s+(true|false)\)/gm)];
    expect(doSql.map((m) => m[1]).sort()).toEqual(TELAS.map((t) => t.codigo).sort());
    for (const m of doSql) {
      const t = TELAS.find((x) => x.codigo === m[1])!;
      expect([m[2], m[3], m[4] === "true"], t.codigo).toEqual([t.sistema, t.grupo, !!t.somenteAdmin]);
    }
  });

  it("sistemas e grupos do front existem na migration", () => {
    for (const s of SISTEMAS) expect(SQL, s.codigo).toMatch(new RegExp(`\\('${s.codigo}',\\s+'${s.nome}'`));
    for (const g of GRUPOS) expect(SQL, g.codigo).toMatch(new RegExp(`\\('${g.sistema}',\\s+'${g.codigo}',\\s+'${g.nome}'`));
  });

  it("MEU SUPERVISOR/sistemas.json tem o mesmo código de cada sistema", () => {
    const codigos = CATALOGO.sistemas.map((s) => s.codigo).sort();
    expect(codigos).toEqual(SISTEMAS.map((s) => s.codigo).sort());
    for (const s of SISTEMAS) expect(CATALOGO.sistemas.find((x) => x.codigo === s.codigo)?.nome).toBe(s.nome);
  });

  it("todo item do menu (menos Minha conta e Sistemas) tem tela do PDV com a mesma rota", () => {
    for (const n of NAV) {
      if (n.to === "/conta" || n.menuSistemas) continue;
      expect(n.tela, n.to).toBeTruthy();
      expect(TELAS.find((t) => t.codigo === n.tela)?.rota, n.to).toBe(n.to);
      expect(n.tela!.startsWith("pdv."), n.to).toBe(true);
    }
  });

  it("rota filha usa a tela do pai", () => {
    expect(itemDaRota("/lotes/123")?.tela).toBe("pdv.lotes");
    expect(telaDaRota("/lotes/123")?.codigo).toBe("pdv.lotes");
    expect(telaDaRota("/historico", "rh")?.codigo).toBe("rh.historico");
    expect(telaDaRota("/", "rh")?.codigo).toBe("rh.painel");
  });

  it("modelos prontos cobrem todas as telas editáveis", () => {
    for (const md of MODELOS) expect(Object.keys(md.telas).sort()).toEqual(TELAS_EDITAVEIS.map((t) => t.codigo).sort());
    const v = MODELOS.find((m) => m.id === "vendedor")!;
    expect(v.telas["pdv.pdv"]).toBe(true);
    expect(v.telas["pdv.financeiro"]).toBe(false);
    expect(MODELOS.find((m) => m.id === "tudo")!.telas["rh.global"]).toBe(true);
    expect(MODELOS.find((m) => m.id === "gerente")!.telas["rh.global"]).toBe(false);
  });

  it("toda área usada por uma tela existe", () => {
    const areas = MODULOS.map((m) => m.id);
    for (const t of TELAS) if (t.area) expect(areas).toContain(t.area);
  });
});
