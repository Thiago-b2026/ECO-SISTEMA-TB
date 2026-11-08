// Permissões do Ecossistema TB em 3 níveis: SISTEMA → GRUPO → TELA
// (camada acima das permissões por área e das ações especiais do PDV).
// - Tela sem flag marcada = BLOQUEADA (não aparece no menu, rota mostra "Acesso negado").
// - Admin vê tudo. Telas "somente_admin" não têm checkbox: só o Admin entra (e só o Admin dá acessos).
// - Fonte da verdade no banco: public.sistemas / public.grupos / public.telas / public.usuario_telas,
//   funções public.minhas_telas(app) e public.meus_sistemas().
//   Esta lista é o espelho dela no front e precisa bater com a migration
//   20261108000017_permissao_por_tela.sql (um teste confere).
// - Código da tela: "<sistema>.<tela>" (regra do CLAUDE.md da raiz do Ecossistema).
import type { AppRole } from "@/lib/auth";
import type { Modulo } from "@/lib/permissoes";

export type CodigoSistema = "portal" | "pdv" | "rh" | "crm" | "checklist" | "pop" | "supervisor";

export interface Sistema {
  codigo: CodigoSistema;
  nome: string;
  url: string | null;
  ordem: number;
  ativo: boolean;
}

export interface Grupo {
  sistema: CodigoSistema;
  codigo: string;
  nome: string;
  ordem: number;
}

export interface Tela {
  codigo: string;
  nome: string;
  sistema: CodigoSistema;
  grupo: string;
  rota: string;
  /** Área de permissão do PDV (ver/inserir/editar/excluir) que os dados desta tela usam. */
  area?: Modulo;
  /** Só o Admin entra; não aparece no editor. */
  somenteAdmin?: boolean;
  /** Perfis que acessavam a tela ANTES do controle por tela (base da migração e do modo de segurança). */
  perfis: AppRole[];
}

/** Sistemas do ecossistema (espelho de public.sistemas e de MEU SUPERVISOR/sistemas.json). */
export const SISTEMAS: Sistema[] = [
  { codigo: "portal", nome: "Portal Grupo TB", url: "https://portal-grupotb.vercel.app", ordem: 5, ativo: false },
  { codigo: "pdv", nome: "PDV Salvados", url: "https://eco-sistema-tb.vercel.app", ordem: 10, ativo: true },
  { codigo: "rh", nome: "Gestão RH", url: "https://gestao-rh-tau.vercel.app", ordem: 20, ativo: true },
  { codigo: "crm", nome: "CRM Super Mix Braz", url: null, ordem: 30, ativo: false },
  { codigo: "checklist", nome: "Check List Operacional", url: null, ordem: 40, ativo: false },
  { codigo: "pop", nome: "Treinamentos com POP", url: null, ordem: 50, ativo: false },
  { codigo: "supervisor", nome: "Meu Supervisor", url: null, ordem: 90, ativo: false },
];

/** Sistema deste site. */
export const SISTEMA_ATUAL: CodigoSistema = "pdv";

export const GRUPOS: Grupo[] = [
  // PDV: mesma organização do menu novo (Dashboard, PDV · Frente de loja, Produtos, Financeiro, Cadastros, CRM e WhatsApp)
  { sistema: "pdv", codigo: "dashboard", nome: "Dashboard", ordem: 10 },
  { sistema: "pdv", codigo: "frente", nome: "PDV · Frente de loja", ordem: 20 },
  { sistema: "pdv", codigo: "produtos", nome: "Produtos", ordem: 30 },
  { sistema: "pdv", codigo: "financeiro", nome: "Financeiro", ordem: 40 },
  { sistema: "pdv", codigo: "cadastros", nome: "Cadastros", ordem: 50 },
  { sistema: "pdv", codigo: "crm", nome: "CRM e WhatsApp", ordem: 60 },
  { sistema: "portal", codigo: "acessos", nome: "Acessos", ordem: 10 },
  { sistema: "rh", codigo: "lancamentos", nome: "Lançamentos", ordem: 10 },
  { sistema: "rh", codigo: "consolidado", nome: "Consolidado", ordem: 20 },
];

const TODOS: AppRole[] = ["admin", "gerente", "vendedor", "estoquista"];
const GESTOR: AppRole[] = ["admin", "gerente"];
const VENDA: AppRole[] = ["admin", "gerente", "vendedor"];
const ESTOQUE: AppRole[] = ["admin", "gerente", "estoquista"];

