// Servidor real: Supabase ECO-SISTEMA-TB. Dados do sistema no schema "metas"; login, telas, unidades e
// permissões no schema "public" (mesmo login de todos os sistemas). As regras de verdade são o RLS.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chave, TELAS_APP } from "../lib/telas";
import { ErroServidor, traduzir, type Acesso, type Lancamento, type Meta, type NovoLancamento, type Servidor, type Sessao, type Unidade, type Vendedor } from "./servidor";

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
    const unidades = ok<{ id: string; nome: string; rede: string | null }[]>(unid).map((u): Unidade => ({ id: u.id, nome: u.nome, rede: u.rede }));
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
}
