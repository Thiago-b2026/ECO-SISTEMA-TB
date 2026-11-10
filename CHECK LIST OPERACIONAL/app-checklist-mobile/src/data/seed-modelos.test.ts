import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODELOS_SEED, SETORES } from "./seed-modelos";
import { gerarSeedSql } from "./seed-sql";
import { todosItens } from "../domain/regras";

const contagem = Object.fromEntries(MODELOS_SEED.map((m) => [m.codigo, todosItens(m.conteudo).length]));

describe("modelos reais (planilha do líder de loja do Braz)", () => {
  it("8 modelos, com a mesma quantidade de itens de cada aba da planilha (109 + 2 sugeridos)", () => {
    expect(contagem).toEqual({
      lider_manha: 20, lider_analise: 16, lider_tarde: 14, fiscal_manha: 16, fiscal_tarde: 11,
      lider_semanal: 18, lider_mensal: 7, metodo_polar: 9,
    });
    const sugeridos = MODELOS_SEED.flatMap((m) => todosItens(m.conteudo)).filter((i) => i.ajuda?.startsWith("SUGERIDO"));
    expect(sugeridos.map((i) => i.id)).toEqual(["mp_atendimento", "mp_rupturas"]);
    expect(Object.values(contagem).reduce((a, b) => a + b, 0) - sugeridos.length).toBe(109);
  });

  it("ids únicos, condições válidas (item anterior), setores e prazos conhecidos", () => {
    const todos = MODELOS_SEED.flatMap((m) => todosItens(m.conteudo));
    expect(new Set(todos.map((i) => i.id)).size).toBe(todos.length);
    for (const m of MODELOS_SEED) {
      const itens = todosItens(m.conteudo);
      itens.forEach((i, idx) => {
        if (i.condicao) expect(itens.slice(0, idx).some((x) => x.id === i.condicao!.item_id), i.id).toBe(true);
        expect(SETORES[i.setor!], `${i.id} setor ${i.setor}`).toBeTruthy();
        if (i.prazo_hora) expect(i.prazo_hora).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
        if (i.dias_semana) expect(i.dias_semana.every((d) => d >= 0 && d <= 6)).toBe(true);
        if (!i.pontua) expect(i.peso >= 0).toBe(true);
      });
    }
  });

  it("regras da planilha: prazos de 14:00 e 15:00, oferta condicional, itens por dia da semana", () => {
    const item = (id: string) => MODELOS_SEED.flatMap((m) => todosItens(m.conteudo)).find((i) => i.id === id)!;
    expect(item("la_of_confirmar").prazo_hora).toBe("14:00");
    expect(item("lt_pedido").prazo_hora).toBe("15:00");
    expect(item("ft_validade_padaria")).toMatchObject({ prazo_hora: "15:00", foto: "sempre" });
    expect(item("la_of_causa").condicao).toEqual({ item_id: "la_of_sucesso", valores: [false] });
    expect(item("ls_qui_frios").dias_semana).toEqual([4]);
    expect(MODELOS_SEED.find((m) => m.codigo === "lider_mensal")!.agenda.dias_antes_fim_mes).toBe(8);
  });

  it("o SQL de carga está em dia com o arquivo de modelos (rode npm run seed:gerar)", () => {
    const arquivo = readFileSync(resolve(import.meta.dirname, "../../supabase/seed/checklist_seed.sql"), "utf8").replace(/\r\n/g, "\n");
    expect(arquivo).toBe(gerarSeedSql());
  });
});