export const TELAS: Tela[] = [
  // PDV Salvados
  { codigo: "pdv.dashboard", nome: "Dashboard", sistema: "pdv", grupo: "dashboard", rota: "/dashboard", perfis: TODOS },
  { codigo: "pdv.relatorios", nome: "Relatórios", sistema: "pdv", grupo: "dashboard", rota: "/relatorios", area: "relatorios", perfis: GESTOR },
  { codigo: "pdv.pdv", nome: "PDV", sistema: "pdv", grupo: "frente", rota: "/pdv", area: "vendas", perfis: VENDA },
  { codigo: "pdv.vendas", nome: "Vendas e notas", sistema: "pdv", grupo: "frente", rota: "/vendas", area: "vendas", perfis: VENDA },
  { codigo: "pdv.produtos", nome: "Cadastro de produtos", sistema: "pdv", grupo: "produtos", rota: "/produtos", area: "produtos", perfis: TODOS },
  { codigo: "pdv.mercadologico", nome: "Mercadológico", sistema: "pdv", grupo: "produtos", rota: "/mercadologico", area: "produtos", perfis: ESTOQUE },
  { codigo: "pdv.lotes", nome: "Lotes", sistema: "pdv", grupo: "produtos", rota: "/lotes", area: "lotes", perfis: ESTOQUE },
  { codigo: "pdv.etiquetas", nome: "Etiquetas", sistema: "pdv", grupo: "produtos", rota: "/etiquetas", area: "produtos", perfis: GESTOR },
  { codigo: "pdv.transferencias", nome: "Transferências", sistema: "pdv", grupo: "produtos", rota: "/transferencias", area: "produtos", perfis: ESTOQUE },
  { codigo: "pdv.mercado_livre", nome: "Mercado Livre (busca de anúncios)", sistema: "pdv", grupo: "produtos", rota: "/mercado-livre", perfis: ESTOQUE },
  { codigo: "pdv.financeiro", nome: "Financeiro (pagar, receber, fluxo, DRE)", sistema: "pdv", grupo: "financeiro", rota: "/financeiro", area: "financeiro", perfis: GESTOR },
  { codigo: "pdv.caixa", nome: "Caixa", sistema: "pdv", grupo: "financeiro", rota: "/caixa", area: "caixa", perfis: VENDA },
  { codigo: "pdv.pagamentos", nome: "Formas de pagamento", sistema: "pdv", grupo: "financeiro", rota: "/pagamentos", area: "cadastros_financeiros", perfis: GESTOR },
  { codigo: "pdv.contas_bancarias", nome: "Contas bancárias", sistema: "pdv", grupo: "financeiro", rota: "/contas-bancarias", area: "cadastros_financeiros", perfis: GESTOR },
  { codigo: "pdv.plano_contas", nome: "Plano de contas", sistema: "pdv", grupo: "financeiro", rota: "/plano-contas", area: "cadastros_financeiros", perfis: GESTOR },
  { codigo: "pdv.lojas", nome: "Empresas", sistema: "pdv", grupo: "cadastros", rota: "/lojas", somenteAdmin: true, perfis: ["admin"] },
  { codigo: "pdv.pessoas", nome: "Pessoas", sistema: "pdv", grupo: "cadastros", rota: "/pessoas", area: "pessoas", perfis: ["admin"] },
  { codigo: "pdv.login_acesso", nome: "Login de acesso", sistema: "pdv", grupo: "cadastros", rota: "/usuarios", somenteAdmin: true, perfis: ["admin"] },
  { codigo: "pdv.crm", nome: "CRM", sistema: "pdv", grupo: "crm", rota: "/crm", area: "crm", perfis: VENDA },
  // Gestão RH (outro site, mesmo login). Antes: quem era membro de uma empresa do RH via estas telas.
  { codigo: "rh.painel", nome: "Painel", sistema: "rh", grupo: "lancamentos", rota: "/", perfis: [] },
  { codigo: "rh.historico", nome: "Histórico", sistema: "rh", grupo: "lancamentos", rota: "/historico", perfis: [] },
  { codigo: "rh.global", nome: "Visão Global", sistema: "rh", grupo: "consolidado", rota: "/global", perfis: [] },
  { codigo: "rh.empresas", nome: "Empresas", sistema: "rh", grupo: "consolidado", rota: "/empresas", perfis: [] },
  { codigo: "rh.usuarios", nome: "Usuários do Gestão RH", sistema: "rh", grupo: "consolidado", rota: "/usuarios", somenteAdmin: true, perfis: [] },
  // Portal (fase 2): exclusivas do Admin
  { codigo: "portal.usuarios", nome: "Usuários", sistema: "portal", grupo: "acessos", rota: "/usuarios", somenteAdmin: true, perfis: [] },
  { codigo: "portal.redes", nome: "Redes e unidades", sistema: "portal", grupo: "acessos", rota: "/redes", somenteAdmin: true, perfis: [] },
  { codigo: "portal.permissoes", nome: "Permissões", sistema: "portal", grupo: "acessos", rota: "/permissoes", somenteAdmin: true, perfis: [] },
];

