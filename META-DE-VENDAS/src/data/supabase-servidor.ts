// Servidor real: Supabase ECO-SISTEMA-TB. Dados do sistema no schema "metas"; login, telas, unidades e
// permissões no schema "public" (mesmo login de todos os sistemas). As regras de verdade são o RLS.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chave, TELAS_APP } from "../lib/telas";
import {
  CAMPOS_UNIDADE, ErroServidor, normalizarDados, traduzir, type Acesso, type DadosUnidade, type Empresa, type Lancamento, type Meta, type NovaUnidade,
  type NovoAcesso, type NovoLancamento, type Servidor, type Sessao, type Unidade, type UnidadeCadastro, type UsuarioAcesso, type Vendedor,
} from "./servidor";

type Resp = { data: unknown; error: { message: string } | null };
function ok<T>(r: Resp): T {
  if (r.error) throw new ErroServidor(traduzir(r.error.message));
  return r.data as T;
}
const num = (v: unknown) => Number(v ?? 0);
const meta = (m: Record<string, unknown>): Meta => ({
  loja_id: String(m.loja_id), mes_referencia: String(m.mes_referencia), meta_total: num(m.meta_total),
  percentual_minimo: num(m.percentual_minimo), premio_meta_100: num(m.premio_meta_100), premio_meta_90: num(m.premio_meta_90),
  valor_por_cliente_engajado: num(m.valor_por_cliente_engajado),
});
const lanc = (l: Record<string, unknown>): Lancamento => ({
  id: String(l.id), vendedor_id: String(l.vendedor_id), loja_id: String(l.loja_id), mes_referencia: String(l.mes_referencia),
  faturamento_realizado: num(l.faturamento_realizado), clientes_engajados: num(l.clientes_engajados),
});
const COLS_LANC = "id, vendedor_id, loja_id, mes_referencia, faturamento_realizado, clientes_engajados";
const COLS_VEND = "id, loja_id, user_id, nome, ativo";

export class SupabaseServidor implements Servidor {
  readonly modo = "supabase" as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sb: SupabaseClient<any, "metas", "metas">;

  constructor(url: string, chaveAnon: string) {
    this.sb = createClient(url, chaveAnon, { auth: { persistSession: true, autoRefreshToken: true }, db: { schema: "metas" } });
  }

  private get pub() {
    return this.sb.schema("public");
  }

  private async sessaoDe(id: string, email: string): Promise<Sessao> {
    const [v, a] = await Promise.all([
      this.sb.from("vendedores").select("nome").eq("user_id", id).limit(1),
      this.pub.rpc("is_admin"),
    ]);
    return { usuario_id: id, email, nome: (v.data?.[0] as { nome?: string } | undefined)?.nome ?? email, admin: a.data === true };
  }

