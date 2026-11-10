// Gera o SQL de carga dos modelos reais (versão 1 já publicada). Ids determinísticos: rodar de novo não duplica.
import { MODELOS_SEED } from "./seed-modelos.ts";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function gerarSeedSql(): string {
  const linhas: string[] = [
    "-- CARGA DOS MODELOS REAIS do Check List (gerado por scripts/gerar-seed.ts a partir de src/data/seed-modelos.ts).",
    "-- NÃO EDITE À MÃO. Rodar no SQL Editor DEPOIS da migration do schema checklist. Idempotente.",
    "begin;",
  ];
  for (const m of MODELOS_SEED) {
    const idModelo = `md5('checklist-modelo:${m.codigo}')::uuid`;
    const idVersao = `md5('checklist-versao:${m.codigo}:1')::uuid`;
    linhas.push(
      `insert into checklist.modelos (id, codigo, nome, descricao, categoria, perfil_executor) values (${idModelo}, ${q(m.codigo)}, ${q(m.nome)}, ${q(m.descricao)}, ${q(m.categoria)}, ${q(m.perfil_executor)}) on conflict (id) do nothing;`,
      `insert into checklist.modelo_versoes (id, modelo_id, numero, status, conteudo, publicada_em) values (${idVersao}, ${idModelo}, 1, 'publicada', ${q(JSON.stringify(m.conteudo))}::jsonb, now()) on conflict (id) do nothing;`,
      `insert into checklist.historico (tabela, registro_id, acao, depois, justificativa) select 'modelo_versoes', ${idVersao}, 'publicada', jsonb_build_object('numero', 1, 'origem', 'carga inicial'), 'Planilha ${m.aba_planilha.replace(/'/g, "''")}' where not exists (select 1 from checklist.historico where registro_id = ${idVersao} and acao = 'publicada');`,
    );
  }
  linhas.push("commit;", "");
  return linhas.join("\n");
}
