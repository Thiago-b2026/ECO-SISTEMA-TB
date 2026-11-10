// Tipos do domínio do Check List Operacional.
// O conteúdo de uma versão de modelo (seções + itens) é um JSON imutável depois de publicado
// e é o MESMO formato no app, no banco (checklist.modelo_versoes.conteudo) e no seed.

export type Perfil = "operador" | "supervisor" | "gestor";

export type TipoItem =
  | "sim_nao"
  | "conformidade" // conforme | parcial | nao_conforme | na
  | "numero"
  | "texto"
  | "multipla"
  | "assinatura"
  | "foto";

export type RegraFoto = "nunca" | "sempre" | "se_nao_conforme";
export type RegraObs = "nunca" | "sempre" | "se_nao_conforme";

/** Mostra o item só se a resposta de outro item for igual a um dos valores. */
export interface Condicao {
  item_id: string;
  valores: (string | boolean | number)[];
}

export interface Item {
  id: string;
  texto: string;
  ajuda?: string;
  tipo: TipoItem;
  /** múltipla escolha */
  opcoes?: string[];
  multipla_selecao?: boolean;
  /** número: fora da faixa = não conforme */
  min?: number;
  max?: number;
  unidade?: string;
  /** sim/não: permite N/A */
  permite_na?: boolean;
  /** sim/não: qual resposta é a "boa" (padrão: sim) */
  resposta_esperada?: boolean;
  obrigatorio: boolean;
  foto: RegraFoto;
  observacao: RegraObs;
  gera_plano: boolean;
  /** entra na nota? (só tipos avaliativos) */
  pontua: boolean;
  peso: number;
  /** "14:00" – prazo do item no dia da tarefa (horário de São Paulo) */
  prazo_hora?: string;
  /** 0=domingo..6=sábado – item só aparece nesses dias */
  dias_semana?: number[];
  condicao?: Condicao;
  /** nº do relatório do CISS que o item manda conferir */
  ref_ciss?: string;
  setor?: string;
}

export interface Secao {
  id: string;
  titulo: string;
  setor?: string;
  itens: Item[];
}

export interface ConteudoModelo {
  secoes: Secao[];
}

export type StatusVersao = "rascunho" | "publicada" | "arquivada";

export interface Modelo {
  id: string;
  nome: string;
  descricao?: string;
  categoria: string;
  perfil_executor: Perfil;
  ativo: boolean;
}

export interface ModeloVersao {
  id: string;
  modelo_id: string;
  numero: number;
  status: StatusVersao;
  conteudo: ConteudoModelo;
  publicada_em?: string | null;
}

/** Valor de uma resposta (jsonb no banco). */
export type ValorResposta =
  | { tipo: "sim_nao"; v: boolean | "na" }
  | { tipo: "conformidade"; v: "conforme" | "parcial" | "nao_conforme" | "na" }
  | { tipo: "numero"; v: number }
  | { tipo: "texto"; v: string }
  | { tipo: "multipla"; v: string[] }
  | { tipo: "assinatura"; v: string } // caminho/ref da imagem da assinatura
  | { tipo: "foto"; v: true };

export interface Resposta {
  id: string;
  execucao_id: string;
  item_id: string;
  valor: ValorResposta | null;
  observacao?: string | null;
  respondido_em: string; // ISO UTC
  lat?: number | null;
  lng?: number | null;
}

export interface Foto {
  id: string;
  execucao_id: string;
  item_id: string | null;
  plano_id?: string | null;
  storage_path: string;
  mime: string;
  bytes: number;
  tirada_em: string;
  lat?: number | null;
  lng?: number | null;
  precisao_m?: number | null;
}

export type StatusExecucao = "em_andamento" | "concluida" | "validada" | "devolvida" | "cancelada";

export interface Execucao {
  id: string;
  tarefa_id: string | null;
  modelo_id: string;
  versao_id: string;
  loja_id: string;
  usuario_id: string;
  inicio_em: string;
  fim_em?: string | null;
  status: StatusExecucao;
  pontuacao?: number | null;
  lat?: number | null;
  lng?: number | null;
  assinatura_path?: string | null;
  validado_por?: string | null;
  motivo_devolucao?: string | null;
}

export type Frequencia = "diaria" | "semanal" | "mensal";

export interface Agendamento {
  id: string;
  modelo_id: string;
  loja_id: string;
  responsavel_id: string | null;
  perfil_responsavel: Perfil | null;
  frequencia: Frequencia;
  dias_semana?: number[] | null;
  dia_mes?: number | null;
  dias_antes_fim_mes?: number | null;
  hora_inicio: string; // "07:00"
  hora_limite: string; // "10:00"
  ativo: boolean;
}

export interface Tarefa {
  id: string;
  agendamento_id: string | null;
  modelo_id: string;
  loja_id: string;
  responsavel_id: string | null;
  perfil_responsavel: Perfil | null;
  data_ref: string; // YYYY-MM-DD (data em São Paulo)
  prazo: string; // ISO UTC
  execucao_id?: string | null;
  concluida_em?: string | null;
  cancelada_em?: string | null;
  motivo_cancelamento?: string | null;
}

export type StatusPlano = "aberto" | "em_andamento" | "aguardando_validacao" | "concluido" | "cancelado";

export interface PlanoAcao {
  id: string;
  execucao_id: string | null;
  item_id: string | null;
  loja_id: string;
  setor?: string | null;
  titulo: string;
  descricao?: string | null;
  responsavel_id: string | null;
  prazo: string;
  status: StatusPlano;
  solucao?: string | null;
  executado_por?: string | null;
  validado_por?: string | null;
  motivo_cancelamento?: string | null;
  criado_por?: string | null;
  criado_em: string;
}
