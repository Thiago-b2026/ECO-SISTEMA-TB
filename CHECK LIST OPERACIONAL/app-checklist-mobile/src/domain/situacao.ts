// "Atrasada" é CALCULADA (regra C), nunca gravada.
// Ações do plano: mesmas validações de checklist.plano_* (regra D).
import type { Execucao, PlanoAcao, StatusPlano, Tarefa } from "./tipos";

export type SituacaoTarefa = "pendente" | "em_andamento" | "atrasada" | "concluida" | "cancelada";

export function situacaoTarefa(t: Tarefa, execucao?: Pick<Execucao, "status"> | null, agora = new Date()): SituacaoTarefa {
  if (t.cancelada_em) return "cancelada";
  if (t.concluida_em) return "concluida";
  if (execucao && (execucao.status === "concluida" || execucao.status === "validada")) return "concluida";
  if (new Date(t.prazo) < agora) return "atrasada";
  if (execucao && (execucao.status === "em_andamento" || execucao.status === "devolvida")) return "em_andamento";
  return "pendente";
}

export const planoAtrasado = (p: Pick<PlanoAcao, "status" | "prazo">, agora = new Date()) =>
  p.status !== "concluido" && p.status !== "cancelado" && new Date(p.prazo) < agora;

export const ROTULO_STATUS_PLANO: Record<StatusPlano, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_validacao: "Aguardando validação",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export type AcaoPlano = "iniciar" | "enviar_solucao" | "validar" | "rejeitar" | "cancelar" | "alterar";

/** O que o usuário pode fazer no plano. supervisor = supervisor ou gestor na unidade. */
export function acoesPlano(p: PlanoAcao, usuario: string, supervisor: boolean): AcaoPlano[] {
  const responsavel = p.responsavel_id === usuario;
  if (!supervisor && !responsavel) return [];
  const a: AcaoPlano[] = [];
  if (p.status === "aberto") a.push("iniciar");
  if (p.status === "aberto" || p.status === "em_andamento") a.push("enviar_solucao");
  if (supervisor && p.status === "aguardando_validacao" && p.executado_por !== usuario) a.push("validar", "rejeitar");
  if (supervisor && p.status !== "concluido" && p.status !== "cancelado") a.push("alterar", "cancelar");
  return a;
}

export interface ArgsAcaoPlano {
  texto?: string;
  prazo?: string | null;
  responsavel_id?: string | null;
}

/** Aplica a ação com as mesmas validações do banco. Lança Error com a mesma mensagem. */
export function aplicarAcaoPlano(p: PlanoAcao, acao: AcaoPlano, usuario: string, supervisor: boolean, args: ArgsAcaoPlano = {}): PlanoAcao {
  const texto = (args.texto ?? "").trim();
  if (!supervisor && p.responsavel_id !== usuario) throw new Error("Sem permissão neste plano de ação.");
  switch (acao) {
    case "iniciar":
      if (p.status === "em_andamento") return p;
      if (p.status !== "aberto") throw new Error("Só um plano aberto pode ser iniciado.");
      return { ...p, status: "em_andamento" };
    case "enviar_solucao":
      if (!texto) throw new Error("Descreva a solução.");
      if (p.status === "aguardando_validacao" && p.solucao === texto) return p;
      if (p.status !== "aberto" && p.status !== "em_andamento") throw new Error(`Plano ${p.status}: não aceita solução agora.`);
      return { ...p, status: "aguardando_validacao", solucao: texto, executado_por: usuario };
    case "validar":
      if (p.status === "concluido") return p;
      if (!supervisor) throw new Error("Só supervisor ou gestor valida.");
      if (p.status !== "aguardando_validacao") throw new Error("Só um plano aguardando validação pode ser concluído.");
      if (p.executado_por === usuario) throw new Error("Quem executou não valida a própria solução.");
      return { ...p, status: "concluido", validado_por: usuario };
    case "rejeitar":
      if (!supervisor) throw new Error("Só supervisor ou gestor rejeita.");
      if (!texto) throw new Error("Informe a justificativa da rejeição.");
      if (p.status === "em_andamento") return p;
      if (p.status !== "aguardando_validacao") throw new Error("Só um plano aguardando validação pode ser rejeitado.");
      if (p.executado_por === usuario) throw new Error("Quem executou não valida a própria solução.");
      return { ...p, status: "em_andamento" };
    case "cancelar":
      if (p.status === "cancelado") return p;
      if (!supervisor) throw new Error("Só supervisor ou gestor cancela.");
      if (!texto) throw new Error("Informe o motivo do cancelamento.");
      if (p.status === "concluido") throw new Error("Plano concluído não pode ser cancelado.");
      return { ...p, status: "cancelado", motivo_cancelamento: texto };
    case "alterar": {
      if (!supervisor) throw new Error("Só supervisor ou gestor altera prazo ou responsável.");
      const prazo = args.prazo ?? p.prazo;
      const resp = args.responsavel_id === undefined ? p.responsavel_id : args.responsavel_id;
      if (prazo === p.prazo && resp === p.responsavel_id) return p;
      if (!texto) throw new Error("Trocar prazo ou responsável exige justificativa.");
      if (p.status === "concluido" || p.status === "cancelado") throw new Error("Plano encerrado não pode ser alterado.");
      return { ...p, prazo, responsavel_id: resp };
    }
  }
}
