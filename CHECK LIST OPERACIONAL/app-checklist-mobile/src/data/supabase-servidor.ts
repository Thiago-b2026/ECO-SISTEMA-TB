// Servidor real: Supabase ECO-SISTEMA-TB. Dados do sistema no schema "checklist";
// login, telas e unidades no schema "public" (iguais ao PDV e ao RH).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AcaoPlano, ArgsAcaoPlano } from "../domain/situacao";
import type { Agendamento, Execucao, Foto, Modelo, ModeloVersao, Perfil, PlanoAcao, Resposta, Tarefa } from "../domain/tipos";
import {
  ErroServidor, type Dashboard, type Historico, type LinhaRelatorio, type LojaAcesso, type Membro, type NovoPlano,
  type Pacote, type PacoteExecucao, type Servidor, type Sessao,
} from "./servidor";

const BUCKET = "checklist-fotos";

type Resultado<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Falha de rede (sem internet) × erro de regra. */
function erro(e: { message: string } | Error | unknown): ErroServidor {
  const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
  const semConexao = /Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(msg);
  return new ErroServidor(semConexao ? "Sem conexão com o servidor." : msg, semConexao);
}

function ok<T>(r: Resultado<T>): T {
  if (r.error) throw erro(r.error);
  return r.data as T;
}

export class SupabaseServidor implements Servidor {
  readonly modo = "supabase" as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sb: SupabaseClient<any, "checklist", "checklist">;

  constructor(url: string, chaveAnon: string) {
    this.sb = createClient(url, chaveAnon, {
      auth: { persistSession: true, autoRefreshToken: true },
      db: { schema: "checklist" },
    });
  }

  private get pub() {
    return this.sb.schema("public");
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    try {
      return ok(await this.sb.rpc(fn, args)) as T;
    } catch (e) {
      throw e instanceof ErroServidor ? e : erro(e);
    }
  }

  private async nomeDe(id: string, email: string): Promise<string> {
    const r = await this.sb.from("membros").select("nome").eq("usuario_id", id).limit(1);
    return (r.data?.[0] as { nome?: string } | undefined)?.nome ?? email;
  }

