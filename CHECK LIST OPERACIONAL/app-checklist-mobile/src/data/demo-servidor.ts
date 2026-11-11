// MODO DEMONSTRAÇÃO: um "servidor" dentro do navegador (IndexedDB), com as MESMAS regras do banco
// (multiempresa, RLS por empresa/unidade, versões imutáveis, pendências, pontuação, plano automático,
// fluxo do plano, histórico). Serve para testar sem tocar no banco de produção.
// Só abre no "npm run dev" ou com VITE_MODO_DEMO=1 (ver conexao.ts).
import Dexie, { type Table } from "dexie";
import { agendaVale } from "../domain/agenda";
import { idPlano, md5Uuid, novoId } from "../domain/ids";
import { fator, itemVisivel, itensParaPlano, mapaRespostas, naoConforme, pendencias, pontuacaoExecucao, todosItens } from "../domain/regras";
import { aplicarAcaoPlano, type AcaoPlano, type ArgsAcaoPlano } from "../domain/situacao";
import { dataSP, diaSemana, instanteSP } from "../domain/tempo";
import type { Agendamento, Execucao, Foto, Modelo, ModeloVersao, Perfil, PlanoAcao, Resposta, Tarefa } from "../domain/tipos";
import { TELAS_APP, telasDoPerfil } from "../lib/telas";
import { calcularDashboard, type RespostaCalculada } from "./dashboard-calc";
import { MODELOS_SEED, SETORES } from "./seed-modelos";
import {
  ErroServidor, nivel, type Empresa, type EmpresaCompleta, type Historico, type LinhaRelatorio, type LojaAcesso, type Membro,
  type NovoColaborador, type NovoPlano, type Pacote, type PacoteExecucao, type Servidor, type Sessao, type Setor, type Unidade,
} from "./servidor";

interface Usuario { id: string; email: string; nome: string; senha: string; admin?: boolean }
interface Rede { id: string; nome: string; ativo: boolean; ordem: number }
interface Loja { id: string; nome: string; cnpj: string | null; rede_id: string | null; ativo: boolean; sistemas: string[] }
type RespostaServ = Resposta & Partial<RespostaCalculada>;
type ExecServ = Execucao & { motivo_cancelamento?: string | null; validado_em?: string | null };
type PlanoServ = PlanoAcao & { atualizado_em?: string };
interface Arquivo { path: string; blob: Blob; mime: string }

class BancoDemo extends Dexie {
  usuarios!: Table<Usuario, string>;
  redes!: Table<Rede, string>;
  lojas!: Table<Loja, string>;
  membros!: Table<Membro, string>;
  setores!: Table<Setor, [string, string]>;
  modelos!: Table<Modelo, string>;
  versoes!: Table<ModeloVersao, string>;
  agendamentos!: Table<Agendamento, string>;
  tarefas!: Table<Tarefa, string>;
  execucoes!: Table<ExecServ, string>;
  respostas!: Table<RespostaServ, string>;
  fotos!: Table<Foto & { loja_id: string; enviado_por: string }, string>;
  planos!: Table<PlanoServ, string>;
  historico!: Table<Historico & { loja_id: string | null; rede_id: string | null }, number>;
  arquivos!: Table<Arquivo, string>;

  constructor(nome: string) {
    super(nome);
    this.version(1).stores({
      usuarios: "id, email",
      redes: "id, nome",
      lojas: "id, rede_id",
      membros: "id, usuario_id, loja_id, rede_id",
      setores: "[rede_id+codigo], rede_id",
      modelos: "id, rede_id",
      versoes: "id, modelo_id",
      agendamentos: "id, loja_id",
      tarefas: "id, loja_id, data_ref, agendamento_id",
      execucoes: "id, loja_id, usuario_id, tarefa_id",
      respostas: "id, execucao_id, [execucao_id+item_id]",
      fotos: "id, execucao_id, plano_id, storage_path",
      planos: "id, loja_id, execucao_id",
      historico: "++id, registro_id",
      arquivos: "path",
    });
  }
}

export const tipoDoCnpj = (cnpj: string | null | undefined): "matriz" | "filial" | null =>
  cnpj && /^\d{14}$/.test(cnpj) ? (cnpj.slice(8, 12) === "0001" ? "matriz" : "filial") : null;

export const REDES_DEMO: Rede[] = [
  { id: md5Uuid("demo-rede:supermix"), nome: "SUPERMIX BRAZ", ativo: true, ordem: 20 },
  { id: md5Uuid("demo-rede:exemplo2"), nome: "EMPRESA EXEMPLO 2", ativo: true, ordem: 90 },
];
const [SUPERMIX, EXEMPLO2] = REDES_DEMO.map((r) => r.id);

export const LOJAS_DEMO: Loja[] = [
  { id: md5Uuid("demo-loja:matriz"), nome: "Supermix Braz – Matriz (demo)", cnpj: "17890178000158", rede_id: SUPERMIX, ativo: true, sistemas: ["checklist"] },
  { id: md5Uuid("demo-loja:filial"), nome: "Supermix Braz – Filial (demo)", cnpj: "17890178000239", rede_id: SUPERMIX, ativo: true, sistemas: ["checklist"] },
  { id: md5Uuid("demo-loja:ex2-matriz"), nome: "Exemplo 2 – Matriz", cnpj: "22333444000110", rede_id: EXEMPLO2, ativo: true, sistemas: ["checklist"] },
  { id: md5Uuid("demo-loja:ex2-filial"), nome: "Exemplo 2 – Filial", cnpj: "22333444000200", rede_id: EXEMPLO2, ativo: true, sistemas: ["checklist"] },
];
const [MATRIZ, FILIAL] = LOJAS_DEMO.map((l) => l.id);

