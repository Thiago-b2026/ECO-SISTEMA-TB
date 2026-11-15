// MODO DEMONSTRAÇÃO: dados de exemplo só neste navegador (localStorage), com as MESMAS regras do banco
// (permissão por unidade, mês fechado trava tudo, vendedor inativo não recebe lançamento, unidade do lançamento
// fixa, só o admin cadastra empresas, unidades e acessos). Nunca abre num build de produção sem VITE_MODO_DEMO=1.
import { mesAtual, somarMeses } from "../lib/formato";
import { chave, TELAS_APP } from "../lib/telas";
import {
  ErroServidor, normalizarDados, type Acesso, type Empresa, type NovaUnidade, type Lancamento, type Meta, type NovoAcesso, type NovoLancamento, type Perfil, type Servidor,
  type Sessao, type UnidadeCadastro, type UsuarioAcesso, type Vendedor,
} from "./servidor";

const REDE = "demo-rede-supermix";
const LOJA1 = "demo-loja-1";
const LOJA2 = "demo-loja-2";

interface UsuarioDemo { id: string; email: string; senha: string; nome: string; admin: boolean }
interface PermDemo { user_id: string; loja_id: string; tela: string; acao: string }
export interface Estado {
  redes: { id: string; nome: string; ativo: boolean }[];
  lojas: UnidadeCadastro[];
  usuarios: UsuarioDemo[];
  permissoes: PermDemo[];
  vendedores: Vendedor[];
  metas: Meta[];
  lancamentos: Lancamento[];
  fechados: { loja_id: string; mes_referencia: string }[];
}

/** A demonstração começa LIMPA: só o administrador. Ele cadastra empresas, lojas e usuários. */
export const ADMIN_DEMO = { id: "demo-admin", email: "admin@demo.tb", senha: "demo", nome: "Administrador (Ecossistema TB)", papel: "Cadastra empresas, lojas e usuários; vê tudo" };
/** Atalhos da tela de entrada: só o admin (quem ele criar entra com o e-mail e a senha que ele definiu). */
export const USUARIOS_DEMO = [ADMIN_DEMO];

const VERSAO = "metas-demo-v3";
const CHAVE_SESSAO = "metas-demo-sessao";

/** Telas e ações de cada perfil (as mesmas de metas.telas_do_perfil no banco). */
export function telasDoPerfil(perfil: Perfil, lanca: boolean): [string, string][] {
  const comuns = TELAS_APP.filter((t) => !t.somenteAdmin);
  if (perfil === "vendedor") return [["metas.ranking", "ver"], ["metas.meu_desempenho", "ver"], ...(lanca ? [["metas.meu_desempenho", "editar"] as [string, string]] : [])];
  return comuns.flatMap((t) => t.acoes.map((a) => [t.codigo, a] as [string, string]));
}

function vazio(): Estado {
  return { redes: [], lojas: [], usuarios: [{ ...ADMIN_DEMO, admin: true }], permissoes: [], vendedores: [], metas: [], lancamentos: [], fechados: [] };
}

