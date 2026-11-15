// MODO DEMONSTRAÇÃO: dados de exemplo só neste navegador (localStorage), com as MESMAS regras do banco
// (permissão por unidade, mês fechado trava tudo, vendedor inativo não recebe lançamento, unidade do lançamento
// fixa). Serve para testar as telas sem o Supabase. Nunca abre num build de produção sem VITE_MODO_DEMO=1.
import { mesAtual, somarMeses } from "../lib/formato";
import { chave, TELAS_APP } from "../lib/telas";
import { ErroServidor, type Acesso, type Lancamento, type Meta, type NovoLancamento, type Servidor, type Sessao, type Unidade, type Vendedor } from "./servidor";

const LOJA1 = "demo-loja-1";
const LOJA2 = "demo-loja-2";
const UNIDADES: Unidade[] = [
  { id: LOJA1, nome: "Supermix Loja 1", rede: "SUPERMIX BRAZ" },
  { id: LOJA2, nome: "Supermix Loja 2", rede: "SUPERMIX BRAZ" },
];

type Perm = [tela: string, acoes: string[]];
const TUDO: Perm[] = TELAS_APP.map((t) => [t.codigo, t.acoes]);
const VENDEDOR_LANCA: Perm[] = [["metas.meu_desempenho", ["ver", "editar"]], ["metas.ranking", ["ver"]]];
const VENDEDOR_VE: Perm[] = [["metas.meu_desempenho", ["ver"]], ["metas.ranking", ["ver"]]];

export const USUARIOS_DEMO = [
  { id: "demo-admin", email: "admin@demo.tb", senha: "demo", nome: "Admin (Ecossistema TB)", papel: "Vê e faz tudo, nas duas lojas", admin: true, perms: {} as Record<string, Perm[]> },
  { id: "demo-gerente", email: "gerente@demo.tb", senha: "demo", nome: "Gerente da Loja 1", papel: "Meta, lançamentos, vendedores e fechamento da Loja 1", admin: false, perms: { [LOJA1]: TUDO } },
  { id: "demo-ana", email: "ana@demo.tb", senha: "demo", nome: "Ana (vendedora)", papel: "Loja 1 · lança o próprio resultado", admin: false, perms: { [LOJA1]: VENDEDOR_LANCA } },
  { id: "demo-bruno", email: "bruno@demo.tb", senha: "demo", nome: "Bruno (vendedor)", papel: "Loja 1 · só acompanha", admin: false, perms: { [LOJA1]: VENDEDOR_VE } },
];

interface Estado {
  vendedores: Vendedor[];
  metas: Meta[];
  lancamentos: Lancamento[];
  fechados: { loja_id: string; mes_referencia: string }[];
}

const VERSAO = "metas-demo-v1";
const CHAVE_SESSAO = "metas-demo-sessao";

function inicial(): Estado {
  const mes = mesAtual();
  const meses = [somarMeses(mes, -2), somarMeses(mes, -1), mes];
  const vendedores: Vendedor[] = [
    { id: "v-ana", loja_id: LOJA1, user_id: "demo-ana", nome: "Ana", ativo: true },
    { id: "v-bruno", loja_id: LOJA1, user_id: "demo-bruno", nome: "Bruno", ativo: true },
    { id: "v-carla", loja_id: LOJA1, user_id: null, nome: "Carla", ativo: true },
    { id: "v-davi", loja_id: LOJA2, user_id: null, nome: "Davi", ativo: true },
    { id: "v-elis", loja_id: LOJA2, user_id: null, nome: "Elis", ativo: true },
  ];
  const metas: Meta[] = meses.flatMap((m) => [
    { loja_id: LOJA1, mes_referencia: m, meta_total: 136000, percentual_minimo: 0.9, premio_meta_100: 4000, premio_meta_90: 1500, valor_por_cliente_engajado: 0.5 },
    { loja_id: LOJA2, mes_referencia: m, meta_total: 90000, percentual_minimo: 0.9, premio_meta_100: 2500, premio_meta_90: 1000, valor_por_cliente_engajado: 0.5 },
  ]);
  // mês -2: bateu 100% na Loja 1; mês -1: ficou na mínima; mês atual: em andamento
  const valores: Record<string, [number, number][]> = {
    "v-ana": [[62000, 80], [55000, 60], [31000, 25]],
    "v-bruno": [[48000, 40], [44000, 35], [22000, 12]],
    "v-carla": [[30000, 20], [27000, 18], [15000, 9]],
    "v-davi": [[50000, 30], [41000, 22], [20000, 10]],
    "v-elis": [[43000, 25], [38000, 20], [18000, 8]],
  };
  const lancamentos: Lancamento[] = vendedores.flatMap((v) => meses.map((m, i) => ({
    id: `l-${v.id}-${m}`, vendedor_id: v.id, loja_id: v.loja_id, mes_referencia: m,
    faturamento_realizado: valores[v.id][i][0], clientes_engajados: valores[v.id][i][1],
  })));
  return { vendedores, metas, lancamentos, fechados: [{ loja_id: LOJA1, mes_referencia: meses[0] }, { loja_id: LOJA2, mes_referencia: meses[0] }] };
}

