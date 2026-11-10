// MODO DEMONSTRAÇÃO: um "servidor" dentro do navegador (IndexedDB), com as MESMAS regras do banco
// (RLS por unidade, versões imutáveis, pendências, pontuação, plano automático, fluxo do plano, histórico).
// Serve para testar no celular sem tocar no banco de produção.
import Dexie, { type Table } from "dexie";
import { agendaVale } from "../domain/agenda";
import { idPlano, md5Uuid, novoId } from "../domain/ids";
import { fator, itemVisivel, itensParaPlano, mapaRespostas, naoConforme, pendencias, pontuacaoExecucao, todosItens } from "../domain/regras";
import { aplicarAcaoPlano, type AcaoPlano, type ArgsAcaoPlano } from "../domain/situacao";
import { dataSP, diaSemana, instanteSP } from "../domain/tempo";
import type { Agendamento, Execucao, Foto, Modelo, ModeloVersao, Perfil, PlanoAcao, Resposta, Tarefa } from "../domain/tipos";
import { calcularDashboard, type RespostaCalculada } from "./dashboard-calc";
import { MODELOS_SEED } from "./seed-modelos";
import {
  ErroServidor, nivel, type Historico, type LinhaRelatorio, type LojaAcesso, type Membro, type NovoPlano, type Pacote,
  type PacoteExecucao, type Servidor, type Sessao,
} from "./servidor";
import { telasDoPerfil } from "../lib/telas";

interface Usuario { id: string; email: string; nome: string; senha: string }
interface Loja { id: string; nome: string }
type RespostaServ = Resposta & Partial<RespostaCalculada>;
type ExecServ = Execucao & { motivo_cancelamento?: string | null; validado_em?: string | null };
type PlanoServ = PlanoAcao & { atualizado_em?: string };
interface Arquivo { path: string; blob: Blob; mime: string }

class BancoDemo extends Dexie {
  usuarios!: Table<Usuario, string>;
  lojas!: Table<Loja, string>;
  membros!: Table<Membro, [string, string]>;
  modelos!: Table<Modelo & { codigo?: string }, string>;
  versoes!: Table<ModeloVersao, string>;
  agendamentos!: Table<Agendamento, string>;
  tarefas!: Table<Tarefa, string>;
  execucoes!: Table<ExecServ, string>;
  respostas!: Table<RespostaServ, string>;
  fotos!: Table<Foto & { loja_id: string; enviado_por: string }, string>;
  planos!: Table<PlanoServ, string>;
  historico!: Table<Historico & { loja_id: string | null }, number>;
  arquivos!: Table<Arquivo, string>;