export const USUARIOS_DEMO: (Usuario & { papel: string })[] = [
  { id: md5Uuid("demo-user:admin"), email: "admin@demo.tb", nome: "Admin (Ecossistema TB)", senha: "demo", admin: true, papel: "Admin · todas as empresas, lojas e colaboradores" },
  { id: md5Uuid("demo-user:ana"), email: "ana@demo.braz", nome: "Ana (Fiscal – Matriz)", senha: "demo", papel: "Operador · fiscal de caixa" },
  { id: md5Uuid("demo-user:bruno"), email: "bruno@demo.braz", nome: "Bruno (Líder – Matriz)", senha: "demo", papel: "Supervisor · líder de loja" },
  { id: md5Uuid("demo-user:carla"), email: "carla@demo.braz", nome: "Carla (Gestora)", senha: "demo", papel: "Gestor · empresa Supermix Braz" },
  { id: md5Uuid("demo-user:diego"), email: "diego@demo.braz", nome: "Diego (Fiscal – Filial)", senha: "demo", papel: "Operador · outra loja" },
  { id: md5Uuid("demo-user:elisa"), email: "elisa@demo.braz", nome: "Elisa (Líder – Filial)", senha: "demo", papel: "Supervisor · outra loja" },
  { id: md5Uuid("demo-user:gabriel"), email: "gabriel@demo.ex2", nome: "Gabriel (Gestor – Exemplo 2)", senha: "demo", papel: "Gestor · outra empresa" },
];
const [, ANA, BRUNO, CARLA, DIEGO, ELISA, GABRIEL] = USUARIOS_DEMO.map((u) => u.id);

const CHAVE_SESSAO = "checklist-demo-sessao";
const lerSessao = (): string | null => { try { return globalThis.localStorage?.getItem(CHAVE_SESSAO) ?? null; } catch { return null; } };
const gravarSessao = (id: string | null) => {
  try { if (id) globalThis.localStorage?.setItem(CHAVE_SESSAO, id); else globalThis.localStorage?.removeItem(CHAVE_SESSAO); } catch { /* sem storage */ }
};

const falha = (msg: string): never => { throw new ErroServidor(msg); };

export class DemoServidor implements Servidor {
  readonly modo = "demo" as const;
  private db: BancoDemo;
  private usuario: string | null;
  private pronto: Promise<void>;
  /** relógio (os testes usam um relógio fixo) */
  agora: () => Date = () => new Date();

  constructor(nomeBanco = "checklist-demo-servidor-v2", usuarioInicial?: string | null) {
    this.db = new BancoDemo(nomeBanco);
    this.usuario = usuarioInicial === undefined ? lerSessao() : usuarioInicial;
    this.pronto = this.semear();
  }

  // ------------------------------------------------------------------ dados iniciais
  private async semear() {
    if ((await this.db.redes.count()) > 0) return;
    await this.db.transaction("rw", this.db.tables, async () => {
      await this.db.redes.bulkAdd(REDES_DEMO);
      await this.db.lojas.bulkAdd(LOJAS_DEMO);
      await this.db.usuarios.bulkAdd(USUARIOS_DEMO.map(({ papel: _p, ...u }) => u));
      const m = (usuario_id: string, rede_id: string, loja_id: string | null, perfil: Perfil): Membro => ({
        id: md5Uuid(`demo-membro:${usuario_id}:${rede_id}:${loja_id}`), usuario_id, rede_id, loja_id, perfil, ativo: true,
        nome: USUARIOS_DEMO.find((u) => u.id === usuario_id)!.nome,
      });
      await this.db.membros.bulkAdd([
        m(ANA, SUPERMIX, MATRIZ, "operador"), m(BRUNO, SUPERMIX, MATRIZ, "supervisor"), m(CARLA, SUPERMIX, null, "gestor"),
        m(DIEGO, SUPERMIX, FILIAL, "operador"), m(ELISA, SUPERMIX, FILIAL, "supervisor"), m(GABRIEL, EXEMPLO2, null, "gestor"),
      ]);
      for (const r of REDES_DEMO) await this.setoresPadrao(r.id);
      for (const s of MODELOS_SEED) {
        const id = md5Uuid(`checklist-modelo:${s.codigo}`);
        const vid = md5Uuid(`checklist-versao:${s.codigo}:1`);
        await this.db.modelos.add({ id, rede_id: SUPERMIX, codigo: s.codigo, nome: s.nome, descricao: s.descricao, categoria: s.categoria, perfil_executor: s.perfil_executor, ativo: true });
        await this.db.versoes.add({ id: vid, modelo_id: id, numero: 1, status: "publicada", conteudo: s.conteudo, publicada_em: new Date().toISOString() });
        const lojas = ["fiscal_manha", "fiscal_tarde", "lider_manha"].includes(s.codigo) ? [MATRIZ, FILIAL] : [MATRIZ];
        for (const loja of lojas) {
          await this.db.agendamentos.add({
            id: md5Uuid(`demo-agenda:${s.codigo}:${loja}`), modelo_id: id, loja_id: loja, responsavel_id: null,
            perfil_responsavel: s.perfil_executor, frequencia: s.agenda.frequencia, dias_semana: s.agenda.dias_semana ?? null,
            dia_mes: s.agenda.dia_mes ?? null, dias_antes_fim_mes: s.agenda.dias_antes_fim_mes ?? null,
            hora_inicio: s.agenda.hora_inicio, hora_limite: s.agenda.hora_limite, ativo: true,
          });
        }
      }
    });
  }

  private async setoresPadrao(rede: string) {
    for (const [codigo, nome] of Object.entries(SETORES)) {
      if (!(await this.db.setores.get([rede, codigo]))) await this.db.setores.add({ rede_id: rede, codigo, nome, ativo: true });
    }
  }

  /** Apaga tudo e recomeça (botão "Reiniciar demonstração"). */
  async reiniciar() {
    await this.db.delete();
    this.db = new BancoDemo(this.db.name);
    this.pronto = this.semear();
    await this.pronto;
  }

  // ------------------------------------------------------------------ "RLS" (igual ao banco)
  private async uid(): Promise<string> {
    await this.pronto;
    if (!this.usuario) falha("Sem login.");
    return this.usuario!;
  }

  private async eAdmin(u?: string) {
    const id = u ?? (await this.uid());
    return !!(await this.db.usuarios.get(id))?.admin;
  }

  private async redeDaLoja(loja: string) {
    return (await this.db.lojas.get(loja))?.rede_id ?? null;
  }

  private async redeDoModelo(modelo: string) {
    return (await this.db.modelos.get(modelo))?.rede_id ?? null;
  }

  private async membrosDe(u: string) {
    return (await this.db.membros.where("usuario_id").equals(u).toArray()).filter((m) => m.ativo);
  }

