// Junta os dados de uma execução (do aparelho ou do servidor) e gera o PDF.
import type { BancoLocal } from "../data/local";
import type { Servidor } from "../data/servidor";
import { dataSP } from "../domain/tempo";
import { baixar, gerarPdfExecucao, nomeArquivo } from "./relatorios";

export async function baixarPdfExecucao(execId: string, db: BancoLocal, srv: Servidor, nomeLoja: string) {
  let e = await db.execucoes.get(execId);
  let respostas = await db.respostas.where("execucao_id").equals(execId).toArray();
  let fotos = await db.fotos.where("execucao_id").equals(execId).toArray();
  if (!e || !respostas.length) {
    const d = await srv.detalheExecucao(execId);
    e = { ...e, ...d.execucao };
    respostas = d.respostas;
    fotos = d.fotos.map((f) => ({ ...f, enviada: true, blob: null }));
  }
  const versao = await db.versoes.get(e.versao_id);
  if (!versao) throw new Error("Versão do modelo não está no aparelho. Atualize com internet.");
  const modelo = (await db.modelos.get(e.modelo_id))?.nome ?? "Checklist";
  const pessoa = (await db.membros.where("usuario_id").equals(e.usuario_id).first())?.nome ?? "—";
  const tarefa = e.tarefa_id ? await db.tarefas.get(e.tarefa_id) : undefined;
  const planos = await db.planos.where("execucao_id").equals(execId).toArray();
  // fotos que já saíram do aparelho: busca o arquivo no servidor (se houver internet)
  const comArquivo = await Promise.all(fotos.map(async (f) => {
    if (f.blob) return f;
    try { return { ...f, blob: await (await fetch(await srv.urlArquivo(f.storage_path))).blob() }; } catch { return f; }
  }));
  const blob = await gerarPdfExecucao({
    execucao: e, versao, modelo, loja: nomeLoja, pessoa, dataRef: tarefa?.data_ref ?? dataSP(e.inicio_em), respostas, fotos: comArquivo, planos,
  });
  baixar(blob, `${nomeArquivo(`${modelo} ${dataSP(e.inicio_em)} ${pessoa}`)}.pdf`);
}
