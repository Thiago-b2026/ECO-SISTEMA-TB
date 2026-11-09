// Trava as regras de EXCLUIR (migration 0022): qualquer movimento bloqueia e nunca se apaga histórico.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(resolve(process.cwd(), "supabase/migrations/20261108000022_excluir_produto_usuario.sql"), "utf8");
const corpo = (nome: string) => {
  const i = SQL.indexOf(`create or replace function public.${nome}(`);
  expect(i, nome).toBeGreaterThan(-1);
  return SQL.slice(i, SQL.indexOf("$$;", SQL.indexOf("$$", i) + 2));
};

describe("excluir produto: só o que foi SÓ cadastrado", () => {
  const motivos = corpo("motivos_nao_excluir_produto");
  const lista = corpo("produtos_excluiveis");
  for (const tabela of ["stock_movements", "venda_itens", "transferencia_itens", "etiquetas_impressas", "crm_pedidos", "lote_id", "lote_item_id", "estoque_atual"]) {
    it(`bloqueia por ${tabela} (na regra e na lista do botão)`, () => {
      expect(motivos).toContain(tabela);
      expect(lista).toContain(tabela);
    });
  }
  it("qualquer registro em stock_movements bloqueia (sem filtro por tipo: entrada também conta)", () => {
    expect(motivos).toMatch(/from public\.stock_movements where produto_id = _id\)/);
  });
  it("quem exclui: admin ou gerente com a área Produtos → Excluir e a tela Produtos", () => {
    const pode = corpo("pode_excluir_produto");
    expect(pode).toContain("is_admin()");
    expect(pode).toContain("'gerente'");
    expect(pode).toContain("permite('produtos', 'excluir')");
    expect(pode).toContain("pode_ver_tela('pdv.produtos')");
    expect(SQL).toContain("('pdv.produtos', 'excluir')");
  });
});

describe("excluir usuário: só quem nunca fez nenhum movimento", () => {
  const m = corpo("motivos_nao_excluir_usuario");
  for (const tabela of ["vendas", "caixas", "caixa_movimentos", "lancamentos", "transferencias", "stock_movements", "lotes", "lote_itens", "produtos",
    "etiquetas_impressas", "modelos_etiqueta", "crm_campanhas", "crm_envios", "crm_pedidos", "dre_faturamento", "auditoria", "rh.empresa_membros", "rh.rh_entries_log"]) {
    it(`bloqueia por ${tabela}`, () => expect(m).toContain(tabela));
  }
});

describe("nunca apagar histórico", () => {
  it("a tabela nova de etiquetas não apaga em cascata (produto/usuário com etiqueta não somem)", () => {
    const t = SQL.slice(SQL.indexOf("create table public.etiquetas_impressas"), SQL.indexOf(");", SQL.indexOf("create table public.etiquetas_impressas")));
    expect(t).not.toMatch(/on delete/i);
  });
  it("ninguém altera nem apaga etiqueta registrada (só política de leitura)", () => {
    expect(SQL).not.toMatch(/on public\.etiquetas_impressas for (insert|update|delete|all)/);
  });
});
