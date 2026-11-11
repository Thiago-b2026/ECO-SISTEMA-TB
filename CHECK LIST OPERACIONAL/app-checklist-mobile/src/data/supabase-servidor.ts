// Servidor real: Supabase ECO-SISTEMA-TB. Dados do sistema no schema "checklist";
// login, telas, empresas (public.redes) e unidades (public.lojas) no schema "public" (iguais ao PDV e ao RH).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AcaoPlano, ArgsAcaoPlano } from "../domain/situacao";
import type { Agendamento, Execucao, Foto, Modelo, ModeloVersao, Perfil, PlanoAcao, Resposta, Tarefa } from "../domain/tipos";
import {
  ErroServidor, type Dashboard, type Empresa, type EmpresaCompleta, type Historico, type LinhaRelatorio, type LojaAcesso,
  type Membro, type NovoColaborador, type NovoPlano, type Pacote, type PacoteExecucao, type Servidor, type Sessao, type Setor, type Unidade,
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

  private async sessaoDe(id: string, email: string): Promise<Sessao> {
    const [m, a] = await Promise.all([
      this.sb.from("membros").select("nome").eq("usuario_id", id).limit(1),
      this.pub.rpc("is_admin"),
    ]);
    return { usuario_id: id, email, nome: (m.data?.[0] as { nome?: string } | undefined)?.nome ?? email, admin: a.data === true };
  }

  async sessaoAtual(): Promise<Sessao | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? this.sessaoDe(u.id, u.email ?? "") : null;
  }

  async entrar(email: string, senha: string): Promise<Sessao> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error || !data.user) {
      throw new ErroServidor(error?.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error?.message ?? "Não foi possível entrar.");
    }
    return this.sessaoDe(data.user.id, data.user.email ?? email);
  }

  async sair() {
    await this.sb.auth.signOut();
  }

  async minhasTelas(): Promise<string[]> {
    const linhas = ok(await this.pub.rpc("minhas_telas", { _app: "checklist" })) as unknown[];
    return linhas.map((x) => (typeof x === "string" ? x : String(Object.values(x as object)[0])));
  }

  async minhasEmpresas(): Promise<Empresa[]> {
    return ok(await this.sb.rpc("minhas_redes", {})) as Empresa[];
  }

  async minhasLojas(): Promise<LojaAcesso[]> {
    // A fonte é o Check List (perfil por unidade / gestor por empresa). Se o Portal tiver unidades liberadas
    // ainda sem perfil, elas aparecem como "sem perfil" (não bloqueia ninguém se a consulta do Portal falhar).
    const perfis = ok(await this.sb.rpc("minhas_lojas", {})) as LojaAcesso[];
    const portal = await this.pub.rpc("minhas_unidades", { _sistema: "checklist" });
    if (portal.error) return perfis;
    const ids = new Set(perfis.map((p) => p.loja_id));
    const extras = ((portal.data ?? []) as { id: string; nome: string; rede_id: string | null; rede: string | null; tipo: string | null; cnpj: string | null }[])
      .filter((u) => !ids.has(u.id))
      .map((u) => ({ loja_id: u.id, nome: u.nome, perfil: null, rede_id: u.rede_id, rede_nome: u.rede, tipo: u.tipo as LojaAcesso["tipo"], cnpj: u.cnpj }));
    return [...perfis, ...extras];
  }

  async gerarTarefas(data: string) {
    await this.rpc("gerar_tarefas", { _data: data });
  }

  async baixar(rede: string, lojas: string[], de: string, ate: string): Promise<Pacote> {
    const [setores, modelos, membros] = await Promise.all([
      this.sb.from("setores").select("*").eq("rede_id", rede),
      this.sb.from("modelos").select("*").eq("rede_id", rede).eq("ativo", true),
      this.sb.from("membros").select("*").eq("rede_id", rede),
    ]);
    const ms = ok(modelos) as Modelo[];
    const versoes = ms.length
      ? ok(await this.sb.from("modelo_versoes").select("id, modelo_id, numero, status, conteudo, publicada_em").in("modelo_id", ms.map((m) => m.id)).neq("status", "rascunho")) as ModeloVersao[]
      : [];
    const vazio = { tarefas: [] as Tarefa[], planos: [] as PlanoAcao[], agendamentos: [] as Agendamento[], execucoes: [] as Execucao[] };
    const porLoja = !lojas.length ? vazio : await (async () => {
      const [tarefas, planos, agendamentos, execucoes] = await Promise.all([
        this.sb.from("v_tarefas").select("*").in("loja_id", lojas).gte("data_ref", de).lte("data_ref", ate),
        this.sb.from("v_planos").select("*").in("loja_id", lojas).or(`status.in.(aberto,em_andamento,aguardando_validacao),atualizado_em.gte.${de}`),
        this.sb.from("agendamentos").select("*").in("loja_id", lojas),
        this.sb.from("execucoes").select("*").in("loja_id", lojas).gte("inicio_em", `${de}T00:00:00-03:00`),
      ]);
      return { tarefas: ok(tarefas) as Tarefa[], planos: ok(planos) as PlanoAcao[], agendamentos: ok(agendamentos) as Agendamento[], execucoes: ok(execucoes) as Execucao[] };
    })();
    return { setores: ok(setores) as Setor[], modelos: ms, versoes, membros: ok(membros) as Membro[], ...porLoja };
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

  async dashboard(de: string, ate: string, loja: string | null, rede: string | null) {
    return this.rpc<Dashboard>("dashboard", { _de: de, _ate: ate, _loja: loja, _rede: rede });
  }

  async relatorio(de: string, ate: string, loja: string | null, rede: string | null) {
    return this.rpc<LinhaRelatorio[]>("relatorio_execucoes", { _de: de, _ate: ate, _loja: loja, _rede: rede });
  }

  async salvarAgendamento(a: Agendamento) {
    ok(await this.sb.from("agendamentos").upsert(a));
  }

  // ------------------------------------------------------------------ checklists (editor)
  async modelosDaEmpresa(rede: string) {
    return ok(await this.sb.from("modelos").select("*").eq("rede_id", rede).order("nome")) as Modelo[];
  }

  async versoesDoModelo(modeloId: string) {
    return ok(await this.sb.from("modelo_versoes").select("*").eq("modelo_id", modeloId).order("numero")) as ModeloVersao[];
  }

  async criarModelo(rede: string, nome: string, descricao: string | null, categoria: string, perfil: Perfil) {
    return this.rpc<string>("criar_modelo", { _rede: rede, _nome: nome, _descricao: descricao, _categoria: categoria, _perfil: perfil });
  }

  async editarModelo(id: string, nome: string, descricao: string | null, categoria: string, perfil: Perfil) {
    await this.rpc("editar_modelo", { _modelo: id, _nome: nome, _descricao: descricao, _categoria: categoria, _perfil: perfil });
  }

  async duplicarModelo(id: string, nome?: string) {
    return this.rpc<string>("duplicar_modelo", { _modelo: id, _nome: nome ?? null });
  }

  async arquivarModelo(id: string, arquivar: boolean) {
    await this.rpc("arquivar_modelo", { _modelo: id, _arquivar: arquivar });
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

  // ------------------------------------------------------------------ equipe e colaboradores
  async equipe(rede: string) {
    return ok(await this.sb.from("membros").select("*").eq("rede_id", rede).order("nome")) as Membro[];
  }

  async definirMembro(email: string, rede: string, loja: string | null, perfil: Perfil, nome: string, ativo: boolean) {
    await this.rpc("definir_membro", { _email: email, _rede: rede, _loja: loja, _perfil: perfil, _nome: nome, _ativo: ativo });
  }

  async alterarMembro(id: string, perfil: Perfil, ativo: boolean, loja?: string | null) {
    await this.rpc("alterar_membro", { _id: id, _perfil: perfil, _ativo: ativo, _loja: loja ?? null });
  }

  async liberarAcesso(membroId: string) {
    await this.rpc("liberar_acesso", { _membro: membroId });
  }

  async criarColaborador(c: NovoColaborador) {
    // serviço central do Ecossistema (Edge Function admin-usuarios do GESTAO SALVADOS), modo Check List
    const { data, error } = await this.sb.functions.invoke("admin-usuarios", {
      body: { acao: "criar", sistema: "checklist", email: c.email, senha: c.senha, nome: c.nome, rede_id: c.rede_id, loja_id: c.loja_id, perfil: c.perfil },
    });
    const msg = (data as { erro?: string } | null)?.erro;
    if (msg) throw new ErroServidor(msg);
    if (error) {
      // a função devolve 400 com { erro } no corpo
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
      throw new ErroServidor(corpo?.erro ?? error.message);
    }
  }

  // ------------------------------------------------------------------ empresas e lojas (admin)
  async empresas(): Promise<EmpresaCompleta[]> {
    const [r, l] = await Promise.all([
      this.pub.from("redes").select("id, nome, ativo, ordem").order("ordem").order("nome"),
      this.pub.from("lojas").select("id, nome, cnpj, tipo, rede_id, ativo, sistemas").order("nome"),
    ]);
    const unidades = ok(l) as Unidade[];
    return (ok(r) as { id: string; nome: string; ativo: boolean }[]).map((x) => ({ ...x, unidades: unidades.filter((u) => u.rede_id === x.id) }));
  }

  async criarEmpresa(nome: string) {
    const r = ok(await this.pub.from("redes").insert({ nome: nome.trim().toUpperCase() }).select("id").single()) as { id: string };
    await this.prepararEmpresa(r.id);
    return r.id;
  }

  async salvarUnidade(u: { id?: string; rede_id: string; nome: string; cnpj: string | null; ativo: boolean; usaChecklist: boolean }) {
    const cnpj = u.cnpj ? u.cnpj.replace(/\D/g, "") || null : null;
    if (u.id) {
      const atual = ok(await this.pub.from("lojas").select("sistemas").eq("id", u.id).single()) as { sistemas: string[] };
      const sistemas = u.usaChecklist ? [...new Set([...atual.sistemas, "checklist"])] : atual.sistemas.filter((s) => s !== "checklist");
      ok(await this.pub.from("lojas").update({ nome: u.nome.trim(), cnpj, ativo: u.ativo, rede_id: u.rede_id, sistemas }).eq("id", u.id));
      return u.id;
    }
    const r = ok(await this.pub.from("lojas").insert({ nome: u.nome.trim(), cnpj, ativo: u.ativo, rede_id: u.rede_id, sistemas: u.usaChecklist ? ["checklist"] : [] })
      .select("id").single()) as { id: string };
    return r.id;
  }

  async prepararEmpresa(rede: string) {
    await this.rpc("preparar_empresa", { _rede: rede });
  }

  async copiarModelos(de: string, para: string, modelos: string[] | null) {
    return this.rpc<number>("copiar_modelos", { _de: de, _para: para, _modelos: modelos });
  }
}
