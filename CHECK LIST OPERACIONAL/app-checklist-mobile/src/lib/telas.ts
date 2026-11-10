// Telas do Check List no Ecossistema TB. Mesmos códigos de
// GESTAO SALVADOS/supabase/migrations/20261110000023_checklist_telas.sql (um teste confere).
// Quem LIBERA a tela é o admin (public.minhas_telas('checklist')); o perfil do Check List
// (checklist.membros) define o que a pessoa faz dentro dela.
import type { Perfil } from "../domain/tipos";
import { nivel } from "../data/servidor";

export const PORTAL_URL = "https://portal-grupotb.vercel.app";

export interface TelaApp {
  codigo: string;
  nome: string;
  rota: string;
  grupo: "operacao" | "supervisao" | "cadastros";
  /** perfil mínimo para a tela fazer sentido */
  perfilMinimo: Perfil;
}

export const TELAS_APP: TelaApp[] = [
  { codigo: "checklist.hoje", nome: "Minhas tarefas", rota: "/", grupo: "operacao", perfilMinimo: "operador" },
  { codigo: "checklist.planos", nome: "Planos de ação", rota: "/planos", grupo: "operacao", perfilMinimo: "operador" },
  { codigo: "checklist.loja", nome: "Tarefas da loja", rota: "/loja", grupo: "supervisao", perfilMinimo: "supervisor" },
  { codigo: "checklist.dashboard", nome: "Dashboard", rota: "/dashboard", grupo: "supervisao", perfilMinimo: "supervisor" },
  { codigo: "checklist.relatorios", nome: "Relatórios", rota: "/relatorios", grupo: "supervisao", perfilMinimo: "supervisor" },
  { codigo: "checklist.agendamentos", nome: "Agendamentos", rota: "/agendamentos", grupo: "cadastros", perfilMinimo: "supervisor" },
  { codigo: "checklist.modelos", nome: "Modelos de checklist", rota: "/modelos", grupo: "cadastros", perfilMinimo: "gestor" },
  { codigo: "checklist.equipe", nome: "Equipe e perfis", rota: "/equipe", grupo: "cadastros", perfilMinimo: "gestor" },
];

/** Rotas filhas que pertencem a uma tela (ex.: /execucao/123 é parte de "Minhas tarefas"). */
const FILHAS: Record<string, string> = { "/execucao": "checklist.hoje" };

export function telaDaRota(path: string): TelaApp | undefined {
  for (const [pref, codigo] of Object.entries(FILHAS)) if (path === pref || path.startsWith(pref + "/")) return TELAS_APP.find((t) => t.codigo === codigo);
  return TELAS_APP.filter((t) => path === t.rota || (t.rota !== "/" && path.startsWith(t.rota + "/"))).sort((a, b) => b.rota.length - a.rota.length)[0];
}

export interface CtxAcesso {
  admin?: boolean;
  /** telas liberadas no Portal; null = consulta falhou (modo de segurança: vale só o perfil) */
  liberadas: ReadonlySet<string> | null;
  /** maior perfil do usuário entre as unidades */
  perfil: Perfil | null;
}

/** Pode abrir a tela? Precisa da tela liberada (ou consulta com erro) E do perfil mínimo. */
export function podeVerTela(codigo: string, ctx: CtxAcesso): boolean {
  const t = TELAS_APP.find((x) => x.codigo === codigo);
  if (!t) return true;
  if (nivel(ctx.perfil) < nivel(t.perfilMinimo)) return false;
  if (ctx.liberadas === null) return true;
  return ctx.liberadas.has(codigo);
}

/** Telas que um perfil normalmente recebe (usado no modo demonstração). */
export const telasDoPerfil = (p: Perfil | null) => TELAS_APP.filter((t) => nivel(p) >= nivel(t.perfilMinimo)).map((t) => t.codigo);
