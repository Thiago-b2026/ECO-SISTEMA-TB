// Banco LOCAL do aparelho (IndexedDB). Tudo é salvo aqui primeiro (offline-first) e
// depois enviado pela fila. Um banco por usuário: num celular compartilhado, um não vê os dados do outro.
import Dexie, { type Table } from "dexie";
import type { Agendamento, Execucao, Foto, Modelo, ModeloVersao, PlanoAcao, Resposta, Tarefa } from "../domain/tipos";
import type { Membro } from "./servidor";

/** Execução no aparelho: + marcas de envio. */
export interface ExecucaoLocal extends Execucao {
  /** concluída no aparelho, falta confirmar no servidor */
  conclusao_pendente?: boolean;
  /** assinatura final (id da foto com a imagem) */
  assinatura_foto_id?: string | null;
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
  membros!: Table<Membro, [string, string]>;
  agendamentos!: Table<Agendamento, string>;
  execucoes!: Table<ExecucaoLocal, string>;
  respostas!: Table<Resposta, string>;
  fotos!: Table<FotoLocal, string>;
  fila!: Table<Operacao, number>;
  meta!: Table<Meta, string>;

  constructor(usuarioId: string, prefixo = "checklist-local") {
    super(`${prefixo}-${usuarioId}`);
    this.version(1).stores({
      modelos: "id",
      versoes: "id, modelo_id",
      tarefas: "id, loja_id, data_ref",
      planos: "id, loja_id, execucao_id, responsavel_id",
      membros: "[usuario_id+loja_id], loja_id",
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
