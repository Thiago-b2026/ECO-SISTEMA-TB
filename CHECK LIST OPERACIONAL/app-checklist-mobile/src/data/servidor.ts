// Contrato entre o app e o "servidor". Duas implementações:
//  - SupabaseServidor (produção: banco ECO-SISTEMA-TB, schema checklist)
//  - DemoServidor (modo demonstração: tudo no navegador, mesmas regras)
import type { AcaoPlano, ArgsAcaoPlano } from "../domain/situacao";
import type {
  Agendamento, Execucao, Foto, Modelo, ModeloVersao, Perfil, PlanoAcao, Resposta, Tarefa,
} from "../domain/tipos";

export interface Sessao {
  usuario_id: string;
  email: string;
  nome: string;
}

export interface LojaAcesso {
  loja_id: string;
  nome: string;
  /** perfil no Check List (checklist.membros). null = unidade liberada no Portal, mas sem perfil */
  perfil: Perfil | null;
}

export interface Membro {
  usuario_id: string;
  loja_id: string;
  perfil: Perfil;
  nome: string;
  ativo: boolean;
}

export interface Pacote {
  modelos: Modelo[];
  versoes: ModeloVersao[];
  tarefas: Tarefa[];
  planos: PlanoAcao[];
  membros: Membro[];
  agendamentos: Agendamento[];
  execucoes: Execucao[];
}

export interface PacoteExecucao {
  execucao: Execucao;
  respostas: Resposta[];
  fotos: Foto[];
}

export interface Historico {
  id: number | string;
  tabela: string;
  registro_id: string;
  acao: string;
  autor: string | null;
  autor_nome?: string;
  data: string;
  justificativa: string | null;
}

export interface Dashboard {
  tarefas_total: number;
  tarefas_concluidas: number;
  tarefas_atrasadas: number;
  tarefas_pendentes: number;
  concluidas_no_prazo: number;
  execucoes: number;
  tempo_medio_seg: number | null;
  conformidade: number | null;
  planos_abertos: number;
  planos_atrasados: number;
  por_setor: { setor: string; conformidade: number | null; itens: number; nao_conformes: number }[];
  por_pessoa: { usuario_id: string; nome: string; execucoes: number; tempo_medio_seg: number | null; conformidade: number | null; concluidas_com_atraso: number }[];
  por_loja: { loja_id: string; nome: string; concluidas: number; atrasadas: number; conformidade: number | null }[];
}

export interface LinhaRelatorio {
  execucao_id: string;
  loja: string;
  modelo: string;
  versao: number;
  pessoa: string;
  data: string;
  inicio: string;
  fim: string | null;
  duracao_seg: number | null;
  status: string;
  pontuacao: number | null;
  nao_conformes: number;
  planos: number;
}

export interface NovoPlano {
  id: string;
  loja_id: string;
  titulo: string;
  descricao: string | null;
  responsavel_id: string | null;
  prazo: string;
  setor: string | null;
}

/** Erro de regra de negócio vindo do servidor (não é falta de internet). */
export class ErroServidor extends Error {
  constructor(msg: string, public readonly semConexao = false) {
    super(msg);
  }
}

export interface Servidor {
  readonly modo: "supabase" | "demo";
  sessaoAtual(): Promise<Sessao | null>;
  entrar(email: string, senha: string): Promise<Sessao>;
  sair(): Promise<void>;
  /** telas liberadas (public.minhas_telas('checklist')). Lança erro se a consulta falhar. */
  minhasTelas(): Promise<string[]>;
  /** unidades do Portal (minhas_unidades('checklist')) com o perfil do Check List */
  minhasLojas(): Promise<LojaAcesso[]>;
  gerarTarefas(data: string): Promise<void>;
  baixar(lojas: string[], de: string, ate: string): Promise<Pacote>;

  enviarArquivo(path: string, blob: Blob, mime: string): Promise<void>;
  urlArquivo(path: string): Promise<string>;
  syncExecucao(e: Execucao, respostas: Resposta[], fotos: Foto[]): Promise<{ status: string }>;
  concluirExecucao(id: string, fim: string, assinaturaPath: string | null, lat: number | null, lng: number | null): Promise<{ pontuacao: number | null }>;
  validarExecucao(id: string, aprovar: boolean, motivo?: string): Promise<void>;
  cancelarExecucao(id: string, motivo: string): Promise<void>;
  cancelarTarefa(id: string, motivo: string): Promise<void>;
  detalheExecucao(id: string): Promise<PacoteExecucao>;

  acaoPlano(id: string, acao: AcaoPlano, args: ArgsAcaoPlano): Promise<void>;
  criarPlano(p: NovoPlano): Promise<void>;
  registrarFotoPlano(f: Foto): Promise<void>;
  historico(registroId: string): Promise<Historico[]>;

  dashboard(de: string, ate: string, loja: string | null): Promise<Dashboard>;
  relatorio(de: string, ate: string, loja: string | null): Promise<LinhaRelatorio[]>;

  salvarAgendamento(a: Agendamento): Promise<void>;
  versoesDoModelo(modeloId: string): Promise<ModeloVersao[]>;
  criarRascunho(modeloId: string): Promise<string>;
  salvarRascunho(v: ModeloVersao): Promise<void>;
  publicarVersao(id: string): Promise<void>;
  equipe(loja: string): Promise<Membro[]>;
  definirMembro(email: string, loja: string, perfil: Perfil, nome: string, ativo: boolean): Promise<void>;
}

export const PERFIS: Record<Perfil, string> = { operador: "Operador", supervisor: "Supervisor", gestor: "Gestor" };
export const nivel = (p: Perfil | null | undefined) => (p === "gestor" ? 3 : p === "supervisor" ? 2 : p === "operador" ? 1 : 0);
