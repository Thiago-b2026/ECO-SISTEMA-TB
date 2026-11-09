import {
  ShoppingCart,
  Boxes,
  Package,
  ListOrdered,
  Wallet,
  LayoutDashboard,
  Landmark,
  Users,
  UserCog,
  Store,
  Building2,
  Contact,
  ArrowRightLeft,
  Tag,
  Network,
  CreditCard,
  Banknote,
  ListTree,
  Gauge,
  MessagesSquare,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/auth";
import type { Modulo } from "@/lib/permissoes";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
  /** Fase do roadmap em que a tela fica pronta (mostra "em breve" antes). */
  fase: 0 | 1 | 2;
  /** Grupo do menu = grupo da tela no banco (public.grupos do sistema "pdv"). Sem grupo = item solto. */
  grupo?: GrupoMenu;
  /** Rota existe (permissão), mas não aparece no menu. */
  oculto?: boolean;
  /** Área de permissão (sem "ver" o item some do menu). */
  modulo?: Modulo;
  /** Tela no controle de acesso por tela (src/lib/telas.ts). Sem tela = sempre liberada (ex.: Minha conta). */
  tela?: string;
}

/** Portal do Ecossistema TB: é lá que se escolhe o sistema (clicar em "Eco Sistema TB" no menu leva para ele). */
export const PORTAL_URL = "https://portal-grupotb.vercel.app";

export type GrupoMenu = "dashboard" | "frente" | "produtos" | "financeiro" | "cadastros" | "crm";

/** Grupos do menu, na ordem do menu (nomes iguais aos de public.grupos / src/lib/telas.ts). */
export const GRUPOS_MENU: { codigo: GrupoMenu; nome: string; icon: LucideIcon }[] = [
  { codigo: "dashboard", nome: "Dashboard", icon: Gauge },
  { codigo: "frente", nome: "PDV · Frente de loja", icon: ShoppingCart },
  { codigo: "produtos", nome: "Produtos", icon: Package },
  { codigo: "financeiro", nome: "Financeiro", icon: Landmark },
  { codigo: "cadastros", nome: "Cadastros", icon: FolderOpen },
  { codigo: "crm", nome: "CRM e WhatsApp", icon: MessagesSquare },
];

const TODOS: AppRole[] = ["admin", "gerente", "vendedor", "estoquista"];
const GESTOR: AppRole[] = ["admin", "gerente"];

/**
 * Menu único do sistema. A ordem é a do menu.
 * Quem vê cada item: o controle POR TELA (campo `tela`). `roles` é só o acesso antigo por perfil,
 * usado como base da migração e no modo de segurança (enquanto a migration não existir).
 */