/** Telas que aparecem no editor (as "somente Admin" e as de sistemas inativos ficam de fora). */
export const TELAS_EDITAVEIS = TELAS.filter((t) => !t.somenteAdmin && SISTEMAS.find((s) => s.codigo === t.sistema)?.ativo);

/** Sistemas que aparecem no editor (ativos e com pelo menos uma tela editável). */
export const SISTEMAS_EDITAVEIS = SISTEMAS.filter((s) => s.ativo && TELAS_EDITAVEIS.some((t) => t.sistema === s.codigo));

export type MapaTelas = Record<string, boolean>;

/** Mapa com todas as telas editáveis desligadas (padrão bloqueado). */
export const telasVazias = (): MapaTelas => Object.fromEntries(TELAS_EDITAVEIS.map((t) => [t.codigo, false]));

/** Converte as linhas de usuario_telas num mapa completo: sem linha = bloqueada. */
export function mapaDeLinhas(linhas: { tela_codigo: string; permitido: boolean }[]): MapaTelas {
  const m = telasVazias();
  for (const l of linhas) if (l.tela_codigo in m) m[l.tela_codigo] = l.permitido;
  return m;
}

/**
 * Regra de acesso a uma tela.
 * - admin: tudo
 * - tela desconhecida (ex.: Minha conta): liberada
 * - somente_admin: só admin
 * - demais: só se estiver na lista do usuário (padrão bloqueado)
 */
export function podeVerTela(codigo: string, ctx: { admin: boolean; liberadas: ReadonlySet<string> }): boolean {
  if (ctx.admin) return true;
  const t = TELAS.find((x) => x.codigo === codigo);
  if (!t) return true;
  if (t.somenteAdmin) return false;
  return ctx.liberadas.has(codigo);
}

/** Sistemas que o usuário vê (pelo menos uma tela liberada). Admin: todos os ativos. */
export function sistemasDoUsuario(ctx: { admin: boolean; liberadas: ReadonlySet<string> }): Sistema[] {
  return SISTEMAS.filter((s) => s.ativo && (ctx.admin || TELAS.some((t) => t.sistema === s.codigo && podeVerTela(t.codigo, ctx))));
}

/**
 * Acesso que o usuário tinha ANTES do controle por tela (perfil + área com "ver").
 * É a regra que a migration usa para gerar as flags de quem já existe, e o modo de
 * segurança do site enquanto a migration não foi aplicada.
 * No RH, "Usuários do Gestão RH" passou a ser só do Admin (decisão de 08/11/2026).
 */
export function telasLegado(role: AppRole | null, podeVerArea: (m: Modulo) => boolean, rh?: { membro: boolean }): Set<string> {
  const s = new Set<string>();
  if (!role) return s;
  for (const t of TELAS) {
    if (t.somenteAdmin && role !== "admin") continue;
    if (t.sistema === "rh") {
      if (role === "admin" || rh?.membro) s.add(t.codigo);
      continue;
    }
    if (t.perfis.includes(role) && (!t.area || podeVerArea(t.area))) s.add(t.codigo);
  }
  return s;
}

/** Tela dona de um caminho no sistema informado (a rota mais específica ganha). */
export function telaDaRota(path: string, sistema: CodigoSistema = SISTEMA_ATUAL): Tela | undefined {
  return TELAS.filter((t) => t.sistema === sistema && (path === t.rota || (t.rota !== "/" && path.startsWith(t.rota + "/"))))
    .sort((a, b) => b.rota.length - a.rota.length)[0];
}

export type EstadoMarcacao = "todos" | "nenhum" | "parcial";

function estadoDe(mapa: MapaTelas, telas: Tela[]): EstadoMarcacao {
  const on = telas.filter((t) => mapa[t.codigo]).length;
  return on === 0 ? "nenhum" : on === telas.length ? "todos" : "parcial";
}

/** Estado do checkbox de um SISTEMA inteiro no editor. */
export const estadoSistema = (mapa: MapaTelas, sistema: CodigoSistema): EstadoMarcacao =>
  estadoDe(mapa, TELAS_EDITAVEIS.filter((t) => t.sistema === sistema));

/** Estado do checkbox de um GRUPO inteiro no editor. */
export const estadoGrupo = (mapa: MapaTelas, sistema: CodigoSistema, grupo: string): EstadoMarcacao =>
  estadoDe(mapa, TELAS_EDITAVEIS.filter((t) => t.sistema === sistema && t.grupo === grupo));
