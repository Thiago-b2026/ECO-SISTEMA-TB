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
  type LucideIcon,
} from "lucide-react";
import type { AppRole } from "@/lib/auth";

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
}

const TODOS: AppRole[] = ["admin", "gerente", "vendedor", "estoquista"];
const GESTOR: AppRole[] = ["admin", "gerente"];

/** Menu único do sistema. Quem pode ver cada tela fica definido aqui. A ordem é a do menu. */
export const NAV: NavItem[] = [
  { to: "/pdv", label: "PDV · Frente de loja", icon: ShoppingCart, roles: ["admin", "gerente", "vendedor"], fase: 1 },

  // Cadastros
  { to: "/pessoas", label: "Pessoas", icon: Contact, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "Cadastros" },
  { to: "/usuarios", label: "Login de acesso", icon: Users, roles: ["admin"], fase: 1, grupo: "Cadastros" },
  { to: "/produtos", label: "Produtos e estoque", icon: Package, roles: TODOS, fase: 1, grupo: "Cadastros" },
  { to: "/etiquetas", label: "Etiquetas", icon: Tag, roles: GESTOR, fase: 1, grupo: "Cadastros" },
  { to: "/mercadologico", label: "Mercadológico", icon: Network, roles: ["admin", "gerente", "estoquista"], fase: 1, grupo: "Cadastros" },
  { to: "/pagamentos", label: "Formas e meios de pagamento", icon: CreditCard, roles: GESTOR, fase: 1, grupo: "Cadastros" },
  { to: "/contas-bancarias", label: "Contas bancárias", icon: Banknote, roles: GESTOR, fase: 1, grupo: "Cadastros" },
  { to: "/plano-contas", label: "Plano de contas", icon: ListTree, roles: GESTOR, fase: 1, grupo: "Cadastros" },

  { to: "/lotes", label: "Lotes", icon: Boxes, roles: ["admin", "gerente", "estoquista"], fase: 1 },

  // Movimento
  { to: "/vendas", label: "Vendas e notas", icon: ListOrdered, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "Movimento" },
  { to: "/caixa", label: "Movimentações de caixa", icon: Wallet, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "Movimento" },
  { to: "/transferencias", label: "Transferências", icon: ArrowRightLeft, roles: ["admin", "gerente", "estoquista"], fase: 1, grupo: "Movimento" },

  { to: "/relatorios", label: "Relatórios", icon: LayoutDashboard, roles: GESTOR, fase: 1 },
  { to: "/financeiro", label: "Financeiro", icon: Landmark, roles: GESTOR, fase: 1 },
  { to: "/lojas", label: "Lojas e configurações", icon: Building2, roles: GESTOR, fase: 0 },

  // Rotas sem item no menu
  { to: "/mercado-livre", label: "Mercado Livre", icon: Store, roles: ["admin", "gerente", "estoquista"], fase: 1, oculto: true },
  { to: "/conta", label: "Minha conta", icon: UserCog, roles: TODOS, fase: 0, oculto: true },
];

export function canAccess(path: string, role: AppRole | null): boolean {
  const item = NAV.find((n) => path === n.to || path.startsWith(n.to + "/"));
  return !!item && !!role && item.roles.includes(role);
}
