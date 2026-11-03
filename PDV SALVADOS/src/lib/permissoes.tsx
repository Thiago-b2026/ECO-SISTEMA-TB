// Permissões por usuário:
//  - por ÁREA (ver / inserir / editar / excluir)
//  - AÇÕES ESPECIAIS (cancelar venda, desconto, sangria, alterar preço...)
// Quem manda de verdade é o banco (políticas e gatilhos); aqui escondemos o que não pode.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export type Modulo = "pessoas" | "produtos" | "lotes" | "vendas" | "caixa" | "financeiro" | "cadastros_financeiros" | "crm" | "relatorios";
export type Acao = "ver" | "inserir" | "editar" | "excluir";
export type ChaveAcao =
  | "vendas.cancelar" | "vendas.desconto" | "caixa.sangria" | "caixa.suprimento"
  | "produtos.alterar_preco" | "produtos.ajustar_estoque" | "produtos.ver_custo" | "dados.exportar";

export const MODULOS: { id: Modulo; nome: string; desc: string; grupo: string }[] = [
  { id: "vendas", nome: "Vendas / PDV", desc: "vender no caixa, ver vendas", grupo: "Loja" },
  { id: "caixa", nome: "Caixa", desc: "abrir e fechar caixa", grupo: "Loja" },
  { id: "pessoas", nome: "Pessoas", desc: "clientes, fornecedores, funcionários", grupo: "Loja" },
  { id: "crm", nome: "CRM e WhatsApp", desc: "listas, campanhas, pedidos", grupo: "Loja" },
  { id: "produtos", nome: "Produtos e estoque", desc: "cadastro, etiquetas, mercadológico, transferências", grupo: "Estoque" },
  { id: "lotes", nome: "Lotes", desc: "lotes, itens, pallets, robô", grupo: "Estoque" },
  { id: "financeiro", nome: "Financeiro", desc: "contas a pagar e receber", grupo: "Gestão" },
  { id: "cadastros_financeiros", nome: "Cadastros financeiros", desc: "formas de pagamento, contas, plano de contas", grupo: "Gestão" },
  { id: "relatorios", nome: "Relatórios", desc: "relatórios e dashboard", grupo: "Gestão" },
];

export const ACOES_ESPECIAIS: { id: ChaveAcao; nome: string; desc: string; grupo: string; risco?: boolean }[] = [
  { id: "vendas.desconto", nome: "Dar desconto na venda", desc: "sem isso, o PDV não aceita desconto", grupo: "Vendas", risco: true },
  { id: "vendas.cancelar", nome: "Cancelar venda", desc: "estorna a venda e devolve o estoque", grupo: "Vendas", risco: true },
  { id: "caixa.sangria", nome: "Fazer sangria", desc: "retirar dinheiro do caixa", grupo: "Caixa", risco: true },
  { id: "caixa.suprimento", nome: "Fazer suprimento", desc: "colocar dinheiro (troco) no caixa", grupo: "Caixa" },
  { id: "produtos.alterar_preco", nome: "Alterar preço de venda", desc: "mudar o preço de um produto", grupo: "Estoque", risco: true },
  { id: "produtos.ajustar_estoque", nome: "Ajustar estoque", desc: "lançar perda, ajuste ou devolução", grupo: "Estoque", risco: true },
  { id: "produtos.ver_custo", nome: "Ver custo dos produtos", desc: "mostra o custo nas telas e exportações", grupo: "Estoque" },
  { id: "dados.exportar", nome: "Exportar Excel / PDF", desc: "baixar listas e relatórios", grupo: "Geral" },
];

export interface LinhaPermissao { modulo: Modulo; ver: boolean; inserir: boolean; editar: boolean; excluir: boolean }
export type MapaModulos = Record<Modulo, LinhaPermissao>;
export type MapaAcoes = Record<ChaveAcao, boolean>;