  async sessaoAtual(): Promise<Sessao | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    return { usuario_id: u.id, email: u.email ?? "", nome: await this.nomeDe(u.id, u.email ?? "") };
  }

  async entrar(email: string, senha: string): Promise<Sessao> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error || !data.user) {
      throw new ErroServidor(error?.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error?.message ?? "Não foi possível entrar.");
    }
    return { usuario_id: data.user.id, email: data.user.email ?? email, nome: await this.nomeDe(data.user.id, data.user.email ?? email) };
  }

  async sair() {
    await this.sb.auth.signOut();
  }

  async minhasTelas(): Promise<string[]> {
    const r = await this.pub.rpc("minhas_telas", { _app: "checklist" });
    const linhas = ok(r) as unknown[];
    return linhas.map((x) => (typeof x === "string" ? x : String(Object.values(x as object)[0])));
  }

  async minhasLojas(): Promise<LojaAcesso[]> {
    const perfis = ok(await this.sb.rpc("minhas_lojas", {})) as { loja_id: string; nome: string; perfil: Perfil }[];
    // Unidades liberadas no Portal. Se a consulta falhar, valem só as do Check List (não bloqueia todo mundo).
    const portal = await this.pub.rpc("minhas_unidades", { _sistema: "checklist" });
    if (portal.error) return perfis;
    const lista = (portal.data ?? []) as { id: string; nome: string }[];
    const mapa = new Map(perfis.map((p) => [p.loja_id, p]));
    return lista.map((u) => ({ loja_id: u.id, nome: u.nome, perfil: mapa.get(u.id)?.perfil ?? null }));
  }

  async gerarTarefas(data: string) {
    await this.rpc("gerar_tarefas", { _data: data });
  }

  async baixar(lojas: string[], de: string, ate: string): Promise<Pacote> {
    if (!lojas.length) return { modelos: [], versoes: [], tarefas: [], planos: [], membros: [], agendamentos: [], execucoes: [] };
    const [modelos, versoes, tarefas, planos, membros, agendamentos, execucoes] = await Promise.all([
      this.sb.from("modelos").select("*").eq("ativo", true),
      this.sb.from("modelo_versoes").select("id, modelo_id, numero, status, conteudo, publicada_em").neq("status", "rascunho"),
      this.sb.from("v_tarefas").select("*").in("loja_id", lojas).gte("data_ref", de).lte("data_ref", ate),
      this.sb.from("v_planos").select("*").in("loja_id", lojas).or(`status.in.(aberto,em_andamento,aguardando_validacao),atualizado_em.gte.${de}`),
      this.sb.from("membros").select("*").in("loja_id", lojas),
      this.sb.from("agendamentos").select("*").in("loja_id", lojas),
      this.sb.from("execucoes").select("*").in("loja_id", lojas).gte("inicio_em", `${de}T00:00:00-03:00`),
    ]);
    return {
      modelos: ok(modelos) as Modelo[],
      versoes: ok(versoes) as ModeloVersao[],
      tarefas: ok(tarefas) as Tarefa[],
      planos: ok(planos) as PlanoAcao[],
      membros: ok(membros) as Membro[],
      agendamentos: ok(agendamentos) as Agendamento[],
      execucoes: ok(execucoes) as Execucao[],
    };
  }

  async enviarArquivo(path: string, blob: Blob, mime: string) {
    try {
      const { error } = await this.sb.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
      // já enviado antes (reenvio) = ok
      if (error && !/exists|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ""}`)) throw erro(error);
    } catch (e) {
      throw e instanceof ErroServidor ? e : erro(e);
    }
  }

  async urlArquivo(path: string) {
    const { data, error } = await this.sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    if (error || !data) throw erro(error ?? new Error("Foto indisponível."));
    return data.signedUrl;
  }

  async syncExecucao(e: Execucao, respostas: Resposta[], fotos: Foto[]) {
    return this.rpc<{ status: string }>("sync_execucao", {
      _e: e,
      _respostas: respostas.map((r) => ({ id: r.id, item_id: r.item_id, valor: r.valor, observacao: r.observacao ?? null, respondido_em: r.respondido_em, lat: r.lat ?? null, lng: r.lng ?? null })),
      _fotos: fotos.map((f) => ({ id: f.id, item_id: f.item_id, storage_path: f.storage_path, mime: f.mime, bytes: f.bytes, tirada_em: f.tirada_em, lat: f.lat ?? null, lng: f.lng ?? null, precisao_m: f.precisao_m ?? null })),
    });
  }

  async concluirExecucao(id: string, fim: string, assinaturaPath: string | null, lat: number | null, lng: number | null) {
    const r = await this.rpc<{ pontuacao: number | null }>("concluir_execucao", { _id: id, _fim: fim, _assinatura_path: assinaturaPath, _lat: lat, _lng: lng });
    return { pontuacao: r.pontuacao == null ? null : Number(r.pontuacao) };
  }

  async validarExecucao(id: string, aprovar: boolean, motivo?: string) {
    await this.rpc("validar_execucao", { _id: id, _aprovar: aprovar, _motivo: motivo ?? null });
  }

  async cancelarExecucao(id: string, motivo: string) {
    await this.rpc("cancelar_execucao", { _id: id, _motivo: motivo });
  }

  async cancelarTarefa(id: string, motivo: string) {
    await this.rpc("cancelar_tarefa", { _id: id, _motivo: motivo });
  }

  async detalheExecucao(id: string): Promise<PacoteExecucao> {
    const [e, r, f] = await Promise.all([
      this.sb.from("execucoes").select("*").eq("id", id).single(),
      this.sb.from("respostas").select("*").eq("execucao_id", id),
      this.sb.from("fotos").select("*").eq("execucao_id", id),
    ]);
    return { execucao: ok(e) as Execucao, respostas: ok(r) as Resposta[], fotos: ok(f) as Foto[] };
  }

  async acaoPlano(id: string, acao: AcaoPlano, args: ArgsAcaoPlano) {
    const t = args.texto ?? null;
    switch (acao) {
      case "iniciar": return void (await this.rpc("plano_iniciar", { _id: id }));
      case "enviar_solucao": return void (await this.rpc("plano_enviar_solucao", { _id: id, _solucao: t }));
      case "validar": return void (await this.rpc("plano_validar", { _id: id }));
      case "rejeitar": return void (await this.rpc("plano_rejeitar", { _id: id, _justificativa: t }));
      case "cancelar": return void (await this.rpc("plano_cancelar", { _id: id, _motivo: t }));
      case "alterar": return void (await this.rpc("plano_alterar", { _id: id, _prazo: args.prazo ?? null, _responsavel: args.responsavel_id ?? null, _justificativa: t }));
    }
  }

  async criarPlano(p: NovoPlano) {
    await this.rpc("plano_criar", { _id: p.id, _loja: p.loja_id, _titulo: p.titulo, _descricao: p.descricao, _responsavel: p.responsavel_id, _prazo: p.prazo, _setor: p.setor });
  }

  async registrarFotoPlano(f: Foto) {
    await this.rpc("registrar_foto_plano", { _f: f });
  }

  async historico(registroId: string): Promise<Historico[]> {
    return ok(await this.sb.from("historico").select("*").eq("registro_id", registroId).order("id")) as Historico[];
  }

  async dashboard(de: string, ate: string, loja: string | null) {
    return this.rpc<Dashboard>("dashboard", { _de: de, _ate: ate, _loja: loja });
  }

  async relatorio(de: string, ate: string, loja: string | null) {
    return this.rpc<LinhaRelatorio[]>("relatorio_execucoes", { _de: de, _ate: ate, _loja: loja });
  }

  async salvarAgendamento(a: Agendamento) {
    ok(await this.sb.from("agendamentos").upsert(a));
  }

  async versoesDoModelo(modeloId: string) {
    return ok(await this.sb.from("modelo_versoes").select("*").eq("modelo_id", modeloId).order("numero")) as ModeloVersao[];
  }

  async criarRascunho(modeloId: string) {
    return this.rpc<string>("criar_rascunho", { _modelo: modeloId });
  }

  async salvarRascunho(v: ModeloVersao) {
    ok(await this.sb.from("modelo_versoes").update({ conteudo: v.conteudo }).eq("id", v.id).eq("status", "rascunho"));
  }

  async publicarVersao(id: string) {
    await this.rpc("publicar_versao", { _versao: id });
  }

  async equipe(loja: string) {
    return ok(await this.sb.from("membros").select("*").eq("loja_id", loja).order("nome")) as Membro[];
  }

  async alterarMembro(usuario: string, loja: string, perfil: Perfil, ativo: boolean) {
    await this.rpc("alterar_membro", { _usuario: usuario, _loja: loja, _perfil: perfil, _ativo: ativo });
  }

  async definirMembro(email: string, loja: string, perfil: Perfil, nome: string, ativo: boolean) {
    await this.rpc("definir_membro", { _email: email, _loja: loja, _perfil: perfil, _nome: nome, _ativo: ativo });
  }
}
