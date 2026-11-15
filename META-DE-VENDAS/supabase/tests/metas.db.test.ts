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
    insert into public.grupos (sistema, codigo, nome) values ('metas', 'metas', 'Meta de Vendas');
    insert into public.telas (codigo, nome, app, grupo, rota) values
      ${TELAS.map(([c]) => `('${c}', '${c}', 'metas', 'metas', '/${c.split(".")[1]}')`).join(", ")};
  `);
  for (const [tela, acoes] of TELAS)
    for (const acao of acoes) {
      await db.query(`insert into public.acoes (codigo, nome) values ($1, $1) on conflict do nothing`, [acao]);
      await db.query(`insert into public.tela_acoes (tela_codigo, acao) values ($1, $2)`, [tela, acao]);
    }
  await liberar(U.gerente, LOJA_A, TELAS);
  await liberar(U.vendA, LOJA_A, [["metas.meu_desempenho", ["ver", "editar"]], ["metas.ranking", ["ver"]]]);
  await liberar(U.vendA2, LOJA_A, [["metas.meu_desempenho", ["ver"]]]);
  await liberar(U.vendB, LOJA_B, [["metas.meu_desempenho", ["ver", "editar"]], ["metas.ranking", ["ver"]]]);
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

describe("histórico", () => {
  it("se o vendedor muda de loja, os lançamentos antigos continuam na loja antiga", async () => {
    await sql(U.admin, `update metas.vendedores set loja_id = $2 where id = $1`, [V.a2, LOJA_B]);
    const [l] = await sql<{ loja_id: string }>(null, `select loja_id from metas.lancamentos where vendedor_id = $1`, [V.a2]);
    expect(l.loja_id).toBe(LOJA_A);
  });
});
