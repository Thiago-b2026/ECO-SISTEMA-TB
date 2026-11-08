// Acesso POR TELA (camada acima das permissões por área e das ações especiais).
// - Tela sem flag marcada = BLOQUEADA (não aparece no menu, rota mostra "Acesso negado").
// - Admin vê tudo. Telas "somente_admin" não têm checkbox: só o Admin entra.
// - Fonte da verdade no banco: public.telas / public.usuario_telas / public.minhas_telas().
//   Esta lista é o espelho dela no front e precisa bater com a migration
//   20261108000017_permissao_por_tela.sql (um teste confere).
import type { AppRole } from "@/lib/auth";
import type { Modulo } from "@/lib/permissoes";

export type ModuloTela = "vendas" | "caixa" | "estoque" | "cadastros" | "financeiro" | "relatorios" | "crm" | "rh";
export type AppTela = "eco" | "rh";

export interface Tela {
  codigo: string;
  nome: string;
  modulo: ModuloTela;
  rota: string;
  app: AppTela;
  /** Área de permissão (ver/inserir/editar/excluir) que os dados desta tela usam. */
  area?: Modulo;
  /** Só o Admin entra; não aparece no editor. */
  somenteAdmin?: boolean;
  /** Perfis que acessavam a tela ANTES do controle por tela (base da migração e do modo de segurança). */
  perfis: AppRole[];
}

export const URL_GESTAO_RH = "https://gestao-rh-tau.vercel.app";

export const MODULOS_TELA: { id: ModuloTela; nome: string }[] = [
  { id: "vendas", nome: "Vendas" },
  { id: "caixa", nome: "Caixa" },
  { id: "estoque", nome: "Estoque" },
  { id: "cadastros", nome: "Cadastros" },
  { id: "financeiro", nome: "Financeiro" },
  { id: "relatorios", nome: "Relatórios" },
  { id: "crm", nome: "CRM" },
  { id: "rh", nome: "RH (Gestão RH)" },
];

const TODOS: AppRole[] = ["admin", "gerente", "vendedor", "estoquista"];
const GESTOR: AppRole[] = ["admin", "gerente"];
const VENDA: AppRole[] = ["admin", "gerente", "vendedor"];
const ESTOQUE: AppRole[] = ["admin", "gerente", "estoquista"];

