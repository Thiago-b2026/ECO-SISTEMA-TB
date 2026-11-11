// Etapa 13 – tempos de execução no banco (PGlite). A migration 20261111000002 é idempotente.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { como, falha, linhas, novoBanco, type Banco } from "./db";

const id = (p: string, n: number) => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = { gA: id("a1000000", 1), opA: id("a1000000", 2), supA: id("a1000000", 3), gB: id("a1000000", 4) };
const REDE_A = id("b1000000", 1), REDE_B = id("b1000000", 2);
const LOJA_A = id("c1000000", 1), LOJA_B = id("c1000000", 2);
const MOD = id("d1000000", 1);

let db: Banco;
let versao = "";
const sql = (u: string | null, q: string, p: unknown[] = []) => como(db, u, () => linhas(db, q, p));
const deve = (u: string, q: string, p: unknown[], t: string | RegExp) => como(db, u, () => falha(db, q, p, t));
const item = (i: string) => ({ id: i, texto: `Item ${i}`, tipo: "sim_nao", obrigatorio: true, foto: "nunca", observacao: "nunca", gera_plano: false, pontua: true, peso: 1, tempo_padrao_min: 2 });
const t = (min: number) => new Date(Date.UTC(2026, 10, 10, 13, 0) + min * 60000).toISOString(); // 10/11 10:00 em SP + min

beforeAll(async () => {
  db = await novoBanco();
  // idempotente: aplicar a migration nova de novo não quebra nem duplica
  await db.exec(readFileSync(resolve(import.meta.dirname, "../migrations/20261111000002_checklist_tempos.sql"), "utf8"));
  await db.exec(`
    insert into auth.users (id) values ('${U.gA}'), ('${U.opA}'), ('${U.supA}'), ('${U.gB}');
    insert into public.redes (id, nome) values ('${REDE_A}', 'TEMPO A'), ('${REDE_B}', 'TEMPO B');
    insert into public.lojas (id, nome, rede_id) values ('${LOJA_A}', 'A1', '${REDE_A}'), ('${LOJA_B}', 'B1', '${REDE_B}');
    insert into checklist.membros (usuario_id, rede_id, loja_id, perfil, nome) values
      ('${U.gA}', '${REDE_A}', null, 'gestor', 'Gestor A'), ('${U.opA}', '${REDE_A}', '${LOJA_A}', 'operador', 'Op A'),
      ('${U.supA}', '${REDE_A}', '${LOJA_A}', 'supervisor', 'Sup A'), ('${U.gB}', '${REDE_B}', null, 'gestor', 'Gestor B');
  `);
  await sql(U.gA, `insert into checklist.modelos (id, rede_id, nome) values ($1, $2, 'Abertura')`, [MOD, REDE_A]);
  const [{ v }] = await sql(U.gA, `select checklist.criar_rascunho($1)::text v`, [MOD]) as { v: string }[];
  versao = v;
  await sql(U.gA, `update checklist.modelo_versoes set conteudo = $2 where id = $1`, [v, JSON.stringify({ tempo_padrao_min: 10, secoes: [{ id: "s", titulo: "S", itens: [item("a"), item("b")] }] })]);
  await sql(U.gA, `select checklist.publicar_versao($1)`, [v]);
});

const exec = id("e1000000", 1);
const pacote = (respostas: unknown[], extra: Record<string, unknown> = {}) => [
  JSON.stringify({ id: exec, modelo_id: MOD, versao_id: versao, loja_id: LOJA_A, inicio_em: t(0), ...extra }),
  JSON.stringify(respostas), "[]",
];

