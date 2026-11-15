// O modo demonstração repete as regras do banco (as mesmas testadas em supabase/tests/metas.db.test.ts).
import { beforeEach, describe, expect, it } from "vitest";
import { mesAtual, somarMeses } from "../lib/formato";
import { DemoServidor, reiniciarDemo, semearExemplo } from "./demo-servidor";

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

beforeEach(() => semearExemplo());

describe("demonstração: mesmas regras do banco", () => {
  it("começa vazia: nenhuma empresa, loja ou vendedor; só o admin entra", async () => {
    reiniciarDemo();
    await como("admin@demo.tb");
    expect(await s.empresas()).toEqual([]);
    expect((await s.acesso()).unidades).toEqual([]);
    await expect(new DemoServidor().entrar("gerente@demo.tb", "demo")).rejects.toThrow("incorretos");
  });

  it("excluir: empresa só sem unidades, unidade só sem dados, vendedor só sem lançamento", async () => {
    await como("admin@demo.tb");
    await expect(s.excluirEmpresa("demo-rede-supermix")).rejects.toThrow("unidades antes");
    await expect(s.excluirUnidade(L1)).rejects.toThrow("outro sistema");
    await expect(s.excluirVendedor("v-ana")).rejects.toThrow("use Inativar");
    const rede = await s.salvarEmpresa({ nome: "Apagar", ativo: true });
    const loja = await s.salvarUnidade({ rede_id: rede, nome: "Loja Apagar", cnpj: null, ativo: true, usaMetas: true, dados: {} });
    const v = await s.salvarVendedor({ loja_id: loja, nome: "Temp", ativo: true });
    await expect(s.excluirUnidade(loja)).rejects.toThrow("use Inativar");
    await s.excluirVendedor(v.id);
    await s.excluirUnidade(loja);
    await s.excluirEmpresa(rede);
    expect((await s.empresas()).map((e) => e.nome)).toEqual(["SUPERMIX BRAZ"]);
    await como("gerente@demo.tb");
    await expect(s.excluirEmpresa("demo-rede-supermix")).rejects.toThrow("Só o admin");
  });

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

  it("o admin cadastra empresa, unidade e um login novo; a pessoa entra e vê só a loja dela", async () => {
    await como("admin@demo.tb");
    const rede = await s.salvarEmpresa({ nome: "rede nova", ativo: true });
    expect((await s.empresas()).some((e) => e.nome === "REDE NOVA")).toBe(true);
    const loja = await s.salvarUnidade({ rede_id: rede, nome: "Loja Centro", cnpj: "11.222.333/0001-81", ativo: true, usaMetas: true, dados: {} });
    await expect(s.salvarUnidade({ rede_id: rede, nome: "loja centro", cnpj: null, ativo: true, usaMetas: true, dados: {} })).rejects.toThrow("com esse nome");
    await s.criarLogin({ email: "Zeca@Centro.com", senha: "12345678", nome: "Zeca", rede_id: rede, loja_id: loja, perfil: "vendedor", lanca: true });
    expect((await s.usuarios(rede)).map((u) => [u.email, u.perfil, u.lanca])).toEqual([["zeca@centro.com", "vendedor", true]]);
    await expect(s.criarLogin({ email: "zeca@centro.com", senha: "12345678", nome: "Z", rede_id: rede, loja_id: loja, perfil: "vendedor", lanca: false })).rejects.toThrow("Já existe");

    s = new DemoServidor();
    await s.entrar("zeca@centro.com", "12345678");
    expect((await s.acesso()).unidades.map((u) => u.nome)).toEqual(["Loja Centro"]);
    const eu = await s.meuVendedor();
    await s.salvarLancamento({ vendedor_id: eu!.id, mes_referencia: MES, faturamento_realizado: 5000, clientes_engajados: 2 });
    await expect(s.salvarEmpresa({ nome: "X", ativo: true })).rejects.toThrow("Só o admin");
  });

  it("gestor vale para todas as lojas da empresa; tirar o acesso não apaga o login", async () => {
    await como("admin@demo.tb");
    await s.darAcesso({ email: "bruno@demo.tb", nome: "Bruno", rede_id: "demo-rede-supermix", loja_id: null, perfil: "gestor", lanca: false });
    expect((await s.usuarios("demo-rede-supermix")).filter((u) => u.email === "bruno@demo.tb").map((u) => u.perfil)).toEqual(["gerente", "gerente"]);
    await s.removerAcesso("demo-bruno", L2);
    s = new DemoServidor();
    await s.entrar("bruno@demo.tb", "demo");
    expect((await s.acesso()).unidades.map((u) => u.id)).toEqual([L1]);
  });

  it("os dados ficam salvos no navegador entre uma visita e outra", async () => {
    await como("gerente@demo.tb");
    await s.salvarVendedor({ loja_id: L1, nome: "Gabi", ativo: true });
    const outra = new DemoServidor();
    expect((await outra.sessaoAtual())?.email).toBe("gerente@demo.tb");
    expect((await outra.vendedores(L1)).some((v) => v.nome === "Gabi")).toBe(true);
  });
});
