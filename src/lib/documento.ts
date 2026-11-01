// CPF/CNPJ: validação, máscara e busca de dados (BrasilAPI, gratuita).

export const soDigitos = (v: string) => (v ?? "").replace(/\D/g, "");

export function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function cnpjValido(cnpj: string): boolean {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function formatarDocumento(v: string): string {
  const d = soDigitos(v);
  if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
  return d.slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

export interface DadosEndereco {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cod_ibge?: string;
}

export interface DadosEmpresa extends DadosEndereco {
  nome: string;
  nome_fantasia?: string;
  email?: string;
  telefone?: string;
  situacao_cadastral?: string;
  atividade?: string;
}

/** Converte a resposta da BrasilAPI /cnpj/v1 nos campos do cadastro. */
export function empresaDaBrasilApi(r: any): DadosEmpresa {
  const tel = soDigitos(r.ddd_telefone_1 ?? "");
  const tipoLog = r.descricao_tipo_de_logradouro ? `${r.descricao_tipo_de_logradouro} ` : "";
  return {
    nome: r.razao_social ?? "",
    nome_fantasia: r.nome_fantasia || undefined,
    email: r.email ? String(r.email).toLowerCase() : undefined,
    telefone: tel || undefined,
    cep: r.cep ? soDigitos(String(r.cep)) : undefined,
    logradouro: r.logradouro ? `${tipoLog}${r.logradouro}`.trim() : undefined,
    numero: r.numero || undefined,
    complemento: r.complemento || undefined,
    bairro: r.bairro || undefined,
    cidade: r.municipio || undefined,
    uf: r.uf || undefined,
    cod_ibge: r.codigo_municipio_ibge ? String(r.codigo_municipio_ibge) : undefined,
    situacao_cadastral: r.descricao_situacao_cadastral || undefined,
    atividade: r.cnae_fiscal_descricao || undefined,
  };
}

export async function buscarCnpj(cnpj: string): Promise<DadosEmpresa> {
  const d = soDigitos(cnpj);
  if (!cnpjValido(d)) throw new Error("CNPJ inválido. Confira os números.");
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
  if (r.status === 404) throw new Error("CNPJ não encontrado na Receita.");
  if (!r.ok) throw new Error("Serviço de consulta indisponível. Tente de novo em instantes ou preencha à mão.");
  return empresaDaBrasilApi(await r.json());
}

export async function buscarCep(cep: string): Promise<DadosEndereco> {
  const d = soDigitos(cep);
  if (d.length !== 8) throw new Error("CEP deve ter 8 dígitos.");
  const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${d}`);
  if (!r.ok) throw new Error("CEP não encontrado.");
  const j = await r.json();
  return { cep: d, logradouro: j.street || undefined, bairro: j.neighborhood || undefined, cidade: j.city || undefined, uf: j.state || undefined };
}
