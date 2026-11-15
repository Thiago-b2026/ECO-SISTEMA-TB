// Testes do schema metas num Postgres de verdade (PGlite), SEM tocar no banco de produção.
import { beforeAll, describe, expect, it } from "vitest";
import { como, falha, linhas, novoBanco, rodarMigrations, type Banco } from "./db";

const U = {
  admin: "00000000-0000-4000-8000-000000000001",
  gerente: "00000000-0000-4000-8000-000000000002", // tudo na loja A
  vendA: "00000000-0000-4000-8000-000000000003", // vendedor da A, lança o próprio resultado
  vendA2: "00000000-0000-4000-8000-000000000004", // vendedor da A, só vê
  vendB: "00000000-0000-4000-8000-000000000005", // vendedor da B
  estranho: "00000000-0000-4000-8000-000000000006", // logado, sem nada liberado
};
const REDE = "40000000-0000-4000-8000-00000000000a";
const LOJA_A = "10000000-0000-4000-8000-00000000000a";
const LOJA_B = "10000000-0000-4000-8000-00000000000b";
const LOJA_SEM = "10000000-0000-4000-8000-00000000000c"; // não usa o Meta de Vendas
const V = {
  a: "20000000-0000-4000-8000-00000000000a",
  a2: "20000000-0000-4000-8000-0000000000a2",
  b: "20000000-0000-4000-8000-00000000000b",
  semLogin: "20000000-0000-4000-8000-0000000000a3",
};
const NOV = "2026-11-01";
const OUT = "2026-10-01";

const TELAS: [string, string[]][] = [
  ["metas.dashboard", ["ver"]],
  ["metas.lancamentos", ["ver", "inserir", "editar", "excluir"]],
  ["metas.ranking", ["ver"]],
  ["metas.meu_desempenho", ["ver", "editar"]],
  ["metas.historico", ["ver", "exportar"]],
  ["metas.vendedores", ["ver", "inserir", "editar"]],
  ["metas.configuracao", ["ver", "editar", "fechar_mes"]],
  ["metas.empresas", ["ver", "inserir", "editar"]],
  ["metas.usuarios", ["ver", "inserir", "editar"]],
];

let db: Banco;
const sql = <T = Record<string, unknown>>(u: string | null, q: string, p: unknown[] = []) => como(db, u, () => linhas<T>(db, q, p));
const deve = (u: string | null, q: string, p: unknown[], trecho: string | RegExp) => como(db, u, () => falha(db, q, p, trecho));

async function liberar(usuario: string, loja: string, telas: [string, string[]][]) {
  for (const [tela, acoes] of telas)
    for (const acao of acoes)
      await db.query(`insert into public.usuario_permissoes (user_id, unidade_id, tela_codigo, acao, permitido) values ($1, $2, $3, $4, true)`,
        [usuario, loja, tela, acao]);
}

async function lancar(u: string, vendedor: string, mes: string, fat: number, cli = 0, loja: string = LOJA_A) {
  return sql(u, `insert into metas.lancamentos (vendedor_id, loja_id, mes_referencia, faturamento_realizado, clientes_engajados)
                 values ($1, $2, $3, $4, $5) returning loja_id`, [vendedor, loja, mes, fat, cli]);
}

