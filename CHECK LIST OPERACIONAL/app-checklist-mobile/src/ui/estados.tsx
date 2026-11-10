// Selos de situação: sempre ícone + texto (regra J).
import { Ban, CheckCircle2, CircleDashed, Clock, Hourglass, PlayCircle, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import type { SituacaoTarefa } from "../domain/situacao";
import { ROTULO_STATUS_PLANO, planoAtrasado } from "../domain/situacao";
import type { PlanoAcao, StatusExecucao } from "../domain/tipos";
import { Selo } from "./base";

export function SeloTarefa({ s }: { s: SituacaoTarefa }) {
  switch (s) {
    case "pendente": return <Selo tom="neutro" icone={CircleDashed}>Pendente</Selo>;
    case "em_andamento": return <Selo tom="info" icone={PlayCircle}>Em andamento</Selo>;
    case "atrasada": return <Selo tom="erro" icone={Clock}>Atrasada</Selo>;
    case "concluida": return <Selo tom="ok" icone={CheckCircle2}>Concluída</Selo>;
    case "cancelada": return <Selo tom="neutro" icone={Ban}>Cancelada</Selo>;
  }
}

export function SeloExecucao({ s }: { s: StatusExecucao }) {
  switch (s) {
    case "em_andamento": return <Selo tom="info" icone={PlayCircle}>Em andamento</Selo>;
    case "concluida": return <Selo tom="ok" icone={CheckCircle2}>Concluída · aguardando validação</Selo>;
    case "validada": return <Selo tom="ok" icone={ShieldCheck}>Validada</Selo>;
    case "devolvida": return <Selo tom="alerta" icone={RotateCcw}>Devolvida para correção</Selo>;
    case "cancelada": return <Selo tom="neutro" icone={Ban}>Cancelada</Selo>;
  }
}

export function SeloPlano({ p }: { p: Pick<PlanoAcao, "status" | "prazo"> }) {
  const rotulo = ROTULO_STATUS_PLANO[p.status];
  const atrasado = planoAtrasado(p);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {p.status === "concluido" ? <Selo tom="ok" icone={CheckCircle2}>{rotulo}</Selo>
        : p.status === "cancelado" ? <Selo tom="neutro" icone={XCircle}>{rotulo}</Selo>
          : p.status === "aguardando_validacao" ? <Selo tom="info" icone={Hourglass}>{rotulo}</Selo>
            : <Selo tom="alerta" icone={p.status === "aberto" ? CircleDashed : PlayCircle}>{rotulo}</Selo>}
      {atrasado && <Selo tom="erro" icone={Clock}>Atrasado</Selo>}
    </span>
  );
}