  /** admin = gestor; gestor da empresa da unidade = gestor; senão o perfil da unidade */
  private async perfil(loja: string, u?: string): Promise<Perfil | null> {
    const id = u ?? (await this.uid());
    if (await this.eAdmin(id)) return "gestor";
    const rede = await this.redeDaLoja(loja);
    const ms = await this.membrosDe(id);
    if (ms.some((m) => m.perfil === "gestor" && m.rede_id === rede)) return "gestor";
    return ms.find((m) => m.loja_id === loja)?.perfil ?? null;
  }

  private async pode(loja: string, minimo: Perfil) {
    return nivel(await this.perfil(loja)) >= nivel(minimo);
  }

  private async eGestor(rede: string | null) {
    if (!rede) return false;
    const u = await this.uid();
    return (await this.eAdmin(u)) || (await this.membrosDe(u)).some((m) => m.perfil === "gestor" && m.rede_id === rede);
  }

  private async naRede(rede: string | null) {
    if (!rede) return false;
    const u = await this.uid();
    return (await this.eAdmin(u)) || (await this.membrosDe(u)).some((m) => m.rede_id === rede);
  }

  private async hist(tabela: string, registro_id: string, loja_id: string | null, acao: string, justificativa?: string | null, rede?: string | null) {
    await this.db.historico.add({
      tabela, registro_id, loja_id, rede_id: rede ?? (loja_id ? await this.redeDaLoja(loja_id) : null), acao, autor: this.usuario,
      data: this.agora().toISOString(), justificativa: justificativa?.trim() || null,
    } as Historico & { loja_id: string | null; rede_id: string | null });
  }

  // ------------------------------------------------------------------ sessão / acesso
  private sessao(u: Usuario): Sessao {
    return { usuario_id: u.id, email: u.email, nome: u.nome, admin: !!u.admin };
  }

  async sessaoAtual(): Promise<Sessao | null> {
    await this.pronto;
    if (!this.usuario) return null;
    const u = await this.db.usuarios.get(this.usuario);
    return u ? this.sessao(u) : null;
  }

  async entrar(email: string, senha: string): Promise<Sessao> {
    await this.pronto;
    const u = await this.db.usuarios.where("email").equals(email.trim().toLowerCase()).first();
    if (!u || u.senha !== senha) falha("E-mail ou senha incorretos.");
    this.usuario = u!.id;
    gravarSessao(u!.id);
    return this.sessao(u!);
  }

  async sair() {
    this.usuario = null;
    gravarSessao(null);
  }

  async minhasTelas() {
    const u = await this.uid();
    if (await this.eAdmin(u)) return TELAS_APP.map((t) => t.codigo);
    const maior = (await this.membrosDe(u)).reduce<Perfil | null>((a, m) => (nivel(m.perfil) > nivel(a) ? m.perfil : a), null);
    return telasDoPerfil(maior);
  }

  async minhasEmpresas(): Promise<Empresa[]> {
    const u = await this.uid();
    const admin = await this.eAdmin(u);
    const ms = await this.membrosDe(u);
    return (await this.db.redes.toArray()).filter((r) => r.ativo && (admin || ms.some((m) => m.rede_id === r.id)))
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
      .map((r) => ({
        rede_id: r.id, nome: r.nome,
        perfil: admin ? "gestor" : ms.filter((m) => m.rede_id === r.id).reduce<Perfil | null>((a, m) => (nivel(m.perfil) > nivel(a) ? m.perfil : a), null),
      }));
  }

  async minhasLojas(): Promise<LojaAcesso[]> {
    const out: LojaAcesso[] = [];
    const redes = new Map((await this.db.redes.toArray()).map((r) => [r.id, r.nome]));
    for (const l of await this.db.lojas.toArray()) {
      if (!l.ativo || !l.sistemas.includes("checklist")) continue;
      const p = await this.perfil(l.id);
      if (p) out.push({ loja_id: l.id, nome: l.nome, perfil: p, rede_id: l.rede_id, rede_nome: l.rede_id ? redes.get(l.rede_id) ?? null : null, tipo: tipoDoCnpj(l.cnpj), cnpj: l.cnpj });
    }
    return out.sort((a, b) => (a.rede_nome ?? "").localeCompare(b.rede_nome ?? "") || (a.tipo === "matriz" ? -1 : 1) - (b.tipo === "matriz" ? -1 : 1) || a.nome.localeCompare(b.nome));
  }

  async gerarTarefas(data: string) {
    await this.uid();
    for (const a of await this.db.agendamentos.toArray()) {
      if (!a.ativo || !(await this.perfil(a.loja_id)) || !agendaVale(a, data)) continue;
      const modelo = await this.db.modelos.get(a.modelo_id);
      const publicada = (await this.db.versoes.where("modelo_id").equals(a.modelo_id).toArray()).some((v) => v.status === "publicada");
      if (!modelo?.ativo || !publicada) continue;
      const id = md5Uuid(`demo-tarefa:${a.id}:${data}`);
      if (await this.db.tarefas.get(id)) continue;
      await this.db.tarefas.add({
        id, agendamento_id: a.id, modelo_id: a.modelo_id, loja_id: a.loja_id, responsavel_id: a.responsavel_id,
        perfil_responsavel: a.perfil_responsavel, data_ref: data, prazo: instanteSP(data, a.hora_limite),
      });
    }
  }

  private async tarefaVisivel(t: Tarefa) {
    const u = await this.uid();
    if (await this.pode(t.loja_id, "supervisor")) return true;
    return t.responsavel_id === u || (t.responsavel_id == null && t.perfil_responsavel === (await this.perfil(t.loja_id)));
  }

  private async execVisivel(e: Execucao) {
    return e.usuario_id === (await this.uid()) || (await this.pode(e.loja_id, "supervisor"));
  }

  private async planoVisivel(p: PlanoAcao) {
    const u = await this.uid();
    return (await this.pode(p.loja_id, "supervisor")) || p.responsavel_id === u || p.criado_por === u;
  }

  private async membroVisivel(m: Membro) {
    const u = await this.uid();
    return m.usuario_id === u || (await this.eGestor(m.rede_id)) || (m.loja_id ? await this.pode(m.loja_id, "supervisor") : await this.naRede(m.rede_id));
  }

