// Telas do Meta de Vendas no Ecossistema TB. Mesmos códigos de
// GESTAO SALVADOS/supabase/migrations/20261115000027_metas_telas.sql (um teste confere).
// Quem LIBERA a tela e as ações por unidade é o admin (Permissões): public.minhas_telas('metas') e
// public.minhas_permissoes('metas', unidade). As regras de verdade ficam no banco (RLS).
export const PORTAL_URL = "https://portal-grupotb.vercel.app";

export type Grupo = "acompanhamento" | "lancamentos" | "cadastros";

export interface TelaApp {
  codigo: string;
  nome: string;
  rota: string;
  grupo: Grupo;
  /** ações da tela (catálogo public.tela_acoes) */
  acoes: string[];
}

export const TELAS_APP: TelaApp[] = [
  { codigo: "metas.dashboard", nome: "Dashboard", rota: "/dashboard", grupo: "acompanhamento", acoes: ["ver"] },
  { codigo: "metas.ranking", nome: "Ranking", rota: "/ranking", grupo: "acompanhamento", acoes: ["ver"] },
  { codigo: "metas.meu_desempenho", nome: "Meu desempenho", rota: "/meu-desempenho", grupo: "acompanhamento", acoes: ["ver", "editar"] },
  { codigo: "metas.historico", nome: "Histórico", rota: "/historico", grupo: "acompanhamento", acoes: ["ver", "exportar"] },
  { codigo: "metas.lancamentos", nome: "Lançamentos do mês", rota: "/lancamentos", grupo: "lancamentos", acoes: ["ver", "inserir", "editar", "excluir"] },
  { codigo: "metas.vendedores", nome: "Vendedores", rota: "/vendedores", grupo: "cadastros", acoes: ["ver", "inserir", "editar"] },
  { codigo: "metas.configuracao", nome: "Meta e fechamento do mês", rota: "/configuracao", grupo: "cadastros", acoes: ["ver", "editar", "fechar_mes"] },
];

export const NOME_GRUPO: Record<Grupo, string> = { acompanhamento: "Acompanhamento", lancamentos: "Lançamentos", cadastros: "Cadastros" };

export function telaDaRota(path: string): TelaApp | undefined {
  return TELAS_APP.find((t) => path === t.rota || path.startsWith(t.rota + "/"));
}

export interface CtxAcesso {
  admin?: boolean;
  /** telas liberadas; null = consulta falhou (modo de segurança: mostra o menu, o banco continua barrando) */
  liberadas: ReadonlySet<string> | null;
}

/** Pode abrir a tela? */
export function podeVerTela(codigo: string, ctx: CtxAcesso): boolean {
  if (!TELAS_APP.some((t) => t.codigo === codigo)) return true;
  if (ctx.admin || ctx.liberadas === null) return true;
  return ctx.liberadas.has(codigo);
}

/** Primeira tela que a pessoa pode abrir (a de entrada). Vendedor → Meu desempenho; gestão → Dashboard. */
const PREFERENCIA = ["metas.dashboard", "metas.meu_desempenho", "metas.ranking", "metas.lancamentos", "metas.historico", "metas.configuracao", "metas.vendedores"];
export function telaInicial(ctx: CtxAcesso): TelaApp | undefined {
  const codigo = PREFERENCIA.find((c) => podeVerTela(c, ctx));
  return TELAS_APP.find((t) => t.codigo === codigo);
}

/** Chave de uma permissão por unidade: "metas.lancamentos:editar". */
export const chave = (tela: string, acao: string) => `${tela}:${acao}`;