/** Dados de exemplo (SÓ para os testes automáticos): 1 empresa, 2 lojas, gerente, 2 vendedores com login e 3 meses. */
export function dadosDeExemplo(): Estado {
  const mes = mesAtual();
  const meses = [somarMeses(mes, -2), somarMeses(mes, -1), mes];
  const usuarios: UsuarioDemo[] = [
    { ...ADMIN_DEMO, admin: true },
    { id: "demo-gerente", email: "gerente@demo.tb", senha: "demo", nome: "Gerente da Loja 1", admin: false },
    { id: "demo-ana", email: "ana@demo.tb", senha: "demo", nome: "Ana (vendedora)", admin: false },
    { id: "demo-bruno", email: "bruno@demo.tb", senha: "demo", nome: "Bruno (vendedor)", admin: false },
  ];
  const p = (user: string, loja: string, perfil: Perfil, lanca = false) => telasDoPerfil(perfil, lanca).map(([tela, acao]) => ({ user_id: user, loja_id: loja, tela, acao }));
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
  return {
    redes: [{ id: REDE, nome: "SUPERMIX BRAZ", ativo: true }],
    lojas: [
      { id: LOJA1, nome: "Supermix Loja 1", cnpj: null, rede_id: REDE, ativo: true, usaMetas: true, outros: ["rh"], dados: {} },
      { id: LOJA2, nome: "Supermix Loja 2", cnpj: null, rede_id: REDE, ativo: true, usaMetas: true, outros: ["rh"], dados: {} },
    ],
    usuarios,
    permissoes: [...p("demo-gerente", LOJA1, "gerente"), ...p("demo-ana", LOJA1, "vendedor", true), ...p("demo-bruno", LOJA1, "vendedor")],
    vendedores,
    metas,
    lancamentos: vendedores.flatMap((v) => meses.map((m, i) => ({
      id: `l-${v.id}-${m}`, vendedor_id: v.id, loja_id: v.loja_id, mes_referencia: m,
      faturamento_realizado: valores[v.id][i][0], clientes_engajados: valores[v.id][i][1],
    }))),
    fechados: [{ loja_id: LOJA1, mes_referencia: meses[0] }, { loja_id: LOJA2, mes_referencia: meses[0] }],
  };
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
const soAdmin = (o: string) => new ErroServidor(`Só o admin ${o} (regra do Ecossistema).`);
const fechadoErro = (o: string) => new ErroServidor(`Mês fechado: reabra o mês para alterar ${o}.`);

export class DemoServidor implements Servidor {
  readonly modo = "demo" as const;
  private e: Estado;
  private euId: string | null;

  constructor() {
    this.e = ler<Estado>(VERSAO) ?? vazio();
    // lojas cadastradas antes dos dados completos (CNPJ/endereço) continuam abrindo
    for (const l of this.e.lojas) l.dados ??= {};
    this.euId = ler<string>(CHAVE_SESSAO);
    if (!this.eu) this.euId = null;
  }

  private get eu() {
    return this.e.usuarios.find((u) => u.id === this.euId) ?? null;
  }
  private salvar() {
    gravar(VERSAO, this.e);
  }
  private usa(loja: string) {
    const l = this.e.lojas.find((x) => x.id === loja);
    return !!l && l.ativo && l.usaMetas;
  }
  private pode(tela: string, acao: string, loja: string) {
    const eu = this.eu;
    if (!eu) return false;
    if (eu.admin) return true;
    return this.usa(loja) && this.e.permissoes.some((p) => p.user_id === eu.id && p.loja_id === loja && p.tela === tela && p.acao === acao);
  }
  private veUnidade(loja: string) {
    const eu = this.eu;
    if (!eu || !this.usa(loja)) return false;
    return eu.admin || this.e.permissoes.some((p) => p.user_id === eu.id && p.loja_id === loja && p.acao === "ver");
  }
  private fechado(loja: string, mes: string) {
    return this.e.fechados.some((f) => f.loja_id === loja && f.mes_referencia === mes);
  }
  private sessao(): Sessao | null {
    const eu = this.eu;
    return eu ? { usuario_id: eu.id, email: eu.email, nome: eu.nome, admin: eu.admin } : null;
  }

  async sessaoAtual() {
    return this.sessao();
  }
  async entrar(email: string, senha: string) {
    const u = this.e.usuarios.find((x) => x.email === email.trim().toLowerCase() && x.senha === senha);
    if (!u) throw new ErroServidor("E-mail ou senha incorretos.");
    this.euId = u.id;
    gravar(CHAVE_SESSAO, u.id);
    return this.sessao()!;
  }
  async sair() {
    this.euId = null;
    gravar(CHAVE_SESSAO, null);
  }

  async acesso(): Promise<Acesso> {
    const eu = this.eu;
    if (!eu) return { liberadas: new Set(), unidades: [] };
    const minhas = this.e.permissoes.filter((p) => p.user_id === eu.id && p.acao === "ver" && this.usa(p.loja_id)).map((p) => p.tela);
    const liberadas = new Set(eu.admin ? TELAS_APP.map((t) => t.codigo) : minhas);
    const redes = new Map(this.e.redes.map((r) => [r.id, r.nome]));
    const unidades = this.e.lojas.filter((l) => this.veUnidade(l.id))
      .map((l) => ({ id: l.id, nome: l.nome, rede_id: l.rede_id, rede: l.rede_id ? redes.get(l.rede_id) ?? null : null }))
      .sort((a, b) => (a.rede ?? "").localeCompare(b.rede ?? "") || a.nome.localeCompare(b.nome));
    return { liberadas, unidades };
  }

  async permissoes(unidade: string) {
    return new Set(TELAS_APP.flatMap((t) => t.acoes.filter((a) => this.pode(t.codigo, a, unidade)).map((a) => chave(t.codigo, a))));
  }

  async meuVendedor() {
    return this.e.vendedores.find((v) => v.user_id === this.euId) ?? null;
  }

  async vendedores(unidade: string) {
    return this.e.vendedores.filter((v) => v.loja_id === unidade && (this.veUnidade(unidade) || v.user_id === this.euId))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async salvarVendedor(v: { id?: string; loja_id: string; nome: string; ativo: boolean }) {
    if (!v.nome.trim()) throw new ErroServidor("Informe o nome do vendedor.");
    if (!this.usa(v.loja_id)) throw new ErroServidor("A unidade escolhida não usa o Meta de Vendas (marque o sistema na unidade).");
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
      const u = this.e.usuarios.find((x) => x.email === email.trim().toLowerCase());
      if (!u) throw new ErroServidor("Não existe login com esse e-mail. Peça ao administrador para criar o login.");
      if (this.e.vendedores.some((x) => x.user_id === u.id && x.id !== vendedor)) throw new ErroServidor("Esse login já está ligado a outro vendedor.");
      v.user_id = u.id;
    }
    this.salvar();
  }

  async emailsVendedores(unidade: string) {
    if (!this.pode("metas.vendedores", "ver", unidade)) return new Map<string, string>();
    return new Map(this.e.vendedores.filter((v) => v.loja_id === unidade && v.user_id)
      .map((v) => [v.id, this.e.usuarios.find((u) => u.id === v.user_id)?.email ?? ""] as [string, string]));
  }

  async metas(unidade: string, meses: string[]) {
    if (!this.veUnidade(unidade)) return [];
    return this.e.metas.filter((m) => m.loja_id === unidade && meses.includes(m.mes_referencia)).map((m) => ({ ...m }));
  }

  async salvarMeta(m: Meta) {
    if (!this.pode("metas.configuracao", "editar", m.loja_id)) throw proibido();
    if (this.fechado(m.loja_id, m.mes_referencia)) throw fechadoErro("a meta");
    if ([m.meta_total, m.premio_meta_100, m.premio_meta_90, m.valor_por_cliente_engajado].some((x) => !(x >= 0)) || !(m.percentual_minimo > 0 && m.percentual_minimo <= 1)
      || m.premio_meta_90 > m.premio_meta_100) {
      throw new ErroServidor("Algum valor está fora do permitido (negativo, % acima de 100 ou prêmio mínimo maior que o de 100%).");
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
    const proprio = v.user_id === this.euId && this.pode("metas.meu_desempenho", "editar", loja);
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

  // ---------------------------------------------------------------- só o admin
  private exigirAdmin(o: string) {
    if (!this.eu?.admin) throw soAdmin(o);
  }

  async empresas(): Promise<Empresa[]> {
    this.exigirAdmin("vê o cadastro de empresas");
    return [...this.e.redes].sort((a, b) => a.nome.localeCompare(b.nome))
      .map((r) => ({ ...r, unidades: this.e.lojas.filter((l) => l.rede_id === r.id).map((l) => ({ ...l })).sort((a, b) => a.nome.localeCompare(b.nome)) }));
  }

  async salvarEmpresa(x: { id?: string; nome: string; ativo: boolean }) {
    this.exigirAdmin("cadastra empresas");
    const nome = x.nome.trim().toUpperCase();
    if (!nome) throw new ErroServidor("Informe o nome da empresa.");
    if (this.e.redes.some((r) => r.nome === nome && r.id !== x.id)) throw new ErroServidor("Já existe uma empresa com esse nome.");
    if (x.id) {
      Object.assign(this.e.redes.find((r) => r.id === x.id) ?? {}, { nome, ativo: x.ativo });
      this.salvar();
      return x.id;
    }
    const id = `demo-rede-${uid()}`;
    this.e.redes.push({ id, nome, ativo: x.ativo });
    this.salvar();
    return id;
  }

  async salvarUnidade(u: NovaUnidade) {
    this.exigirAdmin("cadastra unidades");
    const nome = u.nome.trim();
    const cnpj = u.cnpj ? u.cnpj.replace(/\D/g, "") || null : null;
    if (!nome) throw new ErroServidor("Informe o nome da unidade.");
    if (this.e.lojas.some((l) => l.nome.toLowerCase() === nome.toLowerCase() && l.id !== u.id)) throw new ErroServidor("Já existe uma unidade com esse nome.");
    if (cnpj && this.e.lojas.some((l) => l.cnpj === cnpj && l.id !== u.id)) throw new ErroServidor("Já existe uma unidade com esse CNPJ.");
    if (u.id) {
      Object.assign(this.e.lojas.find((l) => l.id === u.id) ?? {}, { nome, cnpj, rede_id: u.rede_id, ativo: u.ativo, usaMetas: u.usaMetas, dados: normalizarDados(u.dados) });
      this.salvar();
      return u.id;
    }
    const id = `demo-loja-${uid()}`;
    this.e.lojas.push({ id, nome, cnpj, rede_id: u.rede_id, ativo: u.ativo, usaMetas: u.usaMetas, outros: [], dados: normalizarDados(u.dados) });
    this.salvar();
    return id;
  }

  async usuarios(rede: string): Promise<UsuarioAcesso[]> {
    this.exigirAdmin("vê os acessos");
    const lojas = this.e.lojas.filter((l) => l.rede_id === rede);
    const linhas: UsuarioAcesso[] = [];
    for (const l of lojas) {
      for (const u of this.e.usuarios) {
        const p = this.e.permissoes.filter((x) => x.user_id === u.id && x.loja_id === l.id);
        if (!p.length) continue;
        const tem = (t: string, a: string) => p.some((x) => x.tela === t && x.acao === a);
        const nome = this.e.vendedores.find((v) => v.user_id === u.id)?.nome ?? u.nome;
        linhas.push({ user_id: u.id, email: u.email, nome, loja_id: l.id, loja: l.nome,
          perfil: tem("metas.configuracao", "editar") ? "gerente" : tem("metas.meu_desempenho", "ver") ? "vendedor" : "personalizado",
          lanca: tem("metas.meu_desempenho", "editar") });
      }
    }
    return linhas.sort((a, b) => a.nome.localeCompare(b.nome) || a.loja.localeCompare(b.loja));
  }

  private definir(usuario: string, nome: string, a: NovoAcesso) {
    let lojas: string[];
    if (a.perfil === "gestor") {
      lojas = this.e.lojas.filter((l) => l.rede_id === a.rede_id && l.ativo && l.usaMetas).map((l) => l.id);
      if (!lojas.length) throw new ErroServidor("A empresa ainda não tem unidade que use o Meta de Vendas.");
    } else {
      const l = this.e.lojas.find((x) => x.id === a.loja_id);
      if (!a.loja_id || !l) throw new ErroServidor("Escolha a unidade.");
      if (l.rede_id !== a.rede_id) throw new ErroServidor("A unidade não é desta empresa.");
      if (!l.usaMetas) throw new ErroServidor("A unidade escolhida não usa o Meta de Vendas (marque o sistema na unidade).");
      lojas = [l.id];
    }
    this.e.permissoes = this.e.permissoes.filter((p) => !(p.user_id === usuario && lojas.includes(p.loja_id)))
      .concat(lojas.flatMap((loja) => telasDoPerfil(a.perfil, a.lanca).map(([tela, acao]) => ({ user_id: usuario, loja_id: loja, tela, acao }))));
    if (a.perfil === "vendedor" && !this.e.vendedores.some((v) => v.user_id === usuario)) {
      this.e.vendedores.push({ id: `v-${uid()}`, loja_id: a.loja_id!, user_id: usuario, nome: nome.trim() || "Vendedor", ativo: true });
    }
    this.salvar();
  }

  async darAcesso(a: NovoAcesso) {
    this.exigirAdmin("dá acessos");
    const u = this.e.usuarios.find((x) => x.email === a.email.trim().toLowerCase());
    if (!u) throw new ErroServidor('Não existe login com esse e-mail. Use "Criar login novo".');
    this.definir(u.id, a.nome || u.nome, a);
  }

  async criarLogin(a: NovoAcesso & { senha: string }) {
    this.exigirAdmin("cria logins");
    const email = a.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroServidor("E-mail inválido.");
    if (a.senha.length < 8) throw new ErroServidor("A senha precisa ter pelo menos 8 caracteres.");
    if (!a.nome.trim()) throw new ErroServidor("Informe o nome.");
    if (this.e.usuarios.some((x) => x.email === email)) throw new ErroServidor('Já existe usuário com esse e-mail. Use "Dar acesso a quem já tem login".');
    const id = `demo-u-${uid()}`;
    this.e.usuarios.push({ id, email, senha: a.senha, nome: a.nome.trim(), admin: false });
    this.definir(id, a.nome, a);
  }

  async removerAcesso(usuario: string, unidade: string) {
    this.exigirAdmin("tira acessos");
    this.e.permissoes = this.e.permissoes.filter((p) => !(p.user_id === usuario && p.loja_id === unidade));
    this.salvar();
  }

  // ---- excluir: as mesmas regras do banco (metas.excluir_*)
  async excluirVendedor(id: string) {
    const v = this.e.vendedores.find((x) => x.id === id);
    if (!v) throw new ErroServidor("Vendedor não encontrado.");
    if (!this.pode("metas.vendedores", "editar", v.loja_id)) throw proibido();
    if (this.e.lancamentos.some((l) => l.vendedor_id === id)) throw new ErroServidor("Este vendedor já tem lançamentos: use Inativar (o histórico continua).");
    this.e.vendedores = this.e.vendedores.filter((x) => x.id !== id);
    this.salvar();
  }

  async excluirUnidade(id: string) {
    this.exigirAdmin("exclui unidades");
    const l = this.e.lojas.find((x) => x.id === id);
    if (!l) throw new ErroServidor("Unidade não encontrada.");
    if (l.outros.length) throw new ErroServidor(`A unidade também é usada em outro sistema (${l.outros.join(", ")}): desmarque o Meta de Vendas ou inative.`);
    const usada = this.e.vendedores.some((x) => x.loja_id === id) || this.e.lancamentos.some((x) => x.loja_id === id)
      || this.e.metas.some((x) => x.loja_id === id) || this.e.fechados.some((x) => x.loja_id === id);
    if (usada) throw new ErroServidor("A unidade já tem vendedores, metas ou lançamentos: use Inativar (o histórico continua).");
    this.e.permissoes = this.e.permissoes.filter((p) => p.loja_id !== id);
    this.e.lojas = this.e.lojas.filter((x) => x.id !== id);
    this.salvar();
  }

  async excluirEmpresa(id: string) {
    this.exigirAdmin("exclui empresas");
    if (this.e.lojas.some((l) => l.rede_id === id)) throw new ErroServidor("Exclua (ou passe para outra empresa) as unidades antes de excluir a empresa.");
    this.e.redes = this.e.redes.filter((r) => r.id !== id);
    this.salvar();
  }
}

/** Apaga tudo o que foi cadastrado na demonstração (botão na tela de entrada). */
export function reiniciarDemo() {
  gravar(VERSAO, null);
  gravar(CHAVE_SESSAO, null);
}

/** Só para os testes automáticos: começa com os dados de exemplo. */
export function semearExemplo() {
  gravar(VERSAO, dadosDeExemplo());
  gravar(CHAVE_SESSAO, null);
}
