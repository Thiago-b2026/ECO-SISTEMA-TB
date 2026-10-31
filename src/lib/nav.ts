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
}

/** Menu único do sistema. Quem pode ver cada tela fica definido aqui. */
export const NAV: NavItem[] = [
  { to: "/pdv", label: "PDV", icon: ShoppingCart, roles: ["admin", "gerente", "vendedor"], fase: 1 },
  { to: "/lotes", label: "Lotes", icon: Boxes, roles: ["admin", "gerente", "estoquista"], fase: 1 },
  { to: "/produtos", label: "Produtos e estoque", icon: Package, roles: ["admin", "gerente", "vendedor", "estoquista"], fase: 1 },
  { to: "/vendas", label: "Vendas", icon: ListOrdered, roles: ["admin", "gerente", "vendedor"], fase: 1 },
  { to: "/caixa", label: "Caixa", icon: Wallet, roles: ["admin", "gerente", "vendedor"], fase: 1 },
  { to: "/relatorios", label: "Relatórios", icon: LayoutDashboard, roles: ["admin", "gerente"], fase: 1 },
  { to: "/financeiro", label: "Financeiro", icon: Landmark, roles: ["admin", "gerente"], fase: 2 },
  { to: "/usuarios", label: "Usuários", icon: Users, roles: ["admin"], fase: 1 },
  { to: "/conta", label: "Minha conta", icon: UserCog, roles: ["admin", "gerente", "vendedor", "estoquista"], fase: 0 },
];

export function canAccess(path: string, role: AppRole | null): boolean {
  const item = NAV.find((n) => path === n.to || path.startsWith(n.to + "/"));
  return !!item && !!role && item.roles.includes(role);
}
