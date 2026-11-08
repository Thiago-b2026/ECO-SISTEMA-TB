import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODELOS, MODULOS, type Modulo } from "@/lib/permissoes";
import { NAV, itemDaRota, itemVisivel } from "@/lib/nav";
import {
  TELAS, TELAS_EDITAVEIS, estadoModulo, mapaDeLinhas, podeVerTela, telaDaRota, telasLegado, telasVazias,
} from "@/lib/telas";

const SQL = readFileSync(resolve(process.cwd(), "supabase/migrations/20261108000017_permissao_por_tela.sql"), "utf8");
const CONFERIR = readFileSync(resolve(process.cwd(), "supabase/scripts/conferir_telas_antes.sql"), "utf8");
const tudoVe = () => true;
const nada = new Set<string>();

describe("regra de tela", () => {
  it("é BLOQUEADA por padrão (sem flag = não vê)", () => {
    for (const t of TELAS_EDITAVEIS) expect(podeVerTela(t.codigo, { admin: false, liberadas: nada })).toBe(false);
    expect(Object.values(telasVazias()).every((v) => v === false)).toBe(true);
    expect(mapaDeLinhas([])["estoque.etiquetas"]).toBe(false);
  });

  it("admin vê tudo, inclusive as telas exclusivas do Admin", () => {
    for (const t of TELAS) expect(podeVerTela(t.codigo, { admin: true, liberadas: nada })).toBe(true);
  });

  it("libera só a tela marcada (Etiquetas sem Mercadológico e sem Transferências)", () => {
    const liberadas = new Set(["estoque.etiquetas"]);
    expect(podeVerTela("estoque.etiquetas", { admin: false, liberadas })).toBe(true);
    expect(podeVerTela("estoque.mercadologico", { admin: false, liberadas })).toBe(false);
    expect(podeVerTela("estoque.transferencias", { admin: false, liberadas })).toBe(false);
  });

  it("Login de acesso e Lojas são só do Admin, mesmo com flag; Pessoas é liberável", () => {
    const liberadas = new Set(["cadastros.login_acesso", "cadastros.lojas", "cadastros.pessoas"]);
    expect(podeVerTela("cadastros.login_acesso", { admin: false, liberadas })).toBe(false);
    expect(podeVerTela("cadastros.lojas", { admin: false, liberadas })).toBe(false);
    expect(podeVerTela("cadastros.pessoas", { admin: false, liberadas })).toBe(true);
    expect(TELAS_EDITAVEIS.map((t) => t.codigo)).not.toContain("cadastros.login_acesso");
    expect(TELAS_EDITAVEIS.map((t) => t.codigo)).toContain("cadastros.pessoas");
  });

  it("tela sem controle (Minha conta) continua liberada", () => {
    expect(podeVerTela("conta", { admin: false, liberadas: nada })).toBe(true);
  });

  it("estado do módulo: todos, nenhum e parcial", () => {
    const m = telasVazias();
    expect(estadoModulo(m, "estoque")).toBe("nenhum");
    m["estoque.etiquetas"] = true;
    expect(estadoModulo(m, "estoque")).toBe("parcial");
    for (const t of TELAS_EDITAVEIS) if (t.modulo === "estoque") m[t.codigo] = true;
    expect(estadoModulo(m, "estoque")).toBe("todos");
  });
});