export const TELAS: Tela[] = [
  { codigo: "vendas.pdv", nome: "PDV · Frente de loja", modulo: "vendas", rota: "/pdv", app: "eco", area: "vendas", perfis: VENDA },
  { codigo: "vendas.notas", nome: "Vendas e notas", modulo: "vendas", rota: "/vendas", app: "eco", area: "vendas", perfis: VENDA },
  { codigo: "caixa.movimentacoes", nome: "Movimentações de caixa", modulo: "caixa", rota: "/caixa", app: "eco", area: "caixa", perfis: VENDA },
  { codigo: "estoque.produtos", nome: "Produtos e estoque", modulo: "estoque", rota: "/produtos", app: "eco", area: "produtos", perfis: TODOS },
  { codigo: "estoque.lotes", nome: "Lotes", modulo: "estoque", rota: "/lotes", app: "eco", area: "lotes", perfis: ESTOQUE },
  { codigo: "estoque.etiquetas", nome: "Etiquetas", modulo: "estoque", rota: "/etiquetas", app: "eco", area: "produtos", perfis: GESTOR },
  { codigo: "estoque.mercadologico", nome: "Mercadológico", modulo: "estoque", rota: "/mercadologico", app: "eco", area: "produtos", perfis: ESTOQUE },
  { codigo: "estoque.transferencias", nome: "Transferências", modulo: "estoque", rota: "/transferencias", app: "eco", area: "produtos", perfis: ESTOQUE },
  { codigo: "estoque.mercado_livre", nome: "Mercado Livre (busca de anúncios)", modulo: "estoque", rota: "/mercado-livre", app: "eco", perfis: ESTOQUE },
  { codigo: "cadastros.pessoas", nome: "Pessoas", modulo: "cadastros", rota: "/pessoas", app: "eco", area: "pessoas", perfis: ["admin"] },
  { codigo: "cadastros.login_acesso", nome: "Login de acesso", modulo: "cadastros", rota: "/usuarios", app: "eco", somenteAdmin: true, perfis: ["admin"] },
  { codigo: "cadastros.pagamentos", nome: "Formas e meios de pagamento", modulo: "cadastros", rota: "/pagamentos", app: "eco", area: "cadastros_financeiros", perfis: GESTOR },
  { codigo: "cadastros.contas_bancarias", nome: "Contas bancárias", modulo: "cadastros", rota: "/contas-bancarias", app: "eco", area: "cadastros_financeiros", perfis: GESTOR },
  { codigo: "cadastros.plano_contas", nome: "Plano de contas", modulo: "cadastros", rota: "/plano-contas", app: "eco", area: "cadastros_financeiros", perfis: GESTOR },
  { codigo: "cadastros.lojas", nome: "Lojas e configurações", modulo: "cadastros", rota: "/lojas", app: "eco", somenteAdmin: true, perfis: ["admin"] },
  { codigo: "financeiro.financeiro", nome: "Financeiro (pagar, receber, fluxo, DRE)", modulo: "financeiro", rota: "/financeiro", app: "eco", area: "financeiro", perfis: GESTOR },
  { codigo: "relatorios.dashboard", nome: "Dashboard", modulo: "relatorios", rota: "/dashboard", app: "eco", perfis: TODOS },
  { codigo: "relatorios.relatorios", nome: "Relatórios", modulo: "relatorios", rota: "/relatorios", app: "eco", area: "relatorios", perfis: GESTOR },
  { codigo: "crm.whatsapp", nome: "CRM e WhatsApp", modulo: "crm", rota: "/crm", app: "eco", area: "crm", perfis: VENDA },
  // Gestão RH (outro app, mesmo login). Antes: quem era membro de uma empresa do RH via estas telas.
  { codigo: "rh.painel", nome: "Painel", modulo: "rh", rota: "/", app: "rh", perfis: [] },
  { codigo: "rh.historico", nome: "Histórico", modulo: "rh", rota: "/historico", app: "rh", perfis: [] },
  { codigo: "rh.global", nome: "Visão Global", modulo: "rh", rota: "/global", app: "rh", perfis: [] },
  { codigo: "rh.empresas", nome: "Empresas", modulo: "rh", rota: "/empresas", app: "rh", perfis: [] },
  { codigo: "rh.usuarios", nome: "Usuários do Gestão RH", modulo: "rh", rota: "/usuarios", app: "rh", perfis: [] },
];

/** Telas que aparecem no editor (as "somente Admin" ficam de fora). */
export const TELAS_EDITAVEIS = TELAS.filter((t) => !t.somenteAdmin);

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

/**
 * Acesso que o usuário tinha ANTES do controle por tela (perfil + área com "ver").
 * É a regra que a migration usa para gerar as flags de quem já existe, e o modo de
 * segurança do site enquanto a migration não foi aplicada.
 */
export function telasLegado(role: AppRole | null, podeVerArea: (m: Modulo) => boolean, rh?: { membro: boolean; gestor: boolean }): Set<string> {
  const s = new Set<string>();
  if (!role) return s;
  for (const t of TELAS) {
    if (t.app === "rh") {
      if (role === "admin" || (rh?.membro && (t.codigo !== "rh.usuarios" || rh.gestor))) s.add(t.codigo);
      continue;
    }
    if (t.somenteAdmin && role !== "admin") continue;
    if (t.perfis.includes(role) && (!t.area || podeVerArea(t.area))) s.add(t.codigo);
  }
  return s;
}

/** Tela dona de um caminho (a rota mais específica ganha). */
export function telaDaRota(path: string, app: AppTela = "eco"): Tela | undefined {
  return TELAS.filter((t) => t.app === app && (path === t.rota || (t.rota !== "/" && path.startsWith(t.rota + "/"))))
    .sort((a, b) => b.rota.length - a.rota.length)[0];
}

/** Estado do checkbox de um módulo no editor. */
export function estadoModulo(mapa: MapaTelas, modulo: ModuloTela): "todos" | "nenhum" | "parcial" {
  const ts = TELAS_EDITAVEIS.filter((t) => t.modulo === modulo);
  const on = ts.filter((t) => mapa[t.codigo]).length;
  return on === 0 ? "nenhum" : on === ts.length ? "todos" : "parcial";
}
