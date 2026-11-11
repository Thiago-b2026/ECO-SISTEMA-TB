// Contrato entre o app e o "servidor". Duas implementações:
//  - SupabaseServidor (produção: banco ECO-SISTEMA-TB, schema checklist)
//  - DemoServidor (modo demonstração: tudo no navegador, mesmas regras)
import type { AcaoPlano, ArgsAcaoPlano } from "../domain/situacao";
import type { ConfigTempos, ExecTempo, ItemTempo } from "../domain/tempos";
import type {
  Agendamento, Execucao, Foto, Modelo, ModeloVersao, Perfil, PlanoAcao, Resposta, Tarefa,
} from "../domain/tipos";

export interface Sessao {
  usuario_id: string;
  email: string;
  nome: string;
  /** admin do Ecossistema (vê todas as empresas; só ele cria empresa, loja e colaborador) */
  admin: boolean;
}

/** Empresa = public.redes */
export interface Empresa {
  rede_id: string;
  nome: string;
  /** maior perfil da pessoa na empresa (admin = gestor) */
  perfil: Perfil | null;
}

export interface LojaAcesso {
  loja_id: string;
  nome: string;
  /** perfil no Check List (checklist.membros; gestor da empresa vale em todas as unidades dela) */
  perfil: Perfil | null;
  rede_id: string | null;
  rede_nome: string | null;
  tipo: "matriz" | "filial" | null;
  cnpj: string | null;
}

/** Gestor: loja_id nulo (vale para a empresa). Supervisor e operador: uma unidade. */
export interface Membro {
  id: string;
  usuario_id: string;
  rede_id: string;
  loja_id: string | null;
  perfil: Perfil;
  nome: string;
  ativo: boolean;
}

export interface Setor {
  rede_id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
}

/** Unidade como aparece na tela Empresas e lojas (todas as unidades da empresa, usem ou não o Check List). */
export interface Unidade {
  id: string;
  nome: string;
  cnpj: string | null;
  tipo: "matriz" | "filial" | null;
  rede_id: string | null;
  ativo: boolean;
  sistemas: string[];
}

export interface EmpresaCompleta {
  id: string;
  nome: string;
  ativo: boolean;
  unidades: Unidade[];
}

/** Tempos brutos do período (checklist.dados_tempos); situações e comparativos saem de src/domain/tempos.ts */
export interface DadosTempos {
  config: (ConfigTempos & { rede_id: string })[];
  execucoes: ExecTempo[];
  itens: ItemTempo[];
}

export interface NovoColaborador {
  nome: string;
  email: string;
  senha: string;
  rede_id: string;
  loja_id: string | null;
  perfil: Perfil;
}

export interface Pacote {
  setores: Setor[];
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
  /** empresas em que a pessoa está (admin: todas as ativas) */
  minhasEmpresas(): Promise<Empresa[]>;
  /** unidades do Check List com o perfil (de todas as empresas da pessoa) */
  minhasLojas(): Promise<LojaAcesso[]>;
  gerarTarefas(data: string): Promise<void>;
  /** dados de UMA empresa (modelos/setores/equipe) e das unidades dela */
  baixar(rede: string, lojas: string[], de: string, ate: string): Promise<Pacote>;

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

  dashboard(de: string, ate: string, loja: string | null, rede: string | null): Promise<Dashboard>;
  relatorio(de: string, ate: string, loja: string | null, rede: string | null): Promise<LinhaRelatorio[]>;

  salvarAgendamento(a: Agendamento): Promise<void>;

  // tempos de execução
  dadosTempos(de: string, ate: string, rede: string | null, loja: string | null): Promise<DadosTempos>;
  salvarConfigTempos(rede: string, cfg: ConfigTempos): Promise<void>;
  // checklists (editor) – sempre rascunho → publicar
  modelosDaEmpresa(rede: string): Promise<Modelo[]>;
  versoesDoModelo(modeloId: string): Promise<ModeloVersao[]>;
  criarModelo(rede: string, nome: string, descricao: string | null, categoria: string, perfil: Perfil): Promise<string>;
  editarModelo(id: string, nome: string, descricao: string | null, categoria: string, perfil: Perfil): Promise<void>;
  duplicarModelo(id: string, nome?: string): Promise<string>;
  arquivarModelo(id: string, arquivar: boolean): Promise<void>;
  criarRascunho(modeloId: string): Promise<string>;
  salvarRascunho(v: ModeloVersao): Promise<void>;
  publicarVersao(id: string): Promise<void>;

  // equipe e colaboradores
  equipe(rede: string): Promise<Membro[]>;
  definirMembro(email: string, rede: string, loja: string | null, perfil: Perfil, nome: string, ativo: boolean): Promise<void>;
  alterarMembro(id: string, perfil: Perfil, ativo: boolean, loja?: string | null): Promise<void>;
  /** só o admin: libera as telas do Check List conforme o perfil (permissões centrais) */
  liberarAcesso(membroId: string): Promise<void>;
  /** só o admin: cria o LOGIN (serviço central admin-usuarios) e põe na equipe */
  criarColaborador(c: NovoColaborador): Promise<void>;

  // empresas e lojas (só o admin) – public.redes / public.lojas
  empresas(): Promise<EmpresaCompleta[]>;
  criarEmpresa(nome: string): Promise<string>;
  salvarUnidade(u: { id?: string; rede_id: string; nome: string; cnpj: string | null; ativo: boolean; usaChecklist: boolean }): Promise<string>;
  /** prepara a empresa no Check List (setores padrão) */
  prepararEmpresa(rede: string): Promise<void>;
  copiarModelos(de: string, para: string, modelos: string[] | null): Promise<number>;
}

export const PERFIS: Record<Perfil, string> = { operador: "Operador", supervisor: "Supervisor", gestor: "Gestor" };
export const nivel = (p: Perfil | null | undefined) => (p === "gestor" ? 3 : p === "supervisor" ? 2 : p === "operador" ? 1 : 0);
