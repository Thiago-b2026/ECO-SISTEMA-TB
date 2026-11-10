// Mesmas contas de checklist.dashboard (usado no modo demonstração e nos testes).
import type { Execucao, PlanoAcao, Tarefa } from "../domain/tipos";
import { dataSP } from "../domain/tempo";
import { nomeSetor } from "./seed-modelos";
import type { Dashboard, Membro } from "./servidor";

/** Resposta como o servidor guarda depois de concluir (visível, fator, peso, setor). */
export interface RespostaCalculada {
  execucao_id: string;
  visivel: boolean | null;
  fator: number | null;
  peso: number | null;
  setor: string | null;
  nao_conforme: boolean | null;
}

const arred = (n: number) => Math.round(n * 100) / 100;

function conformidade(rs: RespostaCalculada[]): number | null {
  let o = 0;
  let p = 0;
  for (const r of rs) {
    if (!r.visivel || r.fator == null || !(r.peso! > 0)) continue;
    o += r.peso! * r.fator;
    p += r.peso!;
  }
  return p === 0 ? null : arred((100 * o) / p);
}

const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const duracao = (e: Execucao) => (e.fim_em ? Math.max(0, Math.round((new Date(e.fim_em).getTime() - new Date(e.inicio_em).getTime()) / 1000)) : null);

export function calcularDashboard(args: {
  de: string; ate: string; lojas: { id: string; nome: string }[];
  tarefas: Tarefa[]; execucoes: Execucao[]; respostas: RespostaCalculada[]; planos: PlanoAcao[]; membros: Membro[];
  agora?: Date;
}): Dashboard {
  const agora = args.agora ?? new Date();
  const ids = new Set(args.lojas.map((l) => l.id));
  const t = args.tarefas.filter((x) => ids.has(x.loja_id) && x.data_ref >= args.de && x.data_ref <= args.ate);
  const atrasada = (x: Tarefa) => !x.concluida_em && !x.cancelada_em && new Date(x.prazo) < agora;
  const e = args.execucoes.filter((x) => ids.has(x.loja_id) && (x.status === "concluida" || x.status === "validada")
    && dataSP(x.inicio_em) >= args.de && dataSP(x.inicio_em) <= args.ate);
  const eIds = new Set(e.map((x) => x.id));
  const r = args.respostas.filter((x) => eIds.has(x.execucao_id) && x.visivel && x.fator != null && (x.peso ?? 0) > 0);
  const porExec = new Map(e.map((x) => [x.id, x]));
  const planos = args.planos.filter((p) => ids.has(p.loja_id) && p.status !== "concluido" && p.status !== "cancelado");
  const nome = (u: string) => args.membros.find((m) => m.usuario_id === u)?.nome ?? "Usuário";

  const setores = [...new Set(r.map((x) => x.setor ?? "Sem setor"))].sort();
  const pessoas = [...new Set(e.map((x) => x.usuario_id))];

  return {
    tarefas_total: t.filter((x) => !x.cancelada_em).length,
    tarefas_concluidas: t.filter((x) => x.concluida_em).length,
    tarefas_atrasadas: t.filter(atrasada).length,
    tarefas_pendentes: t.filter((x) => !x.concluida_em && !x.cancelada_em && !atrasada(x)).length,
    concluidas_no_prazo: t.filter((x) => x.concluida_em && x.concluida_em <= x.prazo).length,
    execucoes: e.length,
    tempo_medio_seg: media(e.map(duracao).filter((x): x is number => x != null)),
    conformidade: conformidade(r),
    planos_abertos: planos.length,
    planos_atrasados: planos.filter((p) => new Date(p.prazo) < agora).length,
    por_setor: setores.map((s) => {
      const rs = r.filter((x) => (x.setor ?? "Sem setor") === s);
      return { setor: s, conformidade: conformidade(rs), itens: rs.length, nao_conformes: rs.filter((x) => x.nao_conforme).length };
    }),
    por_pessoa: pessoas.map((u) => {
      const es = e.filter((x) => x.usuario_id === u);
      const esIds = new Set(es.map((x) => x.id));
      return {
        usuario_id: u, nome: nome(u), execucoes: es.length,
        tempo_medio_seg: media(es.map(duracao).filter((x): x is number => x != null)),
        conformidade: conformidade(r.filter((x) => porExec.get(x.execucao_id)?.usuario_id === u)),
        concluidas_com_atraso: t.filter((x) => x.concluida_em && x.execucao_id && esIds.has(x.execucao_id) && x.concluida_em > x.prazo).length,
      };
    }).sort((a, b) => a.nome.localeCompare(b.nome)),
    por_loja: args.lojas.map((l) => ({
      loja_id: l.id, nome: l.nome,
      concluidas: t.filter((x) => x.loja_id === l.id && x.concluida_em).length,
      atrasadas: t.filter((x) => x.loja_id === l.id && atrasada(x)).length,
      conformidade: conformidade(r.filter((x) => porExec.get(x.execucao_id)?.loja_id === l.id)),
    })).sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

export const rotuloSetor = nomeSetor;
