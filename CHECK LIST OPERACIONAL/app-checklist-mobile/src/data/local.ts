// Banco LOCAL do aparelho (IndexedDB). Tudo é salvo aqui primeiro (offline-first) e
// depois enviado pela fila. Um banco por usuário: num celular compartilhado, um não vê os dados do outro.
import Dexie, { type Table } from "dexie";
import type { Agendamento, Execucao, Foto, Modelo, ModeloVersao, PlanoAcao, Resposta, Tarefa } from "../domain/tipos";
import type { LojaAcesso, Membro, Setor } from "./servidor";

/** Execução no aparelho: + marcas de envio. */
export interface ExecucaoLocal extends Execucao {
  /** concluída no aparelho, falta confirmar no servidor */
  conclusao_pendente?: boolean;
  /** assinatura final (id da foto com a imagem) */
  assinatura_foto_id?: string | null;
  /** pausa em andamento (app em 2º plano / saiu da tela) – só no aparelho */
  pausa_desde?: string | null;
}

/** Foto no aparelho: guarda o arquivo até ser enviado. */
export interface FotoLocal extends Foto {
  blob?: Blob | null;
  enviada: boolean;
  /** "assinatura" = imagem da assinatura */
  tipo?: "foto" | "assinatura";
}

export type TipoOp = "execucao" | "plano_acao" | "plano_criar" | "plano_foto" | "validar_execucao" | "cancelar_tarefa" | "cancelar_execucao";

export interface Operacao {
  seq?: number;
  tipo: TipoOp;
  /** chave para não repetir a mesma operação (ex.: id da execução) */
  chave: string;
  dados: Record<string, unknown>;
  criada_em: string;
  tentativas: number;
  erro?: string | null;
}

export interface Meta {
  chave: string;
  valor: unknown;
}

export class BancoLocal extends Dexie {
  modelos!: Table<Modelo, string>;
  versoes!: Table<ModeloVersao, string>;
  tarefas!: Table<Tarefa, string>;
  planos!: Table<PlanoAcao & { local?: boolean }, string>;
  membros!: Table<Membro, string>;
  setores!: Table<Setor, [string, string]>;
  /** unidades do usuário (com a empresa) – para saber a empresa de cada loja sem internet */
  lojas!: Table<LojaAcesso, string>;
  agendamentos!: Table<Agendamento, string>;
  execucoes!: Table<ExecucaoLocal, string>;
  respostas!: Table<Resposta, string>;
  fotos!: Table<FotoLocal, string>;
  fila!: Table<Operacao, number>;
  meta!: Table<Meta, string>;

  // v2 = multiempresa (membros por empresa). Nada foi para produção antes, então não há migração de dados.
  constructor(usuarioId: string, prefixo = "checklist-local-v2") {
    super(`${prefixo}-${usuarioId}`);
    this.version(1).stores({
      modelos: "id, rede_id",
      versoes: "id, modelo_id",
      tarefas: "id, loja_id, data_ref",
      planos: "id, loja_id, execucao_id, responsavel_id",
      membros: "id, loja_id, rede_id, usuario_id",
      setores: "[rede_id+codigo], rede_id",
      lojas: "loja_id, rede_id",
      agendamentos: "id, loja_id",
      execucoes: "id, tarefa_id, loja_id, usuario_id, status",
      respostas: "id, execucao_id, &[execucao_id+item_id]",
      fotos: "id, execucao_id, plano_id, [execucao_id+item_id]",
      fila: "++seq, tipo, chave",
      meta: "chave",
    });
  }

  async lerMeta<T>(chave: string): Promise<T | undefined> {
    return (await this.meta.get(chave))?.valor as T | undefined;
  }

  async gravarMeta(chave: string, valor: unknown) {
    await this.meta.put({ chave, valor });
  }
}