describe("migração dos usuários atuais (ninguém perde acesso)", () => {
  // Acesso de hoje = o que o menu antigo mostrava: perfil na lista + área com "ver".
  const menuAntigo = (role: "gerente" | "vendedor" | "estoquista", ver: (m: Modulo) => boolean) =>
    new Set(NAV.filter((n) => n.tela && !n.externo && n.roles.includes(role) && (!n.modulo || ver(n.modulo))).map((n) => n.tela!));

  for (const role of ["gerente", "vendedor", "estoquista"] as const) {
    it(`${role}: as telas migradas são exatamente as que ele via no menu`, () => {
      const migradas = [...telasLegado(role, tudoVe)].filter((c) => !c.startsWith("rh.")).sort();
      expect(migradas).toEqual([...menuAntigo(role, tudoVe)].sort());
    });
  }

  it("respeita área sem 'ver' (vendedor sem CRM não ganha a tela de CRM)", () => {
    const ver = (m: Modulo) => m !== "crm";
    const s = telasLegado("vendedor", ver);
    expect(s.has("crm.whatsapp")).toBe(false);
    expect(s.has("vendas.pdv")).toBe(true);
  });

  it("vendedor não ganha Etiquetas nem Financeiro; estoquista não ganha PDV", () => {
    const v = telasLegado("vendedor", tudoVe);
    expect(v.has("estoque.etiquetas")).toBe(false);
    expect(v.has("financeiro.financeiro")).toBe(false);
    expect(telasLegado("estoquista", tudoVe).has("vendas.pdv")).toBe(false);
  });

  it("RH: membro ganha Painel/Histórico/Visão Global/Empresas; Usuários só Dono/Admin da empresa", () => {
    const membro = telasLegado("vendedor", tudoVe, { membro: true, gestor: false });
    expect(["rh.painel", "rh.historico", "rh.global", "rh.empresas"].every((c) => membro.has(c))).toBe(true);
    expect(membro.has("rh.usuarios")).toBe(false);
    expect(telasLegado("vendedor", tudoVe, { membro: true, gestor: true }).has("rh.usuarios")).toBe(true);
    expect([...telasLegado("gerente", tudoVe)].some((c) => c.startsWith("rh."))).toBe(false);
  });

  it("o SQL da migration usa os mesmos perfis e áreas do front", () => {
    for (const t of TELAS.filter((x) => x.app === "eco" && !x.somenteAdmin)) {
      const linha = SQL.split("\n").find((l) => l.includes(`('${t.codigo}',`) && l.includes("array["));
      expect(linha, t.codigo).toBeTruthy();
      for (const p of t.perfis) expect(linha).toContain(`'${p}'`);
      expect(linha).toContain(t.area ? `'${t.area}')` : "null)");
      expect(CONFERIR).toContain(`'${t.codigo}'`);
    }
  });
});

describe("catálogo de telas", () => {
  it("toda tela do front existe na migration e vice-versa", () => {
    for (const t of TELAS) expect(SQL).toContain(`('${t.codigo}',`);
    const doSql = [...SQL.matchAll(/^\s+\('([a-z_]+\.[a-z_]+)',\s+'[^']+',\s+'[a-z]+',/gm)].map((m) => m[1]);
    expect(doSql.sort()).toEqual(TELAS.map((t) => t.codigo).sort());
  });

  it("todo item do menu (menos Minha conta e links externos) tem tela cadastrada", () => {
    for (const n of NAV) {
      if (n.to === "/conta" || n.externo) continue;
      expect(n.tela, n.to).toBeTruthy();
      expect(TELAS.find((t) => t.codigo === n.tela)?.rota, n.to).toBe(n.to);
    }
  });

  it("rota filha usa a tela do pai", () => {
    expect(itemDaRota("/lotes/123")?.tela).toBe("estoque.lotes");
    expect(telaDaRota("/lotes/123")?.codigo).toBe("estoque.lotes");
    expect(telaDaRota("/historico", "rh")?.codigo).toBe("rh.historico");
    expect(telaDaRota("/", "rh")?.codigo).toBe("rh.painel");
  });

  it("atalho Gestão RH só aparece para quem tem tela de RH", () => {
    const rh = NAV.find((n) => n.externo)!;
    const base = { podeTela: () => true, pode: () => true };
    expect(itemVisivel(rh, { ...base, temRh: false })).toBe(false);
    expect(itemVisivel(rh, { ...base, temRh: true })).toBe(true);
  });

  it("modelos prontos cobrem todas as telas editáveis", () => {
    for (const md of MODELOS) expect(Object.keys(md.telas).sort()).toEqual(TELAS_EDITAVEIS.map((t) => t.codigo).sort());
    const v = MODELOS.find((m) => m.id === "vendedor")!;
    expect(v.telas["vendas.pdv"]).toBe(true);
    expect(v.telas["financeiro.financeiro"]).toBe(false);
    expect(MODELOS.find((m) => m.id === "tudo")!.telas["rh.global"]).toBe(true);
    expect(MODELOS.find((m) => m.id === "gerente")!.telas["rh.global"]).toBe(false);
  });

  it("toda área usada por uma tela existe", () => {
    const areas = MODULOS.map((m) => m.id);
    for (const t of TELAS) if (t.area) expect(areas).toContain(t.area);
  });
});