describe("tempos no banco", () => {
  it("item com início e fim; reenvio antigo/novo NUNCA apaga nem atrasa o iniciado_em", async () => {
    const r = (ini: string | null, fim: string | null, em: string) => ({ id: id("f1000000", 1), item_id: "a", valor: { tipo: "sim_nao", v: true }, respondido_em: em, iniciado_em: ini, concluido_em: fim });
    await sql(U.opA, `select checklist.sync_execucao($1, $2, $3)`, pacote([r(t(1), t(3), t(3))]));
    // outro aparelho / reenvio mais novo, mas com início mais tarde e sem início: o início continua o mais antigo
    await sql(U.opA, `select checklist.sync_execucao($1, $2, $3)`, pacote([r(t(2), t(4), t(4))]));
    await sql(U.opA, `select checklist.sync_execucao($1, $2, $3)`, pacote([r(null, t(4), t(4))]));
    const [a] = await sql(null, `select iniciado_em, concluido_em, duracao_seg from checklist.respostas where execucao_id = $1 and item_id = 'a'`, [exec]);
    expect(new Date(a.iniciado_em as string).toISOString()).toBe(t(1));
    expect(new Date(a.concluido_em as string).toISOString()).toBe(t(4));
    expect(a.duracao_seg).toBe(180);
    expect((await sql(null, `select count(*)::int n from checklist.respostas where execucao_id = $1`, [exec]))[0].n).toBe(1);
  });

  it("pausa fica fora do tempo ativo e não diminui com reenvio antigo", async () => {
    const b = { id: id("f1000000", 2), item_id: "b", valor: { tipo: "sim_nao", v: true }, respondido_em: t(9), iniciado_em: t(5), concluido_em: t(9) };
    await sql(U.opA, `select checklist.sync_execucao($1, $2, $3)`, pacote([b], { tempo_pausado_seg: 300, pausas: [{ inicio: t(10), fim: t(15) }] }));
    await sql(U.opA, `select checklist.sync_execucao($1, $2, $3)`, pacote([b], { tempo_pausado_seg: 60 })); // antigo: ignorado
    await sql(U.opA, `select checklist.concluir_execucao($1, $2)`, [exec, t(20)]);
    const [e] = await sql(null, `select duracao_seg, tempo_pausado_seg, tempo_ativo_seg, jsonb_array_length(pausas) n from checklist.execucoes where id = $1`, [exec]);
    expect(e).toEqual({ duracao_seg: 1200, tempo_pausado_seg: 300, tempo_ativo_seg: 900, n: 1 });
  });

  it("dados_tempos: supervisor/gestor da A veem; operador e empresa B não; padrão do checklist e dos itens", async () => {
    const [{ d }] = await sql(U.supA, `select checklist.dados_tempos('2026-11-01', '2026-11-30') d`) as { d: { execucoes: Record<string, unknown>[]; itens: Record<string, unknown>[] } }[];
    expect(d.execucoes).toHaveLength(1);
    expect(d.execucoes[0]).toMatchObject({ modelo: "Abertura", pessoa: "Op A", loja: "A1", total_seg: 1200, pausado_seg: 300, ativo_seg: 900, padrao_seg: 600 });
    expect(d.itens.map((i) => [i.item_id, i.duracao_seg, i.padrao_seg])).toEqual([["a", 180, 120], ["b", 240, 120]]);
    for (const u of [U.gB, U.opA]) {
      const [{ x }] = await sql(u, `select checklist.dados_tempos('2026-11-01', '2026-11-30') x`) as { x: { execucoes: unknown[]; itens: unknown[] } }[];
      expect(x.execucoes).toEqual([]);
      expect(x.itens).toEqual([]);
    }
    const [{ y }] = await sql(U.gA, `select checklist.dados_tempos('2026-11-01', '2026-11-30', $1) y`, [REDE_B]) as { y: { execucoes: unknown[] } }[];
    expect(y.execucoes).toEqual([]); // filtro de empresa
  });

  it("limites por empresa: só o gestor da empresa grava; a outra empresa não lê", async () => {
    await deve(U.supA, `insert into checklist.config_tempos (rede_id, acima_pct) values ($1, 25)`, [REDE_A], /row-level security/);
    await deve(U.gB, `insert into checklist.config_tempos (rede_id, acima_pct) values ($1, 25)`, [REDE_A], /row-level security/);
    await sql(U.gA, `insert into checklist.config_tempos (rede_id, acima_pct, muito_acima_pct, rapido_pct) values ($1, 25, 60, 35)`, [REDE_A]);
    await deve(U.gA, `update checklist.config_tempos set muito_acima_pct = 10 where rede_id = $1`, [REDE_A], /check constraint/);
    expect(await sql(U.gB, `select * from checklist.config_tempos`)).toEqual([]);
    expect((await sql(U.supA, `select acima_pct from checklist.config_tempos`))[0].acima_pct).toBe(25);
  });
});
