// Permissões por usuário e módulo (ver / inserir / editar / excluir).
// Quem manda de verdade é o banco (políticas e gatilhos); aqui só escondemos o que não pode.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export type Modulo = "pessoas" | "produtos" | "lotes" | "vendas" | "caixa" | "financeiro" | "cadastros_financeiros" | "crm" | "relatorios";
export type Acao = "ver" | "inserir" | "editar" | "excluir";

export const MODULOS: { id: Modulo; nome: string; desc: string }[] = [
  { id: "vendas", nome: "Vendas / PDV", desc: "vender, cancelar venda" },
  { id: "caixa", nome: "Caixa", desc: "abrir, sangria, suprimento, fechar" },
  { id: "produtos", nome: "Produtos e estoque", desc: "cadastro, etiquetas, mercadológico, ajustes de estoque" },
  { id: "lotes", nome: "Lotes", desc: "lotes, itens, pallets, robô" },
  { id: "pessoas", nome: "Cadastros de pessoas", desc: "clientes, fornecedores, funcionários" },
  { id: "financeiro", nome: "Financeiro", desc: "contas a pagar e receber" },
  { id: "cadastros_financeiros", nome: "Cadastros financeiros", desc: "formas/meios de pagamento, contas bancárias, plano de contas" },
  { id: "crm", nome: "CRM e WhatsApp", desc: "listas, campanhas, pedidos" },
  { id: "relatorios", nome: "Relatórios", desc: "relatórios e dashboard" },
];

export interface LinhaPermissao { modulo: Modulo; ver: boolean; inserir: boolean; editar: boolean; excluir: boolean }

interface Estado {
  pode: (m: Modulo, a?: Acao) => boolean;
  recarregar: () => Promise<void>;
}
const Ctx = createContext<Estado>({ pode: () => true, recarregar: async () => {} });

export function PermissoesProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [linhas, setLinhas] = useState<LinhaPermissao[]>([]);
  async function recarregar() {
    if (!user) return setLinhas([]);
    const { data } = await supabase.from("permissoes").select("modulo, ver, inserir, editar, excluir").eq("user_id", user.id);
    setLinhas((data ?? []) as LinhaPermissao[]);
  }
  useEffect(() => {
    recarregar();
  }, [user?.id]);
  const pode = (m: Modulo, a: Acao = "ver") => {
    if (role === "admin") return true;
    const l = linhas.find((x) => x.modulo === m);
    return l ? l[a] : true;
  };
  return <Ctx.Provider value={{ pode, recarregar }}>{children}</Ctx.Provider>;
}

export const usePermissoes = () => useContext(Ctx);