export const NAV: NavItem[] = [
  // DASHBOARD
  { to: "/dashboard", label: "Dashboard", icon: Gauge, roles: TODOS, fase: 1, grupo: "dashboard", tela: "pdv.dashboard" },
  { to: "/relatorios", label: "Relatórios", icon: LayoutDashboard, roles: GESTOR, fase: 1, grupo: "dashboard", modulo: "relatorios", tela: "pdv.relatorios", oculto: true }, // virou aba do Dashboard

  // PDV · FRENTE DE LOJA
  { to: "/pdv", label: "PDV", icon: ShoppingCart, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "frente", modulo: "vendas", tela: "pdv.pdv" },
  { to: "/vendas", label: "Vendas e notas", icon: ListOrdered, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "frente", modulo: "vendas", tela: "pdv.vendas" },

  // PRODUTOS
  { to: "/produtos", label: "Cadastro de produtos", icon: Package, roles: TODOS, fase: 1, grupo: "produtos", modulo: "produtos", tela: "pdv.produtos" },
  { to: "/mercadologico", label: "Mercadológico", icon: Network, roles: ["admin", "gerente", "estoquista"], fase: 1, grupo: "produtos", modulo: "produtos", tela: "pdv.mercadologico" },
  { to: "/lotes", label: "Lotes", icon: Boxes, roles: ["admin", "gerente", "estoquista"], fase: 1, grupo: "produtos", modulo: "lotes", tela: "pdv.lotes" },
  { to: "/etiquetas", label: "Etiquetas", icon: Tag, roles: GESTOR, fase: 1, grupo: "produtos", modulo: "produtos", tela: "pdv.etiquetas" },
  { to: "/transferencias", label: "Transferências", icon: ArrowRightLeft, roles: ["admin", "gerente", "estoquista"], fase: 1, grupo: "produtos", modulo: "produtos", tela: "pdv.transferencias" },

  // FINANCEIRO
  { to: "/financeiro", label: "Financeiro", icon: Landmark, roles: GESTOR, fase: 1, grupo: "financeiro", modulo: "financeiro", tela: "pdv.financeiro" },
  { to: "/caixa", label: "Movimentações de caixa", icon: Wallet, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "financeiro", modulo: "caixa", tela: "pdv.caixa" },
  { to: "/pagamentos", label: "Formas e meios de pagamento", icon: CreditCard, roles: GESTOR, fase: 1, grupo: "financeiro", modulo: "cadastros_financeiros", tela: "pdv.pagamentos" },
  { to: "/contas-bancarias", label: "Contas bancárias", icon: Banknote, roles: GESTOR, fase: 1, grupo: "financeiro", modulo: "cadastros_financeiros", tela: "pdv.contas_bancarias" },
  { to: "/plano-contas", label: "Plano de contas", icon: ListTree, roles: GESTOR, fase: 1, grupo: "financeiro", modulo: "cadastros_financeiros", tela: "pdv.plano_contas" },

  // CADASTROS
  { to: "/lojas", label: "Empresas", icon: Building2, roles: ["admin"], fase: 0, grupo: "cadastros", tela: "pdv.lojas" },
  { to: "/pessoas", label: "Pessoas", icon: Contact, roles: ["admin"], fase: 1, grupo: "cadastros", modulo: "pessoas", tela: "pdv.pessoas" },
  { to: "/usuarios", label: "Login de acesso", icon: Users, roles: ["admin"], fase: 1, grupo: "cadastros", tela: "pdv.login_acesso" },

  // CRM E WHATSAPP
  { to: "/crm", label: "CRM", icon: MessagesSquare, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "crm", modulo: "crm", tela: "pdv.crm" },

  // Rotas sem item no menu
  { to: "/mercado-livre", label: "Mercado Livre", icon: Store, roles: ["admin", "gerente", "estoquista"], fase: 1, grupo: "produtos", oculto: true, tela: "pdv.mercado_livre" },
  { to: "/conta", label: "Minha conta", icon: UserCog, roles: TODOS, fase: 0, oculto: true },
];

/** Item do menu dono de um caminho (rotas filhas, como /lotes/123, contam). */
export function itemDaRota(path: string): NavItem | undefined {
  return NAV.filter((n) => (path === n.to || path.startsWith(n.to + "/"))).sort((a, b) => b.to.length - a.to.length)[0];
}

/** O item aparece no menu? Tela liberada + área com "ver". */
export function itemVisivel(n: NavItem, p: { podeTela: (c: string | undefined) => boolean; pode: (m: Modulo) => boolean }): boolean {
  if (n.oculto) return false;
  return p.podeTela(n.tela) && (!n.modulo || p.pode(n.modulo));
}

/** Acesso antigo, só por perfil (mantido para testes e referência). */
export function canAccess(path: string, role: AppRole | null): boolean {
  const item = itemDaRota(path);
  return !!item && !!role && item.roles.includes(role);
}

export type BlocoMenu =
  | { tipo: "grupo"; codigo: GrupoMenu; nome: string; icon: LucideIcon; itens: NavItem[] }
  | { tipo: "item"; item: NavItem };

/**
 * Monta o menu: um bloco por GRUPO (na ordem de GRUPOS_MENU) com as telas liberadas dele,
 * mais os itens soltos (ex.: "Sistemas"). A 1ª tela liberada do grupo é a tela principal:
 * clicar no grupo abre ela e mostra as subtelas logo abaixo.
 */
export function montarMenu(itens: NavItem[]): BlocoMenu[] {
  const blocos: BlocoMenu[] = [];
  for (const g of GRUPOS_MENU) {
    const doGrupo = itens.filter((i) => i.grupo === g.codigo);
    if (doGrupo.length) blocos.push({ tipo: "grupo", codigo: g.codigo, nome: g.nome, icon: g.icon, itens: doGrupo });
  }
  for (const i of itens) if (!i.grupo) blocos.push({ tipo: "item", item: i });
  return blocos;
}
