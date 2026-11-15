// O modo demonstração repete as regras do banco (as mesmas testadas em supabase/tests/metas.db.test.ts).
import { beforeEach, describe, expect, it } from "vitest";
import { mesAtual, somarMeses } from "../lib/formato";
import { DemoServidor, reiniciarDemo } from "./demo-servidor";

const memoria = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => void memoria.set(k, v),
  removeItem: (k: string) => void memoria.delete(k), clear: () => memoria.clear(), key: () => null, length: 0,
} as Storage;

const MES = mesAtual();
const L1 = "demo-loja-1";
const L2 = "demo-loja-2";
let s: DemoServidor;
async function como(email: string) {
  s = new DemoServidor();
  await s.entrar(email, "demo");
}

beforeEach(() => reiniciarDemo());

describe("demonstração: mesmas regras do banco", () => {
  it("o gerente vê e mexe só na Loja 1", async () => {
    await como("gerente@demo.tb");
    expect((await s.acesso()).unidades.map((u) => u.id)).toEqual([L1]);
    await s.salvarLancamento({ vendedor_id: "v-carla", mes_referencia: MES, faturamento_realizado: 20000, clientes_engajados: 3 });
    await expect(s.salvarLancamento({ vendedor_id: "v-davi", mes_referencia: MES, faturamento_realizado: 1, clientes_engajados: 0 })).rejects.toThrow("permissão");
    await expect(s.salvarVendedor({ loja_id: L2, nome: "X", ativo: true })).rejects.toThrow("permissão");
  });

  it("a vendedora lança só o próprio resultado; o vendedor só com 'ver' não lança", async () => {
    await como("ana@demo.tb");
    await s.salvarLancamento({ vendedor_id: "v-ana", mes_referencia: MES, faturamento_realizado: 33000, clientes_engajados: 30 });
    expect((await s.meusLancamentos([MES]))[0].faturamento_realizado).toBe(33000);
    await expect(s.salvarLancamento({ vendedor_id: "v-bruno", mes_referencia: MES, faturamento_realizado: 1, clientes_engajados: 0 })).rejects.toThrow("permissão");
    await expect(s.salvarMeta({ loja_id: L1, mes_referencia: MES, meta_total: 1, percentual_minimo: 0.9, premio_meta_100: 0, premio_meta_90: 0, valor_por_cliente_engajado: 0 })).rejects.toThrow("permissão");
    await como("bruno@demo.tb");
    await expect(s.salvarLancamento({ vendedor_id: "v-bruno", mes_referencia: MES, faturamento_realizado: 1, clientes_engajados: 0 })).rejects.toThrow("permissão");
    expect((await s.lancamentos(L1, [MES])).length).toBe(3); // o ranking mostra todos da loja
    expect(await s.lancamentos(L2, [MES])).toEqual([]);
  });

  it("mês fechado trava tudo, até para o admin; reabrir libera", async () => {
    await como("admin@demo.tb");
    const fechado = somarMeses(MES, -2); // os dados de exemplo já vêm com esse mês fechado
    expect(await s.mesesFechados(L1, [fechado])).toEqual([fechado]);
    await expect(s.salvarLancamento({ vendedor_id: "v-ana", mes_referencia: fechado, faturamento_realizado: 1, clientes_engajados: 0 })).rejects.toThrow("Mês fechado");
    await s.reabrirMes(L1, fechado);
    await s.salvarLancamento({ vendedor_id: "v-ana", mes_referencia: fechado, faturamento_realizado: 1, clientes_engajados: 0 });
  });

  it("vendedor inativo não recebe lançamento novo; o login só liga a quem existe e não repete", async () => {
    await como("gerente@demo.tb");
    const v = await s.salvarVendedor({ loja_id: L1, nome: "Fábio", ativo: false });
    await expect(s.salvarLancamento({ vendedor_id: v.id, mes_referencia: MES, faturamento_realizado: 1, clientes_engajados: 0 })).rejects.toThrow("inativo");
    await expect(s.ligarLogin(v.id, "ninguem@x.com")).rejects.toThrow("Não existe login");
    await expect(s.ligarLogin(v.id, "ana@demo.tb")).rejects.toThrow("outro vendedor");
  });

  it("os dados ficam salvos no navegador entre uma visita e outra", async () => {
    await como("gerente@demo.tb");
    await s.salvarVendedor({ loja_id: L1, nome: "Gabi", ativo: true });
    const outra = new DemoServidor();
    expect((await outra.sessaoAtual())?.email).toBe("gerente@demo.tb");
    expect((await outra.vendedores(L1)).some((v) => v.nome === "Gabi")).toBe(true);
  });
});
