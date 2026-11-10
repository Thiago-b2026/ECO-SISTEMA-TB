import { describe, expect, it } from "vitest";
import { agendaVale } from "./agenda";
import { idPlano } from "./ids";
import { acoesPlano, aplicarAcaoPlano, planoAtrasado, situacaoTarefa } from "./situacao";
import { dataSP, diaSemana, duracao, horaSP, instanteSP } from "./tempo";
import type { PlanoAcao, Tarefa } from "./tipos";

describe("tempo (UTC gravado, São Paulo exibido)", () => {
  it("converte data/hora de SP para UTC e volta", () => {
    expect(instanteSP("2026-11-10", "14:00")).toBe("2026-11-10T17:00:00.000Z");
    expect(horaSP("2026-11-10T17:00:00.000Z")).toBe("14:00");
    expect(dataSP("2026-11-11T02:30:00.000Z")).toBe("2026-11-10"); // 23:30 em SP
    expect(diaSemana("2026-11-09")).toBe(1);
    expect(duracao(3900)).toBe("1h 05min");
  });
});

describe("agenda (igual ao banco)", () => {
  it("semanal, mensal por dia e N dias antes do fim", () => {
    expect(agendaVale({ frequencia: "semanal", dias_semana: [1] }, "2026-11-09")).toBe(true);
    expect(agendaVale({ frequencia: "semanal", dias_semana: [1] }, "2026-11-10")).toBe(false);
    expect(agendaVale({ frequencia: "mensal", dia_mes: 31 }, "2026-11-30")).toBe(true);
    expect(agendaVale({ frequencia: "mensal", dias_antes_fim_mes: 8 }, "2026-11-22")).toBe(true);
    expect(agendaVale({ frequencia: "mensal", dias_antes_fim_mes: 8 }, "2026-11-23")).toBe(false);
  });
});

describe("ids", () => {
  it("id do plano no formato uuid (o teste de banco confere que é igual ao Postgres)", () => {
    expect(idPlano("a", "b")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(idPlano("a", "b")).toBe(idPlano("a", "b"));
  });
});

describe("situação calculada (regra C)", () => {
  const t: Tarefa = { id: "t", agendamento_id: null, modelo_id: "m", loja_id: "l", responsavel_id: null, perfil_responsavel: "operador", data_ref: "2026-11-10", prazo: "2026-11-10T13:00:00Z" };
  it("atrasada quando passou do prazo e não concluiu", () => {
    expect(situacaoTarefa(t, null, new Date("2026-11-10T12:00:00Z"))).toBe("pendente");
    expect(situacaoTarefa(t, { status: "em_andamento" }, new Date("2026-11-10T12:00:00Z"))).toBe("em_andamento");
    expect(situacaoTarefa(t, null, new Date("2026-11-10T14:00:00Z"))).toBe("atrasada");
    expect(situacaoTarefa({ ...t, concluida_em: "x" }, null, new Date("2026-11-11T00:00:00Z"))).toBe("concluida");
    expect(planoAtrasado({ status: "aberto", prazo: "2026-11-10T13:00:00Z" }, new Date("2026-11-10T14:00:00Z"))).toBe(true);
    expect(planoAtrasado({ status: "concluido", prazo: "2026-11-10T13:00:00Z" }, new Date("2026-11-10T14:00:00Z"))).toBe(false);
  });
});

describe("plano de ação (regra D, igual ao banco)", () => {
  const p: PlanoAcao = { id: "p", execucao_id: "e", item_id: "i", loja_id: "l", titulo: "x", responsavel_id: "op", prazo: "2026-11-11T00:00:00Z", status: "aberto", criado_em: "" };
  it("fluxo completo com rejeição; quem executou não valida", () => {
    let x = aplicarAcaoPlano(p, "iniciar", "op", false);
    x = aplicarAcaoPlano(x, "enviar_solucao", "op", false, { texto: "feito" });
    expect(acoesPlano(x, "op", false)).toEqual([]);
    expect(() => aplicarAcaoPlano(x, "validar", "op", false)).toThrow("Só supervisor");
    expect(() => aplicarAcaoPlano(x, "rejeitar", "sup", true, { texto: " " })).toThrow("justificativa");
    x = aplicarAcaoPlano(x, "rejeitar", "sup", true, { texto: "faltou foto" });
    expect(x.status).toBe("em_andamento");
    x = aplicarAcaoPlano(x, "enviar_solucao", "sup", true, { texto: "eu fiz" });
    expect(() => aplicarAcaoPlano(x, "validar", "sup", true)).toThrow("Quem executou não valida");
    expect(acoesPlano(x, "sup", true)).not.toContain("validar");
    x = aplicarAcaoPlano(x, "validar", "gestor", true);
    expect(x.status).toBe("concluido");
    expect(() => aplicarAcaoPlano(x, "cancelar", "gestor", true, { texto: "x" })).toThrow("concluído");
    expect(() => aplicarAcaoPlano(p, "alterar", "sup", true, { prazo: "2026-12-01T00:00:00Z" })).toThrow("justificativa");
    expect(() => aplicarAcaoPlano(p, "cancelar", "sup", true, { texto: "" })).toThrow("motivo");
  });
});
