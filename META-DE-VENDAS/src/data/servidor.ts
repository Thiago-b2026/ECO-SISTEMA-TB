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
  rede_id: string | null;
  rede: string | null;
}

/** Dados cadastrais da unidade: os MESMOS campos de public.lojas que o PDV usa ("Dados da unidade"). */
export const CAMPOS_UNIDADE = ["razao_social", "nome_fantasia", "ie", "im", "regime_tributario", "email", "telefone", "cep", "logradouro", "numero",
  "complemento", "bairro", "cidade", "uf", "cod_ibge", "situacao_cadastral", "atividade"] as const;
export type CampoUnidade = (typeof CAMPOS_UNIDADE)[number];
export type DadosUnidade = Partial<Record<CampoUnidade, string | null>>;

/** Cadastro único do ecossistema (public.redes / public.lojas). Só o admin altera. */
export interface UnidadeCadastro {
  id: string;
  nome: string;
  cnpj: string | null;
  rede_id: string | null;
  ativo: boolean;
  dados: DadosUnidade;
  /** a unidade está marcada para o Meta de Vendas (public.lojas.sistemas contém "metas") */
  usaMetas: boolean;
  /** outros sistemas em que a unidade aparece (só para mostrar) */
  outros: string[];
}

export interface NovaUnidade {
  id?: string;
  rede_id: string;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  usaMetas: boolean;
  dados: DadosUnidade;
}

/** Limpa os dados antes de gravar: vazio vira null, CEP só dígitos, UF em maiúsculas. */
export function normalizarDados(d: DadosUnidade): DadosUnidade {
  const out: DadosUnidade = {};
  for (const k of CAMPOS_UNIDADE) {
    const v = (d[k] ?? "").toString().trim();
    out[k] = v ? v : null;
  }
  if (out.cep) out.cep = out.cep.replace(/\D/g, "").slice(0, 8) || null;
  if (out.uf) out.uf = out.uf.toUpperCase().slice(0, 2);
  if (out.telefone) out.telefone = out.telefone.replace(/\D/g, "") || null;
  return out;
}

export interface Empresa {
  id: string;
  nome: string;
  ativo: boolean;
  unidades: UnidadeCadastro[];
}

export type Perfil = "vendedor" | "gerente" | "gestor";

export interface UsuarioAcesso {
  user_id: string;
  email: string;
  nome: string;
  loja_id: string;
  loja: string;
  perfil: Perfil | "personalizado";
  lanca: boolean;
}

export interface NovoAcesso {
  email: string;
  nome: string;
  rede_id: string;
  /** vazio para o gestor (vale para a empresa toda) */
  loja_id: string | null;
  perfil: Perfil;
  /** vendedor: lança o próprio resultado */
  lanca: boolean;
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
  // ---- só o admin: empresas, unidades e usuários (cadastro único do ecossistema)
  empresas(): Promise<Empresa[]>;
  salvarEmpresa(e: { id?: string; nome: string; ativo: boolean }): Promise<string>;
  salvarUnidade(u: NovaUnidade): Promise<string>;
  usuarios(rede: string): Promise<UsuarioAcesso[]>;
  /** dá ou troca o acesso de quem JÁ tem login */
  darAcesso(a: NovoAcesso): Promise<void>;
  /** cria o login (Edge Function admin-usuarios) e já dá o acesso */
  criarLogin(a: NovoAcesso & { senha: string }): Promise<void>;
  removerAcesso(usuario: string, unidade: string): Promise<void>;
  // ---- excluir: só o que nunca foi usado (com histórico, o caminho é inativar)
  excluirVendedor(id: string): Promise<void>;
  excluirUnidade(id: string): Promise<void>;
  excluirEmpresa(id: string): Promise<void>;
}

export const NOME_PERFIL: Record<Perfil | "personalizado", string> = {
  vendedor: "Vendedor", gerente: "Gerente da unidade", gestor: "Gestor da empresa", personalizado: "Personalizado (Permissões)",
};

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