  async baixar(rede: string, lojas: string[], de: string, ate: string): Promise<Pacote> {
    const filtra = async <T,>(xs: T[], f: (x: T) => Promise<boolean>) => { const r: T[] = []; for (const x of xs) if (await f(x)) r.push(x); return r; };
    const dentro = rede && (await this.naRede(rede));
    const minhas: string[] = [];
    for (const l of lojas) if ((await this.redeDaLoja(l)) === rede && (await this.perfil(l))) minhas.push(l);
    const modelos = dentro ? (await this.db.modelos.where("rede_id").equals(rede).toArray()).filter((m) => m.ativo) : [];
    const ids = new Set(modelos.map((m) => m.id));
    return {
      setores: dentro ? await this.db.setores.where("rede_id").equals(rede).toArray() : [],
      modelos,
      versoes: (await this.db.versoes.toArray()).filter((v) => ids.has(v.modelo_id) && v.status !== "rascunho"),
      membros: dentro ? await filtra(await this.db.membros.where("rede_id").equals(rede).toArray(), (m) => this.membroVisivel(m)) : [],
      tarefas: await filtra(await this.db.tarefas.where("loja_id").anyOf(minhas).toArray(), async (t) => t.data_ref >= de && t.data_ref <= ate && (await this.tarefaVisivel(t))),
      execucoes: await filtra(await this.db.execucoes.where("loja_id").anyOf(minhas).toArray(), async (e) => dataSP(e.inicio_em) >= de && (await this.execVisivel(e))),
      planos: await filtra(await this.db.planos.where("loja_id").anyOf(minhas).toArray(), (p) => this.planoVisivel(p)),
      agendamentos: await this.db.agendamentos.where("loja_id").anyOf(minhas).toArray(),
    };
  }