beforeAll(async () => {
  db = await novoBanco();
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U).map((u) => `('${u}')`).join(", ")};
    insert into public.admins_stub (user_id) values ('${U.admin}');
    insert into public.redes (id, nome) values ('${REDE}', 'SUPERMIX BRAZ');
    insert into public.lojas (id, nome, rede_id, sistemas) values
      ('${LOJA_A}', 'Loja A', '${REDE}', array['metas']),
      ('${LOJA_B}', 'Loja B', '${REDE}', array['metas']),
      ('${LOJA_SEM}', 'Loja sem metas', '${REDE}', array['pdv']);
  `);
  // as telas e ações vêm da migration real do PDV (20261115000027_metas_telas.sql)
  await liberar(U.gerente, LOJA_A, TELAS.filter(([t]) => !["metas.empresas", "metas.usuarios"].includes(t)));
  await liberar(U.vendA, LOJA_A, [["metas.meu_desempenho", ["ver", "editar"]], ["metas.ranking", ["ver"]]]);
  await liberar(U.vendA2, LOJA_A, [["metas.meu_desempenho", ["ver"]]]);
  await liberar(U.vendB, LOJA_B, [["metas.meu_desempenho", ["ver", "editar"]], ["metas.ranking", ["ver"]]]);
});

describe("catálogo de telas (migration 0027 do PDV)", () => {
  it("tem exatamente as telas e ações que as regras do banco usam", async () => {
    const r = await sql<{ tela_codigo: string; acoes: string[] }>(null,
      `select tela_codigo, array_agg(acao order by acao) acoes from public.tela_acoes where tela_codigo like 'metas.%' group by 1 order by 1`);
    const esperado = TELAS.map(([t, a]) => ({ tela_codigo: t, acoes: [...a].sort() })).sort((x, y) => x.tela_codigo.localeCompare(y.tela_codigo));
    expect(r).toEqual(esperado);
  });

  it("toda ação usada por public.pode() no schema metas está no catálogo da tela", async () => {
    const usadas = new Set<string>();
    const src = await sql<{ def: string }>(null,
      `select concat_ws(' ', pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)) def
         from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'metas'`);
    for (const { def } of src) for (const m of def.matchAll(/pode\('(metas\.[a-z_]+)'::text, '([a-z_]+)'::text/g)) usadas.add(`${m[1]}/${m[2]}`);
    expect(usadas.size).toBeGreaterThan(5);
    const catalogo = new Set(TELAS.flatMap(([t, a]) => a.map((x) => `${t}/${x}`)));
    for (const u of usadas) expect(catalogo.has(u), u).toBe(true);
  });

  it("sistema ativo, sem url até a publicação, e a ação 'fechar_mes' existe", async () => {
    expect(await sql(null, `select ativo, url from public.sistemas where codigo = 'metas'`)).toEqual([{ ativo: true, url: null }]);
    expect(await sql(null, `select especial from public.acoes where codigo = 'fechar_mes'`)).toEqual([{ especial: true }]);
  });
});

describe("migration", () => {
  it("roda de novo sem erro e sem apagar nada (idempotente)", async () => {
    await sql(U.gerente, `insert into metas.vendedores (id, loja_id, user_id, nome) values ($1, $2, $3, 'Ana')`, [V.a, LOJA_A, U.vendA]);
    await rodarMigrations(db);
    expect(await sql(null, `select nome from metas.vendedores`)).toEqual([{ nome: "Ana" }]);
  });
});

describe("vendedores", () => {
  it("o gerente cadastra na loja dele, mas não na outra", async () => {
    await sql(U.gerente, `insert into metas.vendedores (id, loja_id, user_id, nome) values ($1, $2, $3, 'Bruno')`, [V.a2, LOJA_A, U.vendA2]);
    await sql(U.gerente, `insert into metas.vendedores (id, loja_id, nome) values ($1, $2, 'Carla (sem login)')`, [V.semLogin, LOJA_A]);
    await deve(U.gerente, `insert into metas.vendedores (loja_id, nome) values ($1, 'Intruso')`, [LOJA_B], /row-level security/);
    await sql(U.admin, `insert into metas.vendedores (id, loja_id, user_id, nome) values ($1, $2, $3, 'Davi')`, [V.b, LOJA_B, U.vendB]);
  });

  it("unidade que não usa o Meta de Vendas é recusada (até para o admin)", async () => {
    await deve(U.admin, `insert into metas.vendedores (loja_id, nome) values ($1, 'X')`, [LOJA_SEM], "não usa o Meta de Vendas");
  });

  it("vendedor não cadastra nem edita vendedores", async () => {
    await deve(U.vendA, `insert into metas.vendedores (loja_id, nome) values ($1, 'Eu de novo')`, [LOJA_A], /row-level security/);
    const r = await sql(U.vendA, `update metas.vendedores set nome = 'Hack' where id = $1 returning id`, [V.a2]);
    expect(r).toHaveLength(0);
  });

  it("quem não tem nada liberado não vê ninguém; vendedor vê os da própria loja", async () => {
    expect(await sql(U.estranho, `select id from metas.vendedores`)).toHaveLength(0);
    const daA = await sql<{ nome: string }>(U.vendA, `select nome from metas.vendedores order by nome`);
    expect(daA.map((v) => v.nome)).toEqual(["Ana", "Bruno", "Carla (sem login)"]);
    expect(await sql(U.vendB, `select nome from metas.vendedores`)).toEqual([{ nome: "Davi" }]);
  });
});

describe("meta do mês", () => {
  it("o gerente define; mês que não começa no dia 1 e valor negativo são recusados", async () => {
    await sql(U.gerente, `insert into metas.configuracao_meta (loja_id, mes_referencia, meta_total, percentual_minimo, premio_meta_100, premio_meta_90, valor_por_cliente_engajado)
                          values ($1, $2, 136000, 0.90, 4000, 1500, 0.50)`, [LOJA_A, NOV]);
    await deve(U.gerente, `insert into metas.configuracao_meta (loja_id, mes_referencia) values ($1, '2026-12-15')`, [LOJA_A], /check constraint/);
    await deve(U.gerente, `insert into metas.configuracao_meta (loja_id, mes_referencia, meta_total) values ($1, '2026-12-01', -1)`, [LOJA_A], /check constraint/);
  });

  it("o vendedor vê a meta da loja, mas não altera", async () => {
    expect(await sql(U.vendA, `select meta_total from metas.configuracao_meta`)).toEqual([{ meta_total: "136000.00" }]);
    expect(await sql(U.vendA, `update metas.configuracao_meta set meta_total = 1 returning id`)).toHaveLength(0);
    await deve(U.vendA, `insert into metas.configuracao_meta (loja_id, mes_referencia) values ($1, $2)`, [LOJA_A, OUT], /row-level security/);
  });

  it("a meta da loja A não aparece para a loja B", async () => {
    expect(await sql(U.vendB, `select id from metas.configuracao_meta`)).toHaveLength(0);
  });
});

describe("lançamentos", () => {
  it("a unidade do lançamento vem do vendedor, não do que foi enviado", async () => {
    const [r] = await lancar(U.gerente, V.a2, NOV, 50000, 10, LOJA_B);
    expect(r.loja_id).toBe(LOJA_A);
  });

  it("o vendedor com 'Meu desempenho → editar' lança e corrige o próprio resultado", async () => {
    await lancar(U.vendA, V.a, NOV, 80000, 40);
    const r = await sql(U.vendA, `update metas.lancamentos set faturamento_realizado = 82000 where vendedor_id = $1 returning faturamento_realizado`, [V.a]);
    expect(r).toEqual([{ faturamento_realizado: "82000.00" }]);
  });

  it("o vendedor não lança para um colega nem apaga lançamentos", async () => {
    await deve(U.vendA, `insert into metas.lancamentos (vendedor_id, loja_id, mes_referencia) values ($1, $2, $3)`, [V.semLogin, LOJA_A, NOV], /row-level security/);
    expect(await sql(U.vendA, `delete from metas.lancamentos where vendedor_id = $1 returning id`, [V.a])).toHaveLength(0);
  });

  it("vendedor só com 'ver' não lança nem o próprio resultado", async () => {
    await deve(U.vendA2, `insert into metas.lancamentos (vendedor_id, loja_id, mes_referencia) values ($1, $2, $3)`, [V.a2, LOJA_A, OUT], /row-level security/);
  });

  it("o ranking: vendedores da loja A veem todos da A e nada da B", async () => {
    await lancar(U.vendB, V.b, NOV, 30000, 5, LOJA_B);
    expect(await sql(U.vendA, `select vendedor_id from metas.lancamentos`)).toHaveLength(2);
    expect(await sql(U.vendB, `select vendedor_id from metas.lancamentos`)).toEqual([{ vendedor_id: V.b }]);
    expect(await sql(U.estranho, `select id from metas.lancamentos`)).toHaveLength(0);
    expect(await sql(U.admin, `select id from metas.lancamentos`)).toHaveLength(3);
  });

  it("não troca o vendedor nem o mês de um lançamento; o mesmo mês não se repete", async () => {
    await deve(U.gerente, `update metas.lancamentos set mes_referencia = $2 where vendedor_id = $1`, [V.a, OUT], "Não é possível trocar");
    await deve(U.gerente, `insert into metas.lancamentos (vendedor_id, loja_id, mes_referencia) values ($1, $2, $3)`, [V.a, LOJA_A, NOV], /duplicate key|unique/);
  });

  it("vendedor inativo não recebe lançamento; os antigos continuam", async () => {
    await sql(U.gerente, `update metas.vendedores set ativo = false where id = $1`, [V.semLogin]);
    await deve(U.gerente, `insert into metas.lancamentos (vendedor_id, loja_id, mes_referencia) values ($1, $2, $3)`, [V.semLogin, LOJA_A, NOV], "Vendedor inativo");
    await sql(U.gerente, `update metas.vendedores set ativo = true where id = $1`, [V.semLogin]);
  });

  it("vendedores não são apagados (só inativados)", async () => {
    await deve(U.admin, `delete from metas.vendedores where id = $1`, [V.semLogin], /permission denied/);
  });
});

describe("login do vendedor", () => {
  it("o gerente liga o vendedor a um login que já existe, pelo e-mail", async () => {
    await db.exec(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000c1', 'Carla@Loja.com')`);
    await sql(U.gerente, `select metas.ligar_login($1, ' carla@loja.com ')`, [V.semLogin]);
    expect(await sql(null, `select user_id from metas.vendedores where id = $1`, [V.semLogin])).toEqual([{ user_id: "00000000-0000-4000-8000-0000000000c1" }]);
    expect(await sql(U.gerente, `select email from metas.emails_vendedores($1) where vendedor_id = $2`, [LOJA_A, V.semLogin])).toEqual([{ email: "Carla@Loja.com" }]);
  });

  it("e-mail sem login, login já usado por outro vendedor e quem não pode editar são recusados", async () => {
    await deve(U.gerente, `select metas.ligar_login($1, 'ninguem@x.com')`, [V.semLogin], "Não existe login");
    await db.query(`update auth.users set email = 'ana@loja.com' where id = $1`, [U.vendA]);
    await deve(U.gerente, `select metas.ligar_login($1, 'ana@loja.com')`, [V.semLogin], "já está ligado a outro vendedor");
    await deve(U.vendA, `select metas.ligar_login($1, null)`, [V.semLogin], "não tem permissão");
  });

  it("e-mail vazio desliga o login; o vendedor não vê os e-mails dos colegas", async () => {
    await sql(U.gerente, `select metas.ligar_login($1, '')`, [V.semLogin]);
    expect(await sql(null, `select user_id from metas.vendedores where id = $1`, [V.semLogin])).toEqual([{ user_id: null }]);
    expect(await sql(U.vendA, `select * from metas.emails_vendedores($1)`, [LOJA_A])).toHaveLength(0);
  });
});