function ler<T>(k: string): T | null {
  try {
    const t = globalThis.localStorage?.getItem(k);
    return t ? (JSON.parse(t) as T) : null;
  } catch {
    return null;
  }
}
function gravar(k: string, v: unknown) {
  try {
    if (v === null) globalThis.localStorage?.removeItem(k);
    else globalThis.localStorage?.setItem(k, JSON.stringify(v));
  } catch {
    /* sem armazenamento (aba anônima): os dados valem só até recarregar */
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);
const proibido = () => new ErroServidor("Você não tem permissão para fazer isso nesta unidade.");
const fechadoErro = (o: string) => new ErroServidor(`Mês fechado: reabra o mês para alterar ${o}.`);

export class DemoServidor implements Servidor {
  readonly modo = "demo" as const;
  private e: Estado;
  private eu: (typeof USUARIOS_DEMO)[number] | null;

  constructor() {
    this.e = ler<Estado>(VERSAO) ?? inicial();
    const id = ler<string>(CHAVE_SESSAO);
    this.eu = USUARIOS_DEMO.find((u) => u.id === id) ?? null;
  }

  private salvar() {
    gravar(VERSAO, this.e);
  }

  private pode(tela: string, acao: string, loja: string) {
    if (!this.eu) return false;
    if (this.eu.admin) return true;
    return (this.eu.perms[loja] ?? []).some(([t, a]) => t === tela && a.includes(acao));
  }
  private veUnidade(loja: string) {
    return !!this.eu && (this.eu.admin || (this.eu.perms[loja] ?? []).some(([, a]) => a.includes("ver")));
  }
  private fechado(loja: string, mes: string) {
    return this.e.fechados.some((f) => f.loja_id === loja && f.mes_referencia === mes);
  }
  private sessao(): Sessao | null {
    return this.eu ? { usuario_id: this.eu.id, email: this.eu.email, nome: this.eu.nome, admin: this.eu.admin } : null;
  }

  async sessaoAtual() {
    return this.sessao();
  }
  async entrar(email: string, senha: string) {
    const u = USUARIOS_DEMO.find((x) => x.email === email.trim().toLowerCase() && x.senha === senha);
    if (!u) throw new ErroServidor("E-mail ou senha incorretos.");
    this.eu = u;
    gravar(CHAVE_SESSAO, u.id);
    return this.sessao()!;
  }
  async sair() {
    this.eu = null;
    gravar(CHAVE_SESSAO, null);
  }

  async acesso(): Promise<Acesso> {
    const eu = this.eu;
    if (!eu) return { liberadas: new Set(), unidades: [] };
    const liberadas = new Set(eu.admin ? TELAS_APP.map((t) => t.codigo) : Object.values(eu.perms).flat().filter(([, a]) => a.includes("ver")).map(([t]) => t));
    return { liberadas, unidades: UNIDADES.filter((u) => this.veUnidade(u.id)) };
  }

  async permissoes(unidade: string) {
    return new Set(TELAS_APP.flatMap((t) => t.acoes.filter((a) => this.pode(t.codigo, a, unidade)).map((a) => chave(t.codigo, a))));
  }

  async meuVendedor() {
    return this.e.vendedores.find((v) => v.user_id === this.eu?.id) ?? null;
  }

  async vendedores(unidade: string) {
    return this.e.vendedores.filter((v) => v.loja_id === unidade && (this.veUnidade(unidade) || v.user_id === this.eu?.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async salvarVendedor(v: { id?: string; loja_id: string; nome: string; ativo: boolean }) {
    if (!v.nome.trim()) throw new ErroServidor("Informe o nome do vendedor.");
    if (v.id) {
      const atual = this.e.vendedores.find((x) => x.id === v.id);
      if (!atual || !this.pode("metas.vendedores", "editar", atual.loja_id) || !this.pode("metas.vendedores", "editar", v.loja_id)) throw proibido();
      Object.assign(atual, { loja_id: v.loja_id, nome: v.nome.trim(), ativo: v.ativo });
      this.salvar();
      return { ...atual };
    }
    if (!this.pode("metas.vendedores", "inserir", v.loja_id)) throw proibido();
    const novo: Vendedor = { id: `v-${uid()}`, loja_id: v.loja_id, user_id: null, nome: v.nome.trim(), ativo: v.ativo };
    this.e.vendedores.push(novo);
    this.salvar();
    return { ...novo };
  }

  async ligarLogin(vendedor: string, email: string | null) {
    const v = this.e.vendedores.find((x) => x.id === vendedor);
    if (!v) throw new ErroServidor("Vendedor não encontrado.");
    if (!this.pode("metas.vendedores", "editar", v.loja_id)) throw proibido();
    if (!email?.trim()) {
      v.user_id = null;
    } else {
      const u = USUARIOS_DEMO.find((x) => x.email === email.trim().toLowerCase());
      if (!u) throw new ErroServidor("Não existe login com esse e-mail. Peça ao administrador para criar o login no Portal.");
      if (this.e.vendedores.some((x) => x.user_id === u.id && x.id !== vendedor)) throw new ErroServidor("Esse login já está ligado a outro vendedor.");
      v.user_id = u.id;
    }
    this.salvar();
  }

  async emailsVendedores(unidade: string) {
    if (!this.pode("metas.vendedores", "ver", unidade)) return new Map<string, string>();
    return new Map(this.e.vendedores.filter((v) => v.loja_id === unidade && v.user_id)
      .map((v) => [v.id, USUARIOS_DEMO.find((u) => u.id === v.user_id)?.email ?? ""] as [string, string]));
  }

  async metas(unidade: string, meses: string[]) {
    if (!this.veUnidade(unidade)) return [];
    return this.e.metas.filter((m) => m.loja_id === unidade && meses.includes(m.mes_referencia)).map((m) => ({ ...m }));
  }

  async salvarMeta(m: Meta) {
    if (!this.pode("metas.configuracao", "editar", m.loja_id)) throw proibido();
    if (this.fechado(m.loja_id, m.mes_referencia)) throw fechadoErro("a meta");
    if ([m.meta_total, m.premio_meta_100, m.premio_meta_90, m.valor_por_cliente_engajado].some((x) => !(x >= 0)) || !(m.percentual_minimo > 0 && m.percentual_minimo <= 1)) {
      throw new ErroServidor("Algum valor está fora do permitido (negativo ou % acima de 100).");
    }
    this.e.metas = this.e.metas.filter((x) => !(x.loja_id === m.loja_id && x.mes_referencia === m.mes_referencia)).concat({ ...m });
    this.salvar();
  }

  async lancamentos(unidade: string, meses: string[]) {
    const meu = (await this.meuVendedor())?.id;
    return this.e.lancamentos.filter((l) => l.loja_id === unidade && meses.includes(l.mes_referencia) && (this.veUnidade(unidade) || l.vendedor_id === meu)).map((l) => ({ ...l }));
  }

  async meusLancamentos(meses: string[]) {
    const meu = (await this.meuVendedor())?.id;
    return meu ? this.e.lancamentos.filter((l) => l.vendedor_id === meu && meses.includes(l.mes_referencia)).map((l) => ({ ...l })) : [];
  }

  async salvarLancamento(l: NovoLancamento) {
    const v = this.e.vendedores.find((x) => x.id === l.vendedor_id);
    if (!v) throw new ErroServidor("Vendedor não encontrado.");
    if (!(l.faturamento_realizado >= 0) || !(l.clientes_engajados >= 0) || !Number.isInteger(l.clientes_engajados)) {
      throw new ErroServidor("Algum valor está fora do permitido (negativo ou % acima de 100).");
    }
    const atual = this.e.lancamentos.find((x) => x.vendedor_id === l.vendedor_id && x.mes_referencia === l.mes_referencia);
    const loja = atual?.loja_id ?? v.loja_id;
    const proprio = v.user_id === this.eu?.id && this.pode("metas.meu_desempenho", "editar", loja);
    if (!(this.pode("metas.lancamentos", atual ? "editar" : "inserir", loja) || proprio)) throw proibido();
    if (this.fechado(loja, l.mes_referencia)) throw fechadoErro("os lançamentos");
    if (atual) {
      Object.assign(atual, { faturamento_realizado: l.faturamento_realizado, clientes_engajados: l.clientes_engajados });
    } else {
      if (!v.ativo) throw new ErroServidor("Vendedor inativo: reative o cadastro para lançar.");
      this.e.lancamentos.push({ id: `l-${uid()}`, loja_id: v.loja_id, ...l });
    }
    this.salvar();
  }

  async excluirLancamento(id: string) {
    const l = this.e.lancamentos.find((x) => x.id === id);
    if (!l || !this.pode("metas.lancamentos", "excluir", l.loja_id)) throw new ErroServidor("Você não tem permissão para excluir este lançamento.");
    if (this.fechado(l.loja_id, l.mes_referencia)) throw fechadoErro("os lançamentos");
    this.e.lancamentos = this.e.lancamentos.filter((x) => x.id !== id);
    this.salvar();
  }

  async mesesFechados(unidade: string, meses: string[]) {
    if (!this.veUnidade(unidade)) return [];
    return this.e.fechados.filter((f) => f.loja_id === unidade && meses.includes(f.mes_referencia)).map((f) => f.mes_referencia);
  }

  async fecharMes(unidade: string, mes: string) {
    if (!this.pode("metas.configuracao", "fechar_mes", unidade)) throw proibido();
    if (!this.fechado(unidade, mes)) this.e.fechados.push({ loja_id: unidade, mes_referencia: mes });
    this.salvar();
  }

  async reabrirMes(unidade: string, mes: string) {
    if (!this.pode("metas.configuracao", "fechar_mes", unidade)) throw new ErroServidor("Você não tem permissão para reabrir o mês.");
    this.e.fechados = this.e.fechados.filter((f) => !(f.loja_id === unidade && f.mes_referencia === mes));
    this.salvar();
  }
}

/** Volta os dados de exemplo ao início (botão na tela de entrada da demonstração). */
export function reiniciarDemo() {
  gravar(VERSAO, null);
  gravar(CHAVE_SESSAO, null);
}