  // ------------------------------------------------------------------ arquivos
  async enviarArquivo(path: string, blob: Blob, mime: string) {
    const u = await this.uid();
    if (!(await this.perfil(path.split("/")[0], u))) falha("Sem permissão para enviar foto nesta unidade.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) falha("Tipo de arquivo não permitido.");
    if (blob.size > 5 * 1024 * 1024) falha("Foto maior que 5 MB.");
    if (await this.db.arquivos.get(path)) return; // reenvio
    await this.db.arquivos.add({ path, blob, mime });
  }

  async urlArquivo(path: string) {
    const a = await this.db.arquivos.get(path);
    if (!a) falha("Foto indisponível.");
    return URL.createObjectURL(a!.blob);
  }

  // ------------------------------------------------------------------ execuções
  async syncExecucao(e: Execucao, respostas: Resposta[], fotos: Foto[]) {
    const u = await this.uid();
    let ex = await this.db.execucoes.get(e.id);
    if (!ex) {
      if (!(await this.perfil(e.loja_id))) falha("Você não faz parte desta unidade.");
      if ((await this.redeDaLoja(e.loja_id)) !== (await this.redeDoModelo(e.modelo_id))) falha("A unidade é de outra empresa: este checklist não vale para ela.");
      const v = await this.db.versoes.get(e.versao_id);
      if (!v || v.modelo_id !== e.modelo_id || v.status === "rascunho") falha("Versão de modelo inválida.");
      if (e.tarefa_id) {
        const t = await this.db.tarefas.get(e.tarefa_id);
        if (!t || t.loja_id !== e.loja_id || t.modelo_id !== e.modelo_id) falha("Tarefa não confere com a execução.");
      }
      ex = { ...e, usuario_id: u, status: "em_andamento", fim_em: null, pontuacao: null };
      await this.db.execucoes.add(ex);
    } else if (ex.usuario_id !== u) {
      falha("Esta execução é de outra pessoa.");
    }
    if (ex!.status === "em_andamento" || ex!.status === "devolvida") {
      for (const r of respostas) {
        const atual = await this.db.respostas.where("[execucao_id+item_id]").equals([e.id, r.item_id]).first();
        if (atual && atual.respondido_em > r.respondido_em) continue;
        await this.db.respostas.put({ ...r, id: atual?.id ?? r.id, execucao_id: e.id });
      }
      for (const f of fotos) {
        const [loja, exec] = f.storage_path.split("/");
        if (loja !== ex!.loja_id || exec !== e.id) falha("Caminho de foto inválido.");
        if (!["image/jpeg", "image/png", "image/webp"].includes(f.mime) || !(f.bytes > 0 && f.bytes <= 5242880)) falha("Foto inválida (tipo ou tamanho).");
        if (!(await this.db.fotos.get(f.id))) await this.db.fotos.add({ ...f, execucao_id: e.id, loja_id: ex!.loja_id, enviado_por: u });
      }
    }
    return { status: ex!.status };
  }

  private async responsavelPadrao(loja: string): Promise<string | null> {
    const rede = await this.redeDaLoja(loja);
    const ms = (await this.db.membros.toArray()).filter((m) => m.ativo && ((m.loja_id === loja && m.perfil === "supervisor") || (m.loja_id == null && m.perfil === "gestor" && m.rede_id === rede)));
    return ms.sort((a, b) => nivel(a.perfil) - nivel(b.perfil))[0]?.usuario_id ?? null;
  }

  async concluirExecucao(id: string, fim: string, assinaturaPath: string | null, lat: number | null, lng: number | null) {
    const u = await this.uid();
    const e = await this.db.execucoes.get(id);
    if (!e) falha("Execução não encontrada.");
    if (e!.usuario_id !== u) falha("Só quem executou pode concluir.");
    if (e!.status === "concluida" || e!.status === "validada") return { pontuacao: e!.pontuacao ?? null };
    if (e!.status !== "em_andamento" && e!.status !== "devolvida") falha(`Execução ${e!.status}: não pode ser concluída.`);
    const v = (await this.db.versoes.get(e!.versao_id))!;
    const tarefa = e!.tarefa_id ? await this.db.tarefas.get(e!.tarefa_id) : undefined;
    const dow = diaSemana(tarefa?.data_ref ?? dataSP(e!.inicio_em));
    const rs = await this.db.respostas.where("execucao_id").equals(id).toArray();
    const fotos = await this.db.fotos.where("execucao_id").equals(id).toArray();
    const porItem = new Map<string, number>();
    for (const f of fotos) if (f.item_id) porItem.set(f.item_id, (porItem.get(f.item_id) ?? 0) + 1);
    const pend = pendencias(v.conteudo, rs, porItem, dow);
    if (pend.length) falha(`Há pendências obrigatórias: ${pend.map((p) => `${p.item_id} (${p.mensagem})`).join("; ")}`);

    const p = pontuacaoExecucao(v.conteudo, rs, dow);
    const itens = todosItens(v.conteudo);
    const porId = new Map(itens.map((i) => [i.id, i]));
    const mapa = mapaRespostas(rs);
    for (const r of rs) {
      const item = porId.get(r.item_id);
      if (!item) continue;
      const vis = itemVisivel(item, porId, mapa, dow);
      await this.db.respostas.update(r.id, {
        visivel: vis, fator: vis ? fator(item, r.valor) : null, peso: item.peso, setor: item.setor ?? null, nao_conforme: vis && naoConforme(item, r.valor),
      });
    }
    const fimOk = fim || this.agora().toISOString();
    await this.db.execucoes.update(id, {
      status: "concluida", fim_em: fimOk, pontuacao: p.percentual, assinatura_path: assinaturaPath ?? e!.assinatura_path ?? null,
      lat: lat ?? e!.lat ?? null, lng: lng ?? e!.lng ?? null, motivo_devolucao: null,
    });
    const resp = await this.responsavelPadrao(e!.loja_id);
    for (const item of itensParaPlano(v.conteudo, rs, dow)) {
      const pid = idPlano(id, item.id);
      if (await this.db.planos.get(pid)) continue;
      await this.db.planos.add({
        id: pid, execucao_id: id, item_id: item.id, loja_id: e!.loja_id, setor: item.setor ?? null, titulo: item.texto.slice(0, 200),
        descricao: mapa.get(item.id)?.observacao ?? null, responsavel_id: resp,
        prazo: new Date(new Date(fimOk).getTime() + 86400000).toISOString(), status: "aberto", criado_por: u, criado_em: this.agora().toISOString(),
      });
      await this.hist("planos_acao", pid, e!.loja_id, "criado_automatico");
    }
    if (tarefa && !tarefa.concluida_em) await this.db.tarefas.update(tarefa.id, { concluida_em: fimOk, execucao_id: id });
    await this.hist("execucoes", id, e!.loja_id, e!.status === "devolvida" ? "reenviada" : "concluida");
    return { pontuacao: p.percentual };
  }

  async validarExecucao(id: string, aprovar: boolean, motivo?: string) {
    const u = await this.uid();
    const e = await this.db.execucoes.get(id);
    if (!e) falha("Execução não encontrada.");
    if (!(await this.pode(e!.loja_id, "supervisor"))) falha("Só supervisor ou gestor valida.");
    if (e!.usuario_id === u) falha("Você não pode validar a sua própria execução.");
    if (aprovar && e!.status === "validada") return;
    if (!aprovar && e!.status === "devolvida") return;
    if (e!.status !== "concluida") falha("Só uma execução concluída pode ser validada ou devolvida.");
    if (aprovar) {
      await this.db.execucoes.update(id, { status: "validada", validado_por: u, validado_em: this.agora().toISOString() });
      await this.hist("execucoes", id, e!.loja_id, "validada");
    } else {
      if (!motivo?.trim()) falha("Informe o motivo da devolução.");
      await this.db.execucoes.update(id, { status: "devolvida", motivo_devolucao: motivo!.trim(), validado_por: null });
      if (e!.tarefa_id) await this.db.tarefas.update(e!.tarefa_id, { concluida_em: null });
      await this.hist("execucoes", id, e!.loja_id, "devolvida", motivo);
    }
  }

  async cancelarExecucao(id: string, motivo: string) {
    const u = await this.uid();
    const e = await this.db.execucoes.get(id);
    if (!e) falha("Execução não encontrada.");
    if (e!.usuario_id !== u && !(await this.pode(e!.loja_id, "supervisor"))) falha("Sem permissão.");
    if (!motivo.trim()) falha("Informe o motivo do cancelamento.");
    if (e!.status === "cancelada") return;
    if (e!.status === "concluida" || e!.status === "validada") falha("Execução concluída não pode ser cancelada.");
    await this.db.execucoes.update(id, { status: "cancelada", motivo_cancelamento: motivo.trim() });
    await this.hist("execucoes", id, e!.loja_id, "cancelada", motivo);
  }

  async cancelarTarefa(id: string, motivo: string) {
    const t = await this.db.tarefas.get(id);
    if (!t) falha("Tarefa não encontrada.");
    if (!(await this.pode(t!.loja_id, "supervisor"))) falha("Só supervisor ou gestor cancela tarefa.");
    if (!motivo.trim()) falha("Informe o motivo do cancelamento.");
    if (t!.cancelada_em) return;
    if (t!.concluida_em) falha("Tarefa já concluída não pode ser cancelada.");
    await this.db.tarefas.update(id, { cancelada_em: this.agora().toISOString(), motivo_cancelamento: motivo.trim() });
    await this.hist("tarefas", id, t!.loja_id, "cancelada", motivo);
  }

  async detalheExecucao(id: string): Promise<PacoteExecucao> {
    const e = await this.db.execucoes.get(id);
    if (!e || !(await this.execVisivel(e))) falha("Execução não encontrada.");
    return {
      execucao: e!,
      respostas: await this.db.respostas.where("execucao_id").equals(id).toArray(),
      fotos: await this.db.fotos.where("execucao_id").equals(id).toArray(),
    };
  }

  // ------------------------------------------------------------------ planos
  async acaoPlano(id: string, acao: AcaoPlano, args: ArgsAcaoPlano) {
    const u = await this.uid();
    const p = await this.db.planos.get(id);
    if (!p) falha("Plano de ação não encontrado.");
    const sup = await this.pode(p!.loja_id, "supervisor");
    if (acao === "alterar" && args.responsavel_id) {
      const rede = await this.redeDaLoja(p!.loja_id);
      const ok = (await this.db.membros.where("usuario_id").equals(args.responsavel_id).toArray())
        .some((m) => m.ativo && (m.loja_id === p!.loja_id || (m.loja_id == null && m.rede_id === rede)));
      if (!ok) falha("O responsável precisa ser da equipe da unidade.");
    }
    let novo: PlanoAcao;
    try {
      novo = aplicarAcaoPlano(p!, acao, u, sup, args);
    } catch (e) {
      throw new ErroServidor((e as Error).message);
    }
    if (novo === p) return;
    await this.db.planos.put({ ...novo, atualizado_em: this.agora().toISOString() });
    const nomes: Record<AcaoPlano, string> = { iniciar: "iniciado", enviar_solucao: "solucao_enviada", validar: "validado", rejeitar: "rejeitado", cancelar: "cancelado", alterar: "alterado" };
    await this.hist("planos_acao", id, p!.loja_id, nomes[acao], acao === "rejeitar" || acao === "cancelar" || acao === "alterar" ? args.texto : null);
  }

  async criarPlano(p: NovoPlano) {
    const u = await this.uid();
    if (!(await this.pode(p.loja_id, "supervisor"))) falha("Só supervisor ou gestor cria plano.");
    if (!p.titulo.trim()) falha("Informe o título.");
    if (await this.db.planos.get(p.id)) return;
    await this.db.planos.add({ ...p, execucao_id: null, item_id: null, status: "aberto", criado_por: u, criado_em: this.agora().toISOString() });
    await this.hist("planos_acao", p.id, p.loja_id, "criado");
  }

  async registrarFotoPlano(f: Foto) {
    const u = await this.uid();
    const p = await this.db.planos.get(f.plano_id!);
    if (!p) falha("Plano de ação não encontrado.");
    if (!((await this.pode(p!.loja_id, "supervisor")) || p!.responsavel_id === u)) falha("Sem permissão neste plano de ação.");
    if (await this.db.fotos.get(f.id)) return;
    if (p!.status !== "aberto" && p!.status !== "em_andamento") falha(`Plano ${p!.status}: não aceita foto agora.`);
    await this.db.fotos.add({ ...f, execucao_id: null, loja_id: p!.loja_id, enviado_por: u });
  }

  async historico(registroId: string): Promise<Historico[]> {
    const hs = await this.db.historico.where("registro_id").equals(registroId).sortBy("id");
    const us = await this.db.usuarios.toArray();
    return hs.map((h) => ({ ...h, autor_nome: us.find((u) => u.id === h.autor)?.nome }));
  }

  // ------------------------------------------------------------------ dashboard / relatório
  private async lojasSupervisor(loja: string | null, rede: string | null) {
    const out: { id: string; nome: string }[] = [];
    for (const l of await this.db.lojas.toArray()) {
      if ((!loja || l.id === loja) && (!rede || l.rede_id === rede) && (await this.pode(l.id, "supervisor"))) out.push(l);
    }
    return out;
  }

  async dashboard(de: string, ate: string, loja: string | null, rede: string | null) {
    const lojas = await this.lojasSupervisor(loja, rede);
    return calcularDashboard({
      de, ate, lojas, agora: this.agora(),
      tarefas: await this.db.tarefas.toArray(), execucoes: await this.db.execucoes.toArray(),
      respostas: (await this.db.respostas.toArray()).map((r) => ({ execucao_id: r.execucao_id, visivel: r.visivel ?? null, fator: r.fator ?? null, peso: r.peso ?? null, setor: r.setor ?? null, nao_conforme: r.nao_conforme ?? null })),
      planos: await this.db.planos.toArray(), membros: await this.db.membros.toArray(),
    });
  }

  async relatorio(de: string, ate: string, loja: string | null, rede: string | null): Promise<LinhaRelatorio[]> {
    const lojas = await this.lojasSupervisor(loja, rede);
    const ids = new Set(lojas.map((l) => l.id));
    const es = (await this.db.execucoes.toArray()).filter((e) => ids.has(e.loja_id) && dataSP(e.inicio_em) >= de && dataSP(e.inicio_em) <= ate)
      .sort((a, b) => a.inicio_em.localeCompare(b.inicio_em));
    const out: LinhaRelatorio[] = [];
    for (const e of es) {
      const m = await this.db.modelos.get(e.modelo_id);
      const v = await this.db.versoes.get(e.versao_id);
      const mb = (await this.db.membros.where("usuario_id").equals(e.usuario_id).toArray())[0];
      const rs = await this.db.respostas.where("execucao_id").equals(e.id).toArray();
      out.push({
        execucao_id: e.id, loja: lojas.find((l) => l.id === e.loja_id)!.nome, modelo: m?.nome ?? "?", versao: v?.numero ?? 0,
        pessoa: mb?.nome ?? "Usuário", data: dataSP(e.inicio_em), inicio: e.inicio_em, fim: e.fim_em ?? null,
        duracao_seg: e.fim_em ? Math.round((new Date(e.fim_em).getTime() - new Date(e.inicio_em).getTime()) / 1000) : null,
        status: e.status, pontuacao: e.pontuacao ?? null, nao_conformes: rs.filter((r) => r.nao_conforme).length,
        planos: await this.db.planos.where("execucao_id").equals(e.id).count(),
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ agendamentos
  async salvarAgendamento(a: Agendamento) {
    if (!(await this.pode(a.loja_id, "supervisor"))) falha("Só supervisor ou gestor agenda.");
    if ((await this.redeDaLoja(a.loja_id)) !== (await this.redeDoModelo(a.modelo_id))) falha("A unidade é de outra empresa: este checklist não vale para ela.");
    if (!a.responsavel_id && !a.perfil_responsavel) falha("Escolha um responsável ou um perfil.");
    if (a.frequencia === "semanal" && !(a.dias_semana ?? []).length) falha("Escolha os dias da semana.");
    if (a.frequencia === "mensal" && a.dia_mes == null && a.dias_antes_fim_mes == null) falha("Escolha o dia do mês.");
    if (a.hora_limite <= a.hora_inicio) falha("O horário-limite precisa ser depois do início.");
    await this.db.agendamentos.put(a);
  }

  // ------------------------------------------------------------------ checklists (editor)
  private async exigirGestorDoModelo(modeloId: string, acao = "edita") {
    const rede = await this.redeDoModelo(modeloId);
    if (!rede) falha("Checklist não encontrado.");
    if (!(await this.eGestor(rede))) falha(`Só o gestor da empresa ${acao} checklists.`);
    return rede!;
  }

  async modelosDaEmpresa(rede: string) {
    if (!(await this.naRede(rede))) return [];
    return (await this.db.modelos.where("rede_id").equals(rede).toArray()).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async versoesDoModelo(modeloId: string) {
    const rede = await this.redeDoModelo(modeloId);
    if (!(await this.naRede(rede))) return [];
    const g = await this.eGestor(rede);
    return (await this.db.versoes.where("modelo_id").equals(modeloId).sortBy("numero")).filter((v) => g || v.status !== "rascunho");
  }

  async criarModelo(rede: string, nome: string, descricao: string | null, categoria: string, perfil: Perfil) {
    if (!(await this.eGestor(rede))) falha("Só o gestor da empresa cria checklists.");
    if (!nome.trim()) falha("Informe o nome do checklist.");
    const id = novoId();
    await this.db.modelos.add({ id, rede_id: rede, codigo: null, nome: nome.trim(), descricao: descricao?.trim() || undefined, categoria: categoria || "diaria", perfil_executor: perfil, ativo: true });
    await this.db.versoes.add({ id: novoId(), modelo_id: id, numero: 1, status: "rascunho", conteudo: { secoes: [] } });
    await this.hist("modelos", id, null, "criado", null, rede);
    return id;
  }

  async editarModelo(id: string, nome: string, descricao: string | null, categoria: string, perfil: Perfil) {
    await this.exigirGestorDoModelo(id);
    if (!nome.trim()) falha("Informe o nome do checklist.");
    await this.db.modelos.update(id, { nome: nome.trim(), descricao: descricao?.trim() || undefined, categoria, perfil_executor: perfil });
  }

  private async copiar(modeloId: string, para: string, nome?: string | null) {
    const m = (await this.db.modelos.get(modeloId))!;
    const vs = await this.db.versoes.where("modelo_id").equals(modeloId).sortBy("numero");
    const base = vs.find((v) => v.status === "publicada") ?? vs[vs.length - 1];
    let codigo = m.codigo ?? null;
    if (codigo && (await this.db.modelos.where("rede_id").equals(para).toArray()).some((x) => x.codigo === codigo)) codigo = `${codigo}_${novoId().slice(0, 6)}`;
    const id = novoId();
    await this.db.modelos.add({ ...m, id, rede_id: para, codigo, nome: nome?.trim() || m.nome, ativo: true });
    await this.db.versoes.add({ id: novoId(), modelo_id: id, numero: 1, status: "rascunho", conteudo: structuredClone(base?.conteudo ?? { secoes: [] }) });
    await this.hist("modelos", id, null, "copiado", null, para);
    return id;
  }

  async duplicarModelo(id: string, nome?: string) {
    const rede = await this.exigirGestorDoModelo(id, "duplica");
    return this.copiar(id, rede, nome ?? `${(await this.db.modelos.get(id))!.nome} (cópia)`);
  }

  async arquivarModelo(id: string, arquivar: boolean) {
    const rede = await this.exigirGestorDoModelo(id, "arquiva");
    await this.db.modelos.update(id, { ativo: !arquivar });
    if (arquivar) for (const a of await this.db.agendamentos.toArray()) if (a.modelo_id === id) await this.db.agendamentos.update(a.id, { ativo: false });
    await this.hist("modelos", id, null, arquivar ? "arquivado" : "reativado", null, rede);
  }

  async criarRascunho(modeloId: string) {
    await this.exigirGestorDoModelo(modeloId);
    const vs = await this.db.versoes.where("modelo_id").equals(modeloId).sortBy("numero");
    const r = vs.find((v) => v.status === "rascunho");
    if (r) return r.id;
    const ult = vs[vs.length - 1];
    const id = novoId();
    await this.db.versoes.add({ id, modelo_id: modeloId, numero: (ult?.numero ?? 0) + 1, status: "rascunho", conteudo: structuredClone(ult?.conteudo ?? { secoes: [] }) });
    return id;
  }

  async salvarRascunho(v: ModeloVersao) {
    const atual = await this.db.versoes.get(v.id);
    if (!atual) falha("Versão não encontrada.");
    await this.exigirGestorDoModelo(atual!.modelo_id);
    if (atual!.status !== "rascunho") falha(`Versão ${atual!.numero} já publicada: não pode ser alterada. Crie um rascunho.`);
    await this.db.versoes.update(v.id, { conteudo: structuredClone(v.conteudo) });
  }

  async publicarVersao(id: string) {
    const v = await this.db.versoes.get(id);
    if (!v) falha("Versão não encontrada.");
    const rede = await this.exigirGestorDoModelo(v!.modelo_id, "publica");
    if (v!.status === "publicada") return;
    if (v!.status !== "rascunho") falha("Só um rascunho pode ser publicado.");
    if (!todosItens(v!.conteudo).length) falha("O modelo precisa de pelo menos um item.");
    for (const x of await this.db.versoes.where("modelo_id").equals(v!.modelo_id).toArray()) {
      if (x.status === "publicada") await this.db.versoes.update(x.id, { status: "arquivada" });
    }
    await this.db.versoes.update(id, { status: "publicada", publicada_em: this.agora().toISOString() });
    await this.hist("modelo_versoes", id, null, "publicada", null, rede);
  }

  // ------------------------------------------------------------------ equipe e colaboradores
  async equipe(rede: string) {
    const out: Membro[] = [];
    for (const m of await this.db.membros.where("rede_id").equals(rede).toArray()) if (await this.membroVisivel(m)) out.push(m);
    return out.sort((a, b) => a.nome.localeCompare(b.nome));
  }

  private async gravarMembro(usuario: string, rede: string, loja: string | null, perfil: Perfil, nome: string, ativo: boolean) {
    const lojaOk = perfil === "gestor" ? null : loja;
    if (perfil !== "gestor" && !lojaOk) falha("Escolha a unidade.");
    if (lojaOk && (await this.redeDaLoja(lojaOk)) !== rede) falha("A unidade não é desta empresa.");
    const atual = (await this.db.membros.where("usuario_id").equals(usuario).toArray()).find((m) => m.rede_id === rede && m.loja_id === lojaOk);
    const m: Membro = { id: atual?.id ?? novoId(), usuario_id: usuario, rede_id: rede, loja_id: lojaOk, perfil, nome: nome.trim(), ativo };
    await this.db.membros.put(m);
    return m;
  }

  async definirMembro(email: string, rede: string, loja: string | null, perfil: Perfil, nome: string, ativo: boolean) {
    if (!(await this.eGestor(rede))) falha("Só o gestor da empresa define a equipe.");
    const u = await this.db.usuarios.where("email").equals(email.trim().toLowerCase()).first();
    if (!u) falha(`Não existe login com o e-mail ${email}. Peça ao admin para criar o colaborador.`);
    await this.gravarMembro(u!.id, rede, loja, perfil, nome || email, ativo);
  }

  async alterarMembro(id: string, perfil: Perfil, ativo: boolean, loja?: string | null) {
    const m = await this.db.membros.get(id);
    if (!m) falha("Pessoa não está na equipe.");
    if (!(await this.eGestor(m!.rede_id))) falha("Só o gestor da empresa define a equipe.");
    const u = await this.uid();
    if (m!.usuario_id === u && m!.perfil === "gestor" && (!ativo || perfil !== "gestor") && !(await this.eAdmin(u))) falha("Você não pode tirar o seu próprio perfil de gestor.");
    const novaLoja = perfil === "gestor" ? null : loja ?? m!.loja_id;
    if (perfil !== "gestor" && !novaLoja) falha("Escolha a unidade.");
    if (novaLoja && (await this.redeDaLoja(novaLoja)) !== m!.rede_id) falha("A unidade não é desta empresa.");
    await this.db.membros.put({ ...m!, perfil, ativo, loja_id: novaLoja });
  }

  async liberarAcesso(membroId: string) {
    if (!(await this.eAdmin())) falha("Só o admin libera telas (regra do Ecossistema).");
    if (!(await this.db.membros.get(membroId))) falha("Pessoa não está na equipe.");
    // no modo demonstração as telas saem do perfil (minhasTelas); nada a gravar
  }

  async criarColaborador(c: NovoColaborador) {
    if (!(await this.eAdmin())) falha("Só o admin cria colaborador (login do Ecossistema).");
    const email = c.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) falha("E-mail inválido.");
    if (c.senha.length < 8) falha("A senha precisa ter pelo menos 8 caracteres.");
    if (!c.nome.trim()) falha("Informe o nome.");
    if (await this.db.usuarios.where("email").equals(email).first()) falha("Já existe usuário com esse e-mail. Use \"Incluir quem já tem login\".");
    const id = novoId();
    await this.db.usuarios.add({ id, email, nome: c.nome.trim(), senha: c.senha });
    await this.gravarMembro(id, c.rede_id, c.loja_id, c.perfil, c.nome, true);
  }

  // ------------------------------------------------------------------ empresas e lojas (admin)
  private async exigirAdmin() {
    if (!(await this.eAdmin())) falha("Só o admin cadastra empresas e lojas.");
  }

  async empresas(): Promise<EmpresaCompleta[]> {
    await this.exigirAdmin();
    const lojas = await this.db.lojas.toArray();
    return (await this.db.redes.toArray()).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome)).map((r) => ({
      id: r.id, nome: r.nome, ativo: r.ativo,
      unidades: lojas.filter((l) => l.rede_id === r.id).map((l): Unidade => ({ ...l, tipo: tipoDoCnpj(l.cnpj) })).sort((a, b) => a.nome.localeCompare(b.nome)),
    }));
  }

  async criarEmpresa(nome: string) {
    await this.exigirAdmin();
    const n = nome.trim().toUpperCase();
    if (!n) falha("Informe o nome da empresa.");
    if ((await this.db.redes.where("nome").equals(n).count()) > 0) falha("Já existe uma empresa com esse nome.");
    const id = novoId();
    await this.db.redes.add({ id, nome: n, ativo: true, ordem: 100 });
    await this.prepararEmpresa(id);
    return id;
  }

  async salvarUnidade(u: { id?: string; rede_id: string; nome: string; cnpj: string | null; ativo: boolean; usaChecklist: boolean }) {
    await this.exigirAdmin();
    const cnpj = u.cnpj ? u.cnpj.replace(/\D/g, "") || null : null;
    if (cnpj && !/^\d{14}$/.test(cnpj)) falha("CNPJ precisa ter 14 dígitos.");
    if (!u.nome.trim()) falha("Informe o nome da unidade.");
    const todas = await this.db.lojas.toArray();
    if (todas.some((l) => l.id !== u.id && l.nome.toLowerCase() === u.nome.trim().toLowerCase())) falha("Já existe uma unidade com esse nome.");
    if (cnpj && todas.some((l) => l.id !== u.id && l.cnpj === cnpj)) falha("Já existe uma unidade com esse CNPJ.");
    const atual = u.id ? await this.db.lojas.get(u.id) : undefined;
    const sistemas = new Set(atual?.sistemas ?? []);
    if (u.usaChecklist) sistemas.add("checklist"); else sistemas.delete("checklist");
    const id = u.id ?? novoId();
    await this.db.lojas.put({ id, nome: u.nome.trim(), cnpj, rede_id: u.rede_id, ativo: u.ativo, sistemas: [...sistemas] });
    return id;
  }

  async prepararEmpresa(rede: string) {
    if (!(await this.eGestor(rede))) falha("Só o admin ou o gestor da empresa.");
    await this.setoresPadrao(rede);
  }

  async copiarModelos(de: string, para: string, modelos: string[] | null) {
    if (!((await this.eAdmin()) || ((await this.eGestor(de)) && (await this.eGestor(para))))) falha("Só o admin (ou quem é gestor das duas empresas) copia checklists entre empresas.");
    if (de === para) falha("Escolha uma empresa de origem diferente.");
    let n = 0;
    for (const m of (await this.db.modelos.where("rede_id").equals(de).toArray()).filter((x) => x.ativo && (!modelos || modelos.includes(x.id)))) {
      await this.copiar(m.id, para);
      n++;
    }
    return n;
  }
}