describe("fechamento do mês", () => {
  it("o vendedor não fecha o mês", async () => {
    await deve(U.vendA, `insert into metas.meses_fechados (loja_id, mes_referencia) values ($1, $2)`, [LOJA_A, NOV], /row-level security/);
  });

  it("o gerente fecha; ninguém altera lançamento nem meta, nem o admin", async () => {
    const [f] = await sql<{ fechado_por: string }>(U.gerente, `insert into metas.meses_fechados (loja_id, mes_referencia) values ($1, $2) returning fechado_por`, [LOJA_A, NOV]);
    expect(f.fechado_por).toBe(U.gerente);
    await deve(U.vendA, `update metas.lancamentos set faturamento_realizado = 1 where vendedor_id = $1`, [V.a], "Mês fechado");
    await deve(U.admin, `update metas.lancamentos set faturamento_realizado = 1 where vendedor_id = $1`, [V.a], "Mês fechado");
    await deve(U.admin, `delete from metas.lancamentos where vendedor_id = $1`, [V.a], "Mês fechado");
    await deve(U.gerente, `insert into metas.lancamentos (vendedor_id, loja_id, mes_referencia) values ($1, $2, $3)`, [V.semLogin, LOJA_A, NOV], "Mês fechado");
    await deve(U.admin, `update metas.configuracao_meta set meta_total = 1 where loja_id = $1`, [LOJA_A], "Mês fechado");
  });

  it("fechar a loja A não trava a loja B", async () => {
    const r = await sql(U.vendB, `update metas.lancamentos set clientes_engajados = 6 where vendedor_id = $1 returning id`, [V.b]);
    expect(r).toHaveLength(1);
  });

  it("depois de reabrir, volta a poder alterar", async () => {
    await sql(U.gerente, `delete from metas.meses_fechados where loja_id = $1 and mes_referencia = $2`, [LOJA_A, NOV]);
    const r = await sql(U.gerente, `update metas.lancamentos set faturamento_realizado = 83000 where vendedor_id = $1 returning id`, [V.a]);
    expect(r).toHaveLength(1);
  });
});