const linha = (m: Modulo, v: string) => ({ modulo: m, ver: v.includes("V"), inserir: v.includes("I"), editar: v.includes("E"), excluir: v.includes("X") });
const mapa = (padrao: string, exc: Partial<Record<Modulo, string>> = {}) =>
  Object.fromEntries(MODULOS.map((m) => [m.id, linha(m.id, exc[m.id] ?? padrao)])) as MapaModulos;
const acoes = (on: ChaveAcao[] | "todas") =>
  Object.fromEntries(ACOES_ESPECIAIS.map((a) => [a.id, on === "todas" || on.includes(a.id)])) as MapaAcoes;

/** Modelos prontos: um clique e depois ajusta o que quiser. */
export const MODELOS: { id: string; nome: string; desc: string; modulos: MapaModulos; acoes: MapaAcoes }[] = [
  {
    id: "vendedor", nome: "Vendedor(a) / caixa", desc: "vende, abre e fecha caixa, cadastra cliente",
    modulos: mapa("", { vendas: "VI", caixa: "VIE", pessoas: "VIE", crm: "VIE", produtos: "V" }),
    acoes: acoes(["caixa.suprimento", "caixa.sangria"]),
  },
  {
    id: "estoquista", nome: "Estoquista", desc: "lotes, produtos, etiquetas e estoque",
    modulos: mapa("", { produtos: "VIE", lotes: "VIE", pessoas: "V" }),
    acoes: acoes(["produtos.ajustar_estoque", "produtos.ver_custo", "dados.exportar"]),
  },
  {
    id: "gerente", nome: "Gerente", desc: "tudo da loja, sem excluir cadastros e financeiro",
    modulos: mapa("VIEX", { pessoas: "VIE", financeiro: "VIE", cadastros_financeiros: "VIE" }),
    acoes: acoes("todas"),
  },
  { id: "consulta", nome: "Só consulta", desc: "vê tudo, não altera nada", modulos: mapa("V"), acoes: acoes(["dados.exportar", "produtos.ver_custo"]) },
  { id: "tudo", nome: "Liberar tudo", desc: "todas as áreas e ações", modulos: mapa("VIEX"), acoes: acoes("todas") },
];

export const mapaLiberado = () => mapa("VIEX");
export const acoesLiberadas = () => acoes("todas");

interface Estado {
  pode: (m: Modulo, a?: Acao) => boolean;
  podeAcao: (c: ChaveAcao) => boolean;
  recarregar: () => Promise<void>;
}
const Ctx = createContext<Estado>({ pode: () => true, podeAcao: () => true, recarregar: async () => {} });

export function PermissoesProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [linhas, setLinhas] = useState<LinhaPermissao[]>([]);
  const [flags, setFlags] = useState<{ chave: ChaveAcao; permitido: boolean }[]>([]);
  async function recarregar() {
    if (!user) { setLinhas([]); setFlags([]); return; }
    const [a, b] = await Promise.all([
      supabase.from("permissoes").select("modulo, ver, inserir, editar, excluir").eq("user_id", user.id),
      supabase.from("permissoes_acoes").select("chave, permitido").eq("user_id", user.id),
    ]);
    setLinhas((a.data ?? []) as LinhaPermissao[]);
    setFlags((b.data ?? []) as { chave: ChaveAcao; permitido: boolean }[]);
  }
  useEffect(() => {
    recarregar();
  }, [user?.id]);
  const pode = (m: Modulo, a: Acao = "ver") => {
    if (role === "admin") return true;
    const l = linhas.find((x) => x.modulo === m);
    return l ? l[a] : true;
  };
  const podeAcao = (c: ChaveAcao) => role === "admin" || (flags.find((f) => f.chave === c)?.permitido ?? true);
  return <Ctx.Provider value={{ pode, podeAcao, recarregar }}>{children}</Ctx.Provider>;
}

export const usePermissoes = () => useContext(Ctx);
