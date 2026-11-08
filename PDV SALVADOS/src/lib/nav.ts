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
  LayoutGrid,
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
  /** Grupo do menu (submenu). Sem grupo = item solto. */
  grupo?: "Cadastros" | "Movimento";
  /** Rota existe (permissão), mas não aparece no menu. */
  oculto?: boolean;
  /** Área de permissão (sem "ver" o item some do menu). */
  modulo?: Modulo;
  /** Tela no controle de acesso por tela (src/lib/telas.ts). Sem tela = sempre liberada (ex.: Minha conta). */
  tela?: string;
  /** Item "Sistemas": lista os sistemas do ecossistema em que o usuário tem tela (links para outros sites). */
  menuSistemas?: true;
}

const TODOS: AppRole[] = ["admin", "gerente", "vendedor", "estoquista"];
const GESTOR: AppRole[] = ["admin", "gerente"];

/**
 * Menu único do sistema. A ordem é a do menu.
 * Quem vê cada item: o controle POR TELA (campo `tela`). `roles` é só o acesso antigo por perfil,
 * usado como base da migração e no modo de segurança (enquanto a migration não existir).
 */
export const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: Gauge, roles: TODOS, fase: 1, tela: "pdv.dashboard" },
  { to: "/pdv", label: "PDV · Frente de loja", icon: ShoppingCart, roles: ["admin", "gerente", "vendedor"], fase: 1, modulo: "vendas", tela: "pdv.pdv" },

  // Cadastros
  { to: "/pessoas", label: "Pessoas", icon: Contact, roles: ["admin"], fase: 1, grupo: "Cadastros", modulo: "pessoas", tela: "pdv.pessoas" },
  { to: "/usuarios", label: "Login de acesso", icon: Users, roles: ["admin"], fase: 1, grupo: "Cadastros", tela: "pdv.login_acesso" },
  { to: "/produtos", label: "Produtos e estoque", icon: Package, roles: TODOS, fase: 1, grupo: "Cadastros", modulo: "produtos", tela: "pdv.produtos" },
  { to: "/etiquetas", label: "Etiquetas", icon: Tag, roles: GESTOR, fase: 1, grupo: "Cadastros", modulo: "produtos", tela: "pdv.etiquetas" },
  { to: "/mercadologico", label: "Mercadológico", icon: Network, roles: ["admin", "gerente", "estoquista"], fase: 1, grupo: "Cadastros", modulo: "produtos", tela: "pdv.mercadologico" },
  { to: "/pagamentos", label: "Formas e meios de pagamento", icon: CreditCard, roles: GESTOR, fase: 1, grupo: "Cadastros", modulo: "cadastros_financeiros", tela: "pdv.pagamentos" },
  { to: "/contas-bancarias", label: "Contas bancárias", icon: Banknote, roles: GESTOR, fase: 1, grupo: "Cadastros", modulo: "cadastros_financeiros", tela: "pdv.contas_bancarias" },
  { to: "/plano-contas", label: "Plano de contas", icon: ListTree, roles: GESTOR, fase: 1, grupo: "Cadastros", modulo: "cadastros_financeiros", tela: "pdv.plano_contas" },

  { to: "/lotes", label: "Lotes", icon: Boxes, roles: ["admin", "gerente", "estoquista"], fase: 1, modulo: "lotes", tela: "pdv.lotes" },

  // Movimento
  { to: "/vendas", label: "Vendas e notas", icon: ListOrdered, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "Movimento", modulo: "vendas", tela: "pdv.vendas" },
  { to: "/caixa", label: "Movimentações de caixa", icon: Wallet, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "Movimento", modulo: "caixa", tela: "pdv.caixa" },
  { to: "/transferencias", label: "Transferências", icon: ArrowRightLeft, roles: ["admin", "gerente", "estoquista"], fase: 1, grupo: "Movimento", modulo: "produtos", tela: "pdv.transferencias" },

  { to: "/crm", label: "CRM e WhatsApp", icon: MessagesSquare, roles: ["admin", "gerente", "vendedor"], fase: 1, modulo: "crm", tela: "pdv.crm" },
  { to: "/relatorios", label: "Relatórios", icon: LayoutDashboard, roles: GESTOR, fase: 1, modulo: "relatorios", tela: "pdv.relatorios" },
  { to: "/financeiro", label: "Financeiro", icon: Landmark, roles: GESTOR, fase: 1, modulo: "financeiro", tela: "pdv.financeiro" },
  { to: "/sistemas", label: "Sistemas", icon: LayoutGrid, roles: ["admin"], fase: 1, menuSistemas: true },
  { to: "/lojas", label: "Lojas e configurações", icon: Building2, roles: ["admin"], fase: 0, tela: "pdv.lojas" },

  // Rotas sem item no menu
  { to: "/mercado-livre", label: "Mercado Livre", icon: Store, roles: ["admin", "gerente", "estoquista"], fase: 1, oculto: true, tela: "pdv.mercado_livre" },
  { to: "/conta", label: "Minha conta", icon: UserCog, roles: TODOS, fase: 0, oculto: true },
];

/** Item do menu dono de um caminho (rotas filhas, como /lotes/123, contam). */
export function itemDaRota(path: string): NavItem | undefined {
  return NAV.filter((n) => !n.menuSistemas && (path === n.to || path.startsWith(n.to + "/"))).sort((a, b) => b.to.length - a.to.length)[0];
}

/** O item aparece no menu? Tela liberada + área com "ver"; "Sistemas" só se ele tiver tela em outro sistema além deste. */
export function itemVisivel(n: NavItem, p: { podeTela: (c: string | undefined) => boolean; pode: (m: Modulo) => boolean; sistemas: { codigo: string }[] }): boolean {
  if (n.oculto) return false;
  if (n.menuSistemas) return p.sistemas.length > 1;
  return p.podeTela(n.tela) && (!n.modulo || p.pode(n.modulo));
}

/** Acesso antigo, só por perfil (mantido para testes e referência). */
export function canAccess(path: string, role: AppRole | null): boolean {
  const item = itemDaRota(path);
  return !!item && !!role && item.roles.includes(role);
}