  async sessaoAtual(): Promise<Sessao | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? this.sessaoDe(u.id, u.email ?? "") : null;
  }

  async entrar(email: string, senha: string): Promise<Sessao> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error || !data.user) {
      throw new ErroServidor(error?.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : traduzir(error?.message ?? "Não foi possível entrar."));
    }
    return this.sessaoDe(data.user.id, data.user.email ?? email);
  }

  async sair() {
    await this.sb.auth.signOut();
  }

  async acesso(): Promise<Acesso> {
    const [telas, unid] = await Promise.all([
      this.pub.rpc("minhas_telas", { _app: "metas" }),
      this.pub.rpc("minhas_unidades", { _sistema: "metas" }),
    ]);
    const unidades = ok<{ id: string; nome: string; rede_id: string | null; rede: string | null }[]>(unid)
      .map((u): Unidade => ({ id: u.id, nome: u.nome, rede_id: u.rede_id, rede: u.rede }));
    if (telas.error) return { liberadas: null, unidades };
    const linhas = (telas.data ?? []) as unknown[];
    const codigos = linhas.map((x) => (typeof x === "string" ? x : String((x as { codigo?: string }).codigo ?? Object.values(x as object)[0])));
    return { liberadas: new Set(codigos), unidades };
  }

  async permissoes(unidade: string): Promise<Set<string>> {
    const r = ok<{ tela_codigo: string; acao: string }[]>(await this.pub.rpc("minhas_permissoes", { _sistema: "metas", _unidade: unidade }));
    return new Set(r.filter((p) => TELAS_APP.some((t) => t.codigo === p.tela_codigo)).map((p) => chave(p.tela_codigo, p.acao)));
  }

  async meuVendedor(): Promise<Vendedor | null> {
    const { data } = await this.sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) return null;
    const r = ok<Vendedor[]>(await this.sb.from("vendedores").select(COLS_VEND).eq("user_id", id).limit(1));
    return r[0] ?? null;
  }

  async vendedores(unidade: string): Promise<Vendedor[]> {
    return ok<Vendedor[]>(await this.sb.from("vendedores").select(COLS_VEND).eq("loja_id", unidade).order("nome"));
  }

  async salvarVendedor(v: { id?: string; loja_id: string; nome: string; ativo: boolean }): Promise<Vendedor> {
    const dados = { loja_id: v.loja_id, nome: v.nome.trim(), ativo: v.ativo };
    const r = v.id
      ? await this.sb.from("vendedores").update(dados).eq("id", v.id).select(COLS_VEND).single()
      : await this.sb.from("vendedores").insert(dados).select(COLS_VEND).single();
    return ok<Vendedor>(r);
  }

  async ligarLogin(vendedor: string, email: string | null) {
    ok(await this.sb.rpc("ligar_login", { _vendedor: vendedor, _email: email ?? "" }));
  }

  async emailsVendedores(unidade: string) {
    const r = ok<{ vendedor_id: string; email: string }[]>(await this.sb.rpc("emails_vendedores", { _loja: unidade }));
    return new Map(r.map((x) => [x.vendedor_id, x.email]));
  }

  async metas(unidade: string, meses: string[]): Promise<Meta[]> {
    if (!meses.length) return [];
    return ok<Record<string, unknown>[]>(await this.sb.from("configuracao_meta").select("*").eq("loja_id", unidade).in("mes_referencia", meses)).map(meta);
  }

  async salvarMeta(m: Meta) {
    ok(await this.sb.from("configuracao_meta").upsert(m, { onConflict: "loja_id,mes_referencia" }));
  }

  async lancamentos(unidade: string, meses: string[]): Promise<Lancamento[]> {
    if (!meses.length) return [];
    return ok<Record<string, unknown>[]>(await this.sb.from("lancamentos").select(COLS_LANC).eq("loja_id", unidade).in("mes_referencia", meses)).map(lanc);
  }

  async meusLancamentos(meses: string[]): Promise<Lancamento[]> {
    const eu = await this.meuVendedor();
    if (!eu || !meses.length) return [];
    return ok<Record<string, unknown>[]>(await this.sb.from("lancamentos").select(COLS_LANC).eq("vendedor_id", eu.id).in("mes_referencia", meses)).map(lanc);
  }

  async salvarLancamento(l: NovoLancamento) {
    const valores = { faturamento_realizado: l.faturamento_realizado, clientes_engajados: l.clientes_engajados };
    const existe = ok<{ id: string }[]>(await this.sb.from("lancamentos").select("id").eq("vendedor_id", l.vendedor_id).eq("mes_referencia", l.mes_referencia));
    if (existe[0]) {
      // só os valores mudam (a unidade do lançamento fica a do momento em que foi lançado)
      const r = ok<unknown[]>(await this.sb.from("lancamentos").update(valores).eq("id", existe[0].id).select("id"));
      if (!r.length) throw new ErroServidor("Você não tem permissão para alterar este lançamento.");
      return;
    }
    // a unidade vem do vendedor (gatilho do banco); loja_id vai só para satisfazer o "not null"
    const { data: v } = await this.sb.from("vendedores").select("loja_id").eq("id", l.vendedor_id).single();
    ok(await this.sb.from("lancamentos").insert({ ...l, loja_id: (v as { loja_id?: string } | null)?.loja_id }));
  }

  async excluirLancamento(id: string) {
    const r = ok<unknown[]>(await this.sb.from("lancamentos").delete().eq("id", id).select("id"));
    if (!r.length) throw new ErroServidor("Você não tem permissão para excluir este lançamento.");
  }

  async mesesFechados(unidade: string, meses: string[]): Promise<string[]> {
    if (!meses.length) return [];
    return ok<{ mes_referencia: string }[]>(await this.sb.from("meses_fechados").select("mes_referencia").eq("loja_id", unidade).in("mes_referencia", meses)).map((m) => m.mes_referencia);
  }

  async fecharMes(unidade: string, mes: string) {
    ok(await this.sb.from("meses_fechados").insert({ loja_id: unidade, mes_referencia: mes }));
  }

  async reabrirMes(unidade: string, mes: string) {
    const r = ok<unknown[]>(await this.sb.from("meses_fechados").delete().eq("loja_id", unidade).eq("mes_referencia", mes).select("loja_id"));
    if (!r.length) throw new ErroServidor("Você não tem permissão para reabrir o mês.");
  }

  // ------------------------------------------------------------------ só o admin (as políticas do banco exigem is_admin)
  async empresas(): Promise<Empresa[]> {
    const [r, l] = await Promise.all([
      this.pub.from("redes").select("id, nome, ativo, ordem").order("ordem").order("nome"),
      this.pub.from("lojas").select(`id, nome, cnpj, rede_id, ativo, sistemas, ${CAMPOS_UNIDADE.join(", ")}`).order("nome"),
    ]);
    const unidades = ok<({ id: string; nome: string; cnpj: string | null; rede_id: string | null; ativo: boolean; sistemas: string[] } & DadosUnidade)[]>(l)
      .map((u): UnidadeCadastro => ({
        id: u.id, nome: u.nome, cnpj: u.cnpj, rede_id: u.rede_id, ativo: u.ativo, usaMetas: u.sistemas.includes("metas"), outros: u.sistemas.filter((s) => s !== "metas"),
        dados: Object.fromEntries(CAMPOS_UNIDADE.map((k) => [k, u[k] ?? null])),
      }));
    return ok<{ id: string; nome: string; ativo: boolean }[]>(r).map((x) => ({ id: x.id, nome: x.nome, ativo: x.ativo, unidades: unidades.filter((u) => u.rede_id === x.id) }));
  }

  async salvarEmpresa(e: { id?: string; nome: string; ativo: boolean }) {
    const dados = { nome: e.nome.trim().toUpperCase(), ativo: e.ativo };
    if (e.id) {
      const r = ok<unknown[]>(await this.pub.from("redes").update(dados).eq("id", e.id).select("id"));
      if (!r.length) throw new ErroServidor("Só o admin altera empresas.");
      return e.id;
    }
    return ok<{ id: string }>(await this.pub.from("redes").insert(dados).select("id").single()).id;
  }

  async salvarUnidade(u: NovaUnidade) {
    const cnpj = u.cnpj ? u.cnpj.replace(/\D/g, "") || null : null;
    const dados = normalizarDados(u.dados);
    if (u.id) {
      // só liga/desliga o "metas": os outros sistemas da unidade ficam como estão
      const atual = ok<{ sistemas: string[] }>(await this.pub.from("lojas").select("sistemas").eq("id", u.id).single());
      const sistemas = u.usaMetas ? [...new Set([...atual.sistemas, "metas"])] : atual.sistemas.filter((s) => s !== "metas");
      const r = ok<unknown[]>(await this.pub.from("lojas").update({ ...dados, nome: u.nome.trim(), cnpj, ativo: u.ativo, rede_id: u.rede_id, sistemas }).eq("id", u.id).select("id"));
      if (!r.length) throw new ErroServidor("Só o admin altera unidades.");
      return u.id;
    }
    return ok<{ id: string }>(await this.pub.from("lojas").insert({ ...dados, nome: u.nome.trim(), cnpj, ativo: u.ativo, rede_id: u.rede_id, sistemas: u.usaMetas ? ["metas"] : [] })
      .select("id").single()).id;
  }

  async usuarios(rede: string): Promise<UsuarioAcesso[]> {
    return ok<UsuarioAcesso[]>(await this.sb.rpc("usuarios_da_empresa", { _rede: rede }));
  }

  async darAcesso(a: NovoAcesso) {
    ok(await this.sb.rpc("definir_acesso", { _email: a.email, _nome: a.nome, _rede: a.rede_id, _loja: a.loja_id, _perfil: a.perfil, _lanca: a.lanca }));
  }

  async criarLogin(a: NovoAcesso & { senha: string }) {
    // serviço central do Ecossistema (Edge Function admin-usuarios do GESTAO SALVADOS), modo Meta de Vendas
    const { data, error } = await this.sb.functions.invoke("admin-usuarios", {
      body: { acao: "criar", sistema: "metas", email: a.email, senha: a.senha, nome: a.nome, rede_id: a.rede_id, loja_id: a.loja_id, perfil: a.perfil, lanca: a.lanca },
    });
    const msg = (data as { erro?: string } | null)?.erro;
    if (msg) throw new ErroServidor(msg);
    if (error) {
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
      throw new ErroServidor(corpo?.erro ?? traduzir(error.message));
    }
  }

  async removerAcesso(usuario: string, unidade: string) {
    ok(await this.sb.rpc("remover_acesso", { _usuario: usuario, _loja: unidade }));
  }

  async excluirVendedor(id: string) {
    ok(await this.sb.rpc("excluir_vendedor", { _vendedor: id }));
  }

  async excluirUnidade(id: string) {
    ok(await this.sb.rpc("excluir_unidade", { _loja: id }));
  }

  async excluirEmpresa(id: string) {
    ok(await this.sb.rpc("excluir_empresa", { _rede: id }));
  }
}