describe("empresas, unidades e acessos (só o admin)", () => {
  const NOVO = "00000000-0000-4000-8000-0000000000d1";
  const GESTOR = "00000000-0000-4000-8000-0000000000d2";
  const perms = (u: string) => sql<{ unidade_id: string; tela_codigo: string; acao: string }>(null,
    `select unidade_id, tela_codigo, acao from public.usuario_permissoes where user_id = $1 order by 1, 2, 3`, [u]);

  beforeAll(async () => {
    await db.exec(`insert into auth.users (id, email) values ('${NOVO}', 'novo@loja.com'), ('${GESTOR}', 'gestor@loja.com')`);
  });

  it("o admin cadastra empresa e unidade; o gerente não", async () => {
    const [r] = await sql<{ id: string }>(U.admin, `insert into public.redes (nome) values ('NOVA REDE') returning id`);
    await sql(U.admin, `insert into public.lojas (nome, rede_id, sistemas) values ('Nova Loja', $1, array['metas'])`, [r.id]);
    await deve(U.gerente, `insert into public.redes (nome) values ('OUTRA')`, [], /row-level security/);
    expect(await sql(U.gerente, `update public.lojas set nome = 'X' where id = $1 returning id`, [LOJA_A])).toHaveLength(0);
  });

  it("vendedor: Ranking e Meu desempenho; 'lança' libera o editar; o cadastro de vendedor nasce ligado ao login", async () => {
    await sql(U.admin, `select metas.definir_acesso('NOVO@loja.com', 'Nívea', $1, $2, 'vendedor', false)`, [REDE, LOJA_A]);
    expect((await perms(NOVO)).map((p) => `${p.tela_codigo}:${p.acao}`)).toEqual(["metas.meu_desempenho:ver", "metas.ranking:ver"]);
    expect(await sql(null, `select nome, loja_id from metas.vendedores where user_id = $1`, [NOVO])).toEqual([{ nome: "Nívea", loja_id: LOJA_A }]);
    await sql(U.admin, `select metas.definir_acesso('novo@loja.com', 'Nívea', $1, $2, 'vendedor', true)`, [REDE, LOJA_A]);
    expect((await perms(NOVO)).map((p) => `${p.tela_codigo}:${p.acao}`)).toContain("metas.meu_desempenho:editar");
    expect(await sql(null, `select count(*)::int n from metas.vendedores where user_id = $1`, [NOVO])).toEqual([{ n: 1 }]);
    // e o vendedor novo já lança o próprio resultado
    const [v] = await sql<{ id: string }>(null, `select id from metas.vendedores where user_id = $1`, [NOVO]);
    await lancar(NOVO, v.id, OUT, 1000, 1);
  });

  it("gestor: o perfil de gerente em todas as unidades da empresa que usam o Meta de Vendas", async () => {
    await sql(U.admin, `select metas.definir_acesso('gestor@loja.com', 'Gil', $1, null, 'gestor')`, [REDE]);
    const unidades = new Set((await perms(GESTOR)).map((p) => p.unidade_id));
    expect(unidades.has(LOJA_A) && unidades.has(LOJA_B)).toBe(true);
    expect(unidades.has(LOJA_SEM)).toBe(false);
    expect((await perms(GESTOR)).some((p) => p.tela_codigo === "metas.configuracao" && p.acao === "fechar_mes")).toBe(true);
    expect((await perms(GESTOR)).some((p) => p.tela_codigo === "metas.empresas")).toBe(false); // telas do admin nunca
    expect(await sql(GESTOR, `select id from metas.lancamentos where loja_id = $1`, [LOJA_B])).not.toHaveLength(0);
  });

  it("trocar o perfil substitui o acesso do Meta de Vendas, sem mexer em outro sistema", async () => {
    await db.query(`insert into public.telas (codigo, nome, app, grupo, rota) values ('pdv.pdv', 'PDV', 'pdv', 'frente', '/pdv') on conflict do nothing`);
    await db.query(`insert into public.usuario_permissoes values ($1, $2, 'pdv.pdv', 'ver', true)`, [NOVO, LOJA_A]);
    await sql(U.admin, `select metas.definir_acesso('novo@loja.com', 'Nívea', $1, $2, 'gerente')`, [REDE, LOJA_A]);
    const p = await perms(NOVO);
    expect(p.some((x) => x.tela_codigo === "pdv.pdv")).toBe(true);
    expect(p.some((x) => x.tela_codigo === "metas.configuracao" && x.acao === "editar")).toBe(true);
  });

  it("só o admin dá ou tira acesso; e-mail sem login e unidade de outra empresa são recusados", async () => {
    await deve(U.gerente, `select metas.definir_acesso('novo@loja.com', 'x', $1, $2, 'vendedor')`, [REDE, LOJA_A], "Só o admin");
    await deve(U.gerente, `select metas.remover_acesso($1, $2)`, [NOVO, LOJA_A], "Só o admin");
    await deve(U.admin, `select metas.definir_acesso('ninguem@x.com', 'x', $1, $2, 'vendedor')`, [REDE, LOJA_A], "Não existe login");
    const [outra] = await sql<{ id: string }>(null, `select id from public.redes where nome = 'NOVA REDE'`);
    await deve(U.admin, `select metas.definir_acesso('novo@loja.com', 'x', $1, $2, 'vendedor')`, [outra.id, LOJA_A], "não é desta empresa");
    await deve(U.admin, `select metas.definir_acesso('novo@loja.com', 'x', $1, $2, 'vendedor')`, [REDE, LOJA_SEM], /não é desta empresa|não usa/);
    await deve(U.admin, `select metas._definir_acesso_usuario($1, 'x', $2, $3, 'vendedor')`, [NOVO, REDE, LOJA_A], /permission denied/);
  });

  it("lista de usuários da empresa com o perfil reconhecido (só o admin vê)", async () => {
    const r = await sql<{ email: string; loja: string; perfil: string }>(U.admin, `select email, loja, perfil from metas.usuarios_da_empresa($1)`, [REDE]);
    expect(r).toEqual(expect.arrayContaining([
      { email: "gestor@loja.com", loja: "Loja B", perfil: "gerente" },
      { email: "novo@loja.com", loja: "Loja A", perfil: "gerente" },
    ]));
    expect(await sql(U.gerente, `select * from metas.usuarios_da_empresa($1)`, [REDE])).toHaveLength(0);
  });

  it("tirar o acesso: some do Meta de Vendas, o login e o histórico continuam", async () => {
    await sql(U.admin, `select metas.remover_acesso($1, $2)`, [NOVO, LOJA_A]);
    expect((await perms(NOVO)).filter((p) => p.tela_codigo.startsWith("metas."))).toHaveLength(0);
    expect((await perms(NOVO)).some((p) => p.tela_codigo === "pdv.pdv")).toBe(true);
    expect(await sql(null, `select bool_or(permitido) p from public.usuario_telas where user_id = $1 and tela_codigo like 'metas.%'`, [NOVO])).toEqual([{ p: false }]);
    expect(await sql(null, `select count(*)::int n from auth.users where id = $1`, [NOVO])).toEqual([{ n: 1 }]);
    expect(await sql(null, `select count(*)::int n from metas.lancamentos l join metas.vendedores v on v.id = l.vendedor_id where v.user_id = $1`, [NOVO])).toEqual([{ n: 1 }]);
  });

  it("excluir: só o que nunca foi usado; com histórico, a mensagem manda inativar", async () => {
    // vendedor com lançamento não sai; sem lançamento, o gerente exclui; o vendedor não exclui ninguém
    await deve(U.gerente, `select metas.excluir_vendedor($1)`, [V.a], "use Inativar");
    const [novo] = await sql<{ id: string }>(U.gerente, `insert into metas.vendedores (loja_id, nome) values ($1, 'Teste') returning id`, [LOJA_A]);
    await deve(U.vendA, `select metas.excluir_vendedor($1)`, [novo.id], "não tem permissão");
    await sql(U.gerente, `select metas.excluir_vendedor($1)`, [novo.id]);
    expect(await sql(null, `select id from metas.vendedores where id = $1`, [novo.id])).toHaveLength(0);

    // unidade com dados não sai; unidade de outro sistema não sai; empresa com unidade não sai
    await deve(U.admin, `select metas.excluir_unidade($1)`, [LOJA_A], "use Inativar");
    await deve(U.admin, `select metas.excluir_unidade($1)`, [LOJA_SEM], "outro sistema (pdv)");
    await deve(U.gerente, `select metas.excluir_unidade($1)`, [LOJA_A], "Só o admin");
    const [r] = await sql<{ id: string }>(U.admin, `insert into public.redes (nome) values ('REDE TESTE APAGAR') returning id`);
    const [l] = await sql<{ id: string }>(U.admin, `insert into public.lojas (nome, rede_id, sistemas) values ('Loja Teste Apagar', $1, array['metas']) returning id`, [r.id]);
    await sql(U.admin, `select metas.definir_acesso('novo@loja.com', 'x', $1, $2, 'gerente')`, [r.id, l.id]);
    await deve(U.admin, `select metas.excluir_empresa($1)`, [r.id], "unidades antes");
    // unidade nova, sem dados: sai (com os acessos dela); depois a empresa vazia sai
    await sql(U.admin, `select metas.excluir_unidade($1)`, [l.id]);
    expect(await sql(null, `select count(*)::int n from public.usuario_permissoes where unidade_id = $1`, [l.id])).toEqual([{ n: 0 }]);
    await deve(U.gerente, `select metas.excluir_empresa($1)`, [r.id], "Só o admin");
    await sql(U.admin, `select metas.excluir_empresa($1)`, [r.id]);
    expect(await sql(null, `select id from public.redes where id = $1`, [r.id])).toHaveLength(0);
  });

  it("o prêmio da meta mínima não passa o da meta 100%", async () => {
    await deve(U.admin, `insert into metas.configuracao_meta (loja_id, mes_referencia, premio_meta_100, premio_meta_90) values ($1, '2027-01-01', 100, 200)`, [LOJA_A], /check constraint/);
  });
});

describe("histórico", () => {
  it("se o vendedor muda de loja, os lançamentos antigos continuam na loja antiga", async () => {
    await sql(U.admin, `update metas.vendedores set loja_id = $2 where id = $1`, [V.a2, LOJA_B]);
    const [l] = await sql<{ loja_id: string }>(null, `select loja_id from metas.lancamentos where vendedor_id = $1`, [V.a2]);
    expect(l.loja_id).toBe(LOJA_A);
  });
});
