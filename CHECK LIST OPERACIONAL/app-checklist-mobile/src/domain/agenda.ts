// Mesma regra de checklist.agenda_vale (datas locais de São Paulo).
import type { Agendamento } from "./tipos";
import { diaSemana, instanteSP, ultimoDiaDoMes } from "./tempo";

type Regra = Pick<Agendamento, "frequencia" | "dias_semana" | "dia_mes" | "dias_antes_fim_mes">;

export function agendaVale(a: Regra, data: string): boolean {
  if (a.frequencia === "diaria") return true;
  if (a.frequencia === "semanal") return (a.dias_semana ?? []).includes(diaSemana(data));
  const ultimo = ultimoDiaDoMes(data);
  if (a.dias_antes_fim_mes != null) {
    const [y, m, d] = ultimo.split("-").map(Number);
    return data === new Date(Date.UTC(y, m - 1, d - a.dias_antes_fim_mes)).toISOString().slice(0, 10);
  }
  if (a.dia_mes != null) return Number(data.slice(8)) === Math.min(a.dia_mes, Number(ultimo.slice(8)));
  return false;
}

/** Prazo de um item (ex.: 14:00) ou da tarefa no dia de referência. */
export const instanteDoDia = (dataRef: string, hora: string) => instanteSP(dataRef, hora);

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function descreverAgenda(a: Regra & Pick<Agendamento, "hora_inicio" | "hora_limite">): string {
  const h = `${a.hora_inicio.slice(0, 5)}–${a.hora_limite.slice(0, 5)}`;
  if (a.frequencia === "diaria") return `Todo dia, ${h}`;
  if (a.frequencia === "semanal") return `Semanal (${(a.dias_semana ?? []).map((d) => DIAS[d]).join(", ")}), ${h}`;
  if (a.dias_antes_fim_mes != null) return `Mensal, ${a.dias_antes_fim_mes} dias antes do fim do mês, ${h}`;
  return `Mensal, dia ${a.dia_mes}, ${h}`;
}
