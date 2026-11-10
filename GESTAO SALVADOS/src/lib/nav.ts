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
  /** Tela com ABAS (ex.: Produtos): o item aparece se pelo menos uma aba estiver liberada. */
  abas?: { tela: string; modulo?: Modulo }[];
}

/** Portal do Ecossistema TB: é lá que se escolhe o sistema (clicar em "Eco Sistema TB" no menu leva para ele). */
export const PORTAL_URL = "https://portal-grupotb.vercel.app";

export type GrupoMenu = "dashboard" | "frente" | "cadastros" | "financeiro" | "crm";

export type AbaProdutos = "cadastro" | "mercadologico" | "lotes" | "etiquetas" | "transferencias";

/**
 * Abas da tela PRODUTOS (CADASTROS → Produtos). Cada aba é uma tela das permissões (mesmo acesso de antes).
 * `rotaAntiga` = endereço que existia antes e agora abre a aba.
 */
export const ABAS_PRODUTOS: { aba: AbaProdutos; nome: string; tela: string; modulo: Modulo; rotaAntiga: string }[] = [
  { aba: "cadastro", nome: "CADASTRO", tela: "pdv.produtos", modulo: "produtos", rotaAntiga: "/produtos" },
  { aba: "mercadologico", nome: "MERCADOLÓGICO", tela: "pdv.mercadologico", modulo: "produtos", rotaAntiga: "/mercadologico" },
  { aba: "lotes", nome: "LOTES", tela: "pdv.lotes", modulo: "lotes", rotaAntiga: "/lotes" },
  { aba: "etiquetas", nome: "ETIQUETAS", tela: "pdv.etiquetas", modulo: "produtos", rotaAntiga: "/etiquetas" },
  { aba: "transferencias", nome: "TRANSFERÊNCIAS", tela: "pdv.transferencias", modulo: "produtos", rotaAntiga: "/transferencias" },
];

/** Grupos do menu, na ordem do menu (nomes iguais aos de public.grupos / src/lib/telas.ts). */
export const GRUPOS_MENU: { codigo: GrupoMenu; nome: string; icon: LucideIcon }[] = [
  { codigo: "dashboard", nome: "Dashboard", icon: Gauge },
  { codigo: "frente", nome: "PDV · Frente de loja", icon: ShoppingCart },
  { codigo: "cadastros", nome: "Cadastros", icon: FolderOpen },
  { codigo: "financeiro", nome: "Financeiro", icon: Landmark },
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

  // CADASTROS (Produtos é uma tela com abas: Cadastro, Mercadológico, Lotes, Etiquetas, Transferências)
  { to: "/produtos", label: "Produtos", icon: Package, roles: TODOS, fase: 1, grupo: "cadastros", tela: "pdv.produtos", abas: ABAS_PRODUTOS },
  { to: "/pessoas", label: "Pessoas", icon: Contact, roles: ["admin"], fase: 1, grupo: "cadastros", modulo: "pessoas", tela: "pdv.pessoas" },
  { to: "/lojas", label: "Empresas", icon: Building2, roles: ["admin"], fase: 0, grupo: "cadastros", tela: "pdv.lojas" },

  // FINANCEIRO
  { to: "/financeiro", label: "Financeiro", icon: Landmark, roles: GESTOR, fase: 1, grupo: "financeiro", modulo: "financeiro", tela: "pdv.financeiro" },
  { to: "/caixa", label: "Movimentações de caixa", icon: Wallet, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "financeiro", modulo: "caixa", tela: "pdv.caixa" },
  { to: "/pagamentos", label: "Formas e meios de pagamento", icon: CreditCard, roles: GESTOR, fase: 1, grupo: "financeiro", modulo: "cadastros_financeiros", tela: "pdv.pagamentos" },
  { to: "/contas-bancarias", label: "Contas bancárias", icon: Banknote, roles: GESTOR, fase: 1, grupo: "financeiro", modulo: "cadastros_financeiros", tela: "pdv.contas_bancarias" },
  { to: "/plano-contas", label: "Plano de contas", icon: ListTree, roles: GESTOR, fase: 1, grupo: "financeiro", modulo: "cadastros_financeiros", tela: "pdv.plano_contas" },

  // CRM E WHATSAPP
  { to: "/crm", label: "CRM", icon: MessagesSquare, roles: ["admin", "gerente", "vendedor"], fase: 1, grupo: "crm", modulo: "crm", tela: "pdv.crm" },

  // Rotas sem item no menu. Os endereços antigos abrem a aba certa (Produtos → abas; Login de acesso → Pessoas).
  { to: "/mercadologico", label: "Mercadológico", icon: Network, roles: ["admin", "gerente", "estoquista"], fase: 1, oculto: true, modulo: "produtos", tela: "pdv.mercadologico" },
  { to: "/lotes", label: "Lotes", icon: Boxes, roles: ["admin", "gerente", "estoquista"], fase: 1, oculto: true, modulo: "lotes", tela: "pdv.lotes" },
  { to: "/etiquetas", label: "Etiquetas", icon: Tag, roles: GESTOR, fase: 1, oculto: true, modulo: "produtos", tela: "pdv.etiquetas" },
  { to: "/transferencias", label: "Transferências", icon: ArrowRightLeft, roles: ["admin", "gerente", "estoquista"], fase: 1, oculto: true, modulo: "produtos", tela: "pdv.transferencias" },
  { to: "/usuarios", label: "Login de acesso", icon: Users, roles: ["admin"], fase: 1, oculto: true, tela: "pdv.login_acesso" },
  { to: "/mercado-livre", label: "Mercado Livre", icon: Store, roles: ["admin", "gerente", "estoquista"], fase: 1, oculto: true, tela: "pdv.mercado_livre" },
  { to: "/conta", label: "Minha conta", icon: UserCog, roles: TODOS, fase: 0, oculto: true },
];

/** Item do menu dono de um caminho (rotas filhas, como /lotes/123, contam). */
export function itemDaRota(path: string): NavItem | undefined {
  return NAV.filter((n) => (path === n.to || path.startsWith(n.to + "/"))).sort((a, b) => b.to.length - a.to.length)[0];
}

type Perm = { podeTela: (c: string | undefined) => boolean; pode: (m: Modulo) => boolean };

/** Abas liberadas de uma tela com abas (tela liberada + área com "ver"). */
export function abasLiberadas<T extends { tela: string; modulo?: Modulo }>(abas: T[], p: Perm): T[] {
  return abas.filter((a) => p.podeTela(a.tela) && (!a.modulo || p.pode(a.modulo)));
}

/** Pode abrir o endereço do item? (trava de tela; tela com abas = pelo menos uma aba liberada) */
export function podeAbrirItem(n: NavItem, p: Pick<Perm, "podeTela">): boolean {
  if (n.abas) return n.abas.some((a) => p.podeTela(a.tela));
  return !n.tela || p.podeTela(n.tela);
}

/** O item aparece no menu? Tela liberada + área com "ver". */
export function itemVisivel(n: NavItem, p: Perm): boolean {
  if (n.oculto) return false;
  if (n.abas) return abasLiberadas(n.abas, p).length > 0;
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