  constructor(nome: string) {
    super(nome);
    this.version(1).stores({
      usuarios: "id, email",
      lojas: "id",
      membros: "[usuario_id+loja_id], loja_id, usuario_id",
      modelos: "id",
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

export const LOJAS_DEMO: Loja[] = [
  { id: md5Uuid("demo-loja:matriz"), nome: "Supermix Braz – Matriz (demo)" },
  { id: md5Uuid("demo-loja:filial"), nome: "Supermix Braz – Filial (demo)" },
];
const [MATRIZ, FILIAL] = LOJAS_DEMO.map((l) => l.id);

export const USUARIOS_DEMO: (Usuario & { papel: string })[] = [
  { id: md5Uuid("demo-user:ana"), email: "ana@demo.braz", nome: "Ana (Fiscal – Matriz)", senha: "demo", papel: "Operador · fiscal de caixa" },
  { id: md5Uuid("demo-user:bruno"), email: "bruno@demo.braz", nome: "Bruno (Líder – Matriz)", senha: "demo", papel: "Supervisor · líder de loja" },
  { id: md5Uuid("demo-user:carla"), email: "carla@demo.braz", nome: "Carla (Gestora)", senha: "demo", papel: "Gestor · todas as lojas" },
  { id: md5Uuid("demo-user:diego"), email: "diego@demo.braz", nome: "Diego (Fiscal – Filial)", senha: "demo", papel: "Operador · outra loja" },
  { id: md5Uuid("demo-user:elisa"), email: "elisa@demo.braz", nome: "Elisa (Líder – Filial)", senha: "demo", papel: "Supervisor · outra loja" },
];
const [ANA, BRUNO, CARLA, DIEGO, ELISA] = USUARIOS_DEMO.map((u) => u.id);

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

  constructor(nomeBanco = "checklist-demo-servidor", usuarioInicial?: string | null) {
    this.db = new BancoDemo(nomeBanco);
    this.usuario = usuarioInicial === undefined ? lerSessao() : usuarioInicial;
    this.pronto = this.semear();
  }

  // ------------------------------------------------------------------ dados iniciais
  private async semear() {
    if ((await this.db.lojas.count()) > 0) return;
    await this.db.transaction("rw", this.db.tables, async () => {
      await this.db.lojas.bulkAdd(LOJAS_DEMO);
      await this.db.usuarios.bulkAdd(USUARIOS_DEMO.map(({ papel: _p, ...u }) => u));
      const m = (usuario_id: string, loja_id: string, perfil: Perfil): Membro => ({
        usuario_id, loja_id, perfil, ativo: true, nome: USUARIOS_DEMO.find((u) => u.id === usuario_id)!.nome,
      });
      await this.db.membros.bulkAdd([
        m(ANA, MATRIZ, "operador"), m(BRUNO, MATRIZ, "supervisor"), m(CARLA, MATRIZ, "gestor"), m(CARLA, FILIAL, "gestor"),
        m(DIEGO, FILIAL, "operador"), m(ELISA, FILIAL, "supervisor"),
      ]);
      for (const s of MODELOS_SEED) {
        const id = md5Uuid(`checklist-modelo:${s.codigo}`);
        const vid = md5Uuid(`checklist-versao:${s.codigo}:1`);
        await this.db.modelos.add({ id, codigo: s.codigo, nome: s.nome, descricao: s.descricao, categoria: s.categoria, perfil_executor: s.perfil_executor, ativo: true });
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

  /** Apaga tudo e recomeça (botão "Reiniciar demonstração"). */
  async reiniciar() {
    await this.db.delete();
    this.db = new BancoDemo(this.db.name);
    this.pronto = this.semear();
    await this.pronto;
  }

  // ------------------------------------------------------------------ "RLS"
  private async uid(): Promise<string> {
    await this.pronto;
    if (!this.usuario) falha("Sem login.");
    return this.usuario!;
  }

  private async perfil(loja: string, u?: string): Promise<Perfil | null> {
    const id = u ?? (await this.uid());
    const m = await this.db.membros.get([id, loja]);
    return m?.ativo ? m.perfil : null;
  }

  private async pode(loja: string, minimo: Perfil) {
    return nivel(await this.perfil(loja)) >= nivel(minimo);
  }

  private async eGestor() {
    const u = await this.uid();
    return (await this.db.membros.where("usuario_id").equals(u).toArray()).some((m) => m.ativo && m.perfil === "gestor");
  }

  private async hist(tabela: string, registro_id: string, loja_id: string | null, acao: string, justificativa?: string | null) {
    await this.db.historico.add({
      tabela, registro_id, loja_id, acao, autor: this.usuario, data: this.agora().toISOString(),
      justificativa: justificativa?.trim() || null,
    } as Historico & { loja_id: string | null });
  }

  // ------------------------------------------------------------------ sessão / acesso
  async sessaoAtual(): Promise<Sessao | null> {
    await this.pronto;
    if (!this.usuario) return null;
    const u = await this.db.usuarios.get(this.usuario);
    return u ? { usuario_id: u.id, email: u.email, nome: u.nome } : null;
  }

  async entrar(email: string, senha: string): Promise<Sessao> {
    await this.pronto;
    const u = await this.db.usuarios.where("email").equals(email.trim().toLowerCase()).first();
    if (!u || u.senha !== senha) falha("E-mail ou senha incorretos.");
    this.usuario = u!.id;
    gravarSessao(u!.id);
    return { usuario_id: u!.id, email: u!.email, nome: u!.nome };
  }

  async sair() {
    this.usuario = null;
    gravarSessao(null);
  }

  async minhasTelas() {
    const u = await this.uid();
    const ms = (await this.db.membros.where("usuario_id").equals(u).toArray()).filter((m) => m.ativo);
    const maior = ms.reduce<Perfil | null>((a, m) => (nivel(m.perfil) > nivel(a) ? m.perfil : a), null);
    return telasDoPerfil(maior);
  }

  async minhasLojas(): Promise<LojaAcesso[]> {
    const u = await this.uid();
    const ms = (await this.db.membros.where("usuario_id").equals(u).toArray()).filter((m) => m.ativo);
    const lojas = await this.db.lojas.bulkGet(ms.map((m) => m.loja_id));
    return ms.map((m, i) => ({ loja_id: m.loja_id, nome: lojas[i]?.nome ?? "?", perfil: m.perfil })).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async gerarTarefas(data: string) {
    const u = await this.uid();
    const minhas = new Set((await this.db.membros.where("usuario_id").equals(u).toArray()).filter((m) => m.ativo).map((m) => m.loja_id));
    for (const a of await this.db.agendamentos.toArray()) {
      if (!a.ativo || !minhas.has(a.loja_id) || !agendaVale(a, data)) continue;
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

  async baixar(lojas: string[], de: string, ate: string): Promise<Pacote> {
    const u = await this.uid();
    const minhas = [];
    for (const l of lojas) if (await this.perfil(l)) minhas.push(l);
    const sup = new Set<string>();
    for (const l of minhas) if (await this.pode(l, "supervisor")) sup.add(l);
    const filtra = async <T,>(xs: T[], f: (x: T) => Promise<boolean>) => { const r: T[] = []; for (const x of xs) if (await f(x)) r.push(x); return r; };
    const tarefas = await filtra(await this.db.tarefas.where("loja_id").anyOf(minhas).toArray(), async (t) => t.data_ref >= de && t.data_ref <= ate && (await this.tarefaVisivel(t)));
    const execucoes = await filtra(await this.db.execucoes.where("loja_id").anyOf(minhas).toArray(), async (e) => dataSP(e.inicio_em) >= de && (await this.execVisivel(e)));
    const planos = await filtra(await this.db.planos.where("loja_id").anyOf(minhas).toArray(), (p) => this.planoVisivel(p));
    const membros = (await this.db.membros.where("loja_id").anyOf(minhas).toArray()).filter((m) => m.usuario_id === u || sup.has(m.loja_id));
    return {
      modelos: (await this.db.modelos.toArray()).filter((m) => m.ativo),
      versoes: (await this.db.versoes.toArray()).filter((v) => v.status !== "rascunho"),
      tarefas, planos, membros, execucoes,
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
    const resp = (await this.db.membros.where("loja_id").equals(e!.loja_id).toArray())
      .filter((m) => m.ativo && (m.perfil === "supervisor" || m.perfil === "gestor"))
      .sort((a, b) => nivel(a.perfil) - nivel(b.perfil))[0]?.usuario_id ?? null;
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
      const m = await this.db.membros.get([args.responsavel_id, p!.loja_id]);
      if (!m?.ativo) falha("O responsável precisa ser da equipe da unidade.");
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
  private async lojasSupervisor(loja: string | null) {
    const out: { id: string; nome: string }[] = [];
    for (const l of await this.db.lojas.toArray()) if ((!loja || l.id === loja) && (await this.pode(l.id, "supervisor"))) out.push(l);
    return out;
  }

  async dashboard(de: string, ate: string, loja: string | null) {
    const lojas = await this.lojasSupervisor(loja);
    return calcularDashboard({
      de, ate, lojas, agora: this.agora(),
      tarefas: await this.db.tarefas.toArray(), execucoes: await this.db.execucoes.toArray(),
      respostas: (await this.db.respostas.toArray()).map((r) => ({ execucao_id: r.execucao_id, visivel: r.visivel ?? null, fator: r.fator ?? null, peso: r.peso ?? null, setor: r.setor ?? null, nao_conforme: r.nao_conforme ?? null })),
      planos: await this.db.planos.toArray(), membros: await this.db.membros.toArray(),
    });
  }

  async relatorio(de: string, ate: string, loja: string | null): Promise<LinhaRelatorio[]> {
    const lojas = await this.lojasSupervisor(loja);
    const ids = new Set(lojas.map((l) => l.id));
    const es = (await this.db.execucoes.toArray()).filter((e) => ids.has(e.loja_id) && dataSP(e.inicio_em) >= de && dataSP(e.inicio_em) <= ate)
      .sort((a, b) => a.inicio_em.localeCompare(b.inicio_em));
    const out: LinhaRelatorio[] = [];
    for (const e of es) {
      const m = await this.db.modelos.get(e.modelo_id);
      const v = await this.db.versoes.get(e.versao_id);
      const mb = await this.db.membros.get([e.usuario_id, e.loja_id]);
      const rs = await this.db.respostas.where("execucao_id").equals(e.id).toArray();
      out.push({
        execucao_id: e.id, loja: lojas.find((l) => l.id === e.loja_id)!.nome, modelo: m?.nome ?? "?", versao: v?.numero ?? 0,
        pessoa: mb?.nome ?? "Usuário", data: dataSP(e.inicio_em), inicio: e.inicio_em, fim: e.fim_em ?? null,
        duracao_seg: e.fim_em ? Math.round((new Date(e.fim_em).getTime() - new Date(e.inicio_em).getTime()) / 1000) : null,
        status: e.status, pontuacao: e.pontuacao ?? null, nao_conformes: rs.filter((r) => r.nao_conforme).length,
        planos: (await this.db.planos.where("execucao_id").equals(e.id).count()),
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ cadastros
  async salvarAgendamento(a: Agendamento) {
    if (!(await this.pode(a.loja_id, "supervisor"))) falha("Só supervisor ou gestor agenda.");
    if (!a.responsavel_id && !a.perfil_responsavel) falha("Escolha um responsável ou um perfil.");
    if (a.frequencia === "semanal" && !(a.dias_semana ?? []).length) falha("Escolha os dias da semana.");
    if (a.frequencia === "mensal" && a.dia_mes == null && a.dias_antes_fim_mes == null) falha("Escolha o dia do mês.");
    if (a.hora_limite <= a.hora_inicio) falha("O horário-limite precisa ser depois do início.");
    await this.db.agendamentos.put(a);
  }

  async versoesDoModelo(modeloId: string) {
    const g = await this.eGestor();
    return (await this.db.versoes.where("modelo_id").equals(modeloId).sortBy("numero")).filter((v) => g || v.status !== "rascunho");
  }

  async criarRascunho(modeloId: string) {
    if (!(await this.eGestor())) falha("Só o gestor edita modelos.");
    const vs = await this.db.versoes.where("modelo_id").equals(modeloId).sortBy("numero");
    const r = vs.find((v) => v.status === "rascunho");
    if (r) return r.id;
    const ult = vs[vs.length - 1];
    const id = novoId();
    await this.db.versoes.add({ id, modelo_id: modeloId, numero: (ult?.numero ?? 0) + 1, status: "rascunho", conteudo: structuredClone(ult?.conteudo ?? { secoes: [] }) });
    return id;
  }

  async salvarRascunho(v: ModeloVersao) {
    if (!(await this.eGestor())) falha("Só o gestor edita modelos.");
    const atual = await this.db.versoes.get(v.id);
    if (!atual) falha("Versão não encontrada.");
    if (atual!.status !== "rascunho") falha(`Versão ${atual!.numero} já publicada: não pode ser alterada. Crie um rascunho.`);
    await this.db.versoes.update(v.id, { conteudo: v.conteudo });
  }

  async publicarVersao(id: string) {
    if (!(await this.eGestor())) falha("Só o gestor publica modelos.");
    const v = await this.db.versoes.get(id);
    if (!v) falha("Versão não encontrada.");
    if (v!.status === "publicada") return;
    if (v!.status !== "rascunho") falha("Só um rascunho pode ser publicado.");
    if (!todosItens(v!.conteudo).length) falha("O modelo precisa de pelo menos um item.");
    for (const x of await this.db.versoes.where("modelo_id").equals(v!.modelo_id).toArray()) {
      if (x.status === "publicada") await this.db.versoes.update(x.id, { status: "arquivada" });
    }
    await this.db.versoes.update(id, { status: "publicada", publicada_em: this.agora().toISOString() });
    await this.hist("modelo_versoes", id, null, "publicada");
  }

  async equipe(loja: string) {
    const u = await this.uid();
    const sup = await this.pode(loja, "supervisor");
    return (await this.db.membros.where("loja_id").equals(loja).toArray()).filter((m) => sup || m.usuario_id === u).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async definirMembro(email: string, loja: string, perfil: Perfil, nome: string, ativo: boolean) {
    if (!(await this.pode(loja, "gestor"))) falha("Só o gestor define a equipe.");
    const u = await this.db.usuarios.where("email").equals(email.trim().toLowerCase()).first();
    if (!u) falha(`Não existe login com o e-mail ${email}. Peça ao admin para criar o usuário no Portal.`);
    await this.db.membros.put({ usuario_id: u!.id, loja_id: loja, perfil, nome: nome.trim() || email, ativo });
  }
}
