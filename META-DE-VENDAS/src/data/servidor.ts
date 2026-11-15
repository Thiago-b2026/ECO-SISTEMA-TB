// Contrato do servidor. Duas implementações com as MESMAS regras:
//  - SupabaseServidor (produção: banco ECO-SISTEMA-TB, schema metas; as regras de verdade são o RLS);
//  - DemoServidor (modo demonstração, dados só no navegador; repete as regras para o teste ficar fiel).

export interface Sessao {
  usuario_id: string;
  email: string;
  nome: string;
  admin: boolean;
}

export interface Unidade {
  id: string;
  nome: string;
  rede: string | null;
}

export interface Acesso {
  /** telas do sistema liberadas; null = a consulta falhou (modo de segurança) */
  liberadas: Set<string> | null;
  unidades: Unidade[];
}

export interface Vendedor {
  id: string;
  loja_id: string;
  user_id: string | null;
  nome: string;
  ativo: boolean;
}

export interface Meta {
  loja_id: string;
  mes_referencia: string;
  meta_total: number;
  percentual_minimo: number;
  premio_meta_100: number;
  premio_meta_90: number;
  valor_por_cliente_engajado: number;
}

export interface Lancamento {
  id: string;
  vendedor_id: string;
  loja_id: string;
  mes_referencia: string;
  faturamento_realizado: number;
  clientes_engajados: number;
}

export interface NovoLancamento {
  vendedor_id: string;
  mes_referencia: string;
  faturamento_realizado: number;
  clientes_engajados: number;
}

export interface Servidor {
  readonly modo: "supabase" | "demo";
  sessaoAtual(): Promise<Sessao | null>;
  entrar(email: string, senha: string): Promise<Sessao>;
  sair(): Promise<void>;
  acesso(): Promise<Acesso>;
  /** permissões do usuário na unidade, como "metas.lancamentos:editar" (admin: todas) */
  permissoes(unidade: string): Promise<Set<string>>;
  /** cadastro de vendedor ligado ao login (o vendedor pode estar em mais de uma loja ao longo do tempo: 1 cadastro) */
  meuVendedor(): Promise<Vendedor | null>;
  vendedores(unidade: string): Promise<Vendedor[]>;
  salvarVendedor(v: { id?: string; loja_id: string; nome: string; ativo: boolean }): Promise<Vendedor>;
  /** liga o vendedor a um login que já existe (e-mail vazio = desliga) */
  ligarLogin(vendedor: string, email: string | null): Promise<void>;
  /** e-mail do login de cada vendedor da unidade (vendedor_id → e-mail) */
  emailsVendedores(unidade: string): Promise<Map<string, string>>;
  metas(unidade: string, meses: string[]): Promise<Meta[]>;
  salvarMeta(m: Meta): Promise<void>;
  lancamentos(unidade: string, meses: string[]): Promise<Lancamento[]>;
  /** lançamentos do próprio vendedor (em qualquer loja) */
  meusLancamentos(meses: string[]): Promise<Lancamento[]>;
  salvarLancamento(l: NovoLancamento): Promise<void>;
  excluirLancamento(id: string): Promise<void>;
  mesesFechados(unidade: string, meses: string[]): Promise<string[]>;
  fecharMes(unidade: string, mes: string): Promise<void>;
  reabrirMes(unidade: string, mes: string): Promise<void>;
}

/** Erro com mensagem já em português, para mostrar na tela. */
export class ErroServidor extends Error {}

/** Traduz os erros mais comuns do banco. */
export function traduzir(msg: string): string {
  if (/row-level security|permission denied/i.test(msg)) return "Você não tem permissão para fazer isso nesta unidade.";
  if (/duplicate key|unique/i.test(msg)) return "Já existe um registro igual (o mesmo vendedor no mesmo mês, por exemplo).";
  if (/check constraint/i.test(msg)) return "Algum valor está fora do permitido (negativo ou % acima de 100).";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  return msg;
}
